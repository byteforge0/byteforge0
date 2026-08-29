import { ebFetch, getCookie, signCookiePayload, verifyCookiePayload } from '../_lib/enablebanking.js';
import { readLinkRecord, writeLinkRecord } from '../_lib/revolut-link.js';

function normalizeAccounts(session) {
  const direct = Array.isArray(session?.accounts) ? session.accounts : [];
  return direct.filter(a => a && typeof a === 'object' && a.uid).slice(0, 8).map(a => ({
    uid: a.uid,
    currency: a.currency || '',
    product: a.product || '',
    details: a.details || ''
  }));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function page(ok, message) {
  const title = ok ? 'Revolut bestätigt' : 'Verbindung fehlgeschlagen';
  const accent = ok ? '#5fd38d' : '#ff6b6b';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>${title}</title><style>body{margin:0;background:#09090a;color:#f5f5f7;font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui;min-height:100vh;display:grid;place-items:center}.card{width:min(360px,calc(100% - 36px));background:#151517;border:1px solid rgba(255,255,255,.09);border-radius:24px;padding:24px;box-sizing:border-box}.dot{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:${accent};color:#0b0b0c;font-size:22px;font-weight:800}h1{font-size:24px;margin:18px 0 8px}p{color:#a0a0a6;margin:0 0 10px}.hint{margin-top:18px;padding:13px 14px;border-radius:15px;background:#202023;color:#ddd;font-size:14px}</style></head><body><main class="card"><div class="dot">${ok ? '✓' : '!'}</div><h1>${title}</h1><p>${escapeHtml(message)}</p>${ok ? '<div class="hint">Schließe jetzt diesen Browser und öffne <strong>Alltag</strong> über dein Homescreen-Icon. Die App übernimmt die Verbindung automatisch.</div>' : '<div class="hint">Öffne danach Alltag erneut und starte die Verbindung noch einmal.</div>'}</main></body></html>`;
}

async function markLinkError(state, message) {
  const parsed = verifyCookiePayload(state);
  if (!parsed?.linkId || parsed.purpose !== 'revolut-link') return;
  try {
    const record = await readLinkRecord(parsed.linkId);
    await writeLinkRecord(parsed.linkId, { ...record, status: 'error', message: String(message || 'Revolut-Verbindung fehlgeschlagen'), failedAt: new Date().toISOString() });
  } catch {}
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Cache-Control', 'no-store');
  const { code, state, error, error_description } = req.query || {};
  const parsedState = verifyCookiePayload(state);
  const legacyState = getCookie(req, 'alltag_revolut_state');
  const validNewState = parsedState?.purpose === 'revolut-link' && parsedState?.linkId && Number(parsedState?.exp || 0) > Date.now();
  const validLegacyState = !!state && !!legacyState && state === legacyState;

  if (error) {
    const message = error_description || error;
    console.warn('revolut-bank-error', JSON.stringify({ error, error_description: error_description || '' }));
    if (state) await markLinkError(state, message);
    return res.status(400).send(page(false, message));
  }
  if (!code || !state || (!validNewState && !validLegacyState)) {
    console.warn('revolut-callback-state', JSON.stringify({ hasCode: !!code, hasState: !!state, validNewState, validLegacyState }));
    return res.status(400).send(page(false, 'Ungültige Rückmeldung von der Bank.'));
  }

  try {
    const session = await ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
    let accounts = normalizeAccounts(session);
    if (!accounts.length && session?.session_id) {
      const details = await ebFetch(`/sessions/${encodeURIComponent(session.session_id)}`);
      const byUid = Array.isArray(details?.accounts_data) ? details.accounts_data : [];
      accounts = byUid.filter(a => a?.uid).slice(0, 8).map(a => ({ uid: a.uid, currency: '', product: '', details: '' }));
    }
    if (!accounts.length) throw new Error('Keine Konten zurückgegeben');

    const validUntil = session?.access?.valid_until || null;
    const cookiePayload = signCookiePayload({ sessionId: session.session_id, accounts, validUntil, connectedAt: new Date().toISOString() });
    const defaultMaxAge = 180 * 24 * 60 * 60;
    const expirySeconds = validUntil ? Math.floor((new Date(validUntil).getTime() - Date.now()) / 1000) : defaultMaxAge;
    const maxAge = Math.max(3600, Math.min(defaultMaxAge, Number.isFinite(expirySeconds) ? expirySeconds : defaultMaxAge));

    if (validNewState) {
      const record = await readLinkRecord(parsedState.linkId);
      await writeLinkRecord(parsedState.linkId, { ...record, status: 'ready', cookiePayload, maxAge, readyAt: new Date().toISOString() });
      return res.status(200).send(page(true, 'Die Freigabe bei Revolut wurde erfolgreich abgeschlossen.'));
    }

    return res.status(200).send(page(true, 'Die Freigabe wurde bestätigt. Öffne Alltag erneut, um die Verbindung zu übernehmen.'));
  } catch (e) {
    console.error('revolut-callback', e?.status, e?.body || e?.message);
    if (state) await markLinkError(state, e?.body?.detail || e?.body?.message || e?.message);
    return res.status(500).send(page(false, e?.body?.detail || e?.body?.message || 'Verbindung konnte nicht abgeschlossen werden.'));
  }
}
