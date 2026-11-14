// 머니 가드 · 구독·고정비 센터
import { db } from '../db.js';
import { monthSummary, forecastMonth, anomalies, CATEGORIES, subscriptionSummary, rollBilling, monthlyEquivalent, detectSubscriptions, categorize } from '../core/logic.js';
import { today, monthKey, prettyDate, diffDays, addMonths } from '../core/dates.js';
import { esc, won, toast, empty, formDialog, modal, ddayBadge, confirmBox } from '../ui.js';
import { txDialog, subDialog } from './forms.js';
import { execute } from '../actions.js';

let ym = null;
export async function money(el, ctx) {
  ym ||= monthKey(today());
  const txs = await db.all('transactions');
  const budgets = await db.all('budgets');
  const subs = await db.all('subscriptions');
  const s = monthSummary(txs, ym);
  const prevYm = addMonths(ym + '-01', -1).slice(0, 7);
  const prev = monthSummary(txs, prevYm);
  const isNow = ym === monthKey(today());
  const fc = isNow ? forecastMonth(s.total) : s.total;
  const inMonth = txs.filter((t) => t.date?.startsWith(ym)).sort((a, b) => ((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || '')));
  const anom = anomalies(inMonth);
  const cats = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]);
  const max = cats[0]?.[1] || 1;
  const bmap = Object.fromEntries(budgets.map((b) => [b.main, b]));
  const ss = subscriptionSummary(subs);
  const known = new Set(subs.map((x) => x.name));
  const found = detectSubscriptions(txs).filter((f) => !known.has(f.merchant));
  // 3달 평균 대비
  const avg3 = [1, 2, 3].map((i) => monthSummary(txs, addMonths(ym + '-01', -i).slice(0, 7)));
  const tips = [];
  for (const [c, v] of cats) {
    const a = avg3.map((x) => x.byCat[c] || 0).filter(Boolean);
    if (a.length >= 2) { const av = a.reduce((x, y) => x + y, 0) / a.length; if (v > av * 1.2 && v - av >= 20000) tips.push(`${c} 지출이 최근 평균보다 ${Math.round((v / av - 1) * 100)}% 많아요 (${won(v - av)} 더)`); }
  }
  if (ss.unused.length) tips.push(`한 달 넘게 안 쓴 구독 ${ss.unused.length}개를 정리하면 월 ${won(ss.savable)} 아낄 수 있어요`);
  for (const o of ss.overlaps) tips.push(`${o.kind} 구독이 ${o.items.length}개예요 (${o.items.map((x) => x.name).join(', ')})`);

  const bud = bmap['전체'];
  el.innerHTML = `
  <section class="card"><div class="cal-head"><button class="icon-btn" data-mv="-1" aria-label="지난달">‹</button><h1>${ym.replace('-', '년 ')}월 돈</h1><button class="icon-btn" data-mv="1" aria-label="다음달">›</button></div>
    <div class="money-line big"><div><small>쓴 돈</small><b>${won(s.total)}</b></div><div><small>들어온 돈</small><b class="plus">${won(s.income)}</b></div>${s.income ? `<div><small>남은 돈</small><b class="${s.net < 0 ? 'minus' : ''}">${won(s.net)}</b></div>` : `<div><small>지출 기록</small><b>${s.count}건</b></div>`}</div>
    <p class="muted small">${isNow ? `이대로면 월말 <b>${won(fc)}</b> · ` : ''}지난달 ${won(prev.total)} (${s.total >= prev.total ? '▲' : '▼'}${won(Math.abs(s.total - prev.total))})${s.business ? ` · 사업 경비 ${won(s.business)}` : ''}</p>
    ${bud ? `<div class="bar ${s.total >= bud.amount ? 'danger' : s.total >= bud.amount * 0.8 ? 'warn' : ''}"><i style="width:${Math.min(100, s.total / bud.amount * 100)}%"></i></div><small class="muted">전체 예산 ${won(bud.amount)} 중 ${Math.round(s.total / bud.amount * 100)}%</small>` : ''}
    <div class="row-btns"><button class="btn primary" data-add>+ 돈 기록</button><button class="btn" data-budget>예산 정하기</button><button class="btn" data-import>파일 가져오기</button><a class="btn" href="#/subs">구독 ${ss.count}개</a></div>
  </section>
  ${tips.length ? `<section class="card tip"><h2>💡 아낄 수 있는 곳</h2><ul>${tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  ${anom.length ? `<section class="card danger-card"><h2>🚨 확인해 보세요</h2><ul class="list">${anom.map((a) => `<li class="row"><span><b>${esc(a.tx.merchant || a.tx.main)} ${won(a.tx.amount)}</b><small>${a.tx.date} ${a.tx.time || ''} · ${esc(a.reason)}</small></span></li>`).join('')}</ul><p class="muted small">내가 쓴 게 아니라면 카드사 고객센터에 바로 연락하세요. 카드 정지·취소는 카드사 공식 절차로만 할 수 있어요.</p></section>` : ''}
  ${found.length ? `<section class="card"><h2>🔁 정기 결제로 보여요</h2><ul class="list">${found.map((f, i) => `<li class="row"><span><b>${esc(f.merchant)} ${won(f.amount)}</b><small>${f.times}번 · 마지막 ${f.last}</small></span><button class="btn small" data-subadd="${i}">구독에 넣기</button></li>`).join('')}</ul></section>` : ''}
  <section class="card"><h2>📊 어디에 썼나</h2>${cats.length ? cats.map(([c, v]) => { const b = bmap[c]; return `<div class="cat-bar"><span>${esc(c)}</span><div class="bar ${b && v >= b.amount ? 'danger' : ''}"><i style="width:${v / max * 100}%"></i></div><b>${won(v)}</b>${b ? `<small>/ ${won(b.amount)}</small>` : ''}</div>`; }).join('') : '<p class="muted pad">아직 기록이 없어요. 카드 결제 문자를 「담기」에 붙여 넣으면 자동으로 적혀요.</p>'}</section>
  <section class="card"><h2>🧾 기록 <small>${inMonth.length}건</small></h2>${inMonth.length ? `<ul class="list">${inMonth.map((t) => `<li class="row"><a href="#" data-tx="${t.id}"><b>${esc(t.merchant || t.main)}</b><small>${t.date?.slice(5).replace('-', '/')} ${t.time || ''} · ${esc(t.main)}${t.sub ? '>' + esc(t.sub) : ''}${t.method ? ' · ' + esc(t.method) : ''}${t.business ? ' · 💼사업' : ''}</small></a><b class="${t.kind === 'in' ? 'plus' : t.kind === 'refund' ? 'plus' : ''}">${t.kind === 'in' || t.kind === 'refund' ? '+' : '-'}${won(t.amount)}</b></li>`).join('')}</ul>` : empty('💳', '이달 기록이 없어요')}</section>`;

  el.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => { ym = addMonths(ym + '-01', Number(b.dataset.mv)).slice(0, 7); ctx.refresh(); }));
  el.querySelector('[data-add]').onclick = () => txDialog({}, ctx.refresh);
  el.querySelectorAll('[data-tx]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); txDialog(await db.get('transactions', a.dataset.tx), ctx.refresh); }));
  el.querySelector('[data-budget]').onclick = () => budgetDialog(budgets, ctx);
  el.querySelector('[data-import]').onclick = () => importDialog(ctx);
  el.querySelectorAll('[data-subadd]').forEach((b) => (b.onclick = () => { const f = found[+b.dataset.subadd]; subDialog({ name: f.merchant, amount: f.amount, nextDate: addMonths(f.last, 1) }, ctx.refresh); }));
}

function budgetDialog(budgets, ctx) {
  const mains = ['전체', ...Object.keys(CATEGORIES)];
  const fields = mains.map((m) => ({ k: m, label: m === '전체' ? '한 달 전체 예산' : m, type: 'money', half: m !== '전체' }));
  const v = Object.fromEntries(budgets.map((b) => [b.main, b.amount]));
  formDialog({ title: '💰 예산 정하기', fields, value: v, extra: '<p class="help">비워 두면 그 분류는 예산 없음. 80%·100%가 되면 알려 드려요.</p>', async onSave(o) {
    for (const m of mains) { const old = budgets.find((b) => b.main === m); if (o[m]) await db.put('budgets', { ...(old || {}), id: old?.id || 'b_' + m, main: m, amount: o[m] }); else if (old) await db.del('budgets', old.id); }
    toast('예산 저장'); ctx.refresh();
  } });
}

/** 은행·카드사에서 내려받은 CSV(엑셀에서 CSV로 저장) 가져오기 */
function importDialog(ctx) {
  modal({ title: '📥 거래내역 파일 가져오기', body: `<p class="muted">은행·카드사 앱에서 <b>거래내역을 엑셀로 내려받아 「CSV」로 저장</b>한 뒤 넣어 주세요. 날짜·금액·가맹점(내용) 칸을 알아서 찾아요.</p>
    <input type="file" id="csv" accept=".csv,text/csv"><div id="csvOut"></div>`, actions: [{ label: '가져오기', primary: true, keep: true, onClick: async (el, close) => {
      const f = el.querySelector('#csv').files[0]; if (!f) return toast('파일을 골라 주세요');
      let text = await f.text();
      if (text.includes('�')) { const buf = await f.arrayBuffer(); try { text = new TextDecoder('euc-kr').decode(buf); } catch {} }
      const rows = parseCsv(text);
      const r = mapRows(rows);
      if (!r.length) return (el.querySelector('#csvOut').innerHTML = '<p class="warn-line">날짜·금액 칸을 찾지 못했어요. 첫 줄에 「날짜」「금액」「내용(가맹점)」 같은 제목이 있어야 해요.</p>');
      if (!(await confirmBox(`${r.length}건을 가져올까요? (같은 날·같은 금액·같은 곳은 건너뜀)`))) return;
      const have = new Set((await db.all('transactions')).map((t) => `${t.date}|${t.amount}|${t.merchant}`));
      let n = 0;
      for (const x of r) { if (have.has(`${x.date}|${Math.abs(x.amount)}|${x.merchant}`)) continue; await execute({ action: 'transaction.create', source: 'user', data: { ...x, source: 'import' } }); n++; }
      toast(`${n}건 가져왔어요`); close(); ctx.refresh();
    } }] });
}

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export function mapRows(rows) {
  const hi = rows.findIndex((r) => r.some((c) => /일자|날짜|거래일|이용일/.test(c)) && r.some((c) => /금액|출금|이용금액|결제금액/.test(c)));
  if (hi < 0) return [];
  const h = rows[hi].map((c) => c.trim());
  const col = (re) => h.findIndex((c) => re.test(c));
  const cD = col(/일자|날짜|거래일|이용일/), cM = col(/가맹점|내용|적요|이용처|거래처|상호/), cOut = col(/출금|이용금액|결제금액|^금액/), cIn = col(/입금/);
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const dm = (r[cD] || '').match(/(\d{4})[.\-/년 ]*(\d{1,2})[.\-/월 ]*(\d{1,2})/);
    if (!dm) continue;
    const date = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
    const num = (s) => Number(String(s || '').replace(/[^\d.-]/g, '')) || 0;
    const o = num(r[cOut]), i = cIn >= 0 ? num(r[cIn]) : 0;
    if (!o && !i) continue;
    out.push({ date, merchant: (r[cM] || '').trim(), amount: Math.abs(o || i), kind: o ? (o < 0 ? 'refund' : 'out') : 'in' });
  }
  return out;
}

// ---------------------------------------------------------------- 구독
export async function subs(el, ctx) {
  const list = await db.all('subscriptions');
  const ss = subscriptionSummary(list);
  const t = today();
  const rows = list.map((x) => ({ ...x, nd: rollBilling(x) })).sort((a, b) => (a.status === '해지') - (b.status === '해지') || (a.nd || '9').localeCompare(b.nd || '9'));
  el.innerHTML = `
  <section class="card"><div class="card-head"><h1>🔁 구독·고정비</h1><button class="btn primary small" data-add>+ 구독</button></div>
    <div class="money-line big"><div><small>한 달</small><b>${won(ss.monthly)}</b></div><div><small>1년이면</small><b>${won(ss.yearly)}</b></div><div><small>아낄 수 있는 돈</small><b class="plus">${won(ss.savable)}</b></div></div>
    <p class="muted small">이용 중 ${ss.count}개 · 1년·3개월 결제는 한 달 값으로 나눠 더했어요. 「절감 가능」은 한 달 넘게 안 쓴 구독만 셉니다 (실제로 아낀 돈과 따로 셉니다).</p>
  </section>
  ${ss.trials.length ? `<section class="card danger-card"><h2>⏳ 무료 체험이 곧 끝나요</h2>${ss.trials.map((x) => `<p><b>${esc(x.name)}</b> ${prettyDate(x.trialEnd)} — 안 쓸 거면 그 전에 해지하세요.</p>`).join('')}</section>` : ''}
  ${ss.overlaps.length ? `<section class="card tip"><h2>👯 같은 종류가 여러 개</h2>${ss.overlaps.map((o) => `<p>${esc(o.kind)}: ${o.items.map((x) => esc(x.name)).join(', ')} — 하나로 줄이면 월 ${won(o.items.slice(1).reduce((a, x) => a + monthlyEquivalent(x), 0))}까지 아낄 수 있어요.</p>`).join('')}</section>` : ''}
  <section class="card">${rows.length ? `<ul class="list">${rows.map((x) => `<li class="row ${x.status === '해지' ? 'done' : ''}"><a href="#" data-ed="${x.id}"><b>${esc(x.name)} <small>${esc(x.kind || '')}</small></b>
     <small>${won(x.amount)} ${esc(x.cycle)}${x.cycle !== '매월' ? ` (월 ${won(monthlyEquivalent(x))})` : ''}${x.nd && x.status !== '해지' ? ' · 다음 ' + prettyDate(x.nd) : ''}${x.lastUsed && diffDays(x.lastUsed, t) > 30 ? ' · 💤 ' + diffDays(x.lastUsed, t) + '일 안 씀' : ''}</small></a>
     <span class="row-btns">${x.nd && x.status !== '해지' ? ddayBadge(diffDays(t, x.nd)) : `<span class="badge">${esc(x.status)}</span>`}${x.status !== '해지' ? `<button class="btn small" data-used="${x.id}" title="오늘 썼어요">썼음</button>` : ''}</span></li>`).join('')}</ul>` : empty('🔁', '구독을 등록하면 결제일 전에 알려 드리고, 안 쓰는 구독을 찾아 드려요', '<button class="btn primary" data-add>+ 첫 구독 넣기</button>')}</section>
  <section class="card"><h2>🧭 해지하는 법</h2><p class="muted small">오토라이프는 대신 해지하지 않아요(계정·결제 정보를 맡지 않으려고). 구독마다 「해지 방법」 칸에 적어 두면 필요할 때 바로 볼 수 있어요. 보통은 <b>그 서비스 앱 → 설정(내 정보) → 멤버십·구독 → 해지</b>, 앱스토어 결제면 <b>구글 플레이·앱스토어 → 구독</b>에서 해지합니다.</p></section>`;
  el.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => subDialog({}, ctx.refresh)));
  el.querySelectorAll('[data-ed]').forEach((a) => (a.onclick = async (e) => { e.preventDefault(); subDialog(await db.get('subscriptions', a.dataset.ed), ctx.refresh); }));
  el.querySelectorAll('[data-used]').forEach((b) => (b.onclick = async () => { const x = await db.get('subscriptions', b.dataset.used); await db.put('subscriptions', { ...x, lastUsed: t }); toast('오늘 쓴 것으로 적었어요'); }));
}
