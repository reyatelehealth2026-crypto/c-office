import crypto from 'node:crypto';

const TOKEN = process.env.C_OFFICE_ACCESS_TOKEN || process.env.C_OFFICE_PUBLIC_TOKEN || '';
const COOKIE_NAME = 'c_office_access';

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map((part) => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [
      decodeURIComponent(part.slice(0, index).trim()),
      decodeURIComponent(part.slice(index + 1).trim()),
    ];
  }).filter(Boolean));
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function tokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return bearer || req.query.access_token || req.query.token || parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
}

function accessDenied(req, res) {
  if (req.path.startsWith('/api/') || req.path.startsWith('/hooks/')) {
    return res.status(401).json({ error: 'access token required', code: 'ACCESS_TOKEN_REQUIRED' });
  }
  return res.status(401).type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>C-Office Access</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08091a;color:#f8fafc;font:15px system-ui}
form{width:min(420px,calc(100vw - 32px));display:grid;gap:14px;padding:24px;border:1px solid #26335f;border-radius:14px;background:#11152b}
input,button{min-height:42px;border-radius:8px;border:1px solid #33416d;padding:0 12px;background:#08091a;color:#fff}
button{background:#00d4ff;color:#051018;font-weight:700;cursor:pointer}
p{margin:0;color:#9ca3af;line-height:1.5}
</style></head><body>
<form method="get" action="/access">
<h1>C-Office Access</h1>
<p>ใส่ access token เพื่อเข้าใช้งานจากเครือข่ายภายนอก</p>
<input name="token" type="password" autocomplete="current-password" autofocus>
<input name="next" type="hidden" value="${encodeURIComponent(req.originalUrl || '/')}">
<button type="submit">Enter</button>
</form></body></html>`);
}

export function accessStatus() {
  return { enabled: !!TOKEN, cookieName: COOKIE_NAME };
}

export function accessLoginRoute(req, res) {
  if (!TOKEN) return res.redirect(req.query.next || '/');
  const supplied = req.query.token || req.query.access_token || '';
  if (!timingSafeEqualText(supplied, TOKEN)) return accessDenied(req, res);
  const next = String(req.query.next || '/');
  res.cookie(COOKIE_NAME, TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
  res.redirect(next.startsWith('/') ? next : '/');
}

export function requireAccessToken(req, res, next) {
  if (!TOKEN) return next();
  if (req.path === '/access') return next();
  if (timingSafeEqualText(tokenFromRequest(req), TOKEN)) return next();
  return accessDenied(req, res);
}
