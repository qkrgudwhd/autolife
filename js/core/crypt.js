// 백업 잠금 — 암호 문장으로 AES-GCM 암호화 (브라우저·Node 공통 WebCrypto).
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function lock(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), enc.encode(text)));
  return JSON.stringify({ autolifeLocked: 1, salt: b64(salt), iv: b64(iv), data: b64(ct) });
}

export async function unlock(json, pass) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, await keyFrom(pass, unb64(o.salt)), unb64(o.data));
    return dec.decode(pt);
  } catch { throw new Error('암호가 맞지 않습니다'); }
}

export async function sha256(text) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...h].map((x) => x.toString(16).padStart(2, '0')).join('');
}
