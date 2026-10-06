/**
 * Headless Prompt Lab service.
 *
 * Exposes the prompt-craft functions the Prompt Lab UI already uses so ai-arena's optimizer can
 * ask for the next candidate without the guidelines being forked into another repo. Additive
 * only: nothing here is imported by the app, so Prompt Lab and the Playground are untouched.
 *
 * Every route but /health requires a bearer token once PROMPTLAB_AUTH_TOKEN is set, and every
 * request is bounded by REQUEST_TIMEOUT_MS. The app's own Gemini calls carry no timeout of their
 * own; the request-level budget is what ends a hung /analyze.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { analyzeGarmentForPromptLab } from "../services/geminiService.ts";
import { isAuthorized } from "./auth.ts";
import { fetchImageInput } from "./imageInput.ts";
import { MAX_BODY_BYTES, REQUEST_TIMEOUT_MS } from "./limits.ts";
import { decide, type DecisionRequest } from "./optimizeDecision.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
// Unset keeps the service open, for loopback-only local runs.
const AUTH_TOKEN = process.env.PROMPTLAB_AUTH_TOKEN ?? "";

// geminiService reads process.env.API_KEY (vite injects it from GEMINI_API_KEY in the browser
// build); mirror that here so one key serves both. Guarded, because assigning undefined to
// process.env stores the string "undefined", which would read as a key being present.
if (!process.env.API_KEY && process.env.GEMINI_API_KEY) {
	process.env.API_KEY = process.env.GEMINI_API_KEY;
}

class HttpError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

const readJson = (req: IncomingMessage): Promise<unknown> =>
	new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				// Answer rather than drop the socket: the rest of the body is discarded, and the
				// client reads a 413 instead of a connection reset.
				reject(new HttpError(413, "Request body too large"));
				req.resume();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
			} catch (error) {
				reject(error);
			}
		});
		req.on("error", reject);
	});

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> => {
	let timer: NodeJS.Timeout;
	const expiry = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new HttpError(504, `Timed out after ${ms} ms`)), ms);
	});
	return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
};

const send = (res: ServerResponse, status: number, body: unknown) => {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json",
		"content-length": Buffer.byteLength(payload),
	});
	res.end(payload);
};

const statusFor = (error: unknown): number => {
	if (error instanceof HttpError) return error.status;
	// An aborted fetch (image download past IMAGE_FETCH_TIMEOUT_MS) is a gateway timeout, not a
	// bad request.
	if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
		return 504;
	}
	return 400;
};

const routes: Record<string, (body: any) => Promise<unknown>> = {
	"POST /optimize-decision": (body: DecisionRequest) => {
		if (!body?.candidate) throw new HttpError(400, "candidate is required");
		return decide(body);
	},
	"POST /analyze": async (body: { imageUrl?: string; garmentMode?: "primary" | "secondary" }) => {
		if (!body?.imageUrl) throw new HttpError(400, "imageUrl is required");
		const image = await fetchImageInput(body.imageUrl);
		return analyzeGarmentForPromptLab(image, body.garmentMode ?? "primary");
	},
};

const server = createServer(async (req, res) => {
	const path = (req.url ?? "/").split("?")[0];
	if (req.method === "GET" && path === "/health") {
		// Reports whether a key is present, never the key itself.
		send(res, 200, { ok: true, hasApiKey: Boolean(process.env.API_KEY) });
		return;
	}

	if (AUTH_TOKEN && !isAuthorized(req.headers.authorization, AUTH_TOKEN)) {
		send(res, 401, { error: "Unauthorized" });
		return;
	}

	const handler = routes[`${req.method} ${path}`];
	if (!handler) {
		send(res, 404, { error: `No route for ${req.method} ${path}` });
		return;
	}

	try {
		const body = await readJson(req);
		send(res, 200, await withTimeout(handler(body), REQUEST_TIMEOUT_MS));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`${req.method} ${path} failed:`, message);
		send(res, statusFor(error), { error: message });
	}
});

server.listen(PORT, HOST, () => {
	console.log(`Prompt Lab service listening on http://${HOST}:${PORT}`);
	if (HOST !== "127.0.0.1" && !AUTH_TOKEN) {
		console.warn("Listening beyond loopback with no PROMPTLAB_AUTH_TOKEN — routes are unauthenticated.");
	}
	if (!process.env.API_KEY) {
		console.warn("GEMINI_API_KEY is not set — /analyze and /optimize-decision will fail.");
	}
});
