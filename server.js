const express = require('express');
const path    = require('path');

const { handleDashboard, isSignedIn } = require('./netlify/lib/dashboard-auth');
const { smsBase, smsHeaders, sameOrigin } = require('./netlify/lib/sms-api');

const app  = express();
const PORT = process.env.PORT || 3000;

/* Never serve the private dashboard files directly (they hold the dashboard
   itself and are only sent after a server-side login), nor the old path. */
app.use(['/private', '/dashboard.html'], (req, res) => res.status(404).send('Not found'));

/* /dashboard: same server-side login as the Netlify function. */
async function dashboard(req, res) {
  const out = await handleDashboard({
    method: req.method,
    cookie: req.headers.cookie || '',
    query: req.query || {},
    body: typeof req.body === 'string' ? req.body : ''
  });
  res.status(out.status).set(out.headers).send(out.body);
}
app.get('/dashboard', dashboard);
app.post('/dashboard', express.text({ type: 'application/x-www-form-urlencoded', limit: '2kb' }), dashboard);

/* Serve all other static files from this directory */
app.use(express.static(__dirname));

/* ── /api/activity ──────────────────────────────────────────────────────────
   Anonymous SMS demand aggregates. The log lives with the SMS service, which
   owns the Railway volume it is written to — a volume attaches to exactly one
   service, so the writer has to be the reader. Proxied through here so the
   dashboard's fetch is same-origin and needs no CORS.

   Set HOPE702_SMS_URL to the SMS service's base URL (e.g.
   https://hope702-sms-production.up.railway.app).                           */
const SMS_API = smsBase();

function emptyActivity(note) {
  return {
    generated_at: new Date().toISOString(),
    unavailable: note,
    totals: { all_time: 0, this_week: 0, today: 0, people_this_week: 0 },
    by_zip: [], by_category: [], by_zip_category: [], by_day: []
  };
}

app.get('/api/activity', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!isSignedIn(req.headers.cookie || '')) {
    return res.status(401).json({ error: 'Sign in to the dashboard first.' });
  }
  if (!SMS_API) return res.json(emptyActivity('HOPE702_SMS_URL is not set'));
  try {
    const r = await fetch(SMS_API + '/api/activity',
                          { headers: smsHeaders(), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('upstream ' + r.status);
    res.json(await r.json());
  } catch (err) {
    /* Degrade to a valid empty shape rather than a 5xx: the dashboard should
       render "no demand data yet", not break the whole page. */
    console.error('activity proxy failed:', err.message);
    res.json(emptyActivity(String(err.message || err)));
  }
});

/* POST /api/reload — same as netlify/functions/reload.js. */
app.post('/api/reload', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!isSignedIn(req.headers.cookie || '')) {
    return res.status(401).json({ error: 'Sign in to the dashboard first.' });
  }
  if (!sameOrigin(req.headers)) return res.status(403).json({ error: 'Forbidden' });
  if (!SMS_API) return res.status(503).json({ error: 'HOPE702_SMS_URL is not set' });
  try {
    const r = await fetch(SMS_API + '/reload', {
      method: 'POST', headers: smsHeaders(), signal: AbortSignal.timeout(9000)
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return res.json({ ok: true, resources: data.resources });
    if (r.status === 401 || r.status === 503) {
      return res.status(502).json({ error: 'The text line refused the request. Check that HOPE702_API_KEY matches on Netlify and Railway.' });
    }
    res.status(502).json({ error: data.error || ('text line answered ' + r.status), resources: data.resources });
  } catch (err) {
    console.error('reload proxy failed:', err.message);
    res.status(504).json({ error: 'The text line did not answer in time. Try again in a minute.' });
  }
});

/* /winter → winter.html */
app.get('/winter', (req, res) => {
  res.sendFile(path.join(__dirname, 'winter.html'));
});

/* Fallback: root → index.html */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HOPE 702 running on port ${PORT}`);
});
