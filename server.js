// SRE Demo App - Volvo Cars "ConnectedDrive Telemetry" demo service.
// Version 1.0.0 contains an intentional memory leak. Version 1.1.0 fixes it.
// The Azure SRE Agent demo is built around detecting, diagnosing and fixing this leak.

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

const telemetryGauge = new client.Gauge({
  name: 'sre_demo_retained_telemetry_records',
  help: 'Number of telemetry records currently retained in memory (leak indicator)',
});
register.registerMetric(telemetryGauge);

// ---- THE LEAK --------------------------------------------------------------
// v1.0.0: every inbound telemetry payload is pushed into a module-scoped array
// that is never drained. Under load this drives the pod's working-set up until
// the Kubernetes memory limit triggers an OOMKill.
//
// v1.1.0 (the fix): replace this with a bounded ring-buffer flushed to a
// downstream sink. See sre-agent/knowledge-base/runbook-memory-leak.md.
const retainedTelemetry = [];

function ingestTelemetry(payload) {
  // Simulate enrichment - allocate a ~16KB buffer per request so the leak
  // is visible within a few minutes of moderate load.
  const enriched = {
    receivedAt: new Date().toISOString(),
    payload,
    enrichment: Buffer.alloc(16 * 1024, 'x').toString('base64'),
  };
  retainedTelemetry.push(enriched);
  telemetryGauge.set(retainedTelemetry.length);
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
    retainedRecords: retainedTelemetry.length,
  });
});

app.post('/api/telemetry', (req, res) => {
  const body = req.body || { vin: 'UNKNOWN', speedKph: 0, batteryPct: 0 };
  const receivedAt = ingestTelemetry(body);
  httpRequestsTotal.inc({ method: 'POST', route: '/api/telemetry', status: 200 });
  res.status(202).json({ accepted: true, receivedAt, retainedRecords: retainedTelemetry.length });
});

app.get('/api/telemetry/recent', (_req, res) => {
  res.json(retainedTelemetry.slice(-10));
});

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[sre-demo-app v${APP_VERSION}] listening on :${PORT}`);
});
