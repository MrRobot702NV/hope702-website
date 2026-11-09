/* Serves /dashboard. Shows the login page until a correct password is posted,
 * then the dashboard itself. All logic lives in netlify/lib/dashboard-auth.js
 * so server.js behaves identically. */
const { handleDashboard } = require('../lib/dashboard-auth');

exports.handler = async (event) => {
  const headers = event.headers || {};
  let body = event.body || '';
  if (event.isBase64Encoded && body) body = Buffer.from(body, 'base64').toString('utf8');

  const res = await handleDashboard({
    method: event.httpMethod,
    cookie: headers.cookie || headers.Cookie || '',
    query: event.queryStringParameters || {},
    body
  });
  return { statusCode: res.status, headers: res.headers, body: res.body };
};
