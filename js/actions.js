// 실행기 — 제안을 검사하고(policy) → 승인 대기에 두거나 → 실제로 저장한다. 모든 실행은 기록(audit)에 남긴다.
import { db, audit, getSettings, uid } from './db.js';
import { check, ACTIONS } from './core/policy.js';
import { categorize, isDuplicateEvent, expandEvents } from './core/logic.js';
import { dailyScan, runRecipes, bigSpendCheck } from './core/automation.js';
import { today, addDays } from './core/dates.js';

const ACTOR = { user: '나', ai: 'AI', inbox: '글 분석', automation: '자동화' };

/** 제안 여러 개를 받는다 -> {done, pending, blocked} 개수 */
export async function submit(proposals, source = 'user', origin = '') {
  const s = await getSettings();
  const r = { done: [], pending: [], blocked: [] };
  for (const p0 of proposals) {
    const p = { ...p0, source: p0.source || source };
    const c = check(p, s);
    if (!c.ok) {
      await db.put('approvals', { ...p, status: 'blocked', reason: c.reason, risk: c.risk, origin, at: new Date().toISOString() });
      await audit(p.action, `막음: ${p.title} — ${c.reason}`, p.source, 'blocked');
      r.blocked.push(p); continue;
    }
    if (c.needsApproval) {
      await db.put('approvals', { ...p, status: 'pending', risk: c.risk, origin, at: new Date().toISOString(), version: 1 });
      r.pending.push(p); continue;
    }
    const out = await execute(p);
    r.done.push(out);
  }
  return r;
}

/** 승인 — 승인할 때 본 내용 그대로 실행한다 (승인 뒤 내용 바뀜 금지) */
export async function approve(id, edited) {
  const a = await db.get('approvals', id);
  if (!a || a.status !== 'pending') throw new Error('이미 처리된 요청입니다');
  const p = { ...a, data: edited ? { ...a.data, ...edited } : a.data, source: 'user' };
  const c = check(p, {});
  if (!c.ok) { await db.put('approvals', { ...a, status: 'blocked', reason: c.reason }); throw new Error(c.reason); }
  const out = await execute({ ...p, approvedFrom: a.source });
  await db.put('approvals', { ...a, data: p.data, status: out.skipped ? 'skipped' : 'approved', result: out.message, decidedAt: new Date().toISOString() });
  return out;
}

export async function reject(id) {
  const a = await db.get('approvals', id);
  if (!a) return;
  await db.put('approvals', { ...a, status: 'rejected', decidedAt: new Date().toISOString() });
  await audit(a.action, `거절: ${a.title}`, 'user', 'rejected');
}

/** 실제 저장 */
export async function execute(p) {
  const d = { ...(p.data || {}) };
  const who = p.approvedFrom ? `${ACTOR[p.approvedFrom] || p.approvedFrom} 제안 → 내가 승인` : ACTOR[p.source] || p.source;
  let msg = '', rec = null, skipped = false;
  switch (p.action) {
    case 'event.create': {
      const all = await db.all('events');
      if (isDuplicateEvent(d, all)) { skipped = true; msg = `이미 있는 일정이라 건너뜀: ${d.title}`; break; }
      rec = await db.put('events', { title: d.title, date: d.date, time: d.time || null, endTime: d.endTime || null, place: d.place || '', type: d.type || '기타', arriveBy: d.arriveBy || null,
        remind: d.remind || [60], checklist: d.checklist || [], note: d.note || '', repeat: d.repeat || { freq: 'none' }, color: d.color || '' });
      msg = `일정 등록: ${d.date} ${d.time || ''} ${d.title}`; break;
    }
    case 'event.update': { const e = await db.get('events', d.id); if (e) { rec = await db.put('events', { ...e, ...d }); msg = `일정 수정: ${rec.title}`; } break; }
    case 'task.create': {
      rec = await db.put('tasks', { title: d.title, due: d.due || null, importance: d.importance || 3, category: d.category || '기타', minutes: d.minutes || 30, note: d.note || '', amount: d.amount || null, done: false, steps: d.steps || [] });
      msg = `할 일 추가: ${d.title}`;
      await afterEvent('task.created', rec);
      break;
    }
    case 'task.complete': { const t = await db.get('tasks', d.id); if (t) { rec = await db.put('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); msg = `완료: ${t.title}`; } break; }
    case 'transaction.create': {
      const amt = Number(d.amount);
      const cat = d.main ? { main: d.main, sub: d.sub || '' } : categorize(d.merchant, d.memo);
      rec = await db.put('transactions', { date: d.date || today(), time: d.time || null, amount: Math.abs(amt), kind: d.kind || (amt < 0 ? 'refund' : 'out'), merchant: d.merchant || '', memo: d.memo || '',
        method: d.method || '', installment: d.installment || '', main: cat.main, sub: cat.sub, business: !!d.business, source: p.source });
      msg = `가계부: ${rec.merchant || rec.main} ${rec.amount.toLocaleString('ko-KR')}원`;
      await afterEvent('transaction.created', rec);
      break;
    }
    case 'subscription.create': rec = await db.put('subscriptions', { name: d.name, amount: Number(d.amount), cycle: d.cycle || '매월', nextDate: d.nextDate || null, kind: d.kind || '기타', method: d.method || '', status: '이용중' }); msg = `구독 등록: ${d.name}`; break;
    case 'order.create': rec = await db.put('orders', { item: d.item || '택배', shop: d.shop || '', carrier: d.carrier || '', tracking: d.tracking || '', status: d.status || '출고', orderDate: d.orderDate || today(), receivedDate: d.receivedDate || null, returnBy: d.returnBy || (d.receivedDate ? addDays(d.receivedDate, 7) : null), amount: d.amount || null, note: d.note || '' }); msg = `택배 등록: ${rec.item}`; break;
    case 'memo.create': rec = await db.put('memos', { text: d.text, kind: 'memo' }); msg = '메모 보관'; break;
    case 'message.draft': rec = await db.put('memos', { text: d.body, to: d.to || '', kind: 'draft' }); msg = `초안 보관${d.to ? ' (' + d.to + ')' : ''} — 보내기는 직접`; break;
    case 'memory.create': rec = await db.put('memory', { text: d.text, kind: d.kind || '사실', source: p.approvedFrom || p.source, confidence: d.confidence ?? 0.8 }); msg = `기억: ${d.text}`; break;
    case 'person.create': rec = await db.put('people', { name: d.name, relation: d.relation || '', phone: d.phone || '', birthday: d.birthday || null }); msg = `사람 등록: ${d.name}`; break;
    case 'notify': await notice({ key: uid(), title: d.title, body: d.body || '', level: d.level || 'info' }); msg = '알림'; break;
    default: throw new Error(`모르는 동작 ${p.action}`);
  }
  await audit(p.action, msg || ACTIONS[p.action]?.label, who, skipped ? 'skipped' : 'ok');
  return { ok: true, skipped, message: msg, record: rec };
}

/** 사건 뒤에 붙는 자동화 (큰 지출 · 사용자 레시피) */
export async function afterEvent(trigger, payload) {
  const s = await getSettings();
  const out = [];
  if (trigger === 'transaction.created') { const b = bigSpendCheck(payload, s.recipes); if (b) out.push({ ...b, kind: 'notify' }); }
  const recipes = await db.all('recipes');
  out.push(...runRecipes(recipes, trigger, payload, payload.id));
  for (const o of out) {
    if (o.kind === 'proposal') await submit([o.proposal], 'automation', o.recipe);
    else await notice(o);
  }
}

/** 알림 — 같은 key 는 한 번만 */
export async function notice(n) {
  const id = n.key;
  if (await db.get('notices', id)) return false;
  await db.put('notices', { id, title: n.title, body: n.body || '', level: n.level || 'info', link: n.link || '', recipe: n.recipe || '', read: false, at: new Date().toISOString() });
  const s = await getSettings();
  if (s.notify && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opt = { body: n.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: id, data: { link: n.link } };
      if (reg) await reg.showNotification(n.title, opt); else new Notification(n.title, opt);
    } catch (e) { console.warn('알림 실패', e); }
  }
  return true;
}

export async function loadState() {
  const names = ['events', 'tasks', 'transactions', 'budgets', 'subscriptions', 'people', 'assets', 'orders', 'study', 'invoices', 'routines', 'routineLogs', 'documents'];
  const vals = await Promise.all(names.map((n) => db.all(n)));
  const st = Object.fromEntries(names.map((n, i) => [n, vals[i]]));
  st.expandedTomorrow = expandEvents(st.events, today(), addDays(today(), 1));
  st.recordCount = vals.reduce((a, v) => a + v.length, 0);
  st.lastBackup = (await getSettings()).lastBackup || null;
  return st;
}

let lastScan = 0;
/** 하루 훑기 — 앱을 열 때, 그리고 열려 있는 동안 30분마다 */
export async function runDaily(force = false) {
  if (!force && Date.now() - lastScan < 30 * 60 * 1000) return 0;
  lastScan = Date.now();
  const s = await getSettings();
  const list = dailyScan(await loadState(), s.recipes, new Date());
  let n = 0;
  for (const x of list) if (await notice(x)) n++;
  return n;
}
