// 🛒 장보기·살 것 — 한 줄에 여러 개 담기 · 마트 동선 순서 · 자주 사는 것 · 가족에게 보내기 · 장 본 돈 가계부로
import { db, audit } from '../db.js';
import { SHOP_CATS, parseShopText, groupShop, frequentShop, isOnList, shopText } from '../core/shop.js';
import { esc, toast, empty, formDialog, listen, shareText, confirmBox } from '../ui.js';
import { txDialog } from './forms.js';
import { today } from '../core/dates.js';
import { isFood } from '../core/fridge.js';
import { shopToFridge } from './fridge.js';

export async function shop(el, ctx) {
  const all = await db.all('shopping');
  const groups = groupShop(all);
  const live = groups.flatMap((g) => g.items);
  const left = live.filter((x) => !x.done).length, got = live.length - left;
  const freq = frequentShop(all, 14);
  const boughtFood = live.filter((x) => x.done && isFood(x.cat));
  const food = boughtFood.length;

  el.innerHTML = `
  <section class="card"><div class="card-head"><h1>🛒 장보기·살 것</h1>${live.length ? `<span class="muted small">${got}/${live.length} 샀음</span>` : ''}</div>
    <form class="composer inline" id="shopForm"><button type="button" class="icon-btn" id="shopMic" aria-label="말로 담기">🎙️</button><textarea id="shopIn" rows="1" placeholder="예: 우유 2, 계란 한 판, 휴지"></textarea><button class="btn primary" type="submit">담기</button></form>
    <p class="muted small">쉼표·줄바꿈으로 여러 개를 한 번에 담아요. 수량(2, 3롤, 600g, 한 판)도 알아봐요.</p>
    ${freq.length ? `<h3>자주 사는 것</h3><div class="chips">${freq.map((f) => `<button class="chip" data-re="${esc(f.name)}" data-cat="${esc(f.cat || '')}">+ ${esc(f.name)}</button>`).join('')}</div>` : ''}
  </section>
  <section class="card">${groups.length ? groups.map((g) => `<h3>${g.icon} ${esc(g.cat)} <small class="muted">${g.items.filter((x) => !x.done).length}</small></h3>
    <ul class="list">${g.items.map((x) => `<li class="row ${x.done ? 'done' : ''}"><label><input type="checkbox" data-ck="${x.id}" ${x.done ? 'checked' : ''}> <b>${esc(x.name)}</b>${x.qty ? ` <small>${esc(x.qty)}</small>` : ''}${x.memo ? ` <small class="muted">· ${esc(x.memo)}</small>` : ''}</label><button class="btn small" data-ed="${x.id}" aria-label="${esc(x.name)} 고치기">✎</button></li>`).join('')}</ul>`).join('')
    : empty('🛒', '살 것이 없어요. 위 칸에 적어 담아 보세요.')}</section>
  ${live.length ? `<section class="card"><div class="row-btns">
    <button class="btn" data-share>📤 가족에게 보내기</button>
    ${got ? `<button class="btn" data-pay>🧾 장 본 돈 가계부에</button>${food ? `<button class="btn" data-tofridge>🧊 산 것 냉장고에(${food})</button>` : ''}<button class="btn primary" data-clean>✔ 산 것 정리(${got})</button>` : ''}
  </div><p class="muted small">「산 것 정리」를 하면 목록에서 빠지고, 「자주 사는 것」에 쌓여 다음에 한 번에 다시 담을 수 있어요. 「냉장고에」는 먹을거리만 유통기한을 짐작해 넣고 정리까지 해요.</p></section>` : ''}`;

  const input = el.querySelector('#shopIn');
  const add = async (list) => {
    let n = 0, dup = 0;
    const cur = await db.all('shopping');
    for (const it of list) {
      if (isOnList(cur, it.name)) { dup++; continue; }
      cur.push(await db.put('shopping', { name: it.name, qty: it.qty || '', cat: it.cat || '기타', memo: '', done: false, archived: false }));
      n++;
    }
    toast(`${n}개 담았어요${dup ? ` · 이미 있는 ${dup}개는 건너뜀` : ''}`);
    ctx.refresh();
  };
  el.querySelector('#shopForm').onsubmit = (e) => {
    e.preventDefault();
    const list = parseShopText(input.value);
    if (!list.length) return toast('살 것을 적어 주세요');
    add(list);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('#shopForm').requestSubmit(); } });
  el.querySelector('#shopMic').onclick = () => {
    if (!listen((t) => (input.value = t), () => { if (input.value.trim()) el.querySelector('#shopForm').requestSubmit(); })) toast('이 브라우저는 음성 인식을 지원하지 않아요');
  };
  el.querySelectorAll('[data-re]').forEach((b) => (b.onclick = () => add([{ name: b.dataset.re, cat: b.dataset.cat || undefined }])));
  el.querySelectorAll('[data-ck]').forEach((c) => (c.onchange = async () => {
    const x = await db.get('shopping', c.dataset.ck);
    await db.put('shopping', { ...x, done: c.checked, doneAt: c.checked ? today() : null });
  }));
  el.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = async () => {
    const x = await db.get('shopping', b.dataset.ed);
    formDialog({
      title: '살 것 고치기', value: x,
      fields: [
        { k: 'name', label: '이름', required: true },
        { k: 'qty', label: '수량', placeholder: '예: 2개, 1.5L', half: true },
        { k: 'cat', label: '분류', type: 'select', options: SHOP_CATS.map((c) => [c.k, `${c.icon} ${c.k}`]), half: true },
        { k: 'memo', label: '메모', placeholder: '예: 저지방, 1+1 이면' },
      ],
      async onSave(o) { await db.put('shopping', { ...x, ...o }); ctx.refresh(); },
      onDelete: async () => { await db.del('shopping', x.id); ctx.refresh(); },
    });
  }));
  el.querySelector('[data-share]')?.addEventListener('click', async () => {
    const r = await shareText(shopText(all), '장보기 목록');
    if (r !== 'canceled') await audit('shop.share', `장보기 목록 ${left}개 글로 보냄 (${r})`);
  });
  el.querySelector('[data-pay]')?.addEventListener('click', () => txDialog({ main: '식비', sub: '장보기', memo: live.filter((x) => x.done).map((x) => x.name).join(', ').slice(0, 80) }, ctx.refresh));
  el.querySelector('[data-tofridge]')?.addEventListener('click', async () => {
    const n = await shopToFridge(boughtFood);
    for (const x of live.filter((y) => y.done)) await db.put('shopping', { ...x, archived: true });
    toast(`🧊 ${n}가지 냉장고에 넣고 정리했어요`, 3500);
    location.hash = '#/fridge';
  });
  el.querySelector('[data-clean]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`산 것 ${got}개를 목록에서 정리할까요?\n(「자주 사는 것」에는 남아요)`, '정리'))) return;
    for (const x of live.filter((y) => y.done)) await db.put('shopping', { ...x, archived: true });
    toast('정리했어요'); ctx.refresh();
  });
}
