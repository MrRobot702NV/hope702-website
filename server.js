const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* Serve all static files from this directory */
app.use(express.static(__dirname));

/* ── /api/activity ──────────────────────────────────────────────────────────
   Anonymous SMS demand aggregates. The log lives with the SMS service, which
   owns the Railway volume it is written to — a volume attaches to exactly one
   service, so the writer has to be the reader. Proxied through here so the
   dashboard's fetch is same-origin and needs no CORS.

   Set HOPE702_SMS_URL to the SMS service's base URL (e.g.
   https://hope702-sms-production.up.railway.app).                           */
const SMS_API = (process.env.HOPE702_SMS_URL || '').replace(/\/+$/, '');

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
  if (!SMS_API) return res.json(emptyActivity('HOPE702_SMS_URL is not set'));
  try {
    const r = await fetch(SMS_API + '/api/activity',
                          { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('upstream ' + r.status);
    res.json(await r.json());
  } catch (err) {
    /* Degrade to a valid empty shape rather than a 5xx: the dashboard should
       render "no demand data yet", not break the whole page. */
    console.error('activity proxy failed:', err.message);
    res.json(emptyActivity(String(err.message || err)));
  }
});

/* /dashboard → dashboard.html (no .html extension in URL) */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

/* Fallback: root → index.html */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`HOPE 702 running on port ${PORT}`);
});
