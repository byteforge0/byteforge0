import crypto from 'node:crypto';
import { getPrivateKey } from './enablebanking.js';

const BASE = 'https://jsonblob.com/api/jsonBlob';

function key() {
  return crypto.createHash('sha256').update(getPrivateKey()).update('alltag-revolut-link-v1').digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}

function decrypt(value) {
  const [ivRaw, tagRaw, bodyRaw] = String(value || '').split('.');
  if (!ivRaw || !tagRaw || !bodyRaw) throw new Error('invalid_link_payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(bodyRaw, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('base64url');
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function createLinkRecord(record) {
  const response = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ payload: encrypt(record) }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`link_create_${response.status}`);
  const location = response.headers.get('location') || '';
  const headerId = response.headers.get('x-jsonblob') || '';
  const id = location.split('/').filter(Boolean).pop() || headerId;
  if (!id) throw new Error('link_id_missing');
  return String(id);
}

export async function readLinkRecord(id) {
  if (!/^[A-Za-z0-9_-]{4,180}$/.test(String(id || ''))) throw new Error('invalid_link_id');
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`link_read_${response.status}`);
  const data = await response.json();
  return decrypt(data?.payload);
}

export async function writeLinkRecord(id, record) {
  const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ payload: encrypt(record) }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`link_write_${response.status}`);
}
