// 일정·할 일·지출·구독 양식 (여러 화면이 함께 쓴다)
import { db } from '../db.js';
import { formDialog, toast } from '../ui.js';
import { CATEGORIES, categorize, isDuplicateEvent } from '../core/logic.js';
import { PREP } from '../core/parser.js';
import { today } from '../core/dates.js';
import { execute } from '../actions.js';

export const EVENT_TYPES = ['약속', '회의', '병원', '수업·시험', '마감', '납부', '경조사', '여행', '운동', '가족', '개인', '기타'];
const TYPE_PREP = { 병원: 'hospital', 회의: 'meeting', '수업·시험': 'class', 여행: 'travel', 경조사: 'family', 약속: 'appointment', 마감: 'deadline', 납부: 'bill' };

export const EVENT_FIELDS = [
  { k: 'title', label: '제목', required: true },
  { k: 'type', label: '종류', type: 'select', options: EVENT_TYPES, half: true },
  { k: 'date', label: '날짜', type: 'date', required: true, half: true },
  { k: 'time', label: '시작', type: 'time', half: true },
  { k: 'endTime', label: '끝', type: 'time', half: true },
  { k: 'place', label: '장소', placeholder: '예: 해운대구 ○○병원' },
  { k: 'arriveBy', label: '도착해야 할 때', type: 'time', half: true },
  { k: 'travelMin', label: '가는 데 걸리는 시간(분)', type: 'number', half: true, help: '넣으면 출발 시간을 알려 드려요' },
  { k: 'repeatFreq', label: '반복', type: 'select', options: [['none', '안 함'], ['daily', '매일'], ['weekly', '매주'], ['monthly', '매월'], ['yearly', '매년']], half: true },
  { k: 'repeatUntil', label: '반복 끝나는 날', type: 'date', half: true },
  { k: 'remindSel', label: '미리 알림', type: 'chips', options: [['10', '10분 전'], ['30', '30분 전'], ['60', '1시간 전'], ['180', '3시간 전'], ['1440', '하루 전'], ['10080', '일주일 전']] },
  { k: 'checklist', label: '준비물·할 것', type: 'list' },
  { k: 'with', label: '함께하는 사람', placeholder: '예: 엄마, 김대리' },
  { k: 'note', label: '메모', type: 'textarea', rows: 2 },
];

export function eventDialog(ev = {}, onDone) {
  const v = { type: '기타', date: today(), ...ev, repeatFreq: ev.repeat?.freq || 'none', repeatUntil: ev.repeat?.until || '', remindSel: (ev.remind || [60]).map(String) };
  if (!ev.id && !v.checklist) v.checklist = [];
  return formDialog({
    title: ev.id ? '일정 고치기' : '새 일정', fields: EVENT_FIELDS, value: v,
    extra: `<p class="help">종류를 고른 뒤 「준비물 채우기」를 누르면 종류에 맞는 준비물을 넣어 드려요. <button type="button" class="btn small" data-prep>준비물 채우기</button></p>`,
    async onSave(o) {
      const rec = { ...ev, ...o, repeat: { freq: o.repeatFreq, until: o.repeatUntil || null }, remind: (o.remindSel || []).map(Number) };
      delete rec.repeatFreq; delete rec.repeatUntil; delete rec.remindSel;
      if (!ev.id && isDuplicateEvent(rec, await db.all('events'))) { toast('같은 날·같은 시각에 같은 일정이 이미 있어요'); return; }
      const saved = await db.put('events', rec); toast('일정 저장'); onDone?.(saved);
    },
    onDelete: ev.id ? async () => { await db.del('events', ev.id); toast('지웠어요'); onDone?.(); } : null,
  }).el.querySelector('[data-prep]')?.addEventListener('click', (e) => {
    const root = e.target.closest('.modal');
    const type = root.querySelector('[name=type]').value;
    const list = PREP[TYPE_PREP[type]] || [];
    if (!list.length) return toast('이 종류는 준비물 보기가 없어요. 직접 넣어 주세요');
    const btn = root.querySelector('[data-list=checklist] [data-add-row]');
    const have = new Set([...root.querySelectorAll('[data-list=checklist] input[type=text]')].map((i) => i.value));
    for (const t of list) if (!have.has(t)) { btn.insertAdjacentHTML('beforebegin', `<div class="cl-row"><input type="checkbox"><input type="text" value="${t}"><button type="button" class="icon-btn" data-del-row>✕</button></div>`); }
  });
}

export const TASK_FIELDS = [
  { k: 'title', label: '할 일', required: true },
  { k: 'due', label: '기한', type: 'date', half: true },
  { k: 'importance', label: '중요도', type: 'select', options: [[1, '1 낮음'], [2, '2'], [3, '3 보통'], [4, '4'], [5, '5 아주 중요']], half: true },
  { k: 'category', label: '분류', type: 'select', options: ['업무', '돈', '건강', '가족', '학습', '집', '준비', '안전', '기타'], half: true },
  { k: 'minutes', label: '걸리는 시간(분)', type: 'number', half: true, default: 30 },
  { k: 'steps', label: '작은 단계로 나누기', type: 'list', help: '큰 일은 쪼개면 시작하기 쉬워요' },
  { k: 'note', label: '메모', type: 'textarea', rows: 2 },
];

export function taskDialog(t = {}, onDone) {
  return formDialog({
    title: t.id ? '할 일 고치기' : '새 할 일', fields: TASK_FIELDS, value: { importance: 3, category: '기타', ...t },
    async onSave(o) { const saved = t.id ? await db.put('tasks', { ...t, ...o, importance: Number(o.importance) }) : (await execute({ action: 'task.create', source: 'user', data: { ...o, importance: Number(o.importance) } })).record; toast('저장'); onDone?.(saved); },
    onDelete: t.id ? async () => { await db.del('tasks', t.id); onDone?.(); } : null,
  });
}

const MAIN = Object.keys(CATEGORIES).concat('기타');
export const TX_FIELDS = [
  { k: 'kind', label: '구분', type: 'select', options: [['out', '지출'], ['in', '수입'], ['refund', '환불']], half: true },
  { k: 'amount', label: '금액', type: 'money', required: true, half: true },
  { k: 'merchant', label: '어디서·누구에게', placeholder: '예: 스타벅스, 월급', half: true },
  { k: 'date', label: '날짜', type: 'date', half: true },
  { k: 'main', label: '분류 (비우면 자동)', type: 'select', options: [['', '자동으로 분류'], ...MAIN.map((x) => [x, x])], half: true },
  { k: 'sub', label: '세부 분류', half: true, placeholder: '예: 카페' },
  { k: 'method', label: '결제 수단', half: true, list: ['현금', '체크카드', '신용카드', '계좌이체', '간편결제', '상품권'] },
  { k: 'installment', label: '할부', half: true, list: ['일시불', '2개월', '3개월', '6개월', '12개월'] },
  { k: 'business', label: '사업 경비로 분리', type: 'checkbox', help: '사업자라면 체크해 두세요. 비용 인정 여부는 세무 기준에 따라 따로 확인이 필요해요' },
  { k: 'memo', label: '메모', type: 'textarea', rows: 2 },
];

export function txDialog(tx = {}, onDone) {
  return formDialog({
    title: tx.id ? '기록 고치기' : '돈 기록', fields: TX_FIELDS, value: { kind: 'out', date: today(), ...tx },
    async onSave(o) {
      if (tx.id) { const c = o.main ? { main: o.main, sub: o.sub } : categorize(o.merchant, o.memo); await db.put('transactions', { ...tx, ...o, ...c, amount: Math.abs(o.amount) }); }
      else await execute({ action: 'transaction.create', source: 'user', data: { ...o, amount: o.kind === 'refund' ? -Math.abs(o.amount) : Math.abs(o.amount) } });
      toast('기록했어요'); onDone?.();
    },
    onDelete: tx.id ? async () => { await db.del('transactions', tx.id); onDone?.(); } : null,
  });
}

export const SUB_PRESETS = [
  ['넷플릭스', 'OTT'], ['유튜브 프리미엄', 'OTT'], ['티빙', 'OTT'], ['웨이브', 'OTT'], ['쿠팡플레이', 'OTT'], ['디즈니+', 'OTT'], ['왓챠', 'OTT'],
  ['멜론', '음악'], ['지니', '음악'], ['스포티파이', '음악'], ['플로', '음악'], ['쿠팡 와우', '쇼핑 멤버십'], ['네이버플러스 멤버십', '쇼핑 멤버십'], ['배민클럽', '쇼핑 멤버십'],
  ['ChatGPT', 'AI'], ['Claude', 'AI'], ['Gemini', 'AI'], ['구글 원', '클라우드'], ['iCloud+', '클라우드'], ['네이버 MYBOX', '클라우드'], ['Microsoft 365', '소프트웨어'], ['어도비', '소프트웨어'], ['캔바', '소프트웨어'],
  ['밀리의 서재', '도서'], ['헬스장', '운동'], ['정기 배송', '정기 배송'], ['통신 부가서비스', '통신'],
];
export const SUB_FIELDS = [
  { k: 'name', label: '서비스', required: true, list: SUB_PRESETS.map((x) => x[0]) },
  { k: 'kind', label: '종류', type: 'select', options: ['OTT', '음악', '쇼핑 멤버십', 'AI', '클라우드', '소프트웨어', '도서', '운동', '정기 배송', '통신', '기타'], half: true },
  { k: 'amount', label: '금액', type: 'money', required: true, half: true, help: '가격은 서비스마다 자주 바뀌어요. 결제 문자·영수증의 금액을 넣어 주세요' },
  { k: 'cycle', label: '결제 주기', type: 'select', options: ['매월', '매년', '3개월', '6개월', '매주'], half: true },
  { k: 'nextDate', label: '다음 결제일', type: 'date', half: true },
  { k: 'method', label: '결제 수단', half: true },
  { k: 'status', label: '상태', type: 'select', options: ['이용중', '무료체험', '해지예정', '해지'], half: true },
  { k: 'trialEnd', label: '무료 체험 끝나는 날', type: 'date', half: true },
  { k: 'lastUsed', label: '마지막으로 쓴 날', type: 'date', half: true, help: '한 달 넘게 안 쓰면 「절감 후보」로 보여 드려요' },
  { k: 'cancelHow', label: '해지 방법·공식 주소', type: 'textarea', rows: 2, placeholder: '예: 앱 → 설정 → 멤버십 → 해지' },
  { k: 'shared', label: '가족과 나눠 씀', type: 'checkbox', half: true },
  { k: 'note', label: '메모', type: 'textarea', rows: 2 },
];

export function subDialog(sb = {}, onDone) {
  const m = formDialog({
    title: sb.id ? '구독 고치기' : '구독 추가', fields: SUB_FIELDS, value: { cycle: '매월', status: '이용중', kind: '기타', ...sb },
    async onSave(o) { await db.put('subscriptions', { ...sb, ...o }); toast('저장'); onDone?.(); },
    onDelete: sb.id ? async () => { await db.del('subscriptions', sb.id); onDone?.(); } : null,
  });
  // 이름을 고르면 종류를 맞춰 준다
  m.el.querySelector('[name=name]').addEventListener('change', (e) => {
    const hit = SUB_PRESETS.find((x) => x[0] === e.target.value);
    if (hit) m.el.querySelector('[name=kind]').value = hit[1];
  });
  return m;
}
