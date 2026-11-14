// 권한·승인 엔진 — 「AI 가 하자고 한 것」과 「실제로 하는 것」을 떼어 놓는다.
// AI·자동화·글 분석이 내놓는 것은 모두 「제안」이다. 여기를 통과해야 실행된다.

// 위험 등급 (기획서 §7.3)
//  R0 조회 · R1 내 기기 안 정리 · R2 일정 만들기·바꾸기 · R3 바깥으로 나가는 일 · R4 돈·계약 · R5 금지
export const ACTIONS = {
  'event.create': { risk: 2, label: '일정 만들기' },
  'event.update': { risk: 2, label: '일정 바꾸기' },
  'task.create': { risk: 1, label: '할 일 만들기' },
  'task.complete': { risk: 1, label: '할 일 끝내기' },
  'transaction.create': { risk: 1, label: '가계부 기록' },
  'subscription.create': { risk: 1, label: '구독 등록' },
  'order.create': { risk: 1, label: '택배 등록' },
  'memo.create': { risk: 1, label: '메모 보관' },
  'memory.create': { risk: 1, label: '기억 저장' },
  'person.create': { risk: 1, label: '사람 등록' },
  'notify': { risk: 0, label: '알림 보이기' },
  // 바깥으로 나가는 일 — 이 앱은 대신 보내지 않는다. 초안만 만들어 사용자가 직접 보낸다.
  'message.draft': { risk: 1, label: '문자·메일 초안 (보내기는 직접)' },
};

// 어떤 글이 시켜도 하지 않는 일. 앱에 그런 기능 자체가 없다.
export const FORBIDDEN = /(송금|이체|계좌\s*번호|비밀\s*번호|비번|OTP|인증\s*번호|카드\s*번호|주민\s*등록\s*번호|결제\s*해|구매\s*해|대출|투자\s*해|코인|transfer|password)/i;

/**
 * 제안 하나를 검사한다.
 * @param {object} p {action, title, data, source:'inbox'|'ai'|'automation'|'user'}
 * @param {object} settings {autoApproveRisk: 0|1|2}
 * @returns {{ok:boolean, needsApproval:boolean, risk:number, reason:string}}
 */
export function check(p, settings = {}) {
  const def = ACTIONS[p?.action];
  if (!def) return { ok: false, needsApproval: false, risk: 5, reason: `허용되지 않은 동작: ${p?.action}` };
  const text = JSON.stringify(p.data || {}) + ' ' + (p.title || '');
  // AI·자동화가 만든 제안 속에 돈을 옮기라는 말이 섞이면 막는다 (프롬프트 주입 방어)
  if (p.source !== 'user' && p.action !== 'task.create' && p.action !== 'memo.create' && FORBIDDEN.test(text)) {
    return { ok: false, needsApproval: false, risk: 5, reason: '돈·비밀번호와 관련된 실행은 하지 않습니다' };
  }
  if (!validData(p)) return { ok: false, needsApproval: false, risk: def.risk, reason: '내용이 비어 있거나 형식이 틀렸습니다' };
  const auto = settings.autoApproveRisk ?? 0;
  // 사용자가 직접 누른 것은 이미 승인이다. AI·글분석·자동화는 설정한 등급까지만 바로 한다.
  const needsApproval = p.source === 'user' ? false : def.risk > auto;
  return { ok: true, needsApproval, risk: def.risk, reason: needsApproval ? '사용자 승인 필요' : '바로 실행 가능' };
}

function validData(p) {
  const d = p.data || {};
  const s = (x) => typeof x === 'string' && x.trim().length > 0;
  const date = (x) => x == null || /^\d{4}-\d{2}-\d{2}$/.test(x);
  const time = (x) => x == null || x === '' || /^\d{2}:\d{2}$/.test(x);
  switch (p.action) {
    case 'event.create': return s(d.title) && /^\d{4}-\d{2}-\d{2}$/.test(d.date || '') && time(d.time);
    case 'task.create': return s(d.title) && date(d.due);
    case 'transaction.create': return Number.isFinite(Number(d.amount)) && Number(d.amount) !== 0 && date(d.date);
    case 'subscription.create': return s(d.name) && Number(d.amount) > 0;
    case 'order.create': return s(d.item) || s(d.tracking);
    case 'memo.create': return s(d.text);
    case 'memory.create': return s(d.text);
    case 'person.create': return s(d.name);
    case 'message.draft': return s(d.body);
    default: return true;
  }
}

/** 개인정보를 AI 로 보내기 전에 가린다 */
export function mask(text) {
  return String(text || '')
    .replace(/\b\d{6}\s*-\s*[1-8]\d{6}\b/g, '[주민번호]')
    .replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[카드번호]')
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[전화번호]')
    .replace(/\b\d{2,6}-\d{2,6}-\d{2,8}\b/g, '[계좌번호]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[메일주소]');
}
