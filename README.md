# ConnectedDrive Telemetry API

> Vehicle telemetry ingestion service for the ConnectedDrive platform.
> Ingests near-real-time status events from in-vehicle gateways and
> exposes them to downstream analytics, fleet operations, and the
> in-car companion app.

[![Production](https://img.shields.io/badge/env-production-success)]()
[![Runtime](https://img.shields.io/badge/runtime-Node.js%2020-blue)]()
[![License](https://img.shields.io/badge/license-Internal-lightgrey)]()

---

## Overview

`telemetry-api` is the front-door HTTPS service that accepts telemetry
events emitted by connected vehicles. Each event carries the VIN,
current speed, battery state-of-charge and a UTC timestamp. The service
validates the payload, attaches receipt metadata, and makes the latest
events queryable for operational tooling.

It is part of the **ConnectedDrive** platform owned by the
Connected Services team and is deployed continuously to the
`aks-prod` cluster in Sweden Central.

## Architecture

```
   ┌──────────────────┐     HTTPS      ┌────────────────────┐
   │ In-vehicle       │ ─────────────► │ Azure Front Door   │
   │ telemetry agent  │                │ + WAF              │
   └──────────────────┘                └─────────┬──────────┘
                                                 │
                                                 ▼
                                       ┌────────────────────┐
                                       │ telemetry-api      │
                                       │ (this repo)        │
                                       │ AKS · 2+ replicas  │
                                       └─────────┬──────────┘
                                                 │
                                ┌────────────────┼────────────────┐
                                ▼                ▼                ▼
                       ┌──────────────┐  ┌──────────────┐  ┌────────────────┐
                       │ Companion    │  │ Fleet Ops    │  │ Analytics      │
                       │ app backend  │  │ dashboard    │  │ pipeline       │
                       └──────────────┘  └──────────────┘  └────────────────┘
```

## API reference

Base URL (production): `https://telemetry.connecteddrive.internal`

| Method | Path | Description |
|---|---|---|
| `GET`  | `/`                       | Operator dashboard (live pod stats, send a test event) |
| `GET`  | `/healthz`                | Liveness probe |
| `GET`  | `/readyz`                 | Readiness probe |
| `GET`  | `/api/version`            | Build version + runtime stats |
| `POST` | `/api/telemetry`          | Ingest one telemetry event |
| `GET`  | `/api/telemetry/recent`   | Last 10 accepted events (operator tooling) |
| `GET`  | `/metrics`                | Prometheus exposition |

### `POST /api/telemetry`
```json
{
  "vin": "YV1ABC1234567890",
  "speedKph": 92,
  "batteryPct": 78,
  "ts": "2026-05-27T10:14:00Z"
}
```
Response `202 Accepted`:
```json
{ "accepted": true, "receivedAt": "2026-05-27T10:14:00.123Z", "retainedRecords": 1 }
```

## Service Level Objectives

| SLO | Target |
|---|---|
| Availability (rolling 30 d) | 99.9 % |
| P99 latency `POST /api/telemetry` | < 500 ms |
| Error rate (5xx / total) | < 0.5 % |
| Pod restarts in any rolling 30 min window | 0 |

SLO breaches page the Connected Services on-call rotation through the
Action Group `ag-sre-agent` and are also picked up by **Azure SRE Agent**
for autonomous triage on Sev 1 / Sev 2 incidents.

## Local development

Requires Node.js 20+.

```bash
npm install
npm start
# open http://localhost:8080
```

Send a sample event:
```bash
curl -X POST http://localhost:8080/api/telemetry \
  -H "content-type: application/json" \
  -d '{"vin":"YV1ABC1234567890","speedKph":92,"batteryPct":78,"ts":"2026-05-27T10:14:00Z"}'
```

## Container image

Images are built directly in Azure Container Registry from this
repository — no local Docker, no CI runner. The build is invoked by the
operator deploy script or by the Connected Services SRE Agent.

```powershell
az acr build `
  --registry acrsreswedemo `
  --image sre-demo-app:<version> `
  --file Dockerfile `
  https://github.com/abengtss-max/sre-demo-app.git#main
```

Resulting image: `acrsreswedemo.azurecr.io/sre-demo-app:<version>`.

## Deployment

Promoted to AKS namespace `sre-demo`, cluster `aks-prod`, region
Sweden Central:

```bash
kubectl -n sre-demo set image deployment/telemetry-api \
  app=acrsreswedemo.azurecr.io/sre-demo-app:<version>
kubectl -n sre-demo rollout status deployment/telemetry-api
```

Resource profile: 2 replicas, rolling update
(`maxSurge=1 maxUnavailable=0`), `requests cpu=100m memory=128Mi`,
`limits cpu=500m memory=256Mi`. Liveness probe on `/healthz`,
readiness on `/readyz`.

## Observability

- **Container Insights** is enabled on `aks-prod`; logs land in the
  `log-sre-demo` Log Analytics workspace.
- Prometheus metrics are exposed on `/metrics` and scraped by the
  cluster's Managed Prometheus add-on. Notable custom metrics:
  - `sre_demo_http_requests_total{method,route,status}`
  - `sre_demo_retained_telemetry_records`
  - default process / GC / event-loop metrics under the `sre_demo_` prefix.
- Alerts (`alert-telemetry-api-memory-pressure`,
  `alert-telemetry-api-oomkilled`) route to Action Group
  `ag-sre-agent`.

## Ownership & support

- **Team:** Connected Services platform
- **On-call rotation:** `#connected-services-oncall`
- **Service tier:** Tier 2 (customer-impacting, automated mitigation expected)
- **Incident handling:** Sev 1 / Sev 2 are auto-triaged by Azure SRE
  Agent within the autonomy boundaries defined in the team's
  escalation policy. The agent has scoped permissions on namespace
  `sre-demo` only.

## Contributing

1. Branch from `main`.
2. Keep PRs small and focused. Update tests when adding behaviour.
3. The image tag follows `package.json#version` — bump it when you ship.
4. Squash-merge to `main`; deployment is initiated separately by the
   ops team or the SRE Agent.

---
© Connected Services — internal use only.
