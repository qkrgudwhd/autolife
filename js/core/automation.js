// 자동화 엔진 — 「언제 → 어떤 조건이면 → 무엇을」.
// 1) 내장 레시피: 앱을 열 때(하루 몇 번) 전체를 훑어 알림을 만든다.
// 2) 사용자 레시피: 새 지출·새 분석 같은 사건이 생길 때 조건을 보고 알림·할 일 제안을 만든다.
// 같은 알림은 한 번만 (key 로 중복 막기 = 멱등).

import { today, addDays, diffDays, monthKey, parseYmd, prettyDate } from './dates.js';
import { rollBilling, nextDue, nextAnniversary, contactDue, monthSummary } from './logic.js';

export const BUILTIN = [
  { id: 'event_tomorrow', name: '내일 일정 미리 알림', desc: '전날 내일 일정과 준비물을 알려 줍니다', group: '일정', on: true },
  { id: 'overdue', name: '기한 지난 할 일', desc: '마감이 지난 할 일을 매일 알려 줍니다', group: '할 일', on: true },
  { id: 'big_spend', name: '큰 지출 알림', desc: '정한 금액 이상 쓰면 알려 줍니다', group: '돈', on: true, params: { amount: 100000 } },
  { id: 'budget_over', name: '예산 경고', desc: '분류별 예산의 80%·100%를 넘으면 알려 줍니다', group: '돈', on: true },
  { id: 'sub_due', name: '구독 결제 전 알림', desc: '정기 결제 며칠 전에 알려 줍니다', group: '돈', on: true, params: { days: 3 } },
  { id: 'trial_end', name: '무료 체험 끝나기 전', desc: '무료 체험이 유료로 바뀌기 전에 알려 줍니다', group: '돈', on: true, params: { days: 3 } },
  { id: 'receivable', name: '받을 돈 확인', desc: '입금 예정일이 지난 미수금을 알려 줍니다', group: '사업', on: true },
  { id: 'birthday', name: '생일·기념일', desc: '7일 전과 전날 알려 주고 안부 초안을 준비합니다', group: '사람', on: true },
  { id: 'contact', name: '연락할 때 됐어요', desc: '정한 연락 주기가 지난 사람을 알려 줍니다', group: '사람', on: true },
  { id: 'maintenance', name: '집·차 정기 관리', desc: '필터 교체·엔진오일·보험 갱신 등 다가오면 알려 줍니다', group: '생활', on: true, params: { days: 7 } },
  { id: 'return_deadline', name: '반품 기한', desc: '반품 기한 2일 전에 알려 줍니다', group: '쇼핑', on: true },
  { id: 'exam', name: '시험·과제 D-day', desc: '시험 7일 전·전날, 과제 마감 전날 알려 줍니다', group: '학습', on: true },
  { id: 'medicine', name: '오늘 루틴 남음', desc: '저녁까지 체크하지 않은 복약·루틴을 알려 줍니다', group: '건강', on: true },
  { id: 'doc_expiry', name: '서류 만료', desc: '여권·면허·계약 등 만료 30일 전에 알려 줍니다', group: '문서', on: true },
  { id: 'backup_reminder', name: '백업 알림', desc: '기록이 쌓였는데 2주 넘게 백업하지 않았으면 일요일에 알려 줍니다 (기록은 휴대폰에만 있어요)', group: '안전', on: true },
  { id: 'weekly_report', name: '주간 리포트', desc: '일요일에 한 주 정리를 보여 줍니다', group: '리포트', on: true },
];

const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

/**
 * 하루 훑기. state = { events, tasks, transactions, budgets, subscriptions, people, assets, orders, study, invoices, routines, routineLogs, documents }
 * @returns 알림 목록 [{key, recipe, title, body, level:'info'|'warn'|'danger', link}]
 */
export function dailyScan(state, recipeSettings = {}, now = new Date()) {
  const on = (id) => (recipeSettings[id]?.on ?? BUILTIN.find((r) => r.id === id)?.on) !== false;
  const P = (id, k) => recipeSettings[id]?.params?.[k] ?? BUILTIN.find((r) => r.id === id)?.params?.[k];
  const t = today(now);
  const out = [];
  const push = (recipe, key, title, body, level = 'info', link = '') => out.push({ key: `${recipe}:${key}:${t}`, recipe, title, body, level, link });

  if (on('event_tomorrow')) {
    const tm = addDays(t, 1);
    const evs = (state.expandedTomorrow || []).filter((e) => e.date === tm);
    if (evs.length) {
      const prep = evs.flatMap((e) => (e.checklist || []).filter((c) => !c.done).map((c) => c.t));
      push('event_tomorrow', tm, `내일 일정 ${evs.length}건`, evs.map((e) => `${e.time || '종일'} ${e.title}`).join(' · ') + (prep.length ? ` / 준비: ${[...new Set(prep)].slice(0, 5).join(', ')}` : ''), 'info', '#/calendar');
    }
  }
  if (on('overdue')) {
    const od = (state.tasks || []).filter((x) => !x.done && x.due && x.due < t);
    if (od.length) push('overdue', 'all', `기한 지난 할 일 ${od.length}건`, od.slice(0, 3).map((x) => x.title).join(' · '), 'warn', '#/tasks');
  }
  if (on('sub_due') || on('trial_end')) {
    for (const s of state.subscriptions || []) {
      if (s.status === '해지') continue;
      const nd = rollBilling(s, now);
      if (on('sub_due') && nd) {
        const left = diffDays(t, nd);
        if (left >= 0 && left <= P('sub_due', 'days')) push('sub_due', s.id, `${s.name} 결제 ${left === 0 ? '오늘' : left + '일 후'}`, `${won(s.amount)} · ${s.method || ''} 결제 예정. 안 쓰면 미리 해지하세요.`, 'info', '#/subs');
      }
      if (on('trial_end') && s.trialEnd) {
        const left = diffDays(t, s.trialEnd);
        if (left >= 0 && left <= P('trial_end', 'days')) push('trial_end', s.id, `${s.name} 무료 체험 ${left === 0 ? '오늘' : left + '일 후'} 끝`, '계속 쓰지 않으면 끝나기 전에 해지하세요.', 'warn', '#/subs');
      }
    }
  }
  if (on('budget_over')) {
    const ym = monthKey(t);
    const sum = monthSummary(state.transactions || [], ym);
    for (const b of state.budgets || []) {
      const used = b.main === '전체' ? sum.total : sum.byCat[b.main] || 0;
      if (!b.amount) continue;
      const pct = Math.round(used / b.amount * 100);
      if (pct >= 100) push('budget_over', `${b.main}100`, `${b.main} 예산 넘음 (${pct}%)`, `${won(used)} / ${won(b.amount)}`, 'danger', '#/money');
      else if (pct >= 80) push('budget_over', `${b.main}80`, `${b.main} 예산 ${pct}% 사용`, `남은 돈 ${won(b.amount - used)}`, 'warn', '#/money');
    }
  }
  if (on('receivable')) {
    for (const v of state.invoices || []) {
      if (v.status === '입금완료' || !v.dueDate) continue;
      const left = diffDays(t, v.dueDate);
      if (left < 0) push('receivable', v.id, `${v.client || '거래처'} 미수금 ${-left}일 지남`, `${won(v.amount)} · ${v.title || ''}`, 'warn', '#/m/invoices');
      else if (left === 0) push('receivable', v.id, `${v.client || '거래처'} 오늘 입금 예정`, won(v.amount), 'info', '#/m/invoices');
    }
  }
  if (on('birthday') || on('contact')) {
    for (const p of state.people || []) {
      for (const [field, label] of [['birthday', '생일'], ['anniversary', p.anniversaryName || '기념일']]) {
        if (!on('birthday') || !p[field]) continue;
        const nd = nextAnniversary(p[field], now);
        const left = diffDays(t, nd);
        if (left === 7 || left === 1 || left === 0) push('birthday', `${p.id}${field}`, `${p.name} ${label} ${left === 0 ? '오늘' : left === 1 ? '내일' : '7일 후'}`, `${prettyDate(nd, now)}${p.lunar ? ' (음력 — 올해 양력 날짜를 확인하세요)' : ''}`, 'info', '#/m/people');
      }
      if (on('contact')) {
        const left = contactDue(p, now);
        if (left !== null && left <= 0) push('contact', p.id, `${p.name}님께 연락할 때예요`, `마지막 연락 ${p.lastContact} · 주기 ${p.cycleDays}일`, 'info', '#/m/people');
      }
    }
  }
  if (on('maintenance')) {
    for (const a of state.assets || []) {
      const { date, left } = nextDue(a, now);
      if (date && left !== null && left <= P('maintenance', 'days')) push('maintenance', a.id, `${a.name} ${left < 0 ? -left + '일 지남' : left === 0 ? '오늘' : left + '일 남음'}`, `${a.target || ''} · 다음 ${date}`, left < 0 ? 'warn' : 'info', '#/m/assets');
    }
  }
  if (on('doc_expiry')) {
    for (const d of state.documents || []) {
      if (!d.expires) continue;
      const left = diffDays(t, d.expires);
      if (left <= 30 && left >= -30) push('doc_expiry', d.id, `${d.title} ${left < 0 ? '만료됨' : '만료 ' + left + '일 전'}`, `만료일 ${d.expires} · 갱신 준비`, left <= 7 ? 'warn' : 'info', '#/docs');
    }
  }
  if (on('return_deadline')) {
    for (const o of state.orders || []) {
      if (!o.returnBy || o.status === '반품완료' || o.keep) continue;
      const left = diffDays(t, o.returnBy);
      if (left >= 0 && left <= 2) push('return_deadline', o.id, `${o.item} 반품 기한 ${left === 0 ? '오늘' : left + '일 후'}`, '반품하려면 지금 신청하세요.', 'warn', '#/m/orders');
    }
  }
  if (on('exam')) {
    for (const s of state.study || []) {
      if (!s.date || s.done) continue;
      const left = diffDays(t, s.date);
      const isExam = /시험|고사|자격/.test(s.kind || '');
      if ((isExam && (left === 7 || left === 1 || left === 0)) || (!isExam && (left === 1 || left === 0)))
        push('exam', s.id, `${s.title} ${left === 0 ? '오늘' : 'D-' + left}`, `${s.subject || ''} ${s.kind || ''}`, left <= 1 ? 'warn' : 'info', '#/m/study');
    }
  }
  if (on('medicine') && now.getHours() >= 19) {
    const doneToday = new Set((state.routineLogs || []).filter((l) => l.date === t).map((l) => l.routineId + '|' + (l.slot || '')));
    const left = [];
    for (const r of state.routines || []) {
      if (r.paused) continue;
      for (const slot of r.slots?.length ? r.slots : ['']) if (!doneToday.has(r.id + '|' + slot)) left.push(r.name + (slot ? `(${slot})` : ''));
    }
    if (left.length) push('medicine', 'today', `오늘 남은 루틴 ${left.length}개`, left.slice(0, 5).join(', '), 'info', '#/routine');
  }
  if (on('backup_reminder') && parseYmd(t).getDay() === 0 && (state.recordCount || 0) >= 20) {
    const since = state.lastBackup ? diffDays(state.lastBackup, t) : null;
    if (since === null || since >= 14) push('backup_reminder', 'week', since === null ? '아직 백업을 한 번도 안 했어요' : `마지막 백업이 ${since}일 전이에요`, `기록 ${state.recordCount}개는 이 휴대폰에만 있어요. 설정 → 💾 백업 파일 저장을 눌러 두세요.`, 'warn', '#/settings');
  }
  if (on('weekly_report') && parseYmd(t).getDay() === 0) push('weekly_report', 'week', '이번 주 정리가 준비됐어요', '일정·할 일·지출·루틴을 한눈에 보세요.', 'info', '#/report');
  return out;
}

// ---------------------------------------------------------------- 사용자 레시피
// {id, name, on, trigger:'transaction.created'|'inbox.analyzed'|'task.created',
//  conditions:[{field, op:'gte'|'lte'|'eq'|'contains'|'not_contains', value}], action:{type:'notify'|'task.create', text}}
export const TRIGGERS = {
  'transaction.created': { label: '지출이 기록되면', fields: { amount: '금액', merchant: '가맹점', main: '분류', method: '결제수단' } },
  'inbox.analyzed': { label: '인박스에 글이 들어오면', fields: { kind: '종류', text: '내용', amount: '금액' } },
  'task.created': { label: '할 일이 생기면', fields: { title: '제목', category: '분류' } },
};
export const OPS = { gte: '이상', lte: '이하', eq: '같음', contains: '포함', not_contains: '포함 안 함' };

export function matches(cond, payload) {
  const v = payload?.[cond.field];
  const c = cond.value;
  switch (cond.op) {
    case 'gte': return Number(v) >= Number(c);
    case 'lte': return Number(v) <= Number(c);
    case 'eq': return String(v ?? '') === String(c);
    case 'contains': return String(v ?? '').includes(String(c));
    case 'not_contains': return !String(v ?? '').includes(String(c));
    default: return false;
  }
}

/** 사건 하나에 대해 사용자 레시피를 돌린다 -> 결과(알림·제안) */
export function runRecipes(recipes, trigger, payload, eventId) {
  const out = [];
  for (const r of recipes || []) {
    if (!r.on || r.trigger !== trigger) continue;
    if (!(r.conditions || []).every((c) => matches(c, payload))) continue;
    const text = fill(r.action?.text || r.name, payload);
    const key = `${r.id}:${eventId}`;
    if (r.action?.type === 'task.create') out.push({ key, recipe: r.id, kind: 'proposal', proposal: { action: 'task.create', title: `자동화 「${r.name}」: ${text}`, source: 'automation', data: { title: text, importance: 3, category: '기타' } } });
    else out.push({ key, recipe: r.id, kind: 'notify', title: r.name, body: text, level: 'info' });
  }
  return out;
}

/** '{merchant}에서 {amount}원' 처럼 칸 채우기 */
export function fill(tpl, p) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (k === 'amount' && p?.[k] != null ? Number(p[k]).toLocaleString('ko-KR') : p?.[k] ?? ''));
}

/** 큰 지출 — 지출이 기록되는 순간 쓰는 내장 판단 */
export function bigSpendCheck(tx, recipeSettings = {}) {
  const r = recipeSettings.big_spend || {};
  if (r.on === false) return null;
  const limit = r.params?.amount ?? 100000;
  if ((tx.kind || 'out') === 'out' && Number(tx.amount) >= limit) return { key: `big_spend:${tx.id}`, recipe: 'big_spend', title: `큰 지출 ${won(tx.amount)}`, body: `${tx.merchant || ''} · ${tx.main || ''}`, level: 'warn', link: '#/money' };
  return null;
}
