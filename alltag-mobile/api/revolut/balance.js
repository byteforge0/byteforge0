import { ebFetch, getCookie, verifyCookiePayload, cookie } from '../_lib/enablebanking.js';
import { handleBankTransactions } from '../_lib/bank-transactions.js';

const AVAILABLE_TYPES = ['ITAV', 'CLAV', 'FWAV', 'XPCD', 'OPAV'];
const BOOKED_TYPES = ['ITBD', 'CLBD', 'OPBD', 'PRCD'];

function chooseBalance(rows, types) {
  for (const type of types) {
    const row = rows.find(b => b?.balance_type === type && b?.balance_amount?.currency === 'EUR');
    if (row) return row;
  }
  return rows.find(b => b?.balance_amount?.currency === 'EUR') || null;
}

export default async function handler(req, res) {
  if (String(req.query?.transactions || '') === '1') {
    return handleBankTransactions(req, res, { cookieName: 'alltag_revolut', provider: 'revolut' });
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');
  try {
    const auth = verifyCookiePayload(getCookie(req, 'alltag_revolut'));
    if (!auth?.accounts?.length) return res.status(401).json({ connected: false });

    const results = await Promise.all(auth.accounts.map(async account => {
      try {
        const uid = typeof account === 'string' ? account : account?.uid;
        const data = await ebFetch(`/accounts/${encodeURIComponent(uid)}/balances`);
        const rows = Array.isArray(data?.balances) ? data.balances : [];
        const available = chooseBalance(rows, AVAILABLE_TYPES);
        const booked = chooseBalance(rows, BOOKED_TYPES);
        return {
          uid,
          currency: account?.currency || available?.balance_amount?.currency || booked?.balance_amount?.currency || '',
          available: available ? Number(available.balance_amount.amount) : null,
          booked: booked ? Number(booked.balance_amount.amount) : null,
          updatedAt: available?.last_change_date_time || booked?.last_change_date_time || null,
        };
      } catch (e) {
        return { uid: typeof account === 'string' ? account : account?.uid, error: e?.body || e?.message || 'balance_failed', status: e?.status || 500 };
      }
    }));

    const ok = results.filter(x => !x.error && x.currency === 'EUR');
    if (!ok.length) {
      const expired = results.some(x => x.status === 401 || x.status === 403 || /EXPIRED_SESSION/i.test(JSON.stringify(x.error || '')));
      if (expired) res.setHeader('Set-Cookie', cookie('alltag_revolut', '', 0));
      return res.status(expired ? 401 : 502).json({ connected: !expired, reconnectRequired: expired, accounts: results });
    }

    const availableTotal = ok.reduce((sum, x) => sum + (Number.isFinite(x.available) ? x.available : (Number.isFinite(x.booked) ? x.booked : 0)), 0);
    const bookedTotal = ok.reduce((sum, x) => sum + (Number.isFinite(x.booked) ? x.booked : (Number.isFinite(x.available) ? x.available : 0)), 0);
    return res.status(200).json({
      connected: true,
      currency: 'EUR',
      available: availableTotal,
      booked: bookedTotal,
      accountCount: ok.length,
      validUntil: auth.validUntil || null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('revolut-balance', e?.status, e?.body || e?.message);
    return res.status(503).json({ connected: false, error: 'revolut_unavailable' });
  }
}
