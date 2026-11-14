// 한글 문장 분석기 — AI 없이도(인터넷 없이도) 돈다.
// 문자·메일·카톡 글을 붙여 넣으면 날짜·시각·금액·장소·택배·카드 승인을 뽑고,
// 「무슨 일인지」를 가려 「할 만한 일」 후보를 만든다.
// 결과는 언제나 「후보」다. 실제 저장은 사용자가 승인 센터에서 고른다.

import { ymd, addDays, parseYmd, lastDayOfMonth, addMinutes, pad } from './dates.js';

const WD = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

// ---------------------------------------------------------------- 금액
/** '35,000원' '3만5천원' '12만원' '1억 2천만원' -> 숫자 (없으면 null) */
export function parseMoney(s) {
  if (!s) return null;
  const t = s.replace(/\s+/g, '');
  const m = t.match(/^([\d,]+(?:\.\d+)?)?(억)?([\d,]+)?(천)?(만)?([\d,]+)?(천)?([\d,]+)?원?$/);
  // 숫자만 있는 경우
  if (/^[\d,]+원?$/.test(t)) return Number(t.replace(/[,원]/g, ''));
  if (!m) return null;
  let total = 0, rest = t.replace(/원$/, '');
  const unit = (re, mul) => {
    const r = rest.match(re);
    if (r) { total += Number((r[1] || '1').replace(/,/g, '')) * mul; rest = rest.replace(re, ''); }
  };
  unit(/^([\d,.]*)억/, 1e8);
  // '2천만' 처럼 천+만
  const cm = rest.match(/^([\d,]*)천만/);
  if (cm) { total += Number((cm[1] || '1').replace(/,/g, '')) * 1e7; rest = rest.replace(/^([\d,]*)천만/, ''); }
  unit(/^([\d,.]*)만/, 1e4);
  unit(/^([\d,]*)천/, 1e3);
  unit(/^([\d,]*)백/, 1e2);
  if (rest && /^[\d,]+$/.test(rest)) { total += Number(rest.replace(/,/g, '')); rest = ''; }
  return rest === '' && total > 0 ? Math.round(total) : null;
}

const MONEY_RE = /((?:\d[\d,]*(?:\.\d+)?\s*억\s*)?(?:\d[\d,]*\s*천\s*)?(?:\d[\d,]*\s*만\s*)?(?:\d[\d,]*\s*천\s*)?(?:\d[\d,]*)?\s*원)/g;

export function findAmounts(text) {
  const out = [];
  for (const m of text.matchAll(MONEY_RE)) {
    const raw = m[1].trim();
    if (!/\d/.test(raw)) continue;
    const v = parseMoney(raw);
    if (v) out.push({ value: v, raw, index: m.index });
  }
  return out;
}

// ---------------------------------------------------------------- 날짜
function nextWeekday(base, wd, weeksAhead) {
  // weeksAhead: null=다가오는 그 요일(오늘 포함), 0=이번 주, 1=다음 주, 2=다다음 주
  const d = parseYmd(base);
  if (weeksAhead === null) {
    const diff = (wd - d.getDay() + 7) % 7;
    return addDays(base, diff);
  }
  const monOffset = (d.getDay() + 6) % 7; // 이번 주 월요일까지
  const monday = addDays(base, -monOffset);
  const idx = (wd + 6) % 7; // 월=0 ... 일=6
  return addDays(monday, idx + 7 * weeksAhead);
}

/** 글에서 날짜를 찾는다 -> {date, raw, guessedYear} */
export function findDate(text, now = new Date()) {
  const base = ymd(now);
  let m;
  if ((m = text.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/))) {
    const d = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if (parseYmd(d)) return { date: d, raw: m[0] };
  }
  if ((m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) return withYear(+m[1], +m[2], m[0], now);
  // 11/18 , 11.18 (시각 12:30, 금액 1,000 과 헷갈리지 않게)
  if ((m = text.match(/(?<![\d:.,/])(\d{1,2})[/.](\d{1,2})(?![\d:.,/]|\s*%)/))) {
    const mo = +m[1], da = +m[2];
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return withYear(mo, da, m[0], now);
  }
  const rel = [['오늘', 0], ['금일', 0], ['내일', 1], ['명일', 1], ['모레', 2], ['내일모레', 2], ['글피', 3], ['어제', -1]];
  for (const [w, n] of rel.sort((a, b) => b[0].length - a[0].length)) {
    if (text.includes(w)) return { date: addDays(base, n), raw: w };
  }
  if ((m = text.match(/(이번|금|다음|담|다다음)\s*주\s*([월화수목금토일])\s*요일?/))) {
    const ahead = { 이번: 0, 금: 0, 다음: 1, 담: 1, 다다음: 2 }[m[1]];
    let d = nextWeekday(base, WD[m[2]], ahead);
    // 일요일에 「이번주 금요일」 = 이미 지난 금요일이 아니라 다가오는 금요일로 본다
    if (d < base) return { date: addDays(d, 7), raw: m[0], guessedWeek: true };
    return { date: d, raw: m[0] };
  }
  if ((m = text.match(/(?<![가-힣])([월화수목금토일])요일/))) return { date: nextWeekday(base, WD[m[1]], null), raw: m[0] };
  if ((m = text.match(/(\d{1,3})\s*일\s*(후|뒤)/))) return { date: addDays(base, +m[1]), raw: m[0] };
  if ((m = text.match(/(\d{1,2})\s*주\s*(후|뒤)/))) return { date: addDays(base, 7 * +m[1]), raw: m[0] };
  if (/(이번\s*달|이달)\s*(말|안)|월말/.test(text)) {
    const d = new Date(now.getFullYear(), now.getMonth(), lastDayOfMonth(now.getFullYear(), now.getMonth() + 1));
    return { date: ymd(d), raw: '월말' };
  }
  if ((m = text.match(/(?<![\d월])(\d{1,2})\s*일(?!\s*[후뒤간])(?=\s*(까지|에|오전|오후|\d|\s|$))/))) {
    // '25일까지' -> 이번 달 25일 (지났으면 다음 달)
    const da = +m[1];
    if (da >= 1 && da <= 31) {
      let y = now.getFullYear(), mo = now.getMonth() + 1;
      if (da < now.getDate()) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
      const d = `${y}-${pad(mo)}-${pad(Math.min(da, lastDayOfMonth(y, mo)))}`;
      return { date: d, raw: m[0], guessedMonth: true };
    }
  }
  return null;
}

function withYear(mo, da, raw, now) {
  let y = now.getFullYear();
  let d = `${y}-${pad(mo)}-${pad(da)}`;
  if (!parseYmd(d)) return null;
  // 한 달 넘게 지난 날짜라면 내년 일정으로 본다
  const back = (now - parseYmd(d)) / 86400000;
  if (back > 31) { y += 1; d = `${y}-${pad(mo)}-${pad(da)}`; }
  return { date: d, raw, guessedYear: true };
}

// ---------------------------------------------------------------- 시각
/** -> {time:'HH:MM', raw, guessedPm} */
export function findTime(text) {
  let m;
  if (/정오/.test(text)) return { time: '12:00', raw: '정오' };
  if (/자정/.test(text)) return { time: '00:00', raw: '자정' };
  const re = /(오전|오후|아침|낮|저녁|밤|새벽|AM|PM|am|pm)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/;
  if ((m = text.match(re))) {
    let h = +m[2]; const mi = m[4] ? 30 : +(m[3] || 0);
    if (h > 24 || mi > 59) return null;
    const ap = m[1] || '';
    let guessedPm = false;
    if (/오후|저녁|밤|PM|pm/.test(ap) && h < 12) h += 12;
    else if (/낮/.test(ap) && h < 6) h += 12;
    else if (/오전|아침|새벽|AM|am/.test(ap) && h === 12) h = 0;
    else if (!ap && h >= 1 && h <= 7) { h += 12; guessedPm = true; }
    if (h === 24) h = 0;
    return { time: `${pad(h)}:${pad(mi)}`, raw: m[0].trim(), guessedPm };
  }
  if ((m = text.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/))) {
    return { time: `${pad(m[1])}:${m[2]}`, raw: m[0] };
  }
  return null;
}

// ---------------------------------------------------------------- 카드·택배·장소
const CARD_RE = /(신한|국민|KB|삼성|현대|롯데|하나|우리|BC|비씨|NH|농협|씨티|IBK|기업|카카오뱅크|카카오페이|토스|케이뱅크|수협|광주|전북|제주)\s*(?:체크)?\s*(?:카드)?\s*(?:\(?\s*\d{3,4}\s*\)?)?\s*[^\n]{0,12}?(승인|결제|사용|취소)/;

export function findCard(text) {
  const m = text.match(CARD_RE);
  if (!m) return null;
  const last4 = (text.match(/\((\d{4})\)/) || text.match(/\*{2,}(\d{4})/) || [])[1] || null;
  const installment = (text.match(/(일시불|\d{1,2}\s*개월)/) || [])[1] || null;
  return { issuer: m[1].replace('비씨', 'BC'), last4, canceled: m[2] === '취소' || /승인\s*취소|취소\s*승인/.test(text), installment };
}

const CARRIERS = ['CJ대한통운', '대한통운', '한진택배', '한진', '롯데택배', '롯데글로벌', '우체국', '로젠', '경동', '대신택배', '일양', '합동', '쿠팡', 'GS25', 'CU편의점', '편의점택배'];

export function findTracking(text) {
  if (!/(택배|배송|송장|운송장|출고|배달|도착)/.test(text)) return null;
  const num = (text.match(/(?<!\d)(\d{4}[-\s]?\d{4}[-\s]?\d{2,6}|\d{10,14})(?!\d)/) || [])[1];
  const carrier = CARRIERS.find((c) => text.includes(c)) || null;
  let status = null;
  if (/배송\s*완료|배달\s*완료|도착\s*완료|문앞|수령/.test(text)) status = '배송완료';
  else if (/배송\s*출발|배달\s*출발|오늘\s*도착/.test(text)) status = '배송중';
  else if (/출고|발송|집화|접수/.test(text)) status = '출고';
  if (!num && !carrier) return null;
  return { carrier: carrier === '대한통운' ? 'CJ대한통운' : carrier, number: num ? num.replace(/[-\s]/g, '') : null, status };
}

const PLACE_WORDS = '병원|의원|치과|한의원|약국|센터|보건소|구청|시청|주민센터|행정복지센터|역|터미널|공항|학교|대학교|학원|도서관|카페|식당|호텔|빌딩|타워|회관|교회|성당|은행|우체국|마트|백화점|점';
export function findPlace(text) {
  const named = text.match(new RegExp(`([가-힣A-Za-z0-9]{1,20}(?:${PLACE_WORDS}))(?![가-힣])`));
  const region = text.match(/((?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)(?:특별시|광역시|특별자치시|특별자치도|도|시)?\s*)?([가-힣]{1,6}(?:구|군))(?:\s*([가-힣0-9]{1,8}(?:동|읍|면|로|길)))?/);
  const parts = [];
  if (region) parts.push(region[0].trim());
  if (named && !(region && region[0].includes(named[1]))) parts.push(named[1]);
  return parts.length ? parts.join(' ') : null;
}

// ---------------------------------------------------------------- 분류
export const KINDS = {
  hospital: { label: '병원·진료', icon: '🏥' },
  meeting: { label: '회의·상담', icon: '💼' },
  appointment: { label: '약속·예약', icon: '📅' },
  class: { label: '수업·시험', icon: '🎓' },
  deadline: { label: '마감·제출', icon: '⏰' },
  bill: { label: '납부·청구', icon: '🧾' },
  card: { label: '카드 결제', icon: '💳' },
  delivery: { label: '택배·배송', icon: '📦' },
  family: { label: '경조사·기념일', icon: '🎉' },
  travel: { label: '여행·이동', icon: '✈️' },
  scam: { label: '사기 의심', icon: '🚨' },
  spend: { label: '지출 메모', icon: '💸' },
  note: { label: '메모', icon: '📝' },
};

const KIND_RULES = [
  ['scam', /(검찰|금감원|수사관).{0,20}(계좌|송금|이체)|안전\s*계좌|(대출|환급).{0,15}(링크|클릭|앱\s*설치)|엄마.{0,10}(폰|휴대폰).{0,10}(고장|액정)|문화상품권.{0,10}(구매|보내)|택배.{0,15}(주소\s*불일치|주소지\s*확인).{0,20}(http|www|\.ly|클릭)/],
  ['card', null], // 카드 문장은 따로 판별
  ['delivery', /(택배|배송|송장|운송장|출고|배달\s*예정)/],
  ['hospital', /(병원|의원|치과|한의원|진료|검진|내원|접수\s*번호|처방|예방\s*접종)/],
  ['bill', /(납부|청구|고지|자동\s*이체|출금\s*예정|납기|요금|관리비|공과금|카드\s*대금|결제\s*예정)/],
  ['class', /(시험|수업|강의|과제|레포트|리포트|수강|중간고사|기말고사|휴강|보강)/],
  ['deadline', /(마감|제출|기한|접수\s*기간|신청\s*기간|까지\s*(보내|제출|회신|입금))/],
  ['family', /(생일|돌잔치|결혼식|청첩|부고|장례|발인|조문|기념일|환갑|칠순|팔순|제사|명절|설날|추석)/],
  ['meeting', /(회의|미팅|면접|상담|세미나|워크숍|컨퍼런스|줌|zoom|ZOOM|화상)/],
  ['travel', /(항공|비행기|탑승|출국|입국|KTX|SRT|기차|고속버스|체크인|숙소|호텔\s*예약)/],
  ['appointment', /(예약|약속|만나|방문|모임|저녁\s*식사|점심)/],
];

export function classify(text, card) {
  if (card) return 'card';
  for (const [k, re] of KIND_RULES) if (re && re.test(text)) return k;
  return 'note';
}

// 일정 종류별 준비물 (AI 없이도 「미리 준비」)
export const PREP = {
  hospital: ['신분증', '건강보험증(또는 모바일 건강보험증)', '복용 중인 약 목록', '진료의뢰서·이전 검사 결과', '공복 필요 여부 확인'],
  meeting: ['회의 자료', '안건 정리', '노트북·충전기', '참석자 명단 확인'],
  class: ['수험표·학생증', '신분증', '필기구', '교재·노트', '시험 범위 복습'],
  travel: ['신분증·여권', '탑승권·예매 내역', '충전기', '상비약', '숙소 주소'],
  family: ['축의금·조의금 봉투', '복장 확인', '선물', '이동 경로 확인'],
  appointment: ['장소 확인', '연락처 확인', '출발 시간 확인'],
  deadline: ['제출 서류 목록 확인', '제출 방법(온라인·방문) 확인', '사본 보관'],
  bill: ['납부 계좌·잔액 확인', '납부 방법 확인', '영수증 보관'],
};

function titleFor(kind, text, place) {
  const first = text.split(/\n/).map((s) => s.replace(/\[[^\]]*\]/g, '').trim()).find((s) => s.length > 1) || '';
  const short = first.length > 28 ? first.slice(0, 28) + '…' : first;
  const where = (place || '').split(' ').pop();
  switch (kind) {
    case 'hospital': {
      if (where && /(병원|의원|치과|한의원|센터)$/.test(where)) return `${where} 방문`;
      const w = (text.match(/([가-힣]{0,8}(?:병원|의원|치과|한의원|검진|접종))/) || [])[1];
      return w ? `${w} ${/검진|접종/.test(w) ? '' : '방문'}`.trim() : '병원 방문';
    }
    case 'meeting': return (text.match(/[가-힣A-Za-z0-9 ]{0,12}(회의|미팅|면접|상담|세미나)/) || [short])[0].trim();
    case 'class': return (text.match(/[가-힣A-Za-z0-9]{0,12}\s?(중간고사|기말고사|시험|과제|레포트|리포트|수업|강의)/) || [short])[0].trim();
    case 'family': return (text.match(/[가-힣]{0,8}\s?(생일|결혼식|돌잔치|부고|장례|기념일|환갑|칠순|팔순|제사)/) || [short])[0].trim();
    default: return short || KINDS[kind].label;
  }
}

/**
 * 한 덩어리 글을 분석한다.
 * @returns {{kind, title, date, time, endTime, arriveBy, amount, place, card, tracking, merchant, confidence, hints:string[], proposals:object[]}}
 */
export function analyze(text, now = new Date()) {
  const src = String(text || '').trim();
  const hints = [];
  const card = findCard(src);
  const kind = classify(src, card);
  const dt = findDate(src, now);
  const tm = findTime(src.replace(/\d{1,2}\/\d{1,2}\s+/, (s) => s)); // 그대로
  const amounts = findAmounts(src);
  const place = kind === 'card' ? null : findPlace(src);
  const tracking = findTracking(src);
  const r = { kind, title: titleFor(kind, src, place), date: dt?.date || null, time: tm?.time || null,
    amount: null, place, card, tracking, merchant: null, arriveBy: null, confidence: 0, hints, proposals: [] };

  if (dt?.guessedYear) hints.push('연도가 없어 가장 가까운 날짜로 잡았습니다');
  if (dt?.guessedMonth) hints.push('달이 없어 이번 달(지났으면 다음 달)로 잡았습니다');
  if (dt?.guessedWeek) hints.push('「이번 주」 요일이 이미 지나 다가오는 요일로 잡았습니다');
  if (tm?.guessedPm) hints.push(`「${tm.raw}」를 오후로 보았습니다`);

  // 금액: 카드 문장이면 「누적·잔액」 줄은 뺀다
  const usable = amounts.filter((a) => !/(누적|잔액|한도|포인트)\s*$/.test(src.slice(Math.max(0, a.index - 6), a.index)));
  if (usable.length) r.amount = usable[0].value;

  // 도착 권장
  const early = src.match(/(\d{1,3})\s*분\s*(전|일찍)/);
  if (early && r.time) { r.arriveBy = addMinutes(r.time, -Number(early[1])); }

  if (kind === 'card') {
    r.merchant = findMerchant(src);
    r.title = `${r.merchant || '카드 결제'} ${r.amount ? r.amount.toLocaleString('ko-KR') + '원' : ''}`.trim();
  }
  if (kind === 'scam') hints.push('⚠️ 사기 문자에서 자주 보이는 표현이 있습니다. 링크를 누르거나 돈을 보내지 마세요. 의심되면 112 또는 금융감독원 1332');

  // 신뢰도: 맞춘 칸 수로 어림 (AI 가 아니라 규칙이라 점수를 낮게 둔다)
  let c = 0.35;
  if (r.date) c += 0.2; if (r.time) c += 0.15; if (r.amount) c += 0.1; if (r.place) c += 0.05;
  if (kind !== 'note') c += 0.1; if (hints.length) c -= 0.05 * hints.length;
  r.confidence = Math.max(0.1, Math.min(0.95, Math.round(c * 100) / 100));

  r.proposals = propose(r, src);
  if (r.kind !== 'card' && r.proposals[0]?.action === 'transaction.create') { r.kind = 'spend'; r.title = r.proposals[0].title.replace('지출 기록: ', ''); }
  if (r.kind === 'delivery') r.title = `${deliveryItem(src)}${r.tracking?.carrier ? ' · ' + r.tracking.carrier : ''}${r.tracking?.status ? ' · ' + r.tracking.status : ''}`;
  return r;
}

export function deliveryItem(src) {
  const m = src.match(/상품\s*\(([^)]{1,30})\)/) || src.match(/상품명?\s*[:：]\s*([^\n,]{1,30})/) || src.match(/주문하신\s*([^\n]{1,20}?)\s*(이|가|을|를)\s/);
  return m ? m[1].trim() : '택배';
}

export function findMerchant(src) {
  const lines = src.split(/\n/).map((s) => s.trim()).filter(Boolean);
  // 날짜·시각 줄 다음 줄이 보통 가맹점
  for (let i = 0; i < lines.length; i++) {
    if (/\d{1,2}[/.]\d{1,2}\s+\d{1,2}:\d{2}/.test(lines[i])) {
      const rest = lines[i].replace(/.*\d{1,2}[/.]\d{1,2}\s+\d{1,2}:\d{2}\s*/, '').trim();
      if (rest && !/(누적|잔액|원$)/.test(rest)) return rest;
      const nx = lines[i + 1];
      if (nx && !/(누적|잔액|한도)/.test(nx) && !/^[\d,]+원/.test(nx)) return nx;
    }
  }
  const one = src.replace(/\[[^\]]*\]/g, ' ').match(/\d{1,2}:\d{2}\s+([가-힣A-Za-z0-9&()\- ]{2,30}?)(?:\s+누적|\s+잔액|$)/);
  return one ? one[1].trim() : null;
}

/** 분석 결과 -> 앱이 할 수 있는 일 후보 (승인 센터로 간다) */
export function propose(r, src) {
  const P = [];
  const note = src.length > 400 ? src.slice(0, 400) + '…' : src;
  if (r.kind === 'scam') {
    P.push({ action: 'task.create', title: '사기 의심 문자 — 링크 누르지 말고 삭제·신고', data: { title: '사기 의심 문자 확인·신고(118, 1332)', importance: 5, category: '안전', note } });
    return P;
  }
  if (r.kind === 'card' && r.amount) {
    P.push({ action: 'transaction.create', title: `지출 기록: ${r.title}`, data: {
      date: r.date || null, time: r.time, amount: r.card?.canceled ? -r.amount : r.amount, merchant: r.merchant || '', method: `${r.card?.issuer || ''}카드${r.card?.last4 ? '(' + r.card.last4 + ')' : ''}`,
      installment: r.card?.installment || '', memo: r.card?.canceled ? '승인 취소' : '', source: 'inbox' } });
    return P;
  }
  if (r.kind === 'delivery') {
    P.push({ action: 'order.create', title: `택배 추적 등록${r.tracking?.carrier ? ' · ' + r.tracking.carrier : ''}`, data: {
      item: deliveryItem(src), carrier: r.tracking?.carrier || '', tracking: r.tracking?.number || '',
      status: r.tracking?.status || '출고', orderDate: null, receivedDate: r.tracking?.status === '배송완료' ? null : null, note } });
    return P;
  }
  if (r.kind === 'bill') {
    P.push({ action: 'task.create', title: `납부하기${r.amount ? ' ' + r.amount.toLocaleString('ko-KR') + '원' : ''}${r.date ? ' (' + r.date + '까지)' : ''}`,
      data: { title: `${r.title.replace(/…$/, '')} 납부`, due: r.date, amount: r.amount, importance: 4, category: '돈', note } });
    return P;
  }
  // 「점심 김밥 6천원」 처럼 시각 없이 금액만 있는 짧은 글 = 지출 메모
  if (r.amount && !r.time && ['note', 'appointment'].includes(r.kind) && src.length <= 60) {
    const merchant = src.replace(MONEY_RE, ' ').replace(/(오늘|어제|그저께|아침|점심|저녁|에서|으로|썼|씀|결제|샀|구매|원)/g, ' ').replace(/\s+/g, ' ').trim();
    P.push({ action: 'transaction.create', title: `지출 기록: ${merchant || '지출'} ${r.amount.toLocaleString('ko-KR')}원`, data: { date: r.date, amount: r.amount, merchant, memo: src, source: 'inbox' } });
    return P;
  }
  if (r.kind === 'deadline' && !r.time) {
    P.push({ action: 'task.create', title: `할 일: ${r.title}${r.date ? ' (' + r.date + '까지)' : ''}`, data: { title: r.title, due: r.date, importance: 4, category: '업무', note } });
    return P;
  }
  if (r.date) {
    const kindToType = { hospital: '병원', meeting: '회의', class: '수업·시험', family: '경조사', travel: '여행', appointment: '약속', deadline: '마감' };
    P.push({ action: 'event.create', title: `일정 등록: ${r.title}`, data: {
      title: r.title, date: r.date, time: r.time, place: r.place || '', type: kindToType[r.kind] || '기타', arriveBy: r.arriveBy,
      remind: [1440, 60], checklist: (PREP[r.kind] || []).map((t) => ({ t, done: false })), note } });
    if (PREP[r.kind]) P.push({ action: 'task.create', title: `준비: ${r.title} 준비물 챙기기`, data: { title: `${r.title} 준비`, due: addDays(r.date, -1), importance: 3, category: '준비', note: PREP[r.kind].join(', ') } });
    return P;
  }
  P.push({ action: 'memo.create', title: '메모로 보관', data: { text: note } });
  return P;
}
