// 🧊 냉장고·유통기한 — 급한 순서로 보기 · 먹음/버림 · 다 먹은 것은 장보기로 다시 · 이번 달 버린 비율
import { db, audit, getSettings } from '../db.js';
import { groupFridge, wasteStats, toFridgeItem, PLACES, FOOD_CATS, shelfDays, isFood } from '../core/fridge.js';
import { parseShopText, isOnList, guessCat } from '../core/shop.js';
import { esc, toast, empty, formDialog, listen, ddayBadge } from '../ui.js';
import { today, addDays, prettyDate, diffDays } from '../core/dates.js';
import { suggestRecipes, recipeQuestion } from '../core/recipes.js';

let place = '전체';

export async function fridge(el, ctx) {
  const t = today();
  const all = await db.all('fridge');
  const inside = all.filter((x) => (x.status || 'in') === 'in');
  const groups = groupFridge(place === '전체' ? all : all.filter((x) => x.place === place), t);
  const st = wasteStats(all, t.slice(0, 7));
  const recent = all.filter((x) => x.status === 'eaten' && x.closedOn && x.closedOn >= addDays(t, -3) && !x.reBought).slice(0, 8);
  const withLeft = inside.map((x) => ({ ...x, left: x.expires ? diffDays(t, x.expires) : null }));
  const recipes = suggestRecipes(withLeft, 6);
  const hasAI = Object.values((await getSettings()).ai?.providers || {}).some((p) => p.key);
  const cnt = (p) => inside.filter((x) => x.place === p).length;

  el.innerHTML = `
  <section class="card"><div class="card-head"><h1>🧊 냉장고·유통기한</h1><span class="muted small">${inside.length}가지</span></div>
    <form class="composer inline" id="frForm"><button type="button" class="icon-btn" id="frMic" aria-label="말로 넣기">🎙️</button><textarea id="frIn" rows="1" placeholder="예: 우유, 두부 한 모, 삼겹살 600g"></textarea><button class="btn primary" type="submit">넣기</button></form>
    <p class="muted small">오늘 산 것으로 넣고, 보통 보관 일수로 날짜를 짐작해요. 포장에 적힌 날짜가 다르면 ✎ 로 고쳐 주세요.</p>
    <div class="chips">${['전체', ...PLACES].map((p) => `<button class="chip ${p === place ? 'on' : ''}" data-pl="${p}">${p}${p === '전체' ? '' : ` ${cnt(p)}`}</button>`).join('')}</div>
  </section>
  ${groups.length ? groups.map((g) => `<section class="card ${g.level === 'over' || g.level === 'today' ? 'accent-card' : ''}"><h2>${g.label} <small>${g.items.length}</small></h2>
    <ul class="list">${g.items.map((x) => `<li class="row"><a href="#" data-ed="${x.id}"><b>${esc(x.name)}${x.qty ? ` <span class="muted small">${esc(x.qty)}</span>` : ''}</b><small>${esc(x.place || '냉장')} · ${x.expires ? `${prettyDate(x.expires)}까지${x.guessed ? '(짐작)' : ''}` : '날짜 없음'}${x.memo ? ' · ' + esc(x.memo) : ''}</small></a>
      <span class="row-btns">${x.left != null ? ddayBadge(x.left) : ''}<button class="btn small" data-eat="${x.id}" aria-label="${esc(x.name)} 먹음">😋</button><button class="btn small" data-throw="${x.id}" aria-label="${esc(x.name)} 버림">🗑</button></span></li>`).join('')}</ul></section>`).join('')
    : `<section class="card">${empty('🧊', place === '전체' ? '냉장고가 비어 있어요. 위 칸에 넣거나, 장보기에서 「🧊 산 것 냉장고에」를 눌러 보세요.' : `${place}에 넣은 것이 없어요`)}</section>`}
  ${recent.length ? `<section class="card"><h2>🛒 다 먹은 것 — 또 살까요?</h2><div class="chips">${recent.map((x) => `<button class="chip" data-rebuy="${x.id}">+ ${esc(x.name)}</button>`).join('')}</div></section>` : ''}
  ${inside.length ? `<section class="card"><div class="card-head"><h2>🍳 오늘 뭐 해 먹지?</h2>${hasAI ? '<button class="btn small" data-askai>🤖 AI 에게 묻기</button>' : ''}</div>
    ${recipes.length ? `<ul class="list">${recipes.map((r, i) => `<li class="recipe"><details ${i === 0 ? 'open' : ''}><summary><b>${r.icon} ${esc(r.name)}</b> <span class="muted small">· ${r.min}분</span>${r.urgent.length ? ' <span class="badge">급한 재료 씀</span>' : ''}</summary>
      <p class="small">✅ 있는 것: ${[...r.got, ...r.extras].map((w) => esc(w) + (r.urgent.includes(w) ? '⏰' : '')).join(', ')}${r.missing.length ? ` · ❌ 없는 것: <b>${r.missing.map(esc).join(', ')}</b>` : ''}</p>
      <p class="small">🍳 ${esc(r.how)}</p>
      ${r.missing.length ? `<button class="btn small" data-need="${esc(r.missing.join(','))}">🛒 없는 재료 장보기에</button>` : ''}</details></li>`).join('')}</ul>
      <p class="muted small">집에 있는 재료로 고른 집밥 ${recipes.length}가지예요(기본양념은 있다고 봐요). ⏰ 는 날짜가 급한 재료.</p>`
    : '<p class="muted small">지금 재료로 고를 만한 요리가 없어요. 계란·두부·김치·감자 같은 재료가 있으면 골라 드려요.</p>'}</section>` : ''}
  <section class="card"><h2>♻️ 이번 달</h2><p>😋 먹음 <b>${st.eaten}</b> · 🗑 버림 <b>${st.thrown}</b>${st.eaten + st.thrown ? ` · 버린 비율 <b>${st.rate}%</b>` : ''}</p>
    ${st.top.length ? `<p class="muted small">자주 버린 것: ${st.top.map((x) => `${esc(x.name)} ${x.n}번`).join(', ')} — 다음엔 조금만 사 보세요.</p>` : '<p class="muted small">버리는 음식이 줄면 돈도 줄어요. 다 먹으면 😋, 버리면 🗑 를 눌러 주세요.</p>'}</section>`;

  const input = el.querySelector('#frIn');
  el.querySelector('#frForm').onsubmit = async (e) => {
    e.preventDefault();
    const list = parseShopText(input.value);
    if (!list.length) return toast('넣을 것을 적어 주세요');
    for (const it of list) await db.put('fridge', toFridgeItem(it, t));
    toast(`${list.length}가지 넣었어요`); ctx.refresh();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('#frForm').requestSubmit(); } });
  el.querySelector('#frMic').onclick = () => { if (!listen((x) => (input.value = x), () => { if (input.value.trim()) el.querySelector('#frForm').requestSubmit(); })) toast('이 브라우저는 음성 인식을 지원하지 않아요'); };
  el.querySelectorAll('[data-pl]').forEach((b) => (b.onclick = () => { place = b.dataset.pl; ctx.refresh(); }));
  const close = async (id, status) => {
    const x = await db.get('fridge', id);
    await db.put('fridge', { ...x, status, closedOn: t });
    toast(status === 'eaten' ? `😋 ${x.name} 다 먹었어요` : `🗑 ${x.name} 버렸어요`);
  };
  el.querySelectorAll('[data-eat]').forEach((b) => (b.onclick = () => close(b.dataset.eat, 'eaten')));
  el.querySelectorAll('[data-throw]').forEach((b) => (b.onclick = () => close(b.dataset.throw, 'thrown')));
  el.querySelectorAll('[data-need]').forEach((b) => (b.onclick = async () => {
    const cur = await db.all('shopping'); let n = 0;
    for (const name of b.dataset.need.split(',')) if (!isOnList(cur, name)) { cur.push(await db.put('shopping', { name, qty: '', cat: guessCat(name), memo: '', done: false, archived: false })); n++; }
    b.disabled = true; b.textContent = n ? `🛒 ${n}가지 담았어요` : '🛒 이미 담겨 있어요';
  }));
  el.querySelector('[data-askai]')?.addEventListener('click', () => {
    try { sessionStorage.setItem('al_ai_draft', recipeQuestion(withLeft)); } catch {}
    location.hash = '#/ai';
  });
  el.querySelectorAll('[data-rebuy]').forEach((b) => (b.onclick = async () => {
    const x = await db.get('fridge', b.dataset.rebuy);
    const cur = await db.all('shopping');
    if (!isOnList(cur, x.name)) await db.put('shopping', { name: x.name, qty: '', cat: x.cat || '기타', memo: '', done: false, archived: false });
    await db.put('fridge', { ...x, reBought: true });
    toast(`🛒 장보기에 「${x.name}」 담았어요`);
  }));
  el.querySelectorAll('[data-ed]').forEach((a) => (a.onclick = async (e) => {
    e.preventDefault();
    const x = await db.get('fridge', a.dataset.ed);
    formDialog({
      title: '냉장고 고치기', value: x,
      fields: [
        { k: 'name', label: '이름', required: true, half: true },
        { k: 'qty', label: '수량', half: true },
        { k: 'place', label: '어디에', type: 'select', options: PLACES, half: true },
        { k: 'cat', label: '분류', type: 'select', options: FOOD_CATS, half: true },
        { k: 'bought', label: '산 날', type: 'date', half: true },
        { k: 'expires', label: '먹을 날짜(유통·소비기한)', type: 'date', half: true, help: '포장에 적힌 날짜가 있으면 그걸로' },
        { k: 'memo', label: '메모', placeholder: '예: 반 남음, 개봉함' },
      ],
      async onSave(o) {
        const guessed = o.expires === x.expires ? x.guessed : false;
        const expires = o.expires || (o.bought ? addDays(o.bought, shelfDays(o.name, o.cat)) : x.expires);
        await db.put('fridge', { ...x, ...o, expires, guessed });
        ctx.refresh();
      },
      onDelete: async () => { await db.del('fridge', x.id); ctx.refresh(); },
    });
  }));
}

/** 장보기에서 산 것 → 냉장고 (먹을거리만) — 넣은 개수 */
export async function shopToFridge(items) {
  const t = today(); let n = 0;
  for (const it of items) if (isFood(it.cat)) { await db.put('fridge', toFridgeItem(it, t)); n++; }
  if (n) await audit('fridge.add', `장보기에서 냉장고로 ${n}가지`);
  return n;
}
