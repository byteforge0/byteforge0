import { ebFetch, cookie, getCookie, signCookiePayload } from '../_lib/enablebanking.js';

function normalizeAccounts(session) {
  const direct = Array.isArray(session?.accounts) ? session.accounts : [];
  return direct
    .filter(a => a && typeof a === 'object' && a.uid)
    .slice(0, 8)
    .map(a => ({
      uid: a.uid,
      currency: a.currency || '',
      product: a.product || '',
      details: a.details || ''
    }));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const { code, state, error, error_description } = req.query || {};
  const expectedState = getCookie(req, 'alltag_revolut_state');

  if (error) return res.redirect(302, `/?revolut=error&message=${encodeURIComponent(error_description || error)}`);
  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(302, '/?revolut=error&message=Ung%C3%BCltige%20R%C3%BCckmeldung');
  }

  try {
    const session = await ebFetch('/sessions', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });

    let accounts = normalizeAccounts(session);

    // The POST /sessions response normally contains full AccountResource objects.
    // If a bank/provider returns only account references, fetch the session once
    // more and recover UIDs from accounts_data.
    if (!accounts.length && session?.session_id) {
      const details = await ebFetch(`/sessions/${encodeURIComponent(session.session_id)}`);
      const byUid = Array.isArray(details?.accounts_data) ? details.accounts_data : [];
      accounts = byUid
        .filter(a => a?.uid)
        .slice(0, 8)
        .map(a => ({ uid: a.uid, currency: '', product: '', details: '' }));
    }

    if (!accounts.length) throw new Error('Keine Konten zurückgegeben');

    const validUntil = session?.access?.valid_until || null;
    const payload = signCookiePayload({
      sessionId: session.session_id,
      accounts,
      validUntil,
      connectedAt: new Date().toISOString(),
    });

    const defaultMaxAge = 180 * 24 * 60 * 60;
    const expirySeconds = validUntil
      ? Math.floor((new Date(validUntil).getTime() - Date.now()) / 1000)
      : defaultMaxAge;
    const maxAge = Math.max(3600, Math.min(defaultMaxAge, Number.isFinite(expirySeconds) ? expirySeconds : defaultMaxAge));

    res.setHeader('Set-Cookie', [
      cookie('alltag_revolut', payload, maxAge),
      cookie('alltag_revolut_state', '', 0),
    ]);
    return res.redirect(302, '/?revolut=connected');
  } catch (e) {
    console.error('revolut-callback', e?.status, e?.body || e?.message);
    return res.redirect(302, '/?revolut=error&message=Verbindung%20konnte%20nicht%20abgeschlossen%20werden');
  }
}
