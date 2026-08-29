import { cookie } from '../_lib/enablebanking.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', cookie('alltag_c24', '', 0));
  return res.status(200).json({ connected: false });
}
