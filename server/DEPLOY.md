# Deploying the Prompt Lab service

A plan, not a record of a deploy. Hosting choice and ownership are open (plan decision D2);
every actual deploy needs Jimmy's or Loris's authorization.

## What ships

One container (`Dockerfile` at the repo root) running `server/index.ts`. Stateless apart from
an in-memory analysis cache, so one replica is enough and more are safe. It needs outbound
HTTPS to the Gemini API and to the clips buckets, and inbound HTTP from ai-arena only.

## Suggested placement [assumed]

Next to ai-arena, which already deploys to GKE (`development-cluster`, zone `europe-west2-a`,
namespace `ai-arena`, images in `europe-docker.pkg.dev/catches-reasonably-powerful-gr/catches-docker-actual`,
rolled out with `kubectl set image` from `.github/workflows/build-and-deploy.yaml`). A
`Deployment` + `ClusterIP Service` named `promptlab` in that namespace keeps the service off the
public internet entirely: arena reaches it at `http://promptlab.ai-arena.svc.cluster.local:8787`,
and the bearer token is a second line of defence rather than the only one.

Cloud Run is the alternative if the infra owner prefers it: `--no-allow-unauthenticated` plus a
Cloud Run invoker binding for `ai-arena-svc` would replace the bearer token, but arena's client
would then need to mint an ID token per call, which it does not do today.

| Setting | Value |
|---|---|
| Port | `8787` (`HOST=0.0.0.0` set in the image) |
| Health | `GET /health` for readiness and liveness (open, no auth) |
| CPU / memory | 0.5 vCPU, 512 MiB is plenty: the work is two outbound HTTP calls per request |
| Replicas | 1; scale only for availability |
| Request timeout | Keep the ingress or Cloud Run timeout above `PROMPTLAB_REQUEST_TIMEOUT_MS` (120 s) |

## Secrets (names only)

| Env var in the pod | Source |
|---|---|
| `GEMINI_API_KEY` | Secret Manager / k8s Secret `promptlab-gemini-api-key` |
| `PROMPTLAB_AUTH_TOKEN` | Secret Manager / k8s Secret `promptlab-auth-token`; a random 32+ byte value |

The same `promptlab-auth-token` value is given to ai-arena as `OPTIMIZER_PROMPTLAB_TOKEN`.
Rotate by updating both and restarting both deployments; the service compares in constant time
and never logs either value.

## Wiring ai-arena

| Arena env var | Value |
|---|---|
| `OPTIMIZER_PROMPTLAB_URL` | `http://promptlab.ai-arena.svc.cluster.local:8787` (in-cluster) or the Cloud Run URL |
| `OPTIMIZER_PROMPTLAB_TOKEN` | the shared token above |

Arena calls `POST /optimize-decision` once per optimizer iteration, server to server; the browser
never calls this service.

## Smoke after a deploy

```bash
curl -s "$URL/health"                                  # {"ok":true,"hasApiKey":true}
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL/optimize-decision" -d '{}'   # 401
curl -s -X POST "$URL/optimize-decision" -H "Authorization: Bearer $PROMPTLAB_AUTH_TOKEN" \
  -H 'content-type: application/json' -d @fixture.json    # candidate.prompts + decisions.<slot>.level
```

`fixture.json` is the request shape in [README.md](README.md); a real `GEMINI_API_KEY` is needed
for the third call to return a candidate, and that call is paid.
