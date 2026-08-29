import crypto from 'node:crypto';
import { getPrivateKey } from './enablebanking.js';

function key() {
  return crypto.createHash('sha256').update(getPrivateKey()).update('alltag-c24-handoff-v1').digest();
}

export function createHandoffToken(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `AC1.${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}

export function readHandoffToken(token) {
  const [version, ivRaw, tagRaw, bodyRaw] = String(token || '').trim().split('.');
  if (version !== 'AC1' || !ivRaw || !tagRaw || !bodyRaw) throw new Error('invalid_handoff');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(bodyRaw, 'base64url')), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}
