import { cookie } from '../_lib/enablebanking.js';
import { readHandoffToken } from '../_lib/revolut-handoff.js';

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { token } = body(req);
    const payload = readHandoffToken(token);
    if (!payload?.cookiePayload || Number(payload?.exp || 0) < Date.now()) return res.status(400).json({ error: 'expired_or_invalid' });
    const maxAge = Math.max(3600, Math.min(180 * 24 * 60 * 60, Number(payload.maxAge) || 30 * 24 * 60 * 60));
    res.setHeader('Set-Cookie', cookie('alltag_revolut', payload.cookiePayload, maxAge));
    return res.status(200).json({ connected: true });
  } catch (e) {
    return res.status(400).json({ error: 'invalid_handoff' });
  }
}
