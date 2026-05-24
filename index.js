process.stdout.write('[BOOT] index.js started, Node ' + process.version + '\n');
require('dotenv').config();

// Local DNS override — router DNS sometimes blocks external APIs
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

// Crash hone pe bhi server band na ho
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason?.message || reason);
});
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const adminRoutes = require('./routes/admin');
const waSessions = require('./services/wa-sessions');
const reporter   = require('./services/reporter');
const bookingService = require('./services/booking');
const bookingRoutes  = require('./routes/booking');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use('/admin', adminRoutes);
app.use('/client', require('./routes/client'));
app.use('/booking', bookingRoutes);
app.use('/meta', require('./routes/meta-webhook'));
app.use('/', require('./routes/api-gateway'));
app.use('/', require('./routes/android'));
app.use('/', require('./routes/autoresponder'));

// Landing page — root route
app.get("/", (req, res) => res.sendFile(path.join(frontendDist, "landing.html")));

// Frontend static files serve karo
const frontendDist = path.join(__dirname, 'public');
app.use(express.static(frontendDist));
app.get('/app', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
app.get('/app/*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

// ─── Caller Page — Team lead dashboard ───────────────────────────────────────
// Serves caller.html — no auth required (team internal URL)
app.get('/caller', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'caller.html'));
});

// Firebase Web SDK config — browser side ke liye (no secrets exposed)
app.get('/caller/firebase-config', (req, res) => {
  res.json({
    apiKey:            process.env.FIREBASE_API_KEY            || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN        || '',
    databaseURL:       process.env.FIREBASE_DATABASE_URL       || '',
    projectId:         process.env.FIREBASE_PROJECT_ID        || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET     || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID             || '',
  });
});
// ─────────────────────────────────────────────────────────────────────────────

// Team feedback page — no login required
app.get('/f/:leadId', (req, res) => {
  const booking = require('./services/booking');
  const { leadId } = req.params;
  const data = booking.loadData();
  const lead = data.leads.find(l => l.id === leadId);
  if (!lead) return res.status(404).send('<h2>Lead nahi mila</h2>');

  const callNum = booking.resolveCallNumber(lead);
  const already = lead.feedbackGiven;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lead ${lead.leadNum} — Feedback</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#1e293b;border-radius:16px;padding:24px;width:100%;max-width:420px;border:1px solid #334155}
.badge{display:inline-block;background:#25d366;color:#fff;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:800;margin-bottom:14px}
.title{font-size:20px;font-weight:800;color:#e2e8f0;margin-bottom:4px}
.sub{font-size:13px;color:#64748b;margin-bottom:20px}
.info{background:#0f172a;border-radius:10px;padding:14px 16px;margin-bottom:20px}
.row{display:flex;gap:10px;align-items:flex-start;margin-bottom:8px}
.row:last-child{margin-bottom:0}
.icon{font-size:14px;margin-top:1px}
.val{font-size:14px;color:#e2e8f0;font-weight:500}
.call-btn{display:block;width:100%;padding:14px;background:#14532d;color:#4ade80;border:2px solid #166534;border-radius:10px;font-size:16px;font-weight:800;text-align:center;text-decoration:none;margin-bottom:14px;cursor:pointer}
.call-btn.done{background:#1e293b;color:#4ade80;border-color:#166534}
label{display:block;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
textarea{width:100%;background:#0f172a;border:1.5px solid #334155;border-radius:10px;padding:10px 12px;color:#e2e8f0;font-size:14px;resize:vertical;min-height:90px;outline:none;font-family:inherit}
textarea:focus{border-color:#25d366}
.submit{width:100%;padding:13px;background:#25d366;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:pointer;margin-top:12px;font-family:inherit}
.submit:disabled{background:#334155;color:#64748b;cursor:not-allowed}
.success{background:#052e16;border:1px solid #166534;border-radius:10px;padding:16px;text-align:center;color:#4ade80;font-weight:700;font-size:15px;margin-top:14px}
.existing{background:#0c1a4a;border:1px solid #1d4ed8;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#93c5fd}
</style>
</head>
<body>
<div class="card">
  <div class="badge">Lead ${lead.leadNum}</div>
  <div class="title">Shivangi Auto Clinic</div>
  <div class="sub">${lead.createdDate} — Team Feedback</div>

  <div class="info">
    <div class="row"><span class="icon">👤</span><span class="val">${lead.naam || '—'}</span></div>
    <div class="row"><span class="icon">🏍️</span><span class="val">${lead.vehicle || '—'}</span></div>
    <div class="row"><span class="icon">📍</span><span class="val">${lead.area || '—'}</span></div>
  </div>

  <a href="tel:${callNum}" class="call-btn ${lead.called ? 'done' : ''}" id="callBtn" onclick="markCalled()">
    📞 ${lead.called ? 'Called ✅' : 'Call Karo — ' + callNum}
  </a>

  ${already ? `<div class="existing">✅ Feedback diya ja chuka hai:<br><br><em>"${lead.feedback}"</em></div>` : ''}

  <div id="feedbackSection">
    <label>Feedback</label>
    <textarea id="fbText" placeholder="Jaise: Interested hai, kal aayenge / Number band tha / Baad mein callback chahiye..." >${already ? lead.feedback : ''}</textarea>
    <button class="submit" id="submitBtn" onclick="submitFeedback()">${already ? '✏️ Update Feedback' : '✅ Submit Feedback'}</button>
  </div>

  <div class="success" id="successBox" style="display:none">✅ Feedback save ho gaya!</div>
</div>

<script>
var LEAD_ID = '${lead.id}';
var BASE = '';

function markCalled() {
  fetch(BASE + '/booking/leads/' + LEAD_ID + '/call', { method: 'POST' })
    .then(function() {
      var btn = document.getElementById('callBtn');
      btn.textContent = '📞 Called ✅';
      btn.classList.add('done');
    }).catch(function(){});
}

function submitFeedback() {
  var text = document.getElementById('fbText').value.trim();
  if (!text) { alert('Feedback likho pehle'); return; }
  var btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  fetch(BASE + '/booking/leads/' + LEAD_ID + '/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text })
  }).then(function(r) { return r.json(); }).then(function() {
    document.getElementById('successBox').style.display = 'block';
    btn.textContent = '✅ Saved!';
  }).catch(function() {
    btn.disabled = false;
    btn.textContent = 'Submit Feedback';
    alert('Error — dobara try karo');
  });
}
</script>
</body>
</html>`);
});

app.get('/health', (req, res) => {
  console.log('[Health] Probe from', req.ip, req.headers['user-agent'] || 'unknown');
  res.json({ status: 'ok', version: 'v3-baileys', timestamp: new Date().toISOString() });
});
app.get('/debug/lid-map', (req, res) => {
  const map = {};
  waSessions.getLidPhoneMap().forEach((v, k) => { map[k] = v; });
  res.json({ size: Object.keys(map).length, map });
});
app.get('/wa-status', (req, res) => res.json({ connected: waSessions.getStatus() === 'open', qrPending: !!waSessions.getQRImage() }));

// Pair status — page polls this
app.get('/pair-status', (req, res) => {
  res.json({
    connected: waSessions.getStatus() === 'open',
    code: waSessions.getPairingCode() || null,
    qrPending: !!waSessions.getQRImage(),
  });
});

// Request pairing code — POST { phone: "918469222619" }
app.post('/request-pair', async (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) return res.status(400).json({ error: 'Valid phone number required' });
  const client = db.get('clients').filter({ status: 'active' }).value()[0];
  if (!client) return res.status(404).json({ error: 'No active client' });
  try {
    await waSessions.startClient(client.id, phone);
    res.json({ ok: true, message: 'Pairing code aa raha hai 10-15 seconds mein...' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// QR image endpoint — returns fresh QR as PNG
app.get('/qr-image', async (req, res) => {
  const qr = waSessions.getQRImage();
  if (!qr) return res.status(404).send('no qr');
  try {
    const QRCode = require('qrcode');
    const buf = await QRCode.toBuffer(qr, { width: 300, margin: 2 });
    res.set('Content-Type', 'image/png').set('Cache-Control', 'no-store').send(buf);
  } catch(e) { res.status(500).send('error'); }
});

// Green API style QR page
app.get('/qr', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp — Scan QR Code</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.header{width:100%;background:#fff;border-bottom:1px solid #e8eaed;padding:0 24px;height:56px;display:flex;align-items:center;position:fixed;top:0;left:0;z-index:10}
.header-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
.header-logo .dot{width:32px;height:32px;background:#25d366;border-radius:8px;display:flex;align-items:center;justify-content:center}
.header-logo .dot svg{width:20px;height:20px;fill:#fff}
.header-logo .title{font-size:16px;font-weight:600;color:#1a1a2e}
.header-logo .badge{font-size:11px;background:#f0faf4;color:#25d366;border:1px solid #b7e4c7;border-radius:4px;padding:1px 7px;font-weight:500}
.wrap{margin-top:56px;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;gap:32px;flex-wrap:wrap}
.card{background:#fff;border:1px solid #e8eaed;border-radius:16px;padding:32px 36px;width:360px;flex-shrink:0}
.card-title{font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.card-sub{font-size:13px;color:#6b7280;margin-bottom:24px}
.status-row{display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:10px 14px;background:#f9fafb;border-radius:8px;border:1px solid #e8eaed}
.status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;transition:background .3s}
.status-dot.waiting{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}
.status-dot.connecting{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2)}
.status-dot.connected{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.2)}
.status-text{font-size:13px;font-weight:500;color:#374151}
.timer-badge{margin-left:auto;font-size:11px;color:#9ca3af;font-variant-numeric:tabular-nums}
.qr-box{background:#fff;border:2px solid #e8eaed;border-radius:12px;padding:16px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;aspect-ratio:1;margin-bottom:16px}
.qr-box img{width:100%;height:100%;object-fit:contain;display:block;transition:opacity .3s}
.qr-box .qr-overlay{position:absolute;inset:0;background:rgba(255,255,255,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;opacity:0;transition:opacity .3s;pointer-events:none}
.qr-box .qr-overlay.show{opacity:1}
.spinner{width:36px;height:36px;border:3px solid #e8eaed;border-top-color:#25d366;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.qr-hint{font-size:12px;color:#6b7280;text-align:center;margin-bottom:20px}
.connected-box{text-align:center;padding:20px 0;display:none}
.connected-box .icon{width:64px;height:64px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px}
.connected-box .msg{font-size:18px;font-weight:700;color:#15803d}
.connected-box .sub{font-size:13px;color:#6b7280;margin-top:6px}
.refresh-btn{width:100%;padding:11px;background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;font-size:13px;color:#374151;cursor:pointer;font-weight:500;transition:background .15s}
.refresh-btn:hover{background:#f3f4f6}
.steps-card{background:#fff;border:1px solid #e8eaed;border-radius:16px;padding:28px;width:300px;flex-shrink:0}
.steps-title{font-size:14px;font-weight:600;color:#1a1a2e;margin-bottom:20px}
.step{display:flex;gap:14px;margin-bottom:20px;align-items:flex-start}
.step:last-child{margin-bottom:0}
.step-num{width:28px;height:28px;border-radius:50%;background:#f0fdf4;border:1.5px solid #86efac;color:#16a34a;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.step-body .step-head{font-size:13px;font-weight:600;color:#1a1a2e;margin-bottom:2px}
.step-body .step-desc{font-size:12px;color:#6b7280;line-height:1.5}
.info-box{margin-top:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px}
.info-box p{font-size:12px;color:#15803d;line-height:1.6}
</style>
</head>
<body>
<header class="header">
  <div class="header-logo">
    <div class="dot">
      <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
    </div>
    <span class="title">WhatsApp SaaS</span>
    <span class="badge">Local</span>
  </div>
</header>

<div class="wrap">
  <div class="card">
    <div class="card-title">Scan QR Code</div>
    <div class="card-sub">Bot number <strong>8469222619</strong> se connect karo</div>

    <div class="status-row">
      <div class="status-dot waiting" id="statusDot"></div>
      <div class="status-text" id="statusText">Waiting for scan...</div>
      <div class="timer-badge" id="timerBadge"></div>
    </div>

    <div id="qrSection">
      <div class="qr-box" id="qrBox">
        <img id="qrImg" src="/qr-image?t=0" alt="QR Code" onerror="onQrError()">
        <div class="qr-overlay show" id="qrOverlay">
          <div class="spinner"></div>
          <div style="font-size:13px;color:#6b7280">QR generate ho raha hai...</div>
        </div>
      </div>
      <div class="qr-hint">QR code 60 seconds mein expire hota hai — tab auto-refresh hoga</div>
      <button class="refresh-btn" onclick="forceRefresh()">↻ &nbsp;Refresh QR</button>
    </div>

    <div class="connected-box" id="connectedBox">
      <div class="icon">✅</div>
      <div class="msg">WhatsApp Connected!</div>
      <div class="sub">Bot ab live hai aur messages le raha hai</div>
    </div>
  </div>

  <div class="steps-card">
    <div class="steps-title">WhatsApp se kaise connect karein</div>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <div class="step-head">WhatsApp kholo</div>
        <div class="step-desc">Phone mein WhatsApp ya WhatsApp Business app open karo</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <div class="step-head">Linked Devices</div>
        <div class="step-desc">⋮ Menu (3 dots) → Linked Devices → Link a Device</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <div class="step-head">QR Scan Karo</div>
        <div class="step-desc">Camera se is page ka QR code scan karo</div>
      </div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-body">
        <div class="step-head">Wait karo</div>
        <div class="step-desc">Connected hone ke baad yeh page automatically update ho jayega</div>
      </div>
    </div>
    <div class="info-box">
      <p>💡 <strong>Tip:</strong> Sirf ek baar scan karna hai. Session save rehta hai — next time automatically connect hoga.</p>
    </div>
  </div>
</div>

<script>
var countdown = 60;
var timerInterval = null;
var pollInterval = null;
var lastQrTs = 0;
var isConnected = false;

function startCountdown() {
  countdown = 60;
  clearInterval(timerInterval);
  timerInterval = setInterval(function() {
    countdown--;
    var badge = document.getElementById('timerBadge');
    if (countdown > 0) {
      badge.textContent = 'Expires in ' + countdown + 's';
    } else {
      badge.textContent = 'Refreshing...';
      clearInterval(timerInterval);
    }
  }, 1000);
}

function onQrError() {
  document.getElementById('qrOverlay').className = 'qr-overlay show';
  document.getElementById('statusText').textContent = 'QR generate ho raha hai...';
  document.getElementById('statusDot').className = 'status-dot connecting';
}

function forceRefresh() {
  var img = document.getElementById('qrImg');
  var overlay = document.getElementById('qrOverlay');
  overlay.className = 'qr-overlay show';
  img.src = '/qr-image?t=' + Date.now();
  img.onload = function() {
    overlay.className = 'qr-overlay';
    startCountdown();
  };
  img.onerror = onQrError;
}

function setConnected() {
  isConnected = true;
  clearInterval(pollInterval);
  clearInterval(timerInterval);
  document.getElementById('qrSection').style.display = 'none';
  document.getElementById('connectedBox').style.display = 'block';
  document.getElementById('statusDot').className = 'status-dot connected';
  document.getElementById('statusText').textContent = 'Connected';
  document.getElementById('timerBadge').textContent = '';
}

function poll() {
  fetch('/wa-status').then(function(r){ return r.json(); }).then(function(d) {
    if (d.connected) { setConnected(); return; }

    var dot = document.getElementById('statusDot');
    var txt = document.getElementById('statusText');

    if (d.qrPending) {
      var now = Date.now();
      if (now - lastQrTs > 28000) {
        lastQrTs = now;
        var img = document.getElementById('qrImg');
        var overlay = document.getElementById('qrOverlay');
        overlay.className = 'qr-overlay show';
        var newSrc = '/qr-image?t=' + now;
        img.onload = function() {
          overlay.className = 'qr-overlay';
          dot.className = 'status-dot waiting';
          txt.textContent = 'Waiting for scan...';
          startCountdown();
        };
        img.onerror = onQrError;
        img.src = newSrc;
      }
    } else {
      dot.className = 'status-dot connecting';
      txt.textContent = 'Connecting to WhatsApp...';
      document.getElementById('timerBadge').textContent = '';
    }
  }).catch(function(){});
}

// Initial load
var initImg = document.getElementById('qrImg');
initImg.onload = function() {
  document.getElementById('qrOverlay').className = 'qr-overlay';
  document.getElementById('statusDot').className = 'status-dot waiting';
  document.getElementById('statusText').textContent = 'Waiting for scan...';
  lastQrTs = Date.now();
  startCountdown();
};
initImg.onerror = onQrError;
initImg.src = '/qr-image?t=' + Date.now();

pollInterval = setInterval(poll, 3000);
</script>
</body>
</html>`);
});

// Pairing Code page — Green API style
app.get('/pair', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WhatsApp — Pairing Code</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#f7f8fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center}
.header{width:100%;background:#fff;border-bottom:1px solid #e8eaed;padding:0 24px;height:56px;display:flex;align-items:center;gap:12px;position:fixed;top:0;left:0}
.hlogo{width:32px;height:32px;background:#25d366;border-radius:8px;display:flex;align-items:center;justify-content:center}
.hlogo svg{width:20px;height:20px;fill:#fff}
.htitle{font-size:16px;font-weight:600;color:#1a1a2e}
.hbadge{font-size:11px;background:#f0faf4;color:#25d366;border:1px solid #b7e4c7;border-radius:4px;padding:1px 7px;font-weight:500}
.hlinks{margin-left:auto;display:flex;gap:8px}
.hlinks a{font-size:12px;color:#6b7280;text-decoration:none;padding:5px 10px;border:1px solid #e8eaed;border-radius:6px;background:#fff}
.hlinks a:hover{background:#f3f4f6}
.wrap{margin-top:56px;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;gap:32px;flex-wrap:wrap}
.card{background:#fff;border:1px solid #e8eaed;border-radius:16px;padding:32px 36px;width:380px;flex-shrink:0}
.card-title{font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
.card-sub{font-size:13px;color:#6b7280;margin-bottom:24px}
.status-row{display:flex;align-items:center;gap:8px;margin-bottom:24px;padding:10px 14px;background:#f9fafb;border-radius:8px;border:1px solid #e8eaed}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;transition:background .3s}
.dot.idle{background:#d1d5db}
.dot.loading{background:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2);animation:pulse 1.5s infinite}
.dot.ready{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}
.dot.connected{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.2)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.stxt{font-size:13px;font-weight:500;color:#374151}
.timer{margin-left:auto;font-size:11px;color:#9ca3af;font-variant-numeric:tabular-nums}

.input-row{display:flex;gap:8px;margin-bottom:24px}
.input-row input{flex:1;padding:10px 14px;border:1.5px solid #e8eaed;border-radius:8px;font-size:14px;outline:none;transition:border .15s}
.input-row input:focus{border-color:#25d366}
.input-row button{padding:10px 18px;background:#25d366;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s;white-space:nowrap}
.input-row button:hover{background:#1ebe5d}
.input-row button:disabled{background:#a7f3d0;cursor:not-allowed}

.code-box{background:#f0fdf4;border:2px solid #86efac;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px}
.code-label{font-size:12px;color:#16a34a;font-weight:600;letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px}
.code-digits{font-size:42px;font-weight:800;letter-spacing:14px;color:#15803d;font-family:'Courier New',monospace;line-height:1}
.code-timer{font-size:12px;color:#6b7280;margin-top:10px}

.loading-box{text-align:center;padding:32px 0;display:none}
.spinner{width:40px;height:40px;border:3px solid #e8eaed;border-top-color:#25d366;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-box p{font-size:14px;color:#6b7280}

.connected-box{text-align:center;padding:20px 0;display:none}
.connected-icon{font-size:48px;margin-bottom:12px}
.connected-msg{font-size:18px;font-weight:700;color:#15803d}
.connected-sub{font-size:13px;color:#6b7280;margin-top:6px}

.steps-card{background:#fff;border:1px solid #e8eaed;border-radius:16px;padding:28px;width:300px;flex-shrink:0}
.steps-title{font-size:14px;font-weight:600;color:#1a1a2e;margin-bottom:20px}
.step{display:flex;gap:14px;margin-bottom:20px;align-items:flex-start}
.step:last-child{margin-bottom:0}
.snum{width:28px;height:28px;border-radius:50%;background:#f0fdf4;border:1.5px solid #86efac;color:#16a34a;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.sh{font-size:13px;font-weight:600;color:#1a1a2e;margin-bottom:2px}
.sd{font-size:12px;color:#6b7280;line-height:1.5}
.tip{margin-top:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px}
.tip p{font-size:12px;color:#92400e;line-height:1.6}
</style>
</head>
<body>
<header class="header">
  <div class="hlogo">
    <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
  </div>
  <span class="htitle">WhatsApp SaaS</span>
  <span class="hbadge">Local</span>
  <div class="hlinks">
    <a href="/qr">QR Code</a>
    <a href="/pair" style="background:#f0fdf4;color:#16a34a;border-color:#86efac">Pairing Code</a>
  </div>
</header>

<div class="wrap">
  <div class="card">
    <div class="card-title">Pairing Code se Connect</div>
    <div class="card-sub">WhatsApp number daalo — 8-digit code milega</div>

    <div class="status-row">
      <div class="dot idle" id="dot"></div>
      <div class="stxt" id="stxt">Ready — number daalo</div>
      <div class="timer" id="timer"></div>
    </div>

    <div id="inputSection">
      <div class="input-row">
        <input type="tel" id="phoneInput" placeholder="918469222619" value="918469222619" maxlength="15">
        <button id="genBtn" onclick="generate()">Code Lao</button>
      </div>
    </div>

    <div class="loading-box" id="loadingBox">
      <div class="spinner"></div>
      <p>Code generate ho raha hai...<br><small>10-15 seconds lagenge</small></p>
    </div>

    <div id="codeSection" style="display:none">
      <div class="code-box">
        <div class="code-label">WhatsApp Pairing Code</div>
        <div class="code-digits" id="codeDisplay">--------</div>
        <div class="code-timer" id="codeTimer">60 seconds mein expire hoga</div>
      </div>
      <button onclick="generate()" style="width:100%;padding:10px;background:#f9fafb;border:1px solid #e8eaed;border-radius:8px;font-size:13px;color:#374151;cursor:pointer;font-weight:500">↻ &nbsp;Naya Code Generate Karo</button>
    </div>

    <div class="connected-box" id="connectedBox">
      <div class="connected-icon">✅</div>
      <div class="connected-msg">WhatsApp Connected!</div>
      <div class="connected-sub">Bot ab live hai aur messages le raha hai</div>
    </div>
  </div>

  <div class="steps-card">
    <div class="steps-title">Code kaise use karein</div>
    <div class="step">
      <div class="snum">1</div>
      <div>
        <div class="sh">Number daalo</div>
        <div class="sd">WhatsApp number with country code daalo (jaise 918469222619)</div>
      </div>
    </div>
    <div class="step">
      <div class="snum">2</div>
      <div>
        <div class="sh">Code Lao button dabao</div>
        <div class="sd">10-15 second mein 8-digit code aayega</div>
      </div>
    </div>
    <div class="step">
      <div class="snum">3</div>
      <div>
        <div class="sh">WhatsApp kholo</div>
        <div class="sd">⋮ Menu → Linked Devices → Link a Device</div>
      </div>
    </div>
    <div class="step">
      <div class="snum">4</div>
      <div>
        <div class="sh">"Link with phone number" dabao</div>
        <div class="sd">QR screen pe neeche "Link with phone number instead" option hoga</div>
      </div>
    </div>
    <div class="step">
      <div class="snum">5</div>
      <div>
        <div class="sh">Code enter karo</div>
        <div class="sd">Yahan dikhaya code 60 sec ke andar WhatsApp mein type karo</div>
      </div>
    </div>
    <div class="tip">
      <p>⚠️ <strong>Dhyan do:</strong> Code 60 seconds mein expire hota hai. Jaldi enter karo. Expire ho jaye toh "Naya Code" button dabao.</p>
    </div>
  </div>
</div>

<script>
var polling = null;
var codeTimer = null;
var codeCountdown = 60;

function setStatus(dotClass, text, timerText) {
  document.getElementById('dot').className = 'dot ' + dotClass;
  document.getElementById('stxt').textContent = text;
  document.getElementById('timer').textContent = timerText || '';
}

function startCodeTimer() {
  codeCountdown = 60;
  clearInterval(codeTimer);
  codeTimer = setInterval(function() {
    codeCountdown--;
    document.getElementById('codeTimer').textContent = codeCountdown > 0
      ? codeCountdown + ' seconds mein expire hoga'
      : 'Code expire ho gaya — naya generate karo';
    if (codeCountdown <= 0) clearInterval(codeTimer);
  }, 1000);
}

function showConnected() {
  clearInterval(polling);
  clearInterval(codeTimer);
  document.getElementById('inputSection').style.display = 'none';
  document.getElementById('loadingBox').style.display = 'none';
  document.getElementById('codeSection').style.display = 'none';
  document.getElementById('connectedBox').style.display = 'block';
  setStatus('connected', 'Connected', '');
}

function generate() {
  var phone = document.getElementById('phoneInput').value.replace(/\\D/g, '');
  if (phone.length < 10) { alert('Valid phone number daalo'); return; }
  document.getElementById('genBtn').disabled = true;
  document.getElementById('inputSection').querySelector('input').disabled = true;
  document.getElementById('loadingBox').style.display = 'block';
  document.getElementById('codeSection').style.display = 'none';
  clearInterval(codeTimer);
  setStatus('loading', 'Code generate ho raha hai...', '');

  fetch('/request-pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: phone })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.error) {
      setStatus('idle', 'Error: ' + d.error, '');
      document.getElementById('loadingBox').style.display = 'none';
      document.getElementById('genBtn').disabled = false;
      document.getElementById('inputSection').querySelector('input').disabled = false;
    }
  }).catch(function(e) {
    setStatus('idle', 'Error — server se connect nahi hua', '');
    document.getElementById('loadingBox').style.display = 'none';
    document.getElementById('genBtn').disabled = false;
    document.getElementById('inputSection').querySelector('input').disabled = false;
  });
}

function poll() {
  fetch('/pair-status').then(function(r) { return r.json(); }).then(function(d) {
    if (d.connected) { showConnected(); return; }

    if (d.code) {
      document.getElementById('loadingBox').style.display = 'none';
      document.getElementById('codeSection').style.display = 'block';
      document.getElementById('codeDisplay').textContent = d.code;
      document.getElementById('genBtn').disabled = false;
      document.getElementById('inputSection').querySelector('input').disabled = false;
      setStatus('ready', 'Code ready — WhatsApp mein enter karo', '');
      if (document.getElementById('codeTimer').textContent.includes('expire ho gaya') ||
          document.getElementById('codeDisplay').textContent !== d.code) {
        startCodeTimer();
      }
      if (!document.getElementById('codeTimer').textContent.includes('seconds')) startCodeTimer();
    }
  }).catch(function(){});
}

// Check agar already connected hai
fetch('/pair-status').then(function(r){return r.json();}).then(function(d){
  if (d.connected) showConnected();
});

polling = setInterval(poll, 2000);
</script>
</body>
</html>`);
});

app.listen(PORT, async () => {
  console.log(`[Server] Running on port ${PORT}`);
  waSessions.setDB(db);
  reporter.init(db, waSessions);
  await bookingService.init(db, waSessions);
  await waSessions.bootSessions(db);

  // Self-ping every 14 min — keep-alive
  const selfUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const cron = require('node-cron');
  const axios = require('axios');
  cron.schedule('*/14 * * * *', () => {
    axios.get(`${selfUrl}/health`, { timeout: 10000 })
      .then(() => console.log('[KeepAlive] Ping OK'))
      .catch(e => console.warn('[KeepAlive] Ping failed:', e.message));
  });
});
