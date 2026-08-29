import { cookie } from '../_lib/enablebanking.js';
import { readLinkRecord, writeLinkRecord, tokenHash, safeEqual } from '../_lib/revolut-link.js';

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { linkId, claimToken } = body(req);
    if (!linkId || !claimToken) return res.status(400).json({ error: 'invalid_request' });
    const record = await readLinkRecord(linkId);
    if (!safeEqual(record?.claimHash, tokenHash(claimToken))) return res.status(403).json({ error: 'invalid_claim' });

    if (record.status === 'pending') return res.status(202).json({ status: 'pending' });
    if (record.status === 'error') return res.status(400).json({ status: 'error', message: record.message || 'Revolut-Verbindung fehlgeschlagen' });
    if (record.status === 'claimed') return res.status(410).json({ status: 'claimed' });
    if (record.status !== 'ready' || !record.cookiePayload) return res.status(409).json({ status: 'invalid' });

    const maxAge = Math.max(3600, Math.min(180 * 24 * 60 * 60, Number(record.maxAge) || 30 * 24 * 60 * 60));
    res.setHeader('Set-Cookie', cookie('alltag_revolut', record.cookiePayload, maxAge));
    await writeLinkRecord(linkId, { ...record, status: 'claimed', cookiePayload: null, claimedAt: new Date().toISOString() });
    return res.status(200).json({ status: 'connected' });
  } catch (e) {
    console.error('revolut-claim', e?.message || e);
    return res.status(503).json({ error: 'claim_unavailable' });
  }
}
