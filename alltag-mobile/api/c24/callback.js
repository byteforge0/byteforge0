import { ebFetch, signCookiePayload, verifyCookiePayload } from '../_lib/enablebanking.js';
import { createHandoffToken } from '../_lib/c24-handoff.js';

function normalizeAccounts(session) {
  const found = new Map();

  const add = (uid, meta = {}) => {
    if (!uid || typeof uid !== 'string') return;
    const id = uid.trim();
    if (!id || found.has(id)) return;
    found.set(id, {
      uid: id,
      currency: meta.currency || '',
      product: meta.product || '',
      details: meta.details || ''
    });
  };

  const direct = Array.isArray(session?.accounts) ? session.accounts : [];
  for (const account of direct) {
    if (typeof account === 'string') add(account);
    else if (account && typeof account === 'object') add(account.uid, account);
  }

  const accountData = Array.isArray(session?.accounts_data) ? session.accounts_data : [];
  for (const account of accountData) {
    if (typeof account === 'string') add(account);
    else if (account && typeof account === 'object') add(account.uid, account);
  }

  return [...found.values()].slice(0, 8);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
}

function successPage(token) {
  const safeToken = JSON.stringify(token);
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>C24 bestätigt</title><style>body{margin:0;background:#081015;color:#f5f7f9;font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui;min-height:100vh;display:grid;place-items:center}.card{width:min(370px,calc(100% - 32px));background:#111a20;border:1px solid #ffffff17;border-radius:24px;padding:24px;box-sizing:border-box}.dot{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#33d0d8;color:#061014;font-size:24px;font-weight:900}h1{font-size:25px;margin:18px 0 8px}p{color:#9eabb1}.steps{margin:18px 0;padding:14px;border-radius:16px;background:#17242b;font-size:14px}.steps b{color:#fff}button{width:100%;height:52px;border:0;border-radius:15px;background:#f3f7f8;color:#101418;font:700 15px -apple-system,BlinkMacSystemFont,system-ui}.done{background:#33d0d8}</style></head><body><main class="card"><div class="dot">✓</div><h1>C24 bestätigt</h1><p>Die Bankfreigabe ist fertig. Weil iOS dich im Browser zurückbringt, übernehmen wir die Verbindung mit einem einmaligen verschlüsselten Code.</p><div class="steps"><b>1.</b> Auf „Code kopieren“ tippen.<br><b>2.</b> Browser schließen.<br><b>3.</b> Alltag über dein Homescreen-Icon öffnen.<br><b>4.</b> Dort „Verbindung übernehmen“ tippen.</div><button id="copy">Code kopieren</button></main><script>const token=${safeToken};document.getElementById('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(token);const b=document.getElementById('copy');b.textContent='Kopiert ✓';b.classList.add('done')}catch{prompt('Diesen Code kopieren:',token)}});</script></body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Verbindung fehlgeschlagen</title><style>body{margin:0;background:#09090a;color:#fff;font:16px/1.5 -apple-system,BlinkMacSystemFont,system-ui;min-height:100vh;display:grid;place-items:center}.card{width:min(360px,calc(100% - 32px));background:#151517;border-radius:24px;padding:24px;box-sizing:border-box}p{color:#aaa}</style></head><body><main class="card"><h1>Verbindung fehlgeschlagen</h1><p>${escapeHtml(message)}</p><p>Öffne Alltag erneut und starte die C24-Verbindung noch einmal.</p></main></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  res.setHeader('Cache-Control', 'no-store');
  const { code, state, error, error_description } = req.query || {};
  const parsed = verifyCookiePayload(state);
  const validState = parsed?.purpose === 'c24-auth' && Number(parsed?.exp || 0) > Date.now();

  if (error) return res.status(400).send(errorPage(error_description || error));
  if (!code || !state || !validState) return res.status(400).send(errorPage('Ungültige oder abgelaufene Rückmeldung von der Bank.'));

  try {
    const session = await ebFetch('/sessions', { method: 'POST', body: JSON.stringify({ code }) });
    let accounts = normalizeAccounts(session);

    if (!accounts.length && session?.session_id) {
      const details = await ebFetch(`/sessions/${encodeURIComponent(session.session_id)}`);
      accounts = normalizeAccounts(details);
    }

    if (!accounts.length) {
      console.warn('c24-session-no-accounts', JSON.stringify({
        sessionId: !!session?.session_id,
        accountCount: Array.isArray(session?.accounts) ? session.accounts.length : null,
        accountDataCount: Array.isArray(session?.accounts_data) ? session.accounts_data.length : null,
        accountTypes: Array.isArray(session?.accounts) ? session.accounts.slice(0, 4).map(a => typeof a) : []
      }));
      throw new Error('Keine Konten zurückgegeben');
    }

    const validUntil = session?.access?.valid_until || null;
    const cookiePayload = signCookiePayload({ sessionId:session.session_id, accounts, validUntil, connectedAt:new Date().toISOString() });
    const defaultMaxAge = 180 * 24 * 60 * 60;
    const expirySeconds = validUntil ? Math.floor((new Date(validUntil).getTime() - Date.now()) / 1000) : defaultMaxAge;
    const maxAge = Math.max(3600, Math.min(defaultMaxAge, Number.isFinite(expirySeconds) ? expirySeconds : defaultMaxAge));
    const token = createHandoffToken({ cookiePayload, maxAge, exp: Date.now() + 10 * 60 * 1000 });
    return res.status(200).send(successPage(token));
  } catch (e) {
    console.error('c24-callback', e?.status, e?.body || e?.message);
    return res.status(500).send(errorPage(e?.body?.detail || e?.body?.message || 'Verbindung konnte nicht abgeschlossen werden.'));
  }
}
