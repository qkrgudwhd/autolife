// 지금 내 생활 한 장 요약 — 홈 브리핑 · AI 비서 · 리포트가 같이 쓴다.
import { honor } from './ui.js';
import { db, getSettings } from './db.js';
import { today, addDays, weekdayKo, monthKey, prettyDate, prettyTime, diffDays, startOfWeek } from './core/dates.js';
import { expandEvents, sortTasks, monthSummary, subscriptionSummary, rollBilling, nextDue, nextAnniversary, forecastMonth, streak } from './core/logic.js';

export async function snapshot(now = new Date()) {
  const t = today(now);
  const [events, tasks, txs, budgets, subs, people, assets, orders, study, invoices, routines, logs, approvals, notices, memory, documents] = await Promise.all(
    ['events', 'tasks', 'transactions', 'budgets', 'subscriptions', 'people', 'assets', 'orders', 'study', 'invoices', 'routines', 'routineLogs', 'approvals', 'notices', 'memory', 'documents'].map((s) => db.all(s)));
  const s = await getSettings();
  const upcoming = expandEvents(events, t, addDays(t, 14));
  const todayEv = upcoming.filter((e) => e.date === t);
  const sorted = sortTasks(tasks.filter((x) => !x.done), now);
  const ym = monthKey(t);
  const money = monthSummary(txs, ym);
  const subSum = subscriptionSummary(subs, now);
  const totalBudget = budgets.find((b) => b.main === '전체')?.amount || 0;

  const doneToday = new Set(logs.filter((l) => l.date === t).map((l) => l.routineId + '|' + (l.slot || '')));
  const routineItems = routines.filter((r) => !r.paused).flatMap((r) => (r.slots?.length ? r.slots : ['']).map((slot) => ({ r, slot, done: doneToday.has(r.id + '|' + slot) })));

  // 다가오는 것 (14일)
  const soon = [];
  for (const sb of subs) { if (sb.status === '해지') continue; const d = rollBilling(sb, now); if (d && diffDays(t, d) <= 14) soon.push({ date: d, icon: '💳', text: `${sb.name} 결제 ${Number(sb.amount).toLocaleString('ko-KR')}원`, link: '#/subs' }); if (sb.trialEnd && diffDays(t, sb.trialEnd) >= 0 && diffDays(t, sb.trialEnd) <= 14) soon.push({ date: sb.trialEnd, icon: '⏳', text: `${sb.name} 무료 체험 끝`, link: '#/subs' }); }
  for (const p of people) for (const [f, nm] of [['birthday', '생일'], ['anniversary', p.anniversaryName || '기념일']]) { if (!p[f]) continue; const d = nextAnniversary(p[f], now); if (diffDays(t, d) <= 14) soon.push({ date: d, icon: f === 'birthday' ? '🎂' : '💍', text: `${p.name} ${nm}`, link: '#/m/people' }); }
  for (const a of assets) { const n = nextDue(a, now); if (n.date && n.left <= 14) soon.push({ date: n.date, icon: '🛠️', text: a.name, link: '#/m/assets', late: n.left < 0 }); }
  for (const o of orders) if (o.returnBy && !o.keep && !/반품|환불/.test(o.status || '') && diffDays(t, o.returnBy) >= 0 && diffDays(t, o.returnBy) <= 7) soon.push({ date: o.returnBy, icon: '↩️', text: `${o.item} 반품 기한`, link: '#/m/orders' });
  for (const x of study) if (!x.done && x.date && diffDays(t, x.date) >= 0 && diffDays(t, x.date) <= 14) soon.push({ date: x.date, icon: '🎓', text: x.title, link: '#/m/study' });
  for (const v of invoices) if (v.dueDate && !['입금완료', '취소'].includes(v.status) && diffDays(t, v.dueDate) <= 7) soon.push({ date: v.dueDate, icon: '💰', text: `${v.client} 입금 ${Number(v.amount).toLocaleString('ko-KR')}원`, link: '#/m/invoices', late: v.dueDate < t });
  for (const d of documents) if (d.expires && diffDays(t, d.expires) <= 30 && diffDays(t, d.expires) >= -7) soon.push({ date: d.expires, icon: '📄', text: `${d.title} 만료`, link: '#/docs' });
  soon.sort((a, b) => a.date.localeCompare(b.date));

  // 지난주 대비 이번 주 지출
  const wk = startOfWeek(t);
  const sumRange = (a, b) => txs.filter((x) => (x.kind || 'out') === 'out' && x.date >= a && x.date <= b).reduce((s2, x) => s2 + Number(x.amount || 0), 0);
  const weekSpend = sumRange(wk, addDays(wk, 6));
  const lastWeekSpend = sumRange(addDays(wk, -7), addDays(wk, -1));

  return {
    now, today: t, weekday: weekdayKo(t), settings: s,
    events, upcoming, todayEv, tasks: sorted, overdue: sorted.filter((x) => x.due && x.due < t),
    money: { ...money, forecast: forecastMonth(money.total, now), budget: totalBudget, subMonthly: subSum.monthly, weekSpend, lastWeekSpend },
    subs: subSum, routineItems, soon,
    pending: approvals.filter((a) => a.status === 'pending'),
    unread: notices.filter((n) => !n.read).sort((a, b) => b.at.localeCompare(a.at)),
    memory, raw: { txs, routines, logs, people, invoices },
    streaks: Object.fromEntries(routines.map((r) => [r.id, streak([...new Set(logs.filter((l) => l.routineId === r.id).map((l) => l.date))], now)])),
  };
}

/** 소리 내어 읽을 브리핑 글 */
export function briefingText(sn) {
  const name = sn.settings.name ? `${honor(sn.settings.name)}, ` : '';
  const h = sn.now.getHours();
  const hello = h < 11 ? '좋은 아침이에요' : h < 17 ? '좋은 오후예요' : '오늘 하루 수고 많으셨어요';
  const parts = [`${name}${hello}. 오늘은 ${prettyDate(sn.today, sn.now).replace('오늘 · ', '')}입니다.`];
  if (sn.todayEv.length) parts.push(`오늘 일정은 ${sn.todayEv.length}건입니다. ` + sn.todayEv.slice(0, 3).map((e) => `${e.time ? prettyTime(e.time) + '에 ' : ''}${e.title}`).join(', ') + '.');
  else parts.push('오늘 잡힌 일정은 없습니다.');
  if (sn.overdue.length) parts.push(`기한이 지난 할 일이 ${sn.overdue.length}개 있어요.`);
  if (sn.tasks[0]) parts.push(`가장 먼저 할 일은 ${sn.tasks[0].title}입니다.`);
  const left = sn.routineItems.filter((x) => !x.done).length;
  if (left) parts.push(`오늘 루틴이 ${left}개 남았어요.`);
  if (sn.pending.length) parts.push(`승인을 기다리는 일이 ${sn.pending.length}건 있습니다.`);
  const s0 = sn.soon.find((x) => x.date !== sn.today);
  if (s0) parts.push(`다가오는 일: ${prettyDate(s0.date, sn.now)} ${s0.text}.`);
  return parts.join(' ');
}
