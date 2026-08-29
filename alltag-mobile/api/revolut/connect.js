import crypto from 'node:crypto';
import { ebFetch, cookie, getPrivateKey } from '../_lib/enablebanking.js';

const CALLBACK = 'https://alltag-mobile.vercel.app/api/revolut/callback';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  try {
    getPrivateKey();
    const result = await ebFetch('/aspsps?country=DE&psu_type=personal&service=AIS');
    const banks = Array.isArray(result?.aspsps) ? result.aspsps : [];
    const revolut = banks.find(b => /^revolut$/i.test(b.name)) || banks.find(b => /revolut/i.test(b.name));
    if (!revolut) return res.status(503).send('Revolut ist bei Enable Banking für Deutschland gerade nicht verfügbar.');

    const state = crypto.randomBytes(24).toString('base64url');
    const max = Number(revolut.maximum_consent_validity) || 90 * 24 * 60 * 60;
    const seconds = Math.max(3600, max - 300);
    const validUntil = new Date(Date.now() + seconds * 1000).toISOString();

    const auth = await ebFetch('/auth', {
      method: 'POST',
      body: JSON.stringify({
        access: { valid_until: validUntil, balances: true, transactions: false },
        aspsp: { name: revolut.name, country: revolut.country },
        state,
        redirect_url: CALLBACK,
        psu_type: 'personal',
        language: 'de',
      }),
    });

    if (!auth?.url) return res.status(502).send('Enable Banking hat keine Weiterleitungs-URL geliefert.');
    res.setHeader('Set-Cookie', cookie('alltag_revolut_state', state, 15 * 60));
    return res.redirect(302, auth.url);
  } catch (error) {
    console.error('revolut-connect', error?.status, error?.body || error?.message);
    return res.status(503).send('Revolut-Verbindung ist noch nicht eingerichtet. Prüfe das Vercel-Secret und die Enable-Banking-Aktivierung.');
  }
}
