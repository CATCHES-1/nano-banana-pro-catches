# Headless Prompt Lab service

Exposes the prompt-craft functions the Prompt Lab UI already uses, so ai-arena's garment optimizer
can ask for the next candidate without the prompt guidelines being forked into another repo.

Additive only: nothing in `server/` is imported by the app, and no existing file changed apart from
two `package.json` scripts. Prompt Lab and the Playground are untouched.

## Run

```bash
npm run serve   # http://127.0.0.1:8787
```

Reads `GEMINI_API_KEY` from `.env.local` (the same key the Vite build injects as
`process.env.API_KEY`). No dependencies beyond what the app already has — Node's native TypeScript
stripping runs the `.ts` files directly.

```bash
npm test        # prompt builder, gemini service, and server checks
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness, and whether a key is loaded (never the key itself) |
| `POST` | `/analyze` | `{imageUrl, garmentMode}` → `GarmentAnalysis` |
| `POST` | `/optimize-decision` | An optimizer iteration's findings → the next candidate |

## How the improve step works

**The model never writes prompt text.** It chooses a verbosity `level` (1–5) and the five descriptor
`toggles` per slot; `buildPromptLevels` then renders the prompt. That keeps Prompt Lab's word caps
(1 / 3 / 5 / 8 / 20 words) and its positive-only phrasing enforced by the same code the UI runs,
rather than restated in a system prompt that would drift.

The garment analysis comes from the slot's reference image, cached per URL for the life of the
process — the references are fixed for a whole search, so only the first iteration pays for it.

One call per iteration, over the aggregated findings — never one per rendered image.

### Request

```json
{
  "iteration": 0,
  "target_body_area": "Torso",
  "candidate": { "prompts": { "top": "..." }, "images": { "top": "gs://..." } },
  "best_scores": { "segmentation": 0.951, "jhe": 0.6 },
  "findings": { "jhe": [ { "area": "top", "issue_count": 5, "severity": 1.0,
                           "targeted": true, "reasons": ["branding (major): ..."] } ] },
  "worst_samples": { "jhe": ["sample-a"] }
}
```

### Response

```json
{
  "candidate": { "prompts": { "top": "navy blue solid cotton t-shirt" }, "images": { "top": "gs://..." } },
  "rationale": "...",
  "decisions": { "top": { "level": 3, "toggles": { "includeColor": true, "...": false },
                          "reason": "..." } }
}
```

`candidate: null` means stop — no actionable signal, no reference image could be analysed, or the
suggestion would repeat the current candidate. The caller treats all three the same way.

## Limits

- Reference images must be fetchable over HTTPS. `gs://` URIs are rewritten to
  `storage.googleapis.com`, which works for the public-read clips buckets; a private bucket 403s and
  the endpoint reports that no analysis was available rather than guessing.
- Only the prompt lever is implemented. Regenerating a reference asset
  (`generatePromptLabProductShot`) is the other lever the optimizer could use and is not wired up.
