const $ = (id) => document.getElementById(id);
const fmtBytes = (n) => {
  if (n == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
};
const fmtUptime = (s) => {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
};

async function refresh() {
  try {
    const r = await fetch('/api/version');
    const j = await r.json();
    $('version').textContent = `v${j.version}`;
    $('uptime').textContent = fmtUptime(j.uptimeSeconds);
    $('rss').textContent = fmtBytes(j.rssBytes);
    $('heap').textContent = fmtBytes(j.heapUsedBytes);
    $('retained').textContent = j.retainedRecords.toLocaleString();
    $('host').textContent = window.location.host;
  } catch (e) {
    $('version').textContent = 'offline';
  }
}

$('send').addEventListener('click', async () => {
  const payload = {
    vin: $('vin').value,
    speedKph: Number($('speed').value),
    batteryPct: Number($('battery').value),
    ts: new Date().toISOString(),
  };
  const r = await fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  $('result').textContent = JSON.stringify(await r.json(), null, 2);
  refresh();
});

refresh();
setInterval(refresh, 3000);
