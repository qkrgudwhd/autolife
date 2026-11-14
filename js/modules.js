// 생활 모듈 정의 — 「칸(field) + 미리 만든 보기(preset) + 목록 한 줄 모양」만 적으면 화면이 생긴다.
// 새 메뉴를 더하고 싶으면 여기에 한 덩어리를 더하면 된다 (수강생 실습용).
import { nextDue, nextAnniversary, contactDue } from './core/logic.js';
import { diffDays, today, addDays, prettyDate } from './core/dates.js';
import { esc, won, ddayBadge } from './ui.js';

const RELS = ['가족', '친척', '친구', '연인·배우자', '동료', '상사', '거래처', '고객', '스승·선배', '이웃', '기타'];

export const MODULES = {
  people: {
    store: 'people', icon: '👨‍👩‍👧', title: '사람·기념일', group: '관계',
    desc: '생일·기념일·연락 주기를 챙기고 안부 글 초안을 만들어 드려요',
    fields: [
      { k: 'name', label: '이름(부르는 이름)', required: true, half: true },
      { k: 'relation', label: '관계', type: 'select', options: RELS, half: true },
      { k: 'phone', label: '연락처', type: 'tel', half: true },
      { k: 'group', label: '모임·소속', half: true, placeholder: '예: 고등학교 동창' },
      { k: 'birthday', label: '생일', type: 'date', half: true },
      { k: 'lunar', label: '음력 생일 (해마다 양력 날짜를 고쳐 주세요)', type: 'checkbox', half: true },
      { k: 'anniversaryName', label: '다른 기념일 이름', half: true, placeholder: '예: 결혼기념일' },
      { k: 'anniversary', label: '기념일 날짜', type: 'date', half: true },
      { k: 'cycleDays', label: '연락 주기', type: 'select', options: [['', '정하지 않음'], ['7', '1주'], ['14', '2주'], ['30', '1달'], ['90', '3달'], ['180', '6달'], ['365', '1년']], half: true },
      { k: 'lastContact', label: '마지막 연락한 날', type: 'date', half: true },
      { k: 'likes', label: '좋아하는 것·선물 아이디어', type: 'textarea', rows: 2 },
      { k: 'note', label: '기억할 것 (건강·가족·지난 대화)', type: 'textarea', rows: 2 },
    ],
    sort: (a, b) => (soon(a) ?? 999) - (soon(b) ?? 999),
    line(p) {
      const s = soon(p); const c = contactDue(p);
      return { title: `${p.name} <small>${esc(p.relation || '')}</small>`, sub: [p.birthday ? `🎂 ${prettyDate(nextAnniversary(p.birthday))}` : '', p.anniversary ? `💍 ${esc(p.anniversaryName || '기념일')} ${prettyDate(nextAnniversary(p.anniversary))}` : '', c != null ? (c <= 0 ? '📞 연락할 때' : `📞 ${c}일 뒤 연락`) : ''].filter(Boolean).join(' · '), badge: s != null && s <= 30 ? ddayBadge(s) : '' };
    },
    quick: [
      { label: '📞 오늘 연락함', run: (p) => ({ ...p, lastContact: today() }) },
    ],
    draft: true,
  },
  assets: {
    store: 'assets', icon: '🛠️', title: '집·차·정기 관리', group: '생활',
    desc: '필터 교체, 엔진오일, 보험 갱신처럼 「때가 되면 해야 할 일」을 잊지 않게',
    presets: [
      ['정수기 필터 교체', '집', 180], ['에어컨 필터 청소', '집', 30], ['공기청정기 필터', '집', 180], ['보일러 점검', '집', 365], ['화재경보기 건전지', '집', 365],
      ['세탁조 청소', '집', 60], ['냉장고 정리', '집', 30], ['욕실 실리콘 점검', '집', 365], ['가스 안전 점검', '집', 365],
      ['엔진오일 교체', '차', 180], ['타이어 공기압 점검', '차', 30], ['와이퍼 교체', '차', 365], ['자동차 보험 갱신', '차', 365], ['자동차 정기검사', '차', 730], ['자동차세 연납', '차', 365],
      ['건강검진', '건강', 730], ['치과 스케일링', '건강', 365], ['독감 예방접종', '건강', 365], ['안경·렌즈 점검', '건강', 365],
      ['여권 만료 확인', '서류', 3650], ['운전면허 적성검사', '서류', 3650], ['반려동물 예방접종', '반려동물', 365], ['반려동물 심장사상충약', '반려동물', 30],
    ],
    fields: [
      { k: 'name', label: '무엇을', required: true, list: null },
      { k: 'target', label: '분류', type: 'select', options: ['집', '차', '건강', '서류', '반려동물', '기타'], half: true },
      { k: 'cycleDays', label: '주기(일)', type: 'number', min: 1, half: true, help: '예: 6달 = 180' },
      { k: 'lastDone', label: '마지막으로 한 날', type: 'date', half: true },
      { k: 'dueDate', label: '또는 정해진 날짜', type: 'date', half: true, help: '보험 만기처럼 날짜가 정해져 있으면' },
      { k: 'cost', label: '보통 드는 돈', type: 'money', half: true },
      { k: 'vendor', label: '업체·연락처', half: true },
      { k: 'note', label: '메모 (부품 번호·규격 등)', type: 'textarea', rows: 2 },
    ],
    sort: (a, b) => (nextDue(a).left ?? 9999) - (nextDue(b).left ?? 9999),
    line(a) { const n = nextDue(a); return { title: esc(a.name), sub: `${esc(a.target || '')}${a.cycleDays ? ` · ${a.cycleDays}일마다` : ''}${n.date ? ` · 다음 ${prettyDate(n.date)}` : ' · 마지막 한 날을 넣어 주세요'}`, badge: ddayBadge(n.left) }; },
    quick: [{ label: '✅ 오늘 했음', run: (a) => ({ ...a, lastDone: today(), dueDate: a.dueDate && a.cycleDays ? addDays(today(), Number(a.cycleDays)) : a.dueDate }) }],
  },
  orders: {
    store: 'orders', icon: '📦', title: '쇼핑·택배·반품', group: '쇼핑',
    desc: '주문·송장·반품 기한을 한곳에. 반품 기한은 받은 날 + 7일로 자동 계산 (전자상거래법 청약철회 기본 기간)',
    fields: [
      { k: 'item', label: '상품', required: true },
      { k: 'shop', label: '쇼핑몰', half: true, list: ['쿠팡', '네이버쇼핑', '11번가', 'G마켓', '옥션', 'SSG', '컬리', '무신사', '올리브영', '알리익스프레스', '테무', '당근'] },
      { k: 'amount', label: '금액', type: 'money', half: true },
      { k: 'carrier', label: '택배사', half: true, list: ['CJ대한통운', '한진택배', '롯데택배', '우체국', '로젠', '경동', '쿠팡'] },
      { k: 'tracking', label: '송장번호', half: true, type: 'text' },
      { k: 'status', label: '상태', type: 'select', options: ['주문', '출고', '배송중', '배송완료', '교환중', '반품신청', '반품완료', '환불완료'], half: true },
      { k: 'orderDate', label: '주문한 날', type: 'date', half: true },
      { k: 'receivedDate', label: '받은 날', type: 'date', half: true },
      { k: 'returnBy', label: '반품 기한', type: 'date', half: true, help: '비워 두면 받은 날 + 7일' },
      { k: 'keep', label: '반품 안 함(알림 끄기)', type: 'checkbox', half: true },
      { k: 'rebuyDays', label: '다시 살 주기(일)', type: 'number', half: true, help: '휴지·세제처럼 떨어지는 물건' },
      { k: 'note', label: '메모', type: 'textarea', rows: 2 },
    ],
    beforeSave: (o) => ({ ...o, returnBy: o.returnBy || (o.receivedDate ? addDays(o.receivedDate, 7) : null) }),
    sort: (a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''),
    line(o) { const left = o.returnBy && !o.keep && !/반품|환불/.test(o.status) ? diffDays(today(), o.returnBy) : null; return { title: esc(o.item), sub: [o.shop, o.status, o.carrier && `${o.carrier} ${o.tracking || ''}`, o.amount && won(o.amount)].filter(Boolean).map(esc).join(' · '), badge: left != null && left >= -1 && left <= 7 ? `<span class="badge warn">반품 ${left >= 0 ? 'D-' + left : '지남'}</span>` : '', link: trackUrl(o) }; },
    quick: [{ label: '📬 받았음', run: (o) => ({ ...o, status: '배송완료', receivedDate: today(), returnBy: o.returnBy || addDays(today(), 7) }) }],
  },
  study: {
    store: 'study', icon: '🎓', title: '공부·시험·과제', group: '학습',
    desc: '시험 D-day, 과제 마감, 자격증 일정. 남은 날로 하루 공부량을 나눠 드려요',
    fields: [
      { k: 'title', label: '이름', required: true, placeholder: '예: 사회복지사 2급 기말고사' },
      { k: 'kind', label: '종류', type: 'select', options: ['시험', '과제', '발표', '자격증 시험', '수업', '강의 수강', '독서', '기타'], half: true },
      { k: 'subject', label: '과목·분야', half: true },
      { k: 'date', label: '날짜(시험일·마감일)', type: 'date', half: true, required: true },
      { k: 'time', label: '시각', type: 'time', half: true },
      { k: 'units', label: '공부할 분량', type: 'number', half: true, help: '쪽·강·문제 수' },
      { k: 'unitName', label: '분량 단위', type: 'select', options: ['쪽', '강', '문제', '장', '단원'], half: true },
      { k: 'done', label: '끝남', type: 'checkbox', half: true },
      { k: 'checklist', label: '준비할 것', type: 'list', default: [{ t: '시험 범위 확인', done: false }, { t: '수험표·신분증', done: false }] },
      { k: 'note', label: '메모', type: 'textarea', rows: 2 },
    ],
    sort: (a, b) => (a.done - b.done) || (a.date || '').localeCompare(b.date || ''),
    line(s) { const left = s.date ? diffDays(today(), s.date) : null; return { title: esc(s.title), sub: `${esc(s.kind || '')} ${esc(s.subject || '')} · ${prettyDate(s.date)}`, badge: s.done ? '<span class="badge ok">끝</span>' : ddayBadge(left), plan: true }; },
  },
  clients: {
    store: 'clients', icon: '🤝', title: '거래처·고객', group: '사업',
    desc: '1인 사업자·프리랜서를 위한 작은 고객 장부',
    fields: [
      { k: 'name', label: '상호·이름', required: true, half: true },
      { k: 'contact', label: '담당자', half: true },
      { k: 'phone', label: '전화', type: 'tel', half: true },
      { k: 'email', label: '메일', type: 'email', half: true },
      { k: 'bizNo', label: '사업자번호', half: true },
      { k: 'stage', label: '단계', type: 'select', options: ['문의', '견적', '계약', '진행중', '완료', '재구매', '보류'], half: true },
      { k: 'nextAction', label: '다음 할 일', half: true },
      { k: 'nextDate', label: '다음 연락일', type: 'date', half: true },
      { k: 'history', label: '상담·거래 기록', type: 'textarea', rows: 4, placeholder: '날짜 — 내용 순서로 적어 두면 찾기 쉬워요' },
    ],
    sort: (a, b) => (a.nextDate || '9').localeCompare(b.nextDate || '9'),
    line(c) { return { title: esc(c.name), sub: [c.stage, c.nextAction, c.nextDate && prettyDate(c.nextDate)].filter(Boolean).map(esc).join(' · '), badge: c.nextDate ? ddayBadge(diffDays(today(), c.nextDate)) : '' }; },
  },
  invoices: {
    store: 'invoices', icon: '💰', title: '받을 돈·견적', group: '사업',
    desc: '견적·청구·입금 예정을 적어 두면 입금일이 지날 때 알려 드려요',
    fields: [
      { k: 'client', label: '거래처', required: true, half: true },
      { k: 'title', label: '내용', half: true, placeholder: '예: 11월 영상 편집' },
      { k: 'amount', label: '금액(부가세 포함)', type: 'money', half: true, required: true },
      { k: 'status', label: '상태', type: 'select', options: ['견적', '청구', '일부입금', '입금완료', '취소'], half: true },
      { k: 'issueDate', label: '청구한 날', type: 'date', half: true },
      { k: 'dueDate', label: '입금 예정일', type: 'date', half: true },
      { k: 'taxInvoice', label: '세금계산서 발행', type: 'checkbox', half: true },
      { k: 'note', label: '메모', type: 'textarea', rows: 2 },
    ],
    sort: (a, b) => (a.status === '입금완료') - (b.status === '입금완료') || (a.dueDate || '9').localeCompare(b.dueDate || '9'),
    line(v) { const left = v.dueDate && v.status !== '입금완료' ? diffDays(today(), v.dueDate) : null; return { title: `${esc(v.client)} <small>${won(v.amount)}</small>`, sub: [v.title, v.status, v.dueDate && `입금 ${prettyDate(v.dueDate)}`].filter(Boolean).map(esc).join(' · '), badge: v.status === '입금완료' ? '<span class="badge ok">입금</span>' : ddayBadge(left) }; },
    quick: [{ label: '💵 입금 받음', run: (v) => ({ ...v, status: '입금완료', paidDate: today() }) }],
    summary(rows) { const open = rows.filter((v) => !['입금완료', '취소', '견적'].includes(v.status)); return `받을 돈 ${won(open.reduce((a, v) => a + Number(v.amount || 0), 0))} · ${open.length}건`; },
  },
};

function soon(p) {
  const xs = [p.birthday, p.anniversary].filter(Boolean).map((d) => diffDays(today(), nextAnniversary(d)));
  return xs.length ? Math.min(...xs) : null;
}

function trackUrl(o) {
  if (!o.tracking) return '';
  // 택배사 공식 조회 페이지가 자주 바뀌어, 검색으로 연결한다 (가장 오래 살아남는 방법)
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(`${o.carrier || ''} ${o.tracking}`)}`;
}

// 안부 글 초안 (AI 없이도)
export const GREETINGS = {
  생일: (n) => `${n}님, 생일 축하드려요! 🎂 올 한 해도 건강하고 웃는 날 가득하시길 바랍니다.`,
  명절: (n) => `${n}님, 즐거운 명절 보내세요. 가족분들과 따뜻하고 넉넉한 시간 되시길 바랍니다.`,
  새해: (n) => `${n}님, 새해 복 많이 받으세요! 올해도 늘 건강하시고 하시는 일 모두 잘 되시길 바랍니다.`,
  안부: (n) => `${n}님, 잘 지내시죠? 문득 생각나서 연락드려요. 요즘 날씨가 오락가락하는데 건강 잘 챙기세요.`,
  감사: (n) => `${n}님, 지난번에 도와주셔서 정말 감사했습니다. 덕분에 잘 마무리했어요.`,
  위로: (n) => `${n}님, 소식 듣고 마음이 무거웠습니다. 깊은 위로를 전합니다. 필요한 일 있으면 언제든 말씀 주세요.`,
  축하: (n) => `${n}님, 정말 축하드려요! 그동안 애쓰신 만큼 좋은 결과가 나와 저도 기쁩니다.`,
};
