// 계산 엔진 — 우선순위 · 반복 일정 · 돈 · 구독 · 정기 관리.
// 화면(DOM)·저장소와 떨어져 있어 Node 에서 그대로 시험한다.

import { today, addDays, addMonths, diffDays, parseYmd, ymd, monthKey, startOfWeek } from './dates.js';

// ================================================================ 우선순위
// 기획서 §3.4 공식: P = 0.30D + 0.25I + 0.20U + 0.15R + 0.10T  (각 0~100)
const IMPACT = { 돈: 85, 건강: 90, 안전: 100, 가족: 75, 업무: 70, 학습: 65, 준비: 60, 집: 55, 기타: 40 };
const RISK = { 돈: 90, 안전: 100, 건강: 80, 업무: 60, 학습: 60, 준비: 50, 가족: 50, 집: 40, 기타: 30 };

export function priority(task, now = new Date()) {
  const t0 = today(now);
  let D = 0;
  if (task.due) {
    const n = diffDays(t0, task.due);
    D = n <= 0 ? 100 : n >= 30 ? 0 : Math.round(100 * (1 - n / 30) ** 1.5);
  }
  const I = IMPACT[task.category] ?? 40;
  const U = ((task.importance ?? 3) - 1) * 25; // 1~5 -> 0~100
  const R = task.due ? RISK[task.category] ?? 30 : 10;
  const mins = task.minutes ?? 30;
  const T = mins <= 10 ? 100 : mins >= 240 ? 10 : Math.round(100 - (mins - 10) * 90 / 230);
  const score = Math.round(0.30 * D + 0.25 * I + 0.20 * U + 0.15 * R + 0.10 * T);
  const why = [];
  if (D >= 80) why.push(task.due && diffDays(t0, task.due) < 0 ? '기한 지남' : '기한 임박');
  if (I >= 85) why.push(`${task.category} 영향 큼`);
  if (U >= 75) why.push('내가 중요 표시');
  if (T >= 90) why.push('금방 끝남');
  return { score, parts: { D, I, U, R, T }, why };
}

export function sortTasks(tasks, now = new Date()) {
  return tasks
    .map((t) => ({ ...t, _p: priority(t, now) }))
    .sort((a, b) => (a.done - b.done) || (b._p.score - a._p.score));
}

// ================================================================ 반복
// rule: {freq:'none'|'daily'|'weekly'|'monthly'|'yearly', interval:1, until:'YYYY-MM-DD'|null, weekdays:[0..6]}
export function occurrences(ev, from, to) {
  const rule = ev.repeat || { freq: 'none' };
  const out = [];
  const start = ev.date;
  if (!start) return out;
  if (!rule.freq || rule.freq === 'none') {
    if (start >= from && start <= to) out.push(start);
    return out;
  }
  const iv = Math.max(1, rule.interval || 1);
  const until = rule.until && rule.until < to ? rule.until : to;
  const anchorDay = parseYmd(start).getDate();
  let k = 0, cur = start, guard = 0;
  while (cur <= until && guard++ < 5000) {
    if (cur >= from && !(ev.skip || []).includes(cur)) {
      if (rule.freq !== 'weekly' || !rule.weekdays?.length) out.push(cur);
    }
    if (rule.freq === 'daily') cur = addDays(start, ++k * iv);
    else if (rule.freq === 'weekly') {
      if (rule.weekdays?.length) {
        // 한 주 안의 지정 요일들
        const wk = addDays(start, k * 7 * iv);
        const mon = startOfWeek(wk);
        for (const wd of rule.weekdays) {
          const d = addDays(mon, (wd + 6) % 7);
          if (d >= start && d >= from && d <= until && !(ev.skip || []).includes(d)) out.push(d);
        }
        k++; cur = addDays(start, k * 7 * iv);
      } else cur = addDays(start, ++k * 7 * iv);
    } else if (rule.freq === 'monthly') cur = addMonths(start, ++k * iv, anchorDay);
    else if (rule.freq === 'yearly') cur = addMonths(start, ++k * 12 * iv, anchorDay);
    else break;
  }
  return [...new Set(out)].sort();
}

/** 기간 안의 일정을 날짜별로 펼친다 */
export function expandEvents(events, from, to) {
  const list = [];
  for (const ev of events) for (const d of occurrences(ev, from, to)) list.push({ ...ev, date: d, _origin: ev.date });
  return list.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

/** 같은 날 시간이 겹치는 일정 찾기 */
export function conflicts(dayEvents) {
  const timed = dayEvents.filter((e) => e.time).map((e) => {
    const [h, m] = e.time.split(':').map(Number);
    const s = h * 60 + m;
    let end = s + 60;
    if (e.endTime) { const [eh, em] = e.endTime.split(':').map(Number); end = eh * 60 + em; }
    return { e, s, end };
  }).sort((a, b) => a.s - b.s);
  const out = [];
  for (let i = 1; i < timed.length; i++) if (timed[i].s < timed[i - 1].end) out.push([timed[i - 1].e, timed[i].e]);
  return out;
}

/** 같은 일정이 두 번 들어오는 것 막기: 같은 날·같은 시각·비슷한 제목 */
export function isDuplicateEvent(ev, events) {
  const norm = (s) => (s || '').replace(/\s+/g, '').slice(0, 8);
  return events.some((e) => e.date === ev.date && (e.time || '') === (ev.time || '') && norm(e.title) === norm(ev.title));
}

// ================================================================ 돈
// 대분류 > 소분류 > 낱말. 낱말은 가맹점 이름·메모에서 찾는다.
export const CATEGORIES = {
  식비: { 외식: ['식당', '한식', '중식', '일식', '분식', '고기', '국밥', '치킨', '피자', '버거', '맥도날드', '롯데리아', '김밥', '뷔페'], 배달: ['배달의민족', '배민', '요기요', '쿠팡이츠'], 카페: ['스타벅스', '커피', '카페', '이디야', '메가', '빽다방', '투썸', '컴포즈', '베이커리', '파리바게뜨', '뚜레쥬르'], 장보기: ['마트', '이마트', '홈플러스', '롯데마트', '하나로', '식자재', '시장', '컬리', '정육'], 편의점: ['GS25', 'CU', '세븐일레븐', '이마트24', '편의점'] },
  교통: { 대중교통: ['교통', '지하철', '버스', '티머니', '캐시비', '코레일', 'KTX', 'SRT'], 택시: ['택시', '카카오T', '우티'], 주유: ['주유', 'SK에너지', 'GS칼텍스', 'S-OIL', '오일뱅크', '충전소'], 주차·통행료: ['주차', '하이패스', '도로공사', '통행료'] },
  주거: { 월세·관리비: ['관리비', '월세', '임대'], 전기·가스·수도: ['한국전력', '한전', '도시가스', '가스', '수도'], 인터넷·TV: ['인터넷', 'IPTV', 'SK브로드밴드', 'LG유플러스', 'KT'] },
  통신: { 휴대폰: ['SKT', 'SK텔레콤', 'KT', 'LGU+', '알뜰폰', '통신'] },
  의료: { 병원: ['병원', '의원', '치과', '한의원', '안과', '피부과'], 약국: ['약국'], 건강: ['헬스', '필라테스', '요가', '영양제'] },
  교육: { 학원·강의: ['학원', '교육', '클래스', '인강', '강의', '수강'], 도서: ['교보문고', '알라딘', 'yes24', '예스24', '서점', '도서'] },
  쇼핑: { 온라인: ['쿠팡', '네이버페이', '11번가', 'G마켓', '옥션', 'SSG', '무신사', '알리', '테무'], 의류·잡화: ['유니클로', '자라', '다이소', '올리브영', '백화점', '아울렛'], 전자·가전: ['하이마트', '전자랜드', '애플', '삼성전자'] },
  문화·여가: { 구독: ['넷플릭스', '유튜브', '티빙', '웨이브', '왓챠', '디즈니', '쿠팡플레이', '멜론', '지니', '스포티파이', '플로'], 영화·공연: ['CGV', '메가박스', '롯데시네마', '인터파크', '티켓'], 여행·숙박: ['호텔', '모텔', '야놀자', '여기어때', '에어비앤비', '항공', '대한항공', '아시아나'] },
  경조사·선물: { 경조사: ['축의', '부의', '조의'], 선물: ['선물', '카카오톡 선물', '꽃'] },
  금융: { 보험: ['보험', '생명', '화재', '손해'], 이자·수수료: ['이자', '수수료', '연체'], 저축·투자: ['적금', '예금', '증권'] },
  사업: { 광고비: ['광고', '애드', '메타', '구글애즈', '네이버광고'], 소모품: ['사무용품', '알파', '오피스'], 소프트웨어: ['ChatGPT', 'OpenAI', 'Claude', 'Anthropic', 'Gemini', 'Google', 'Adobe', '어도비', 'Microsoft', 'Notion', 'Canva'] },
};

export function categorize(merchant = '', memo = '') {
  const s = `${merchant} ${memo}`.toLowerCase();
  for (const [main, subs] of Object.entries(CATEGORIES))
    for (const [sub, words] of Object.entries(subs))
      if (words.some((w) => s.includes(w.toLowerCase()))) return { main, sub, auto: true };
  return { main: '기타', sub: '미분류', auto: false };
}

/** 이번 달 요약 */
export function monthSummary(txs, ym) {
  const inMonth = txs.filter((t) => t.date && monthKey(t.date) === ym);
  const spend = inMonth.filter((t) => (t.kind || 'out') === 'out');
  const income = inMonth.filter((t) => t.kind === 'in');
  const byCat = {};
  for (const t of spend) byCat[t.main || '기타'] = (byCat[t.main || '기타'] || 0) + Number(t.amount || 0);
  const total = spend.reduce((a, t) => a + Number(t.amount || 0), 0);
  const inc = income.reduce((a, t) => a + Number(t.amount || 0), 0);
  const biz = spend.filter((t) => t.business).reduce((a, t) => a + Number(t.amount || 0), 0);
  return { total, income: inc, net: inc - total, byCat, business: biz, count: spend.length };
}

/** 월말 예상 지출 = 지금까지 / 지난 날 × 그 달 날 수 */
export function forecastMonth(total, now = new Date()) {
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.round(total / Math.max(1, now.getDate()) * days);
}

/** 이상 지출: 평소(같은 대분류 중앙값)의 3배 넘음 · 10분 안 같은 곳 같은 금액 · 밤 1~5시 */
export function anomalies(txs) {
  const out = [];
  const by = {};
  for (const t of txs) if ((t.kind || 'out') === 'out') (by[t.main || '기타'] ||= []).push(Number(t.amount || 0));
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const sorted = [...txs].sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if ((t.kind || 'out') !== 'out') continue;
    const arr = by[t.main || '기타'];
    const md = median(arr);
    if (arr.length >= 4 && md > 0 && t.amount >= md * 3 && t.amount >= 50000) out.push({ tx: t, reason: `평소 ${t.main} 지출(${md.toLocaleString('ko-KR')}원)의 ${Math.round(t.amount / md)}배` });
    const p = sorted[i - 1];
    if (p && p.merchant && p.merchant === t.merchant && p.amount === t.amount && p.date === t.date && p.time && t.time) {
      const m = (x) => { const [h, mm] = x.split(':').map(Number); return h * 60 + mm; };
      if (Math.abs(m(t.time) - m(p.time)) <= 10) out.push({ tx: t, reason: '10분 안에 같은 곳·같은 금액 두 번 (중복 결제?)' });
    }
    if (t.time && t.time >= '01:00' && t.time < '05:00' && t.amount >= 30000) out.push({ tx: t, reason: '새벽 시간 결제' });
  }
  return out;
}

// ================================================================ 구독
export const CYCLE_MONTHS = { 매월: 1, '3개월': 3, '6개월': 6, 매년: 12 };

export function monthlyEquivalent(sub) {
  if (sub.cycle === '매주') return Math.round(Number(sub.amount || 0) * 52 / 12);
  return Math.round(Number(sub.amount || 0) / (CYCLE_MONTHS[sub.cycle] || 1));
}

/** 다음 결제일을 오늘 이후로 굴려 놓는다 */
export function rollBilling(sub, now = new Date()) {
  if (!sub.nextDate) return null;
  let d = sub.nextDate; const t = today(now); let g = 0;
  const day = parseYmd(sub.nextDate).getDate();
  while (d < t && g++ < 600) d = sub.cycle === '매주' ? addDays(d, 7) : addMonths(d, CYCLE_MONTHS[sub.cycle] || 1, day);
  return d;
}

export function subscriptionSummary(subs, now = new Date()) {
  const active = subs.filter((s) => s.status !== '해지');
  const monthly = active.reduce((a, s) => a + monthlyEquivalent(s), 0);
  const unused = active.filter((s) => s.lastUsed && diffDays(s.lastUsed, today(now)) > 30);
  const trials = active.filter((s) => s.trialEnd && diffDays(today(now), s.trialEnd) >= 0 && diffDays(today(now), s.trialEnd) <= 7);
  // 같은 종류 겹침 (예: OTT 3개)
  const byKind = {};
  for (const s of active) (byKind[s.kind || '기타'] ||= []).push(s);
  const overlaps = Object.entries(byKind).filter(([k, a]) => k !== '기타' && a.length >= 2).map(([k, a]) => ({ kind: k, items: a }));
  const savable = unused.reduce((a, s) => a + monthlyEquivalent(s), 0);
  return { count: active.length, monthly, yearly: monthly * 12, unused, trials, overlaps, savable };
}

/** 거래 내역에서 정기 결제 후보 찾기: 같은 가맹점·비슷한 금액(±10%)·25~35일 간격 2번 이상 */
export function detectSubscriptions(txs) {
  const by = {};
  for (const t of txs) if (t.merchant && (t.kind || 'out') === 'out') (by[t.merchant] ||= []).push(t);
  const out = [];
  for (const [m, a] of Object.entries(by)) {
    const s = a.filter((t) => t.date).sort((x, y) => x.date.localeCompare(y.date));
    let hits = 0;
    for (let i = 1; i < s.length; i++) {
      const gap = diffDays(s[i - 1].date, s[i].date);
      const close = Math.abs(s[i].amount - s[i - 1].amount) <= Math.max(1000, s[i - 1].amount * 0.1);
      if (gap >= 25 && gap <= 35 && close) hits++;
    }
    if (hits >= 1) out.push({ merchant: m, amount: s[s.length - 1].amount, last: s[s.length - 1].date, times: hits + 1 });
  }
  return out;
}

// ================================================================ 정기 관리 (집·차·건강)
/** 마지막 한 날 + 주기(일) -> 다음 할 날, 남은 날 */
export function nextDue(item, now = new Date()) {
  if (item.dueDate) return { date: item.dueDate, left: diffDays(today(now), item.dueDate) };
  if (!item.lastDone || !item.cycleDays) return { date: null, left: null };
  const d = addDays(item.lastDone, Number(item.cycleDays));
  return { date: d, left: diffDays(today(now), d) };
}

// ================================================================ 기념일
/** 해마다 돌아오는 날(생일 등)의 다음 날짜. 음력은 올해 양력 날짜를 사람이 넣는다. */
export function nextAnniversary(mmdd, now = new Date()) {
  if (!mmdd) return null;
  const s = mmdd.length === 10 ? mmdd.slice(5) : mmdd; // 'YYYY-MM-DD' 또는 'MM-DD'
  const [m, d] = s.split('-').map(Number);
  let y = now.getFullYear();
  let c = ymd(new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate())));
  if (c < today(now)) c = ymd(new Date(y + 1, m - 1, Math.min(d, new Date(y + 1, m, 0).getDate())));
  return c;
}

/** 연락 주기가 지난 사람 */
export function contactDue(person, now = new Date()) {
  if (!person.cycleDays || !person.lastContact) return null;
  const left = diffDays(today(now), addDays(person.lastContact, Number(person.cycleDays)));
  return left;
}

// ================================================================ 공부 계획 역산
/** 시험일까지 분량을 나눈다: 남은 날의 마지막 15%(최소 1일)는 복습 */
export function studyPlan(totalUnits, examDate, now = new Date(), unitName = '쪽') {
  const days = diffDays(today(now), examDate);
  if (days <= 0) return { days, perDay: totalUnits, review: 0, text: '오늘이 시험일이거나 지났습니다' };
  const review = Math.max(1, Math.round(days * 0.15));
  const study = Math.max(1, days - review);
  const perDay = Math.ceil(totalUnits / study);
  return { days, perDay, review, text: `하루 ${perDay}${unitName}씩 ${study}일, 마지막 ${review}일은 복습` };
}

// ================================================================ 루틴 연속 기록
export function streak(logDates, now = new Date()) {
  const set = new Set(logDates);
  let n = 0, d = today(now);
  if (!set.has(d)) d = addDays(d, -1); // 오늘 아직 안 했어도 어제까지 이어졌으면 인정
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
