import { db } from '../db.js';
import { snapshot, briefingText } from '../snapshot.js';
import { esc, won, speak, ddayBadge, toast, empty, honor } from '../ui.js';
import { prettyDate, prettyTime, diffDays } from '../core/dates.js';
import { quickAdd } from './quick.js';

export async function home(el, ctx) {
  const sn = await snapshot();
  const s = sn.settings;
  const h = sn.now.getHours();
  const hello = h < 5 ? '늦은 밤이에요' : h < 11 ? '좋은 아침이에요' : h < 17 ? '좋은 오후예요' : '좋은 저녁이에요';
  const left = sn.routineItems.filter((x) => !x.done);
  const m = sn.money;
  const budgetPct = m.budget ? Math.round(m.total / m.budget * 100) : null;

  const senior = s.senior ? `<section class="senior-grid">
      <a class="big-btn" href="#/inbox">📩<span>문자 넣기</span></a>
      <a class="big-btn" href="#/calendar">📅<span>내 일정</span></a>
      <a class="big-btn" href="#/routine">💊<span>약·루틴</span></a>
      <a class="big-btn" href="#/money">💳<span>돈 관리</span></a>
      <a class="big-btn" href="#/m/people">👨‍👩‍👧<span>가족·연락</span></a>
      <a class="big-btn" href="#/ai">🤖<span>물어보기</span></a>
    </section>` : '';

  el.innerHTML = `
  <section class="hero">
    <div class="hero-top"><div><p class="muted">${prettyDate(sn.today, sn.now).replace('오늘 · ', '')}</p><h1>${s.name ? esc(honor(s.name)) + ', ' : ''}${hello}</h1></div>
      <button class="icon-btn big" data-speak aria-label="브리핑 들려주기" title="브리핑 들려주기">🔊</button></div>
    <div class="stats">
      <a href="#/calendar" class="stat"><b>${sn.todayEv.length}</b><span>오늘 일정</span></a>
      <a href="#/tasks" class="stat ${sn.overdue.length ? 'warn' : ''}"><b>${sn.tasks.length}</b><span>할 일${sn.overdue.length ? ` · 지남 ${sn.overdue.length}` : ''}</span></a>
      <a href="#/approvals" class="stat ${sn.pending.length ? 'accent' : ''}"><b>${sn.pending.length}</b><span>승인 대기</span></a>
      <a href="#/routine" class="stat"><b>${left.length}</b><span>남은 루틴</span></a>
    </div>
  </section>
  ${senior}
  <section class="quick-row">
    <button class="qbtn" data-q="paste">📩<span>문자·메일<br>붙여넣기</span></button>
    <button class="qbtn" data-q="spend">💳<span>지출<br>적기</span></button>
    <button class="qbtn" data-q="task">✅<span>할 일<br>추가</span></button>
    <button class="qbtn" data-q="event">📅<span>일정<br>추가</span></button>
    <button class="qbtn" data-q="voice">🎙️<span>말로<br>하기</span></button>
  </section>

  ${sn.unread.length ? `<section class="card"><div class="card-head"><h2>🔔 알림 <small>${sn.unread.length}</small></h2><button class="link" data-readall>모두 읽음</button></div>
    <ul class="list">${sn.unread.slice(0, 6).map((n) => `<li class="row lvl-${n.level}"><a href="${esc(n.link || '#/notices')}" data-notice="${n.id}"><b>${esc(n.title)}</b><small>${esc(n.body)}</small></a></li>`).join('')}</ul></section>` : ''}

  ${sn.pending.length ? `<section class="card accent-card"><div class="card-head"><h2>🛡️ 승인을 기다려요</h2><a class="link" href="#/approvals">전체 보기</a></div>
    <ul class="list">${sn.pending.slice(0, 3).map((a) => `<li class="row"><a href="#/approvals"><b>${esc(a.title)}</b><small>${a.source === 'ai' ? 'AI 비서' : a.source === 'inbox' ? '글 분석' : '자동화'} 제안 · 누르면 확인</small></a></li>`).join('')}</ul></section>` : ''}

  <section class="card"><div class="card-head"><h2>📅 오늘</h2><a class="link" href="#/calendar">일정</a></div>
    ${sn.todayEv.length ? `<ul class="timeline">${sn.todayEv.map((e) => `<li><time>${e.time ? prettyTime(e.time).replace('오전 ', '오전<br>').replace('오후 ', '오후<br>') : '종일'}</time><div><b>${esc(e.title)}</b>${e.place ? `<small>📍 ${esc(e.place)}</small>` : ''}${e.arriveBy ? `<small>⏱ ${prettyTime(e.arriveBy)}까지 도착</small>` : ''}${(e.checklist || []).length ? `<small>🎒 ${e.checklist.filter((c) => !c.done).length}/${e.checklist.length} 준비 남음</small>` : ''}</div></li>`).join('')}</ul>` : '<p class="muted pad">오늘 잡힌 일정이 없어요. 여유로운 하루 되세요 ☕</p>'}
  </section>

  <section class="card"><div class="card-head"><h2>✅ 지금 할 일</h2><a class="link" href="#/tasks">전체</a></div>
    ${sn.tasks.length ? `<ul class="list">${sn.tasks.slice(0, 5).map((t) => `<li class="row task"><label><input type="checkbox" data-done="${t.id}"><span><b>${esc(t.title)}</b><small>${t.due ? prettyDate(t.due) + ' · ' : ''}우선 ${t._p.score}${t._p.why.length ? ' · ' + t._p.why.join(', ') : ''}</small></span></label>${t.due ? ddayBadge(diffDays(sn.today, t.due)) : ''}</li>`).join('')}</ul>` : empty('🎉', '할 일이 없어요!')}
  </section>

  ${sn.routineItems.length ? `<section class="card"><div class="card-head"><h2>💊 오늘 루틴</h2><a class="link" href="#/routine">관리</a></div>
    <div class="routine-chips">${sn.routineItems.map((x) => `<button class="rchip ${x.done ? 'on' : ''}" data-rt="${x.r.id}" data-slot="${esc(x.slot)}">${x.done ? '✔' : esc(x.r.icon || '○')} ${esc(x.r.name)}${x.slot ? ` <small>${esc(x.slot)}</small>` : ''}</button>`).join('')}</div></section>` : ''}

  <section class="card"><div class="card-head"><h2>💳 이번 달 돈</h2><a class="link" href="#/money">자세히</a></div>
    <div class="money-line"><div><small>쓴 돈</small><b>${won(m.total)}</b></div><div><small>월말 예상</small><b>${won(m.forecast)}</b></div><div><small>구독 월</small><b>${won(m.subMonthly)}</b></div></div>
    ${budgetPct != null ? `<div class="bar ${budgetPct >= 100 ? 'danger' : budgetPct >= 80 ? 'warn' : ''}"><i style="width:${Math.min(100, budgetPct)}%"></i></div><small class="muted">전체 예산 ${won(m.budget)}의 ${budgetPct}%</small>` : '<small class="muted">머니 → 예산에서 한 달 예산을 정하면 넘기 전에 알려 드려요</small>'}
    ${m.lastWeekSpend ? `<p class="muted small">이번 주 ${won(m.weekSpend)} · 지난주 ${won(m.lastWeekSpend)} (${m.weekSpend >= m.lastWeekSpend ? '▲' : '▼'} ${won(Math.abs(m.weekSpend - m.lastWeekSpend))})</p>` : ''}
  </section>

  <section class="card"><div class="card-head"><h2>🔭 다가오는 것 (2주)</h2></div>
    ${sn.soon.length ? `<ul class="list">${sn.soon.slice(0, 8).map((x) => `<li class="row"><a href="${x.link}"><b>${x.icon} ${esc(x.text)}</b><small>${prettyDate(x.date)}</small></a>${ddayBadge(diffDays(sn.today, x.date))}</li>`).join('')}</ul>` : '<p class="muted pad">2주 안에 챙길 결제·기념일·관리 일정이 없어요.</p>'}
  </section>
  ${!sn.events.length && !sn.raw.txs.length ? `<section class="card tip"><h2>👋 처음이세요?</h2><p>받은 <b>병원 예약 문자</b>나 <b>카드 결제 문자</b>를 복사해서 「문자·메일 붙여넣기」에 넣어 보세요. 날짜·시간·금액을 알아서 뽑아 일정·가계부로 만들어 드려요. AI 열쇠가 없어도 됩니다.</p><a class="btn primary" href="#/guide">사용법 보기</a></section>` : ''}
  `;

  el.querySelector('[data-speak]').onclick = () => { if (!speak(briefingText(sn))) toast('이 기기는 소리 읽기를 지원하지 않아요'); };
  el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => quickAdd(b.dataset.q, ctx)));
  el.querySelectorAll('[data-done]').forEach((c) => (c.onchange = async () => { const t = await db.get('tasks', c.dataset.done); await db.put('tasks', { ...t, done: true, doneAt: new Date().toISOString() }); toast(`완료! 👏 ${t.title}`); }));
  el.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => toggleRoutine(b.dataset.rt, b.dataset.slot, sn.today)));
  el.querySelector('[data-readall]')?.addEventListener('click', async () => { for (const n of sn.unread) await db.put('notices', { ...n, read: true }); });
  el.querySelectorAll('[data-notice]').forEach((a) => a.addEventListener('click', async () => { const n = await db.get('notices', a.dataset.notice); if (n) await db.put('notices', { ...n, read: true }); }));
}

export async function toggleRoutine(rid, slot, date) {
  const logs = await db.all('routineLogs');
  const hit = logs.find((l) => l.routineId === rid && (l.slot || '') === (slot || '') && l.date === date);
  if (hit) await db.del('routineLogs', hit.id);
  else { await db.put('routineLogs', { routineId: rid, slot: slot || '', date, at: new Date().toISOString() }); toast('체크했어요 ✔'); }
}
