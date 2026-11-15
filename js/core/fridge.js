// 🧊 냉장고·유통기한 — 산 날 + 보통 보관 일수로 「언제까지 먹을지」를 짐작하고,
// 지난 것·오늘·곧(2일) 순서로 보여 준다. 먹음/버림을 세어 「버린 것 줄이기」를 돕는다.
import { addDays, diffDays, today as todayOf } from './dates.js';
import { guessCat } from './shop.js';

// 이름별 보통 보관 일수 (냉장 기준, 집에서 짐작하는 값 — 포장에 적힌 날짜가 있으면 그게 우선)
const DAYS_BY_NAME = [
  ['회', 1], ['생선', 2], ['고등어', 2], ['오징어', 2], ['새우', 2], ['조개', 2], ['바지락', 2], ['굴', 2],
  ['다짐육', 2], ['닭가슴살', 3], ['닭', 3], ['고기', 3], ['삼겹살', 3], ['목살', 3], ['불고기', 3],
  ['상추', 4], ['깻잎', 5], ['시금치', 4], ['콩나물', 3], ['숙주', 3], ['버섯', 5], ['딸기', 3], ['바나나', 5], ['샐러드', 3],
  ['빵', 4], ['식빵', 5], ['두부', 5], ['어묵', 7], ['우유', 7], ['요거트', 14], ['요구르트', 14], ['두유', 30],
  ['계란', 21], ['달걀', 21], ['치즈', 30], ['버터', 60], ['햄', 14], ['소시지', 14], ['베이컨', 7], ['김치', 30],
  ['오이', 7], ['애호박', 7], ['호박', 7], ['대파', 10], ['파', 10], ['토마토', 7], ['사과', 21], ['배', 14], ['귤', 14],
  ['당근', 14], ['양배추', 14], ['배추', 10], ['무', 14], ['감자', 30], ['고구마', 30], ['양파', 30], ['마늘', 30],
  ['만두', 90], ['냉동', 90], ['아이스크림', 180], ['쌀', 180], ['라면', 180], ['과자', 90],
];
const DAYS_BY_CAT = { '채소·과일': 7, '정육·수산': 3, '유제품·계란': 10, '두부·반찬·즉석': 7, '쌀·면·빵': 30, '양념·소스': 180, '음료·간식': 60, 기타: 7 };
export const FOOD_CATS = Object.keys(DAYS_BY_CAT);
export const PLACES = ['냉장', '냉동', '실온'];

const FROZEN = ['냉동', '만두', '아이스크림'];
const ROOM = ['감자', '고구마', '양파', '바나나', '쌀', '라면', '과자', '마늘'];

/** 먹을거리인가 — 장보기의 생활용품·약·반려동물은 냉장고로 보내지 않는다 */
export const isFood = (cat) => FOOD_CATS.includes(cat || '기타');

/** 이름으로 보관 일수 짐작 — 긴 낱말 먼저 (「닭가슴살」이 「닭」보다) */
export function shelfDays(name, cat) {
  const n = String(name || '').replace(/\s/g, '');
  let best = null, len = 0;
  for (const [w, d] of DAYS_BY_NAME) if (w.length > len && n.includes(w)) { best = d; len = w.length; }
  return best ?? DAYS_BY_CAT[cat || guessCat(name)] ?? 7;
}

export function guessPlace(name) {
  const n = String(name || '').replace(/\s/g, '');
  if (FROZEN.some((w) => n.includes(w))) return '냉동';
  if (ROOM.some((w) => n.includes(w))) return '실온';
  return '냉장';
}

/** 장보기 한 줄 → 냉장고 한 줄 (산 날 기준 짐작 날짜) */
export function toFridgeItem(it, boughtOn) {
  const cat = it.cat && isFood(it.cat) ? it.cat : guessCat(it.name);
  return { name: it.name, qty: it.qty || '', cat, place: guessPlace(it.name), bought: boughtOn, expires: addDays(boughtOn, shelfDays(it.name, cat)), guessed: true, status: 'in' };
}

/** 남은 날 · 단계: over(지남) today(오늘까지) soon(2일 안) week(7일 안) ok */
export function fridgeStatus(item, t) {
  if (!item.expires) return { left: null, level: 'ok' };
  const left = diffDays(t, item.expires);
  const level = left < 0 ? 'over' : left === 0 ? 'today' : left <= 2 ? 'soon' : left <= 7 ? 'week' : 'ok';
  return { left, level };
}

const LEVELS = [['over', '⚠️ 날짜 지남 — 확인하세요'], ['today', '🔥 오늘까지'], ['soon', '⏰ 2일 안에 드세요'], ['week', '🗓 이번 주 안'], ['ok', '😌 넉넉해요']];

/** 지금 들어 있는 것만, 급한 순서로 묶기 */
export function groupFridge(items, t) {
  const live = items.filter((x) => (x.status || 'in') === 'in');
  const by = {};
  for (const x of live) { const s = fridgeStatus(x, t); (by[s.level] ||= []).push({ ...x, left: s.left }); }
  return LEVELS.filter(([k]) => by[k]).map(([k, label]) => ({ level: k, label, items: by[k].sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999) || a.name.localeCompare(b.name)) }));
}

/** 이번 달 먹음·버림 — 버린 비율이 줄면 칭찬 */
export function wasteStats(items, month) {
  const m = items.filter((x) => (x.closedOn || '').startsWith(month));
  const eaten = m.filter((x) => x.status === 'eaten').length, thrown = m.filter((x) => x.status === 'thrown').length;
  const total = eaten + thrown;
  return { eaten, thrown, rate: total ? Math.round(thrown / total * 100) : 0, top: topThrown(items) };
}

/** 자주 버리는 것 (지금까지) — 「조금만 사세요」 안내용 */
function topThrown(items) {
  const c = new Map();
  for (const x of items) if (x.status === 'thrown') c.set(x.name, (c.get(x.name) || 0) + 1);
  return [...c.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, n }));
}

/** 하루 훑기용 — 오늘까지·내일까지인 것 한 번에 */
export function expiryNotice(items, now = new Date()) {
  const t = todayOf(now);
  const urgent = items.filter((x) => (x.status || 'in') === 'in' && x.expires).map((x) => ({ ...x, left: diffDays(t, x.expires) })).filter((x) => x.left <= 1);
  if (!urgent.length) return null;
  const over = urgent.filter((x) => x.left < 0).length;
  return {
    title: `🧊 먼저 드세요 ${urgent.length}가지`,
    body: urgent.sort((a, b) => a.left - b.left).slice(0, 5).map((x) => `${x.name}(${x.left < 0 ? '지남' : x.left === 0 ? '오늘' : '내일'})`).join(', ') + (over ? ' — 지난 것은 냄새·색을 보고 판단하세요' : ''),
    level: over ? 'warn' : 'info',
  };
}
