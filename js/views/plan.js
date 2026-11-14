// 일정(달력) · 할 일
import { db } from '../db.js';
import { expandEvents, conflicts, sortTasks } from '../core/logic.js';
import { today, addDays, parseYmd, ymd, pad, prettyDate, prettyTime, addMinutes, WEEK_KO, diffDays } from '../core/dates.js';
import { esc, toast, empty, ddayBadge } from '../ui.js';
import { eventDialog, taskDialog } from './forms.js';

const TYPE_ICON = { 약속: '🤝', 회의: '💼', 병원: '🏥', '수업·시험': '🎓', 마감: '⏰', 납부: '🧾', 경조사: '🎉', 여행: '✈️', 운동: '🏃', 가족: '👨‍👩‍👧', 개인: '🙂', 기타: '📌' };
let cur = null; // 보고 있는 달 'YYYY-MM-01'
let sel = null; // 고른 날

export async function calendar(el, ctx) {
  const t = today();
  cur ||= t.slice(0, 8) + '01'; sel ||= t;
  const first = parseYmd(cur);
  const y = first.getFullYear(), m = first.getMonth();
  const gridStart = addDays(cur, -first.getDay());
  const gridEnd = addDays(gridStart, 41);
  const events = await db.all('events');
  const tasks = await db.all('tasks');
  const list = expandEvents(events, gridStart, gridEnd);
  const byDay = {};
  for (const e of list) (byDay[e.date] ||= []).push(e);
  const dueByDay = {};
  for (const x of tasks) if (!x.done && x.due) (dueByDay[x.due] ||= []).push(x);
  const dayEv = byDay[sel] || [];
  const clash = conflicts(dayEv);
  const week = expandEvents(events, t, addDays(t, 6));

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i); const dd = parseYmd(d);
    const evs = byDay[d] || [];
    cells.push(`<button class="cal-cell ${dd.getMonth() !== m ? 'other' : ''} ${d === t ? 'today' : ''} ${d === sel ? 'sel' : ''} wd${dd.getDay()}" data-d="${d}" aria-label="${prettyDate(d)} 일정 ${evs.length}건">
      <span class="n">${dd.getDate()}</span><span class="dots">${evs.slice(0, 3).map(() => '<i></i>').join('')}${(dueByDay[d] || []).length ? '<i class="task"></i>' : ''}</span></button>`);
  }
  el.innerHTML = `
  <section class="card cal">
    <div class="cal-head"><button class="icon-btn" data-mv="-1" aria-label="지난달">‹</button><h1>${y}년 ${m + 1}월</h1><button class="icon-btn" data-mv="1" aria-label="다음달">›</button><button class="btn small" data-today>오늘</button></div>
    <div class="cal-grid">${WEEK_KO.map((w, i) => `<span class="wd wd${i}">${w}</span>`).join('')}${cells.join('')}</div>
  </section>
  <section class="card"><div class="card-head"><h2>${prettyDate(sel)}</h2><button class="btn small primary" data-add>+ 일정</button></div>
    ${clash.length ? `<p class="warn-line">⚠️ 시간이 겹쳐요: ${clash.map(([a, b]) => `${esc(a.title)} ↔ ${esc(b.title)}`).join(', ')}</p>` : ''}
    ${dayEv.length ? `<ul class="list">${dayEv.map(evRow).join('')}</ul>` : '<p class="muted pad">이날 일정이 없어요.</p>'}
    ${(dueByDay[sel] || []).length ? `<h3>이날 마감인 할 일</h3><ul class="list">${dueByDay[sel].map((x) => `<li class="row"><a href="#/tasks"><b>✅ ${esc(x.title)}</b></a></li>`).join('')}</ul>` : ''}
  </section>
  <section class="card"><h2>🗓 앞으로 7일</h2>${week.length ? `<ul class="list">${week.map((e) => `<li class="row"><a href="#" data-ev="${e.id}" data-date="${e.date}"><b>${TYPE_ICON[e.type] || '📌'} ${esc(e.title)}</b><small>${prettyDate(e.date)} ${e.time ? prettyTime(e.time) : '종일'}${e.place ? ' · ' + esc(e.place) : ''}</small></a>${ddayBadge(diffDays(t, e.date))}</li>`).join('')}</ul>` : '<p class="muted pad">7일 안에 일정이 없어요.</p>'}</section>`;

  el.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { const d = parseYmd(cur); d.setMonth(d.getMonth() + Number(b.dataset.mv)); cur = ymd(d); ctx.refresh(); }));
  el.querySelector('[data-today]').onclick = () => { cur = t.slice(0, 8) + '01'; sel = t; ctx.refresh(); };
  el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => { sel = b.dataset.d; ctx.refresh(); }));
  el.querySelector('[data-add]').onclick = () => eventDialog({ date: sel }, ctx.refresh);
  el.querySelectorAll('[data-ev]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); const ev = await db.get('events', a.dataset.ev); openEvent(ev, a.dataset.date, ctx); }));
  el.querySelectorAll('[data-ck]').forEach((c) => (c.onchange = async () => {
    const [id, i] = c.dataset.ck.split(':'); const ev = await db.get('events', id);
    ev.checklist[+i].done = c.checked; await db.put('events', ev);
  }));
}

function evRow(e) {
  const start = e.arriveBy || e.time;
  const depart = start && e.travelMin ? addMinutes(start, -Number(e.travelMin)) : null;
  return `<li class="ev-row"><a href="#" data-ev="${e.id}" data-date="${e.date}"><b>${TYPE_ICON[e.type] || '📌'} ${esc(e.title)}</b>
    <small>${e.time ? prettyTime(e.time) + (e.endTime ? ' ~ ' + prettyTime(e.endTime) : '') : '종일'}${e.place ? ' · 📍' + esc(e.place) : ''}${e.repeat?.freq && e.repeat.freq !== 'none' ? ' · 🔁' : ''}</small>
    ${e.arriveBy ? `<small>⏱ ${prettyTime(e.arriveBy)}까지 도착</small>` : ''}${depart ? `<small>🚶 ${prettyTime(depart)}에 출발하세요</small>` : ''}</a>
    ${(e.checklist || []).length ? `<div class="mini-check">${e.checklist.map((c, i) => `<label><input type="checkbox" data-ck="${e.id}:${i}" ${c.done ? 'checked' : ''}> ${esc(c.t)}</label>`).join('')}</div>` : ''}</li>`;
}

function openEvent(ev, date, ctx) {
  if (ev.repeat?.freq && ev.repeat.freq !== 'none' && date !== ev.date) {
    // 반복 일정의 한 회차: 「이날만 빼기」 또는 전체 고치기
    import('../ui.js').then(({ modal }) => modal({ title: ev.title, body: `<p>반복 일정이에요 (${prettyDate(date)}).</p>`, actions: [
      { label: '이날만 빼기', onClick: async () => { await db.put('events', { ...ev, skip: [...(ev.skip || []), date] }); toast('이날은 뺐어요'); ctx.refresh(); } },
      { label: '전체 고치기', primary: true, onClick: () => { setTimeout(() => eventDialog(ev, ctx.refresh), 250); } }] }));
  } else eventDialog(ev, ctx.refresh);
}

// ---------------------------------------------------------------- 할 일
let filter = '전체';
export async function tasks(el, ctx) {
  const all = await db.all('tasks');
  const t = today();
  const open = sortTasks(all.filter((x) => !x.done));
  const done = all.filter((x) => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 20);
  const cats = ['전체', '오늘', '지남', ...new Set(open.map((x) => x.category || '기타'))];
  const shown = open.filter((x) => filter === '전체' || (filter === '오늘' ? x.due === t : filter === '지남' ? x.due && x.due < t : (x.category || '기타') === filter));
  el.innerHTML = `
  <section class="card"><div class="card-head"><h1>✅ 할 일 <small>${open.length}</small></h1><button class="btn primary small" data-add>+ 추가</button></div>
    <p class="muted small">순서는 <b>기한·영향·중요도·놓쳤을 때 위험·걸리는 시간</b>을 합쳐 매겨요 (우선 점수 0~100).</p>
    <div class="chips">${cats.map((c) => `<button class="chip ${c === filter ? 'on' : ''}" data-f="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    ${shown.length ? `<ul class="list">${shown.map((x) => `<li class="row task">
        <label><input type="checkbox" data-done="${x.id}"><span><b>${esc(x.title)}</b>
        <small>${x.due ? prettyDate(x.due) + ' · ' : ''}${esc(x.category || '기타')} · 우선 <b>${x._p.score}</b>${x._p.why.length ? ' · ' + x._p.why.join(', ') : ''}${x.amount ? ' · ' + Number(x.amount).toLocaleString('ko-KR') + '원' : ''}</small>
        ${(x.steps || []).length ? `<small>단계 ${x.steps.filter((s) => s.done).length}/${x.steps.length}</small>` : ''}</span></label>
        <span class="row-btns">${x.due ? ddayBadge(diffDays(t, x.due)) : ''}<button class="icon-btn" data-ed="${x.id}" aria-label="고치기">✎</button></span></li>`).join('')}</ul>` : empty('🎉', filter === '전체' ? '할 일이 없어요' : '이 분류엔 할 일이 없어요')}
  </section>
  ${done.length ? `<section class="card"><h2>끝낸 일</h2><ul class="list">${done.map((x) => `<li class="row done"><span><b>${esc(x.title)}</b><small>${(x.doneAt || '').slice(0, 10)}</small></span><button class="link" data-undo="${x.id}">되돌리기</button></li>`).join('')}</ul></section>` : ''}`;
  el.querySelector('[data-add]').onclick = () => taskDialog({}, ctx.refresh);
  el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { filter = b.dataset.f; ctx.refresh(); }));
  el.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = async () => taskDialog(await db.get('tasks', b.dataset.ed), ctx.refresh)));
  el.querySelectorAll('[data-done]').forEach((c) => (c.onchange = async () => { const x = await db.get('tasks', c.dataset.done); await db.put('tasks', { ...x, done: true, doneAt: new Date().toISOString() }); toast(`👏 ${x.title} 끝!`); }));
  el.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = async () => { const x = await db.get('tasks', b.dataset.undo); await db.put('tasks', { ...x, done: false, doneAt: null }); }));
}
