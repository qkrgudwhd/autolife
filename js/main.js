// 앱 뼈대 — 주소(#/…) 따라 화면을 그리고, 저장소가 바뀌면 다시 그린다.
import { APP } from './config.js';
import { bus, getSettings, db } from './db.js';
import { runDaily } from './actions.js';
import { home } from './views/home.js';
import { inbox, approvals } from './views/inbox.js';
import { calendar, tasks } from './views/plan.js';
import { money, subs } from './views/money.js';
import { routine, docs, moduleView, memos, notices, report, automations, memory, auditView, searchView } from './views/life.js';
import { assistant } from './views/assistant.js';
import { shop } from './views/shop.js';
import { fridge } from './views/fridge.js';
import { settings, more, onboarding, guide, lockScreen, protectStorage } from './views/settings.js';
import { esc, toast, modal } from './ui.js';
import { MODULES } from './modules.js';

const ROUTES = {
  '': [home, '홈'], inbox: [inbox, '담기'], approvals: [approvals, '승인 센터'], calendar: [calendar, '일정'], tasks: [tasks, '할 일'],
  money: [money, '머니'], subs: [subs, '구독'], routine: [routine, '루틴'], docs: [docs, '문서'], memos: [memos, '메모'], shop: [shop, '장보기'], fridge: [fridge, '냉장고'], notices: [notices, '알림'],
  report: [report, '리포트'], automations: [automations, '자동화'], memory: [memory, 'AI 기억'], audit: [auditView, '실행 기록'],
  ai: [assistant, 'AI 비서'], search: [searchView, '찾기'], settings: [settings, '설정'], more: [more, '전체 메뉴'], guide: [guide, '사용법'],
};
const TABS = [['', '🏠', '홈'], ['calendar', '📅', '일정'], ['inbox', '📩', '담기'], ['money', '💳', '머니'], ['more', '☰', '전체']];
// 이 화면들은 해당 저장소가 바뀌면 다시 그린다
const WATCH = { '': '*', inbox: [], approvals: ['approvals'], calendar: ['events', 'tasks'], tasks: ['tasks'], money: ['transactions', 'budgets'], subs: ['subscriptions'], routine: ['routines', 'routineLogs'], docs: ['documents'], memos: ['memos'], shop: ['shopping'], fridge: ['fridge'], notices: ['notices'], memory: ['memory'], m: '*' };

const main = document.getElementById('view');
let current = null, rendering = false, pending = false;

function parse() {
  const h = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [a, b] = h.split('/');
  return { key: a || '', sub: b };
}

async function render() {
  if (rendering) { pending = true; return; }
  rendering = true;
  try {
    const { key, sub } = parse();
    current = key;
    const ctx = { refresh: () => render(), key, sub };
    const scrollKeep = window.scrollY;
    if (key === 'm') { await moduleView(main, ctx, sub); setTitle(sub); }
    else { const r = ROUTES[key] || ROUTES['']; await r[0](main, ctx); document.title = `${r[1]} · ${APP.name}`; }
    if (!ctx.keepScroll && renderSameKey === key) window.scrollTo(0, scrollKeep); else window.scrollTo(0, 0);
    renderSameKey = key;
    drawTabs(key);
    await badge();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<section class="card danger-card"><h2>화면을 그리다 문제가 생겼어요</h2><p class="pre">${esc(e.message)}</p><a class="btn" href="#/">홈으로</a></section>`;
  } finally {
    rendering = false;
    if (pending) { pending = false; render(); }
  }
}
let renderSameKey = null;
function setTitle(sub) { document.title = `${MODULES[sub]?.title || sub} · ${APP.name}`; }

function drawTabs(key) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = TABS.map(([k, i, t]) => `<a href="#/${k}" class="${(k === key) || (k === 'more' && !TABS.some((x) => x[0] === key)) ? 'on' : ''}" ${k === key ? 'aria-current="page"' : ''}><span>${i}</span>${t}<i class="dot" data-dot="${k}"></i></a>`).join('');
}

async function badge() {
  const [ap, no] = await Promise.all([db.all('approvals'), db.all('notices')]);
  const p = ap.filter((a) => a.status === 'pending').length, n = no.filter((x) => !x.read).length;
  const bell = document.getElementById('bell');
  bell.dataset.count = n || ''; bell.setAttribute('aria-label', `알림 ${n}개`);
  const d = document.querySelector('[data-dot=""]'); if (d) d.classList.toggle('on', p > 0);
}

let t;
bus.on('change', (store) => {
  const w = WATCH[current];
  if (!w) return badge();
  if (w === '*' || store === '*' || w.includes(store)) { clearTimeout(t); t = setTimeout(render, 120); } else badge();
});
bus.on('settings', applySettings);

function applySettings(s) {
  const r = document.documentElement;
  r.dataset.theme = s.theme === 'auto' ? '' : s.theme;
  if (s.theme === 'auto') delete r.dataset.theme;
  r.classList.toggle('senior', !!s.senior);
  r.style.setProperty('--fs', String((s.senior ? Math.max(1.2, s.fontScale) : s.fontScale) || 1));
}

/** 🎬 오른쪽 위 — 사용법 영상 3편 · 글 사용법 · (PC 판) 사용 기간 */
async function helpMenu() {
  const vids = (APP.videos || []).map((v, i) => `<li class="row"><a href="#" data-vid="${i}"><b>${v.icon} ${esc(v.title)}</b><small>${esc(v.desc)}${v.url ? '' : ' · 준비 중'}</small></a><span class="muted">${v.url ? '▶' : ''}</span></li>`).join('');
  let lic = '';
  if (location.port === '47561') { // PC 프로그램(AutoLife.exe) — 실행기가 사용 기간을 알려 준다
    try {
      const r = await (await fetch('/__autolife', { cache: 'no-store' })).json();
      const L = r.license || {};
      if (L.end) lic = `<p class="small">📅 사용 기간: <b>${esc(L.label || '')}</b> · ${esc(L.end)}까지 <span class="badge">${L.daysLeft}일 남음</span></p>`;
    } catch { /* 실행기가 없으면 안 보임 */ }
  }
  const m = modal({ title: '🎬 사용법 영상', body: `<ul class="list">${vids}</ul>
    <ul class="list"><li class="row"><a href="#/guide" data-close><b>📖 글로 보는 사용법</b><small>화면마다 쓰는 법을 차례로</small></a><span class="muted">›</span></li></ul>
    ${lic}<p class="muted small">${esc(APP.name)} ${esc(APP.version)}${APP.support ? ' · 문의 ' + esc(APP.support) : ''}</p>` });
  m.el.querySelectorAll('[data-vid]').forEach((a) => (a.onclick = (e) => {
    e.preventDefault();
    const v = APP.videos[+a.dataset.vid];
    if (!v.url) { toast('이 영상은 준비 중이에요'); return; }
    window.open(v.url, '_blank', 'noopener');
  }));
  // 창을 닫으면 뒤로 가기가 한 번 일어나므로, 닫은 뒤에 사용법으로 간다
  m.el.querySelectorAll('[data-close]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); m.close(); setTimeout(() => { location.hash = '#/guide'; }, 260); }));
}

async function start() {
  document.getElementById('brand').textContent = APP.name;
  document.getElementById('helpBtn').onclick = helpMenu;
  document.documentElement.style.setProperty('--primary', APP.primary);
  document.documentElement.style.setProperty('--accent', APP.accent);
  const s = await getSettings();
  applySettings(s);
  await lockScreen();
  window.addEventListener('hashchange', render);
  // 공유 받기: /?text=... 로 열리면 담기로
  const q = new URLSearchParams(location.search);
  if (q.get('text') || q.get('title') || q.get('url')) { history.replaceState(null, '', location.pathname + `#/inbox?${q.toString()}`); }
  await render();
  if (!s.onboarded) onboarding(() => render());
  protectStorage();
  runDaily(true).catch(console.error);
  setInterval(() => runDaily().catch(console.error), 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) runDaily().catch(console.error); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('새 판을 받았어요 ✨ 앱을 닫았다 다시 열면 바뀌어요', 5000); });
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
  // 설치 안내 (안드로이드 크롬)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (location.port === '47561') return; // PC 프로그램(AutoLife.exe) 창 — 이미 설치된 것이라 설치 단추가 필요 없다
    const b = document.getElementById('install'); b.hidden = false;
    b.onclick = async () => { e.prompt(); await e.userChoice; b.hidden = true; };
  });
}
start();
