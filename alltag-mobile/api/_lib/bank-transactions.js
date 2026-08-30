import crypto from 'node:crypto';
import { ebFetch, getCookie, verifyCookiePayload } from './enablebanking.js';

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function dateOnly(value) {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function text(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).join(' · ');
  return value == null ? '' : String(value);
}

function txText(row) {
  const parts = [
    row?.card_acceptor?.name,
    row?.merchant?.name,
    row?.creditor?.name,
    row?.debtor?.name,
    text(row?.remittance_information),
    row?.note,
    row?.bank_transaction_code?.description,
    row?.proprietary_bank_transaction_code?.code,
  ];
  return parts.filter(Boolean).map(v => String(v).trim()).filter(Boolean).join(' · ');
}

function stableRef(provider, accountUid, row) {
  const entry = String(row?.entry_reference || '').trim();
  if (entry) return `${provider}:${accountUid}:${entry}`;
  const material = JSON.stringify({
    accountUid,
    amount: row?.transaction_amount?.amount,
    currency: row?.transaction_amount?.currency,
    indicator: row?.credit_debit_indicator,
    date: row?.booking_date || row?.transaction_date || row?.value_date,
    text: txText(row),
  });
  return `${provider}:${accountUid}:h:${crypto.createHash('sha256').update(material).digest('base64url').slice(0, 32)}`;
}

function normalize(provider, accountUid, row) {
  const currency = String(row?.transaction_amount?.currency || '').toUpperCase();
  const rawAmount = Number(row?.transaction_amount?.amount);
  if (currency !== 'EUR' || !Number.isFinite(rawAmount) || rawAmount === 0) return null;

  const indicator = String(row?.credit_debit_indicator || '').toUpperCase();
  const type = indicator === 'DBIT' ? 'expense' : indicator === 'CRDT' ? 'income' : rawAmount < 0 ? 'expense' : 'income';
  const preferredParty = type === 'expense' ? row?.creditor?.name : row?.debtor?.name;
  const alternateParty = type === 'expense' ? row?.debtor?.name : row?.creditor?.name;
  const merchant = String(row?.card_acceptor?.name || row?.merchant?.name || preferredParty || alternateParty || '').trim();
  const remittance = text(row?.remittance_information).trim();
  const description = [merchant, remittance, row?.note, row?.bank_transaction_code?.description]
    .filter(Boolean).map(v => String(v).trim()).filter(Boolean).join(' · ');
  const date = dateOnly(row?.transaction_date || row?.booking_date || row?.value_date);
  if (!date) return null;

  return {
    ref: stableRef(provider, accountUid, row),
    provider,
    accountUid,
    type,
    amount: Math.abs(rawAmount),
    currency: 'EUR',
    date,
    merchant: merchant || remittance || 'Bankbuchung',
    description: description || 'Bankbuchung',
    mcc: row?.merchant_category_code ? String(row.merchant_category_code) : '',
    status: String(row?.status || 'BOOK'),
    bankCode: String(row?.bank_transaction_code?.description || row?.proprietary_bank_transaction_code?.code || ''),
  };
}

function consentDenied(error) {
  const blob = JSON.stringify(error?.body || error?.message || '').toUpperCase();
  return error?.status === 403 || /ACCESS_DENIED|CONSENT|TRANSACTION.*NOT.*ALLOWED|PERMISSION/.test(blob);
}

function sessionExpired(error) {
  const blob = JSON.stringify(error?.body || error?.message || '').toUpperCase();
  return error?.status === 401 || /EXPIRED_SESSION|SESSION.*EXPIRED/.test(blob);
}

function defaultFrom() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

async function readAccountTransactions(req, provider, accountUid, from, to) {
  const out = [];
  let continuation = '';
  for (let page = 0; page < 4; page += 1) {
    const qs = new URLSearchParams({ date_from: from, date_to: to, transaction_status: 'BOOK' });
    if (continuation) qs.set('continuation_key', continuation);
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const headers = {};
    if (forwarded) headers['Psu-Ip-Address'] = forwarded;
    if (req.headers['user-agent']) headers['Psu-User-Agent'] = String(req.headers['user-agent']);
    const payload = await ebFetch(`/accounts/${encodeURIComponent(accountUid)}/transactions?${qs.toString()}`, { headers });
    const rows = Array.isArray(payload?.transactions) ? payload.transactions : Array.isArray(payload?.booked) ? payload.booked : [];
    for (const row of rows) {
      const tx = normalize(provider, accountUid, row);
      if (tx) out.push(tx);
    }
    continuation = String(payload?.continuation_key || '');
    if (!continuation) break;
  }
  return out;
}

export async function handleBankTransactions(req, res, { cookieName, provider }) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const auth = verifyCookiePayload(getCookie(req, cookieName));
  if (!auth?.accounts?.length) return res.status(401).json({ connected: false, reconnectRequired: true });

  const from = isDate(req.query?.date_from) ? String(req.query.date_from) : defaultFrom();
  const to = isDate(req.query?.date_to) ? String(req.query.date_to) : today();
  if (from > to) return res.status(400).json({ error: 'invalid_date_range' });

  const maxStart = new Date(`${to}T12:00:00`);
  maxStart.setDate(maxStart.getDate() - 95);
  const minAllowed = maxStart.toISOString().slice(0, 10);
  const safeFrom = from < minAllowed ? minAllowed : from;

  try {
    const all = [];
    let consentRequired = false;
    let expired = false;
    let successfulAccounts = 0;

    for (const account of auth.accounts.slice(0, 8)) {
      const uid = typeof account === 'string' ? account : account?.uid;
      if (!uid) continue;
      try {
        const rows = await readAccountTransactions(req, provider, uid, safeFrom, to);
        successfulAccounts += 1;
        all.push(...rows);
      } catch (error) {
        if (sessionExpired(error)) expired = true;
        else if (consentDenied(error)) consentRequired = true;
        else console.warn(`${provider}-transactions-account`, error?.status, error?.body || error?.message);
      }
    }

    if (expired && successfulAccounts === 0) {
      return res.status(401).json({ connected: false, reconnectRequired: true });
    }
    if (consentRequired && successfulAccounts === 0) {
      return res.status(409).json({ connected: true, transactionsConsentRequired: true, transactions: [] });
    }

    const deduped = [...new Map(all.map(tx => [tx.ref, tx])).values()]
      .sort((a, b) => b.date.localeCompare(a.date));
    return res.status(200).json({
      connected: true,
      transactionsConsentRequired: consentRequired,
      provider,
      dateFrom: safeFrom,
      dateTo: to,
      transactions: deduped,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`${provider}-transactions`, error?.status, error?.body || error?.message);
    return res.status(503).json({ connected: true, error: 'transactions_unavailable' });
  }
}
