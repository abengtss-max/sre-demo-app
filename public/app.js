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

// Care Portal services — each card maps to a care-request type.
const SERVICES = [
  { code: 'GP-APPT',    name: 'Book a doctor\u2019s appointment', desc: 'General practitioner visit', icon: '\u{1FA7A}' },
  { code: 'RX-RENEW',   name: 'Renew a prescription',            desc: 'Repeat medication',          icon: '\u{1F48A}' },
  { code: 'ADVICE',     name: 'Symptom advice',                  desc: 'Talk to a nurse',            icon: '\u{1F4DE}' },
  { code: 'VACCINE',    name: 'Book a vaccination',              desc: 'Seasonal campaign',          icon: '\u{1F489}' },
  { code: 'REFERRAL',   name: 'Specialist referral',             desc: 'Onward care',                icon: '\u{1F3E5}' },
  { code: 'LAB-TEST',   name: 'Book a lab test',                 desc: 'Samples & results',          icon: '\u{1F9EA}' },
];
const PRIORITIES = ['routine', 'soon', 'urgent'];
const CHANNELS = ['web', 'phone', 'app'];
let requests = 0;

function renderServices() {
  const grid = $('products');
  grid.innerHTML = SERVICES.map((s) => `
    <article class="product">
      <div class="product-img" style="display:grid;place-items:center;font-size:64px;">${s.icon}</div>
      <div class="product-meta">
        <h3>${s.name}</h3>
        <span class="sku">${s.code}</span>
        <span class="price">${s.desc}</span>
      </div>
      <button class="add" data-code="${s.code}">Request</button>
    </article>`).join('');

  grid.querySelectorAll('button.add').forEach((btn) => {
    btn.addEventListener('click', () => submitRequest(btn.dataset.code));
  });
}

async function submitRequest(service) {
  const payload = {
    service,
    priority: PRIORITIES[Math.floor(Math.random() * PRIORITIES.length)],
    channel: CHANNELS[Math.floor(Math.random() * CHANNELS.length)],
    ts: new Date().toISOString(),
  };
  const r = await fetch('/api/care-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  requests += 1;
  $('bagCount').textContent = requests;
  $('result').textContent = JSON.stringify(await r.json(), null, 2);
  refresh();
}

async function refresh() {
  try {
    const r = await fetch('/api/version');
    const j = await r.json();
    $('version').textContent = `v${j.version}`;
    $('uptime').textContent = fmtUptime(j.uptimeSeconds);
    $('rss').textContent = fmtBytes(j.rssBytes);
    $('heap').textContent = fmtBytes(j.heapUsedBytes);
    $('retained').textContent = j.pendingRequests.toLocaleString();
    $('host').textContent = window.location.host;
  } catch (e) {
    $('version').textContent = 'offline';
  }
}

renderServices();
refresh();
setInterval(refresh, 3000);
