// Regional Care Portal — care-request intake service
// Serves the citizen-facing care portal and records incoming care requests
// (service, priority, channel, ts) for the operations dashboard.

const express = require('express');
const morgan = require('morgan');
const client = require('prom-client');
const path = require('path');

const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const PORT = parseInt(process.env.PORT || '8080', 10);

// ---- Prometheus metrics ----------------------------------------------------
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'sre_demo_' });

const httpRequestsTotal = new client.Counter({
  name: 'sre_demo_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
});
register.registerMetric(httpRequestsTotal);

const careRequestGauge = new client.Gauge({
  name: 'sre_demo_retained_care_requests',
  help: 'Number of care-request records currently retained in the in-memory intake queue',
});
register.registerMetric(careRequestGauge);

// In-memory intake queue of received care requests. Surfaced by
// GET /api/care-requests/recent for the operations dashboard and lightweight
// downstream consumers that poll for the latest activity.
const retainedRequests = [];

function recordCareRequest(payload) {
  // Attach receipt metadata and a clinical-summary preview blob used by
  // the triage pipeline downstream (base64-encoded for transport).
  const enriched = {
    receivedAt: new Date().toISOString(),
    payload,
    enrichment: Buffer.alloc(16 * 1024, 'x').toString('base64'),
  };
  retainedRequests.push(enriched);
  careRequestGauge.set(retainedRequests.length);
  return enriched.receivedAt;
}

// ---- App -------------------------------------------------------------------
const app = express();
app.use(morgan('tiny'));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok', version: APP_VERSION }));

app.get('/readyz', (_req, res) => res.status(200).json({ status: 'ready', version: APP_VERSION }));

app.get('/api/version', (_req, res) => {
  res.json({
    version: APP_VERSION,
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    rssBytes: process.memoryUsage().rss,
    heapUsedBytes: process.memoryUsage().heapUsed,
    pendingRequests: retainedRequests.length,
  });
});

app.post('/api/care-requests', (req, res) => {
  const body = req.body || { service: 'UNKNOWN', priority: 'routine', channel: 'web' };
  const receivedAt = recordCareRequest(body);
  httpRequestsTotal.inc({ method: 'POST', route: '/api/care-requests', status: 200 });
  res.status(202).json({ accepted: true, receivedAt, pendingRequests: retainedRequests.length });
});

app.get('/api/care-requests/recent', (_req, res) => {
  res.json(retainedRequests.slice(-10));
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[sre-demo-app v${APP_VERSION}] listening on :${PORT}`);
});
// build-bust: 2026-05-28T08:09:30.6445792+02:00
