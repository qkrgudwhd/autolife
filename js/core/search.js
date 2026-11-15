// 통합 검색 — 모든 기록에서 한 번에 찾는다. 띄어쓰기로 여러 낱말이면 모두 들어간 것만.
// 「11월」「12000」처럼 날짜·금액으로도 찾는다.

const SOURCES = {
  events: { label: '일정', icon: '📅', link: () => '#/calendar', text: (r) => [r.title, r.place, r.note, r.type, r.date, r.with], title: (r) => r.title, sub: (r) => `${r.date || ''} ${r.time || ''} ${r.place || ''}` },
  tasks: { label: '할 일', icon: '✅', link: () => '#/tasks', text: (r) => [r.title, r.note, r.category, r.due], title: (r) => `${r.done ? '✔ ' : ''}${r.title}`, sub: (r) => `${r.due ? '기한 ' + r.due : ''} ${r.category || ''}` },
  transactions: { label: '돈', icon: '💳', link: () => '#/money', text: (r) => [r.merchant, r.memo, r.main, r.sub, r.method, r.date, String(r.amount)], title: (r) => `${r.merchant || r.main} ${Number(r.amount || 0).toLocaleString('ko-KR')}원`, sub: (r) => `${r.date || ''} · ${r.main || ''}${r.sub ? '>' + r.sub : ''}` },
  subscriptions: { label: '구독', icon: '🔁', link: () => '#/subs', text: (r) => [r.name, r.kind, r.note, r.cancelHow], title: (r) => r.name, sub: (r) => `${Number(r.amount || 0).toLocaleString('ko-KR')}원 ${r.cycle || ''}` },
  documents: { label: '문서', icon: '📄', link: () => '#/docs', text: (r) => [r.title, r.type, r.tags, r.text, r.date], title: (r) => r.title, sub: (r) => `${r.type || ''} ${r.date || ''}` },
  people: { label: '사람', icon: '👨‍👩‍👧', link: () => '#/m/people', text: (r) => [r.name, r.relation, r.group, r.likes, r.note, r.phone], title: (r) => r.name, sub: (r) => `${r.relation || ''} ${r.group || ''}` },
  orders: { label: '택배', icon: '📦', link: () => '#/m/orders', text: (r) => [r.item, r.shop, r.carrier, r.tracking, r.note, r.status], title: (r) => r.item, sub: (r) => `${r.shop || ''} ${r.status || ''}` },
  assets: { label: '정기 관리', icon: '🛠️', link: () => '#/m/assets', text: (r) => [r.name, r.target, r.vendor, r.note], title: (r) => r.name, sub: (r) => r.target || '' },
  study: { label: '공부', icon: '🎓', link: () => '#/m/study', text: (r) => [r.title, r.subject, r.kind, r.note, r.date], title: (r) => r.title, sub: (r) => `${r.kind || ''} ${r.date || ''}` },
  clients: { label: '거래처', icon: '🤝', link: () => '#/m/clients', text: (r) => [r.name, r.contact, r.history, r.nextAction, r.bizNo], title: (r) => r.name, sub: (r) => r.stage || '' },
  invoices: { label: '받을 돈', icon: '💰', link: () => '#/m/invoices', text: (r) => [r.client, r.title, r.note, String(r.amount)], title: (r) => `${r.client} ${Number(r.amount || 0).toLocaleString('ko-KR')}원`, sub: (r) => `${r.status || ''} ${r.dueDate || ''}` },
  memos: { label: '메모', icon: '📝', link: () => '#/memos', text: (r) => [r.text, r.to], title: (r) => String(r.text || '').slice(0, 40), sub: (r) => (r.kind === 'draft' ? '초안' : '메모') },
  memory: { label: 'AI 기억', icon: '🧠', link: () => '#/memory', text: (r) => [r.text, r.kind], title: (r) => r.text, sub: (r) => r.kind || '' },
  shopping: { label: '장보기', icon: '🛒', link: () => '#/shop', text: (r) => (r.archived ? [] : [r.name, r.qty, r.memo, r.cat]), title: (r) => `${r.done ? '✔ ' : ''}${r.name}${r.qty ? ' ' + r.qty : ''}`, sub: (r) => r.cat || '' },
  routines: { label: '루틴', icon: '💊', link: () => '#/routine', text: (r) => [r.name, r.dose, r.goal, r.note], title: (r) => r.name, sub: (r) => r.dose || r.kind || '' },
};
export const SEARCH_STORES = Object.keys(SOURCES);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s,]/g, '');

/** data = {events:[...], tasks:[...], ...} → [{store,label,icon,items:[{id,title,sub,link}]}] (많이 맞은 묶음이 위) */
export function searchAll(data, q, limitPer = 20) {
  const words = String(q || '').trim().split(/\s+/).map(norm).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const [store, S] of Object.entries(SOURCES)) {
    const items = [];
    for (const r of data[store] || []) {
      const hay = norm(S.text(r).filter((x) => x != null).join(' '));
      if (words.every((w) => hay.includes(w))) items.push({ id: r.id, title: S.title(r), sub: S.sub(r).trim(), link: S.link(r), at: r.date || r.due || r.updatedAt || '' });
    }
    if (items.length) out.push({ store, label: S.label, icon: S.icon, total: items.length, items: items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limitPer) });
  }
  return out.sort((a, b) => b.total - a.total);
}
