/**
 * Headless Prompt Lab service.
 *
 * Exposes the prompt-craft functions the Prompt Lab UI already uses so ai-arena's optimizer can
 * ask for the next candidate without the guidelines being forked into another repo. Additive
 * only: nothing here is imported by the app, so Prompt Lab and the Playground are untouched.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { analyzeGarmentForPromptLab } from "../services/geminiService.ts";
import { fetchImageInput } from "./imageInput.ts";
import { decide, type DecisionRequest } from "./optimizeDecision.ts";

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY_BYTES = 2_000_000;

// geminiService reads process.env.API_KEY (vite injects it from GEMINI_API_KEY in the browser
// build); mirror that here so one key serves both.
process.env.API_KEY ??= process.env.GEMINI_API_KEY;

const readJson = (req: IncomingMessage): Promise<unknown> =>
	new Promise((resolve, reject) => {
		let size = 0;
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(new Error("Request body too large"));
				req.destroy();
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

const send = (res: ServerResponse, status: number, body: unknown) => {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json",
		"content-length": Buffer.byteLength(payload),
	});
	res.end(payload);
};

const routes: Record<string, (body: any) => Promise<unknown>> = {
	"POST /optimize-decision": (body: DecisionRequest) => {
		if (!body?.candidate) throw new Error("candidate is required");
		return decide(body);
	},
	"POST /analyze": async (body: { imageUrl?: string; garmentMode?: "primary" | "secondary" }) => {
		if (!body?.imageUrl) throw new Error("imageUrl is required");
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

	const handler = routes[`${req.method} ${path}`];
	if (!handler) {
		send(res, 404, { error: `No route for ${req.method} ${path}` });
		return;
	}

	try {
		send(res, 200, await handler(await readJson(req)));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`${req.method} ${path} failed:`, message);
		send(res, 400, { error: message });
	}
});

server.listen(PORT, () => {
	console.log(`Prompt Lab service listening on http://127.0.0.1:${PORT}`);
	if (!process.env.API_KEY) {
		console.warn("GEMINI_API_KEY is not set — /analyze and /optimize-decision will fail.");
	}
});
