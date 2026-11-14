// 저장소 — 휴대폰(브라우저) 안의 IndexedDB. 서버로 보내지 않는다.
import { APP } from './config.js';

export const STORES = [
  'events', 'tasks', 'transactions', 'budgets', 'subscriptions', 'documents', 'routines', 'routineLogs',
  'people', 'orders', 'assets', 'study', 'clients', 'invoices', 'inbox', 'approvals', 'audit', 'memory',
  'recipes', 'notices', 'chats', 'memos', 'settings',
];
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(APP.dbName, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('저장 취소됨'));
  }));
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const db = {
  all: (store) => tx(store, 'readonly', (s) => req(s.getAll())),
  get: (store, id) => tx(store, 'readonly', (s) => req(s.get(id))),
  async put(store, obj) {
    const now = new Date().toISOString();
    const o = { ...obj, id: obj.id || uid(), createdAt: obj.createdAt || now, updatedAt: now };
    await tx(store, 'readwrite', (s) => req(s.put(o)));
    bus.emit('change', store);
    return o;
  },
  async del(store, id) { await tx(store, 'readwrite', (s) => req(s.delete(id))); bus.emit('change', store); },
  async clear(store) { await tx(store, 'readwrite', (s) => req(s.clear())); },
};

// 설정은 settings 저장소의 'main' 한 줄
const DEFAULT_SETTINGS = {
  id: 'main', onboarded: false, userTypes: [], name: '', senior: false, theme: 'auto', fontScale: 1,
  autoApproveRisk: 0, notify: false, pinHash: '', recipes: {},
  ai: { mode: 'auto', providers: { gemini: { key: '', model: '' }, claude: { key: '', model: '' }, openai: { key: '', model: '' } },
    allow: { calendar: true, tasks: true, money: false, memory: true }, usage: [] },
  home: { cards: ['brief', 'today', 'approvals', 'tasks', 'money', 'routine', 'upcoming'] },
};
let cache = null;
export async function getSettings() {
  if (cache) return cache;
  const s = await db.get('settings', 'main');
  cache = deepMerge(structuredClone(DEFAULT_SETTINGS), s || {});
  return cache;
}
export async function saveSettings(patch) {
  const s = deepMerge(await getSettings(), patch);
  cache = s;
  await tx('settings', 'readwrite', (st) => req(st.put(s)));
  bus.emit('settings', s);
  return s;
}
function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) a[k] = deepMerge(a[k], v);
    else a[k] = v;
  }
  return a;
}

/** 실행 기록 (감사 로그) — 무엇을, 누가(사용자/AI/자동화), 결과 */
export function audit(action, detail, actor = 'user', result = 'ok') {
  return db.put('audit', { at: new Date().toISOString(), action, detail: String(detail).slice(0, 300), actor, result });
}

// 백업: 문서 사진(Blob)은 base64 로 바꿔 함께 담는다
export async function exportAll({ includeKeys = false } = {}) {
  const out = { app: APP.nameEn, version: APP.version, exportedAt: new Date().toISOString(), data: {} };
  for (const s of STORES) {
    let rows = await db.all(s);
    if (s === 'documents') rows = await Promise.all(rows.map(async (r) => (r.file instanceof Blob ? { ...r, file: await blobToData(r.file) } : r)));
    if (s === 'settings' && !includeKeys) rows = rows.map((r) => ({ ...r, ai: { ...r.ai, providers: Object.fromEntries(Object.entries(r.ai?.providers || {}).map(([k, v]) => [k, { ...v, key: '' }])) }, pinHash: '' }));
    out.data[s] = rows;
  }
  return out;
}
export async function importAll(obj, { replace = false } = {}) {
  if (!obj?.data) throw new Error('오토라이프 백업 파일이 아닙니다');
  let n = 0;
  for (const s of STORES) {
    const rows = obj.data[s]; if (!Array.isArray(rows)) continue;
    if (replace) await db.clear(s);
    for (let r of rows) {
      if (s === 'documents' && r.file && typeof r.file === 'object' && r.file.__data) r = { ...r, file: dataToBlob(r.file) };
      if (s === 'settings') { cache = null; const cur = await getSettings(); r = deepMerge(structuredClone(cur), { ...r, ai: { ...r.ai, providers: cur.ai.providers }, pinHash: cur.pinHash }); }
      await tx(s, 'readwrite', (st) => req(st.put(r))); n++;
    }
  }
  cache = null; bus.emit('change', '*');
  return n;
}
async function blobToData(b) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { __data: btoa(s), type: b.type };
}
function dataToBlob(o) {
  const bin = atob(o.__data); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: o.type });
}

export async function wipeAll() { for (const s of STORES) await db.clear(s); cache = null; bus.emit('change', '*'); }

// 아주 작은 알림판 (저장소가 바뀌면 화면이 다시 그린다)
export const bus = {
  h: {},
  on(e, f) { (this.h[e] ||= []).push(f); return () => { this.h[e] = this.h[e].filter((x) => x !== f); }; },
  emit(e, d) { (this.h[e] || []).forEach((f) => { try { f(d); } catch (err) { console.error(err); } }); },
};
