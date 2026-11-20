/* POST /api/reload — the dashboard's "Update text line" button.
 *
 * Makes the SMS service re-read the Google Sheet so edits reach texters right
 * away. Signed-in dashboard staff only; the shared key that the SMS service
 * requires is added here, server-side, so it never reaches the browser.
 */
const { isSignedIn } = require('../lib/dashboard-auth');
const { smsBase, smsHeaders, sameOrigin } = require('../lib/sms-api');

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (statusCode, body) => ({ statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });

  const h = event.headers || {};
  if (!isSignedIn(h.cookie || h.Cookie || '')) return reply(401, { error: 'Sign in to the dashboard first.' });
  if (!sameOrigin(h)) return reply(403, { error: 'Forbidden' });

  const base = smsBase();
  if (!base) return reply(503, { error: 'HOPE702_SMS_URL is not set' });

  try {
    /* Netlify stops a function at 10 s; a sheet read normally takes 1–3 s. */
    const r = await fetch(base + '/reload', {
      method: 'POST', headers: smsHeaders(), signal: AbortSignal.timeout(9000)
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) return reply(200, { ok: true, resources: data.resources });
    if (r.status === 401 || r.status === 503) {
      return reply(502, { error: 'The text line refused the request. Check that HOPE702_API_KEY matches on Netlify and Railway.' });
    }
    return reply(502, { error: data.error || ('text line answered ' + r.status), resources: data.resources });
  } catch (err) {
    console.error('reload proxy failed:', err.message);
    return reply(504, { error: 'The text line did not answer in time. Try again in a minute.' });
  }
};
