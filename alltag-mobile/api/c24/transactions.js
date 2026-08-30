import { handleBankTransactions } from '../_lib/bank-transactions.js';

export default function handler(req, res) {
  return handleBankTransactions(req, res, {
    cookieName: 'alltag_c24',
    provider: 'c24'
  });
}
