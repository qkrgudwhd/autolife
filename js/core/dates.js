// 날짜 도우미 — 모두 「이 기기의 지역 시간」 기준.
// 날짜는 'YYYY-MM-DD', 시각은 'HH:MM' 글자로 저장한다 (시간대 혼동을 줄이려고).

export const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];

export function pad(n) { return String(n).padStart(2, '0'); }

export function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hm(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

/** 'YYYY-MM-DD' -> 그날 0시 Date */
export function parseYmd(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 ? dt : null;
}

export function today(now = new Date()) { return ymd(now); }

export function addDays(s, n) {
  const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d);
}

/** 해당 달의 마지막 날 */
export function lastDayOfMonth(y, m1) { return new Date(y, m1, 0).getDate(); }

export function addMonths(s, n, anchorDay) {
  const d = parseYmd(s);
  const day = anchorDay || d.getDate();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  t.setDate(Math.min(day, lastDayOfMonth(t.getFullYear(), t.getMonth() + 1)));
  return ymd(t);
}

/** b - a (일 수). 같은 날이면 0 */
export function diffDays(a, b) {
  const A = parseYmd(a), B = parseYmd(b);
  return Math.round((B - A) / 86400000);
}

/** D-day 글자: 오늘=D-DAY, 미래=D-3, 지난=D+2 */
export function dday(target, now = new Date()) {
  const n = diffDays(today(now), target);
  if (n === 0) return 'D-DAY';
  return n > 0 ? `D-${n}` : `D+${-n}`;
}

export function weekdayKo(s) { return WEEK_KO[parseYmd(s).getDay()]; }

/** 사람이 읽기 좋은 날짜: 11월 18일(수) */
export function prettyDate(s, now = new Date()) {
  if (!s) return '';
  const d = parseYmd(s); if (!d) return s;
  const n = diffDays(today(now), s);
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일(${WEEK_KO[d.getDay()]})`;
  const rel = { 0: '오늘', 1: '내일', 2: '모레', [-1]: '어제' }[n];
  const yr = d.getFullYear() !== now.getFullYear() ? `${d.getFullYear()}년 ` : '';
  return rel ? `${rel} · ${base}` : yr + base;
}

/** '14:00' -> '오후 2시', '09:30' -> '오전 9시 30분' */
export function prettyTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? '오전' : '오후';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${hh}시${m ? ` ${m}분` : ''}`;
}

/** 'HH:MM' 에 분을 더한다 (하루를 넘으면 그대로 넘어가지 않고 잘린다) */
export function addMinutes(t, mins) {
  const [h, m] = t.split(':').map(Number);
  let x = h * 60 + m + mins;
  x = Math.max(0, Math.min(23 * 60 + 59, x));
  return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
}

/** 이번 주 월요일 */
export function startOfWeek(s) {
  const d = parseYmd(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d);
}

export function monthKey(s) { return s.slice(0, 7); }

export function daysInRange(from, to) {
  const out = []; let c = from;
  while (c <= to) { out.push(c); c = addDays(c, 1); }
  return out;
}
