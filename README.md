# sre-demo-app — ConnectedDrive Telemetry

A small Node.js / Express service used as the workload in the Azure SRE
Agent demo. The operator dashboard lets you post simulated vehicle
telemetry events and watch the pod's memory in real time.

> ⚠️ **`v1.0.0` is intentionally broken** — every inbound telemetry event
> is appended to an in-memory array that is never released. Under load
> this drives the container's working set up until Kubernetes OOMKills
> the pod. The fix lands in `v1.1.0` (bounded ring buffer).

## Run locally
```bash
npm install
npm start
# open http://localhost:8080
```

## Container image
The image is built **inside Azure Container Registry** directly from this
public repo — no local Docker, no CI runner needed:

```powershell
az acr build `
  --registry acrsreswedemo `
  --image sre-demo-app:1.0.0 `
  --file Dockerfile `
  https://github.com/abengtss-max/sre-demo-app.git#main
```

To ship a fix, bump `package.json` to `1.1.0`, push to `main`, and re-run
the same command with `--image sre-demo-app:1.1.0`.

## Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Operator dashboard |
| GET | `/healthz` | Liveness probe |
| GET | `/readyz` | Readiness probe |
| GET | `/api/version` | Pod runtime stats incl. retained record count |
| POST | `/api/telemetry` | Ingest one event |
| GET | `/api/telemetry/recent` | Last 10 events |
| GET | `/metrics` | Prometheus exposition |

## Why this exists
This repo is consumed by the Azure SRE Agent demo. The agent is
configured to detect the leak, mitigate it with a `kubectl rollout
undo`, and then ship the permanent fix by opening a PR here and
triggering an ACR build. See the private ops repo for the full setup.
