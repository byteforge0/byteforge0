import { ebFetch, signCookiePayload, verifyCookiePayload } from '../_lib/enablebanking.js';
import { createHandoffToken } from '../_lib/revolut-handoff.js';

function normalizeAccounts(session) {
  const direct = Array.isArray(session?.accounts) ? session.accounts : [];
  return direct.filter(a => a?.uid).slice(0, 8).map(a => ({
    uid: a.uid,
    currency: a.currency || '',
    product: a.product || '',
    details: a.details || ''
  }));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function successPage(token) {
  const safeToken = JSON.stringify(token);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>Revolut bestätigt</title><style>body{margin:0;background:#09090a;color:#f5f5f7;font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui;min-height:100vh;display:grid;place-items:center}.card{width:min(370px,calc(100% - 32px));background:#151517;border:1px solid #ffffff17;border-radius:24px;padding:24px;box-sizing:border-box}.dot{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#5fd38d;color:#0b0b0c;font-size:24px;font-weight:900}h1{font-size:25px;margin:18px 0 8px}p{color:#a0a0a6}.steps{margin:18px 0;padding:14px;border-radius:16px;background:#202023;font-size:14px}.steps b{color:#fff}button{width:100%;height:52px;border:0;border-radius:15px;background:#f3f3f5;color:#101012;font:700 15px -apple-system,BlinkMacSystemFont,system-ui}.done{background:#5fd38d}</style></head><body><main class="card"><div class="dot">✓</div><h1>Revolut bestätigt</h1><p>Die Bankfreigabe ist fertig. Weil iOS dich in Chrome zurückgebracht hat, übernehmen wir die Verbindung mit einem einmaligen verschlüsselten Code.</p><div class="steps"><b>1.</b> Unten auf „Code kopieren“ tippen.<br><b>2.</b> Chrome schließen.<br><b>3.</b> Alltag über dein Homescreen-Icon öffnen.<br><b>4.</b> Dort „Verbindung übernehmen“ tippen.</div><button id="copy">Code kopieren</button></main><script>const token=${safeToken};document.getElementById('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(token);const b=document.getElementById('copy');b.textContent='Kopiert ✓';b.classList.add('done')}catch{prompt('Diesen Code kopieren:',token)}});</script></body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Verbindung fehlgeschlagen</title><style>body{margin:0;background:#09090a;color:#fff;font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui;min-height:100vh;display:grid;place-items:center}.card{width:min(360px,calc(100% - 32px));background:#151517;border-radius:24px;padding:24px;box-sizing:border-box}p{color:#aaa}</style></head><body><main class="card"><h1>Verbindung fehlgeschlagen</h1><p>${escapeHtml(message)}</p><p>Öffne Alltag erneut und starte die Verbindung noch einmal.</p></main></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Cache-Control', 'no-store');
  const { code, state, error, error_description } = req.query || {};
  const parsed = verifyCookiePayload(state);
  const validState = parsed?.purpose === 'revolut-auth' && Number(parsed?.exp || 0) > Date.now();

  if (error) return res.status(400).send(errorPage(error_description || error));
  if (!code || !state || !validState) return res.status(400).send(errorPage('Ungültige oder abgelaufene Rückmeldung von der Bank.'));

  try {
    const session = await ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
    let accounts = normalizeAccounts(session);
    if (!accounts.length && session?.session_id) {
      const details = await ebFetch(`/sessions/${encodeURIComponent(session.session_id)}`);
      const byUid = Array.isArray(details?.accounts_data) ? details.accounts_data : [];
      accounts = byUid.filter(a => a?.uid).slice(0, 8).map(a => ({ uid:a.uid, currency:'', product:'', details:'' }));
    }
    if (!accounts.length) throw new Error('Keine Konten zurückgegeben');

    const validUntil = session?.access?.valid_until || null;
    const cookiePayload = signCookiePayload({ sessionId:session.session_id, accounts, validUntil, connectedAt:new Date().toISOString() });
    const defaultMaxAge = 180 * 24 * 60 * 60;
    const expirySeconds = validUntil ? Math.floor((new Date(validUntil).getTime() - Date.now()) / 1000) : defaultMaxAge;
    const maxAge = Math.max(3600, Math.min(defaultMaxAge, Number.isFinite(expirySeconds) ? expirySeconds : defaultMaxAge));
    const token = createHandoffToken({ cookiePayload, maxAge, exp: Date.now() + 10 * 60 * 1000 });
    return res.status(200).send(successPage(token));
  } catch (e) {
    console.error('revolut-callback', e?.status, e?.body || e?.message);
    return res.status(500).send(errorPage(e?.body?.detail || e?.body?.message || 'Verbindung konnte nicht abgeschlossen werden.'));
  }
}
