// AI 비서 대화 — 앱 기록을 근거로 답하고, 할 일은 「제안」으로만 내놓는다.
import { db, getSettings } from '../db.js';
import { ask, ASSISTANT_SYSTEM, parseAssistant, buildContext, PROVIDERS } from '../core/ai.js';
import { snapshot } from '../snapshot.js';
import { submit } from '../actions.js';
import { esc, toast, listen, speak } from '../ui.js';
import { logUsage } from './inbox.js';
import { analyze } from '../core/parser.js';

const SUGGEST = ['오늘 할 일 순서 정해 줘', '이번 주 일정 정리해 줘', '이번 달 지출 줄이려면 뭐부터?', '내일 병원 가는데 뭘 챙겨야 해?', '다음 주 계획을 짜 줘', '엄마 생신 선물 추천해 줘'];

export async function assistant(el, ctx) {
  const s = await getSettings();
  const hasAI = Object.values(s.ai.providers).some((p) => p.key);
  const hist = (await db.all('chats')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-40);
  el.innerHTML = `
  <section class="chat">
    <div class="chat-head"><h1>🤖 AI 비서</h1><span class="muted small">${hasAI ? `연결: ${Object.entries(s.ai.providers).filter(([, p]) => p.key).map(([k]) => PROVIDERS[k].name.split(' ').pop()).join(' · ')}` : 'AI 미연결 — 기본 모드'}</span>${hist.length ? '<button class="link" data-clear>대화 지우기</button>' : ''}</div>
    ${hasAI ? '' : `<div class="card tip"><p><b>AI 열쇠 없이도</b> 「내일 3시 치과」, 「점심 8천원」처럼 말하면 일정·지출로 정리해 드려요. 질문에 답하고 계획을 짜 주는 비서를 쓰려면 <a href="#/settings">설정 → AI 연결</a>에서 열쇠를 넣으세요 (Gemini 는 무료 사용량이 있어요).</p></div>`}
    <div class="msgs" id="msgs">${hist.length ? hist.map(bubble).join('') : `<div class="bubble ai">안녕하세요! 일정·할 일·돈·생활 무엇이든 말씀하세요. 제가 해 두면 좋은 일은 <b>제안</b>으로 드리고, 승인하시면 그때 해 둘게요.</div>`}</div>
    <div class="suggest">${SUGGEST.map((q) => `<button class="chip" data-sg="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="composer" id="cf"><button type="button" class="icon-btn" id="mic" aria-label="말로 하기">🎙️</button><textarea id="q" rows="1" placeholder="무엇을 도와드릴까요?"></textarea><button class="btn primary" type="submit">보내기</button></form>
  </section>`;
  const msgs = el.querySelector('#msgs');
  msgs.scrollTop = msgs.scrollHeight;
  const q = el.querySelector('#q');
  try { const d = sessionStorage.getItem('al_ai_draft'); if (d) { q.value = d; sessionStorage.removeItem('al_ai_draft'); q.focus(); } } catch {} // 다른 화면이 넘겨준 질문 — 보내기는 직접
  el.querySelectorAll('[data-sg]').forEach((b) => (b.onclick = () => { q.value = b.dataset.sg; send(); }));
  el.querySelector('#cf').onsubmit = (e) => { e.preventDefault(); send(); };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  el.querySelector('#mic').onclick = () => { if (!listen((t) => (q.value = t), () => q.value && send())) toast('이 브라우저는 음성 인식을 지원하지 않아요'); };
  el.querySelector('[data-clear]')?.addEventListener('click', async () => { await db.clear('chats'); ctx.refresh(); });
  bindActions(msgs);

  async function send() {
    const text = q.value.trim(); if (!text) return;
    q.value = '';
    await db.put('chats', { role: 'user', text });
    msgs.insertAdjacentHTML('beforeend', bubble({ role: 'user', text }) + '<div class="bubble ai typing" id="typing">생각 중…</div>');
    msgs.scrollTop = msgs.scrollHeight;
    let reply;
    if (!hasAI) reply = offline(text);
    else {
      try {
        const sn = await snapshot();
        const context = buildContext({ today: sn.today, weekday: sn.weekday, events: sn.upcoming, tasks: sn.tasks.map((t) => ({ title: t.title, due: t.due, score: t._p.score })), money: { ...sn.money, subMonthly: sn.money.subMonthly }, memory: sn.memory }, s.ai.allow);
        const recent = hist.slice(-8).map((m) => `${m.role === 'user' ? '사용자' : '비서'}: ${m.text}`).join('\n');
        const r = await ask(/계획|짜 줘|정리|순서/.test(text) ? 'plan' : 'chat', { system: ASSISTANT_SYSTEM, json: true, maxTokens: 1500, prompt: `[내 기록 요약]\n${context}\n\n[최근 대화]\n${recent}\n\n[지금 질문]\n${text}` }, s.ai);
        await logUsage(r, 'chat');
        const p = parseAssistant(r.text);
        reply = { role: 'ai', text: p.answer, actions: p.actions, meta: `${r.provider} · ${(r.ms / 1000).toFixed(1)}초${p.dropped ? ` · 허용 안 된 제안 ${p.dropped}개 버림` : ''}` };
      } catch (e) { reply = { role: 'ai', text: `AI 연결에 실패했어요.\n${e.message}\n\n열쇠가 맞는지 설정 → AI 연결 → 「연결 확인」을 눌러 보세요.`, actions: offline(text).actions }; }
    }
    const rec = await db.put('chats', reply);
    el.querySelector('#typing')?.remove();
    msgs.insertAdjacentHTML('beforeend', bubble(rec));
    msgs.scrollTop = msgs.scrollHeight;
    bindActions(msgs);
    if (s.senior) speak(reply.text);
  }
}

/** AI 없이: 말을 분석해서 제안만 */
function offline(text) {
  const r = analyze(text);
  const useful = r.proposals.filter((p) => p.action !== 'memo.create');
  return { role: 'ai', text: useful.length ? `이렇게 정리해 볼까요? (${r.hints.join(' · ') || '기본 분석'})` : 'AI 가 연결되지 않아 질문에 답하기는 어려워요. 「내일 3시 회의」, 「택시 1만2천원」처럼 말하면 일정·지출로 정리해 드려요.', actions: useful.map((p) => ({ ...p, source: 'user' })) };
}

function bubble(m) {
  const acts = (m.actions || []).map((a, i) => `<div class="prop" data-act="${m.id}:${i}"><span>${esc(a.title)}</span>${m.applied?.includes(i) ? '<span class="badge ok">처리함</span>' : `<button class="btn small primary" data-apply="${m.id}:${i}">${a.source === 'user' ? '등록' : '승인 센터로'}</button>`}</div>`).join('');
  return `<div class="bubble ${m.role === 'user' ? 'me' : 'ai'}">${esc(m.text).replace(/\n/g, '<br>')}${acts ? `<div class="acts">${acts}</div>` : ''}${m.meta ? `<small class="muted">${esc(m.meta)}</small>` : ''}</div>`;
}

function bindActions(root) {
  root.querySelectorAll('[data-apply]').forEach((b) => (b.onclick = async () => {
    const [id, i] = b.dataset.apply.split(':');
    const m = await db.get('chats', id);
    const a = m.actions[+i];
    const r = await submit([a], a.source || 'ai', 'chat');
    await db.put('chats', { ...m, applied: [...(m.applied || []), +i] });
    b.replaceWith(Object.assign(document.createElement('span'), { className: 'badge ok', textContent: r.done.length ? '처리함' : r.pending.length ? '승인 대기' : '막힘' }));
    toast(r.done[0]?.message || (r.pending.length ? '승인 센터에 올렸어요' : r.blocked[0]?.reason || ''));
  }));
}
