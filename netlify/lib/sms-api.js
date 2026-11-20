/* How the website's server talks to the SMS service on Railway.
 *
 * The SMS service's private endpoints (/api/activity, /reload) only answer a
 * request that carries the shared key in X-HOPE702-Key. The key lives in the
 * HOPE702_API_KEY environment variable on both sides (Netlify here, Railway
 * there) and never reaches a browser: the dashboard calls these functions,
 * and the functions add the key server-side.
 */

function smsBase() {
  return (process.env.HOPE702_SMS_URL || '').replace(/\/+$/, '');
}

function smsHeaders() {
  const key = (process.env.HOPE702_API_KEY || '').trim();
  return key ? { 'X-HOPE702-Key': key } : {};
}

/* POSTs that change something must come from this site's own pages. The
   session cookie is SameSite=Lax, which already keeps other sites from
   sending it on a POST; this is the second lock on the same door. */
function sameOrigin(headers) {
  const h = headers || {};
  const origin = h.origin || h.Origin || '';
  const host = h.host || h.Host || '';
  if (!origin) return true;            // non-browser clients send no Origin
  return origin === 'https://' + host || origin === 'http://' + host;
}

module.exports = { smsBase, smsHeaders, sameOrigin };
