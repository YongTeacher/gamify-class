const enc = new TextEncoder();
const hex = (bytes) => [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
export const randomHex = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
export function equal(a, b) {
  a = String(a || ''); b = String(b || '');
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function passwordHash(password, salt = randomHex()) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return salt + ':' + hex(bits);
}
export async function verifyPassword(password, stored) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(stored || '')) return false;
  return equal(await passwordHash(password, stored.split(':')[0]), stored);
}
export async function signSession(user, secret) {
  const payload = btoa(JSON.stringify({ ...user, exp: Date.now() + 8 * 3600000 }));
  return payload + '.' + await hmac(secret, payload);
}
export async function readSession(request, secret) {
  const value = (request.headers.get('Cookie') || '').split(';').map((v) => v.trim()).find((v) => v.startsWith('lab_session='))?.slice(12);
  if (!value || !secret) return null;
  const [payload, signature] = value.split('.');
  if (!equal(signature, await hmac(secret, payload))) return null;
  try {
    const data = JSON.parse(atob(payload));
    return data.exp > Date.now() && ['student','teacher'].includes(data.role) ? data : null;
  } catch { return null; }
}
