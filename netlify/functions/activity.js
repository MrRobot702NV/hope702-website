/* Anonymous SMS demand aggregates for the dashboard.
 *
 * hope702.org is served by Netlify, so server.js (Railway) never runs for this
 * domain — the proxy has to live here to be reachable. It mirrors the Express
 * route in server.js exactly, so whichever host is in front behaves the same.
 *
 * The log itself lives with the SMS service, which owns the Railway volume it
 * is written to; a volume attaches to exactly one service, so the writer has to
 * be the reader. Set HOPE702_SMS_URL in Netlify's environment variables.
 */

function emptyActivity(note) {
  return {
    generated_at: new Date().toISOString(),
    unavailable: note,
    totals: { all_time: 0, this_week: 0, today: 0, people_this_week: 0 },
    by_zip: [], by_category: [], by_zip_category: [], by_day: []
  };
}

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: JSON_HEADERS, body: 'Method Not Allowed' };
  }

  const base = (process.env.HOPE702_SMS_URL || '').replace(/\/+$/, '');
  if (!base) {
    return {
      statusCode: 200, headers: JSON_HEADERS,
      body: JSON.stringify(emptyActivity('HOPE702_SMS_URL is not set'))
    };
  }

  try {
    const r = await fetch(base + '/api/activity',
                          { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('upstream ' + r.status);
    /* Pass the upstream payload straight through. It is already aggregates
       only — no rows, no digests — so there is nothing to strip here. */
    return { statusCode: 200, headers: JSON_HEADERS, body: await r.text() };
  } catch (err) {
    /* Degrade to a valid empty shape rather than a 5xx: the dashboard should
       render "demand feed unavailable", not break the page. */
    console.error('activity proxy failed:', err.message);
    return {
      statusCode: 200, headers: JSON_HEADERS,
      body: JSON.stringify(emptyActivity(String(err.message || err)))
    };
  }
};
