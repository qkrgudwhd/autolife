// 장보기·살 것 — 한 줄에 여러 개(「우유 2, 계란 한 판, 휴지」)를 넣으면 나눠서 담고,
// 마트 동선 순서(채소 → 정육 → 유제품 …)로 묶어 보여 준다. 자주 사는 것은 한 번에 다시 담는다.

export const SHOP_CATS = [
  { k: '채소·과일', icon: '🥬', words: ['양파', '대파', '파', '마늘', '감자', '고구마', '당근', '배추', '양배추', '상추', '깻잎', '시금치', '오이', '호박', '애호박', '버섯', '콩나물', '숙주', '고추', '피망', '파프리카', '브로콜리', '토마토', '방울토마토', '무', '생강', '사과', '배', '귤', '감귤', '바나나', '딸기', '포도', '수박', '참외', '복숭아', '키위', '레몬', '오렌지', '블루베리', '과일', '채소', '야채', '샐러드'] },
  { k: '정육·수산', icon: '🥩', words: ['고기', '소고기', '돼지고기', '삼겹살', '목살', '닭', '닭고기', '닭가슴살', '다짐육', '불고기', '갈비', '생선', '고등어', '갈치', '연어', '오징어', '새우', '조개', '바지락', '굴', '멸치', '참치회', '회', '전복', '꽃게', '낙지', '문어'] },
  { k: '유제품·계란', icon: '🥛', words: ['우유', '계란', '달걀', '요거트', '요구르트', '치즈', '버터', '생크림', '두유'] },
  { k: '두부·반찬·즉석', icon: '🍱', words: ['두부', '어묵', '햄', '소시지', '스팸', '베이컨', '김치', '반찬', '만두', '떡', '떡볶이', '냉동', '피자', '즉석밥', '햇반', '도시락', '김', '단무지', '맛살'] },
  { k: '쌀·면·빵', icon: '🍞', words: ['쌀', '잡곡', '현미', '라면', '국수', '소면', '파스타', '스파게티', '우동', '냉면', '빵', '식빵', '시리얼', '밀가루', '부침가루', '튀김가루', '떡국떡'] },
  { k: '양념·소스', icon: '🧂', words: ['소금', '설탕', '간장', '된장', '고추장', '고춧가루', '식용유', '올리브유', '참기름', '들기름', '식초', '케첩', '마요네즈', '굴소스', '액젓', '다시다', '맛술', '물엿', '올리고당', '후추', '카레', '짜장'] },
  { k: '음료·간식', icon: '🧃', words: ['물', '생수', '탄산수', '콜라', '사이다', '주스', '커피', '믹스커피', '원두', '차', '녹차', '맥주', '소주', '막걸리', '와인', '과자', '초콜릿', '사탕', '젤리', '아이스크림', '견과', '견과류'] },
  { k: '생활용품', icon: '🧻', words: ['휴지', '화장지', '키친타월', '물티슈', '세제', '섬유유연제', '주방세제', '퐁퐁', '수세미', '고무장갑', '쓰레기봉투', '종량제', '지퍼백', '랩', '호일', '건전지', '전구', '샴푸', '린스', '바디워시', '비누', '치약', '칫솔', '면도기', '생리대', '기저귀', '마스크', '수건', '락스'] },
  { k: '약·건강', icon: '💊', words: ['약', '감기약', '두통약', '진통제', '소화제', '해열제', '파스', '밴드', '반창고', '연고', '영양제', '비타민', '유산균', '오메가', '인공눈물', '소독약'] },
  { k: '반려동물', icon: '🐾', words: ['사료', '간식캔', '배변패드', '모래', '고양이모래', '츄르', '개껌'] },
  { k: '기타', icon: '🛒', words: [] },
];
const CAT_ORDER = Object.fromEntries(SHOP_CATS.map((c, i) => [c.k, i]));

const UNIT = '개|병|봉|봉지|팩|통|구|판|캔|박스|상자|묶음|단|모|마리|줄|장|포|알|롤|kg|g|L|l|ml|리터|킬로|근|인분|세트';
const HAN_NUM = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
const QTY_TAIL = new RegExp(`\\s*(\\d+(?:\\.\\d+)?|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*(${UNIT})?\\s*$`);

/** 이름으로 분류 짐작 — 긴 낱말부터 맞춰 「닭가슴살」이 「닭」보다 먼저 */
export function guessCat(name) {
  const n = String(name || '').replace(/\s/g, '');
  let best = null, len = 0;
  for (const c of SHOP_CATS) for (const w of c.words) if (w.length > len && n.includes(w)) { best = c.k; len = w.length; }
  return best || '기타';
}

/** 「우유 2, 계란 한 판\n휴지 3롤 그리고 대파」 → [{name, qty, cat}] */
export function parseShopText(text) {
  const out = [];
  const head = /^\s*(장보기|살\s*것|사야\s*할\s*것|살거|구매|쇼핑)\s*[:：-]?\s*/;
  for (let part of String(text || '').replace(head, '').split(/[,，、·\n]|\s그리고\s|\s하고\s|\s랑\s/)) {
    part = part.replace(/^[\s\-*•☐□✔✅]+/, '').replace(/^\d+[.)]\s*/, '').trim();
    if (!part) continue;
    let qty = '';
    const m = part.match(QTY_TAIL);
    // 숫자는 단위가 없어도(「우유 2」), 한·두·세… 는 단위가 있을 때만(「계란 한 판」) — 「열무」 같은 이름을 지키려고
    if (m && m.index > 0 && (/^\d/.test(m[1]) || m[2])) {
      qty = `${HAN_NUM[m[1]] ?? m[1]}${m[2] || '개'}`;
      part = part.slice(0, m.index).trim();
    }
    if (!part) continue;
    out.push({ name: part, qty, cat: guessCat(part) });
  }
  return out;
}

/** 지금 살 것만(정리 안 한 것), 분류 순서대로 묶고 안에서는 안 산 것 먼저 */
export function groupShop(items) {
  const live = items.filter((x) => !x.archived);
  const groups = {};
  for (const x of live) (groups[x.cat || '기타'] ||= []).push(x);
  return Object.entries(groups)
    .sort((a, b) => (CAT_ORDER[a[0]] ?? 99) - (CAT_ORDER[b[0]] ?? 99))
    .map(([k, list]) => ({ cat: k, icon: SHOP_CATS[CAT_ORDER[k]]?.icon || '🛒', items: list.sort((a, b) => Number(!!a.done) - Number(!!b.done) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))) }));
}

/** 자주 산 것 — 지금 목록에 없는 것 중 많이 산 순서 */
export function frequentShop(items, n = 12) {
  const live = new Set(items.filter((x) => !x.archived && !x.done).map((x) => norm(x.name)));
  const cnt = new Map();
  for (const x of items) if (x.done || x.archived) { const k = norm(x.name); if (!live.has(k)) cnt.set(k, { name: x.name, cat: x.cat, n: (cnt.get(k)?.n || 0) + 1 }); }
  return [...cnt.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, n);
}

/** 이미 목록에 있으면(안 산 것) 또 담지 않는다 */
export function isOnList(items, name) {
  const k = norm(name);
  return items.some((x) => !x.archived && !x.done && norm(x.name) === k);
}

/** 가족에게 보낼 글 */
export function shopText(items, heading = '🛒 장보기 목록') {
  const groups = groupShop(items).map((g) => ({ ...g, items: g.items.filter((x) => !x.done) })).filter((g) => g.items.length);
  if (!groups.length) return `${heading}\n살 것이 없어요.`;
  const lines = [heading];
  for (const g of groups) { lines.push('', `${g.icon} ${g.cat}`); for (const x of g.items) lines.push(`☐ ${x.name}${x.qty ? ' ' + x.qty : ''}${x.memo ? ' (' + x.memo + ')' : ''}`); }
  return lines.join('\n');
}

const norm = (s) => String(s || '').replace(/\s/g, '').toLowerCase();
