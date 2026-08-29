import crypto from 'node:crypto';

export const ENABLE_BANKING_APP_ID = process.env.ENABLE_BANKING_APP_ID || '8b708426-58a5-4057-9640-a886fd48b6c3';
export const ENABLE_BANKING_API = 'https://api.enablebanking.com';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

export function getPrivateKey() {
  if (process.env.ENABLE_BANKING_PRIVATE_KEY_B64) {
    return Buffer.from(process.env.ENABLE_BANKING_PRIVATE_KEY_B64, 'base64').toString('utf8');
  }
  if (process.env.ENABLE_BANKING_PRIVATE_KEY) {
    return process.env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  throw new Error('ENABLE_BANKING_PRIVATE_KEY_B64 is not configured');
}

export function createEnableBankingJwt(ttlSeconds = 900) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: ENABLE_BANKING_APP_ID }));
  const payload = base64url(JSON.stringify({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + Math.min(Math.max(ttlSeconds, 60), 3600),
  }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), getPrivateKey()).toString('base64url');
  return `${signingInput}.${signature}`;
}

export async function ebFetch(path, options = {}) {
  const response = await fetch(`${ENABLE_BANKING_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${createEnableBankingJwt()}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    cache: 'no-store',
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    const err = new Error(body?.error?.message || body?.detail || body?.message || `Enable Banking HTTP ${response.status}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

function cookieSecret() {
  return crypto.createHash('sha256').update(getPrivateKey()).digest();
}

export function signCookiePayload(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', cookieSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyCookiePayload(value) {
  if (!value || !value.includes('.')) return null;
  const [encoded, sig] = value.split('.');
  const expected = crypto.createHmac('sha256', cookieSecret()).update(encoded).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return null; }
}

export function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const item of raw.split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
