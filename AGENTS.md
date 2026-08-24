# Agent guide

A Vite + React app with two surfaces — the **Playground** (`features/generator/`) and **Prompt
Lab** (`features/garmentPromptLab/`) — plus a headless **Prompt Lab service** (`server/`) that
exposes the same prompt-craft functions over HTTP.

## Run

```sh
npm install
npm run dev     # app on :3000
npm run serve   # headless Prompt Lab service on :8787
npm test        # all checks
npx tsc --noEmit
npm run build
```

`GEMINI_API_KEY` goes in `.env.local`. Vite injects it as `process.env.API_KEY` for the browser
build; `server/index.ts` mirrors the same variable so one key serves both. Never print the value.

## Tests

Tests are plain scripts that `throw` on failure — no framework, no runner config. Node strips the
types natively, so a test file is executed directly:

```sh
node --experimental-strip-types features/garmentPromptLab/promptBuilder.test.ts
```

`npm test` runs all of them. Add a new test the same way: a `.ts` file that throws, wired into the
`test` script. **Do not add a test framework** — the point of this arrangement is that the repo
needs no dependency to be tested.

## Conventions

- Tabs, double quotes, trailing commas — match the surrounding file.
- The prompt-craft modules (`services/geminiService.ts`, `features/garmentPromptLab/promptBuilder.ts`)
  are **pure and DOM-free** so they can run under Node. Keep them that way: no `window`, no
  `document`, no React imports. This is what lets `server/` reuse them without a rewrite.
- `buildPromptLevels` enforces hard word caps per level (1 / 3 / 5 / 8 / 20). Prompts are
  **built**, never hand-written or model-written — see `server/README.md`.
- Positive phrasing only. A prompt names what is visible in the reference image; it never says
  "no", "not", or "without".

## Don't break the app

`server/` is additive: nothing in it is imported by the app. When changing it, the app must stay
untouched — verify with `npx tsc --noEmit`, `npm run build`, and a `git diff` that shows no changes
to `App.tsx`, `components/`, `features/`, `services/`, `types.ts`, or `vite.config.ts`.

The reverse also holds: the prompt-craft modules are a **contract** the optimizer in `ai-arena`
depends on. Changing `buildPromptLevels`' output or `GarmentAnalysis`' shape changes the prompts
that repo generates.

## Related repos

| Repo | Why |
|---|---|
| **ai-arena** | Consumes `server/`. Its garment optimizer calls `POST /optimize-decision` once per iteration. Its `docs/optimizer.md` is the design doc for the loop and the source of the request/response shapes. |
| **ai-evaluation** | Defines the scores the optimizer feeds back here — `evaluators/jhe.py` produces the `findings` this service reads. Read-only reference. |

See [server/README.md](server/README.md) for the service's endpoints and how the improve step
decides.
