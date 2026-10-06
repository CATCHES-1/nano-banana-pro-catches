/**
 * Boots the service as a child process and checks the HTTP contract that needs no Gemini key:
 * open /health, bearer auth on every other route, the body cap, the timeout path, and the
 * /optimize-decision response shape when there is nothing to analyse.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";

const assert = (condition: unknown, message: string) => {
	if (!condition) throw new Error(message);
};

const TOKEN = "service-test-token";
const AUTH = { authorization: `Bearer ${TOKEN}` };

const freePort = async (): Promise<number> => {
	const probe = createServer().listen(0, "127.0.0.1");
	await once(probe, "listening");
	const { port } = probe.address() as { port: number };
	probe.close();
	await once(probe, "close");
	return port;
};

const startService = async (port: number): Promise<ChildProcess> => {
	// No key of any kind reaches the child: /health must report hasApiKey: false.
	const { API_KEY: _apiKey, GEMINI_API_KEY: _geminiKey, ...env } = process.env;
	const child = spawn(process.execPath, ["--experimental-strip-types", "server/index.ts"], {
		env: {
			...env,
			PORT: String(port),
			HOST: "127.0.0.1",
			PROMPTLAB_AUTH_TOKEN: TOKEN,
			PROMPTLAB_MAX_BODY_BYTES: "1000",
			PROMPTLAB_IMAGE_FETCH_TIMEOUT_MS: "300",
			PROMPTLAB_REQUEST_TIMEOUT_MS: "2000",
		},
		stdio: ["ignore", "ignore", "inherit"],
	});
	for (let attempt = 0; attempt < 50; attempt += 1) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/health`);
			if (res.ok) return child;
		} catch {
			// not up yet
		}
		await sleep(100);
	}
	child.kill();
	throw new Error("service did not start");
};

/** Accepts the connection and never answers, so an image fetch can only end by timeout. */
const startStallingServer = async (): Promise<{ server: Server; url: string }> => {
	const server = createServer(() => {});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const { port } = server.address() as { port: number };
	return { server, url: `http://127.0.0.1:${port}/slow.png` };
};

const post = (base: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
	fetch(`${base}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});

const main = async () => {
	const port = await freePort();
	const base = `http://127.0.0.1:${port}`;
	const service = await startService(port);
	const stalling = await startStallingServer();
	try {
		const health = await fetch(`${base}/health`);
		assert(health.status === 200, "/health is open without a token");
		const healthBody = (await health.json()) as { ok: boolean; hasApiKey: boolean };
		assert(healthBody.ok === true && healthBody.hasApiKey === false, "/health reports no key");

		const noAuth = await post(base, "/optimize-decision", { candidate: {} });
		assert(noAuth.status === 401, `missing token is 401, got ${noAuth.status}`);
		const wrongAuth = await post(base, "/optimize-decision", { candidate: {} }, { authorization: "Bearer nope" });
		assert(wrongAuth.status === 401, `wrong token is 401, got ${wrongAuth.status}`);
		const unknownRoute = await post(base, "/nope", {}, AUTH);
		assert(unknownRoute.status === 404, "an unknown route is 404 once authenticated");

		const decision = await post(
			base,
			"/optimize-decision",
			{ iteration: 0, candidate: { prompts: { top: "navy shirt" }, images: {} } },
			AUTH,
		);
		assert(decision.status === 200, `authed /optimize-decision is 200, got ${decision.status}`);
		const decided = (await decision.json()) as { candidate: unknown; rationale: unknown };
		assert(decided.candidate === null, "no reference image means candidate: null");
		assert(typeof decided.rationale === "string" && decided.rationale.length > 0, "rationale is a string");

		const missingCandidate = await post(base, "/optimize-decision", {}, AUTH);
		assert(missingCandidate.status === 400, "a body without candidate is 400");

		const oversized = await post(base, "/optimize-decision", `{"candidate":{"pad":"${"x".repeat(2000)}"}}`, AUTH);
		assert(oversized.status === 413, `a body over the cap is 413, got ${oversized.status}`);

		const started = Date.now();
		const stalled = await post(base, "/analyze", { imageUrl: stalling.url }, AUTH);
		assert(stalled.status === 504, `a stalled image fetch is 504, got ${stalled.status}`);
		assert(Date.now() - started < 1900, "the fetch timeout fires before the request budget");
	} finally {
		service.kill();
		stalling.server.closeAllConnections();
		stalling.server.close();
	}
	console.log("service: all checks passed");
};

await main();
