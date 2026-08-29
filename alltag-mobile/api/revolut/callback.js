import { ebFetch, cookie, getCookie, signCookiePayload } from '../_lib/enablebanking.js';

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
    const accounts = (session?.accounts || [])
      .filter(a => a?.uid)
      .slice(0, 8)
      .map(a => ({ uid: a.uid, currency: a.currency || '', product: a.product || '', details: a.details || '' }));
    if (!accounts.length) throw new Error('Keine Konten zurückgegeben');

    const payload = signCookiePayload({
      sessionId: session.session_id,
      accounts,
      validUntil: session?.access?.valid_until || null,
      connectedAt: new Date().toISOString(),
    });
    const maxAge = 180 * 24 * 60 * 60;
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
