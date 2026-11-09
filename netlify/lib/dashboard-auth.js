/* Server-side gate for the staff dashboard.
 *
 * The password is never in the page or the repo. It lives in the
 * DASHBOARD_PASSWORD environment variable (Netlify site settings). The
 * dashboard HTML lives in /private and is only sent after a correct login.
 *
 * A successful login sets an HttpOnly session cookie good for 12 hours. The
 * cookie is "<expiry>.<HMAC>" keyed off the password, so changing
 * DASHBOARD_PASSWORD signs everyone out immediately.
 *
 * Shared by netlify/functions/dashboard.js, netlify/functions/activity.js and
 * the Express fallback in server.js, so every host behaves the same.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const COOKIE = 'hope702_dash';
const SESSION_SECONDS = 12 * 60 * 60;

function password() {
  return (process.env.DASHBOARD_PASSWORD || '').trim();
}

function signingKey(pw) {
  return crypto.createHash('sha256').update('hope702-dashboard-session:' + pw).digest();
}

function sign(expiry, pw) {
  return crypto.createHmac('sha256', signingKey(pw)).update(String(expiry)).digest('hex');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(header, name) {
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/* True when the request carries a valid, unexpired session cookie. */
function isSignedIn(cookieHeader) {
  const pw = password();
  if (!pw) return false;
  const value = readCookie(cookieHeader, COOKIE);
  if (!value || value.indexOf('.') < 0) return false;
  const [expiry, sig] = value.split('.');
  const exp = Number(expiry);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, sign(exp, pw));
}

function sessionCookie(pw) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return `${COOKIE}=${exp}.${sign(exp, pw)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

const CLEAR_COOKIE = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/* Files in /private are bundled with the function (netlify.toml included_files).
 * Try the layouts Netlify and Express use so the same code works on both. */
function readPrivate(name) {
  const candidates = [
    path.join(__dirname, '..', '..', 'private', name),
    path.join(process.cwd(), 'private', name),
    process.env.LAMBDA_TASK_ROOT ? path.join(process.env.LAMBDA_TASK_ROOT, 'private', name) : null
  ].filter(Boolean);
  for (const p of candidates) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { /* try next */ }
  }
  throw new Error('private/' + name + ' not found');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function loginPage(message) {
  return readPrivate('login.html').replace('<!--LOGIN_MESSAGE-->', message ? escapeHtml(message) : '');
}

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store, private',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin'
};

function parseForm(body) {
  const params = new URLSearchParams(body || '');
  return { password: params.get('password') || '' };
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* One request in, one response out: { status, headers, body }.
 * req = { method, cookie, query, body } with body as a urlencoded string. */
async function handleDashboard(req) {
  const pw = password();
  const headers = Object.assign({}, PAGE_HEADERS);

  if (req.query && req.query.logout !== undefined) {
    return { status: 303, headers: Object.assign(headers, { 'Set-Cookie': CLEAR_COOKIE, Location: '/dashboard' }), body: '' };
  }

  if (!pw) {
    return { status: 503, headers, body: loginPage('The dashboard password has not been set up yet. Ask the site owner to add it.') };
  }

  if (req.method === 'POST') {
    const { password: given } = parseForm(req.body);
    if (given && safeEqual(given.trim(), pw)) {
      return { status: 303, headers: Object.assign(headers, { 'Set-Cookie': sessionCookie(pw), Location: '/dashboard' }), body: '' };
    }
    await delay(700); // slows down guessing
    return { status: 401, headers, body: loginPage('Incorrect password.') };
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return { status: 405, headers, body: 'Method Not Allowed' };
  }

  if (isSignedIn(req.cookie)) {
    return { status: 200, headers, body: readPrivate('dashboard.html') };
  }
  return { status: 200, headers, body: loginPage('') };
}

module.exports = { handleDashboard, isSignedIn };
