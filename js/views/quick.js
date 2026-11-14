import { eventDialog, taskDialog, txDialog } from './forms.js';
import { listen, modal, toast, esc } from '../ui.js';

export function quickAdd(kind, ctx) {
  if (kind === 'paste') return (location.hash = '#/inbox');
  if (kind === 'spend') return txDialog({}, ctx?.refresh);
  if (kind === 'task') return taskDialog({}, ctx?.refresh);
  if (kind === 'event') return eventDialog({}, ctx?.refresh);
  if (kind === 'voice') return voiceInput();
}

/** 말로 하기 → 글로 받아 인박스 분석으로 보낸다 */
export function voiceInput() {
  let text = '';
  const m = modal({ title: '🎙️ 말로 하기', body: `<p class="muted">예) 「다음주 화요일 오후 3시 치과 예약」 · 「오늘 점심 김밥 6천원」 · 「내일까지 보고서 제출」</p><div class="voice-box" aria-live="polite">듣고 있어요…</div>`,
    actions: [{ label: '이대로 분석', primary: true, onClick: () => { if (!text) { toast('들린 말이 없어요'); return false; } sessionStorage.setItem('al_inbox_draft', text); location.hash = '#/inbox?auto=1'; } }] });
  const box = m.el.querySelector('.voice-box');
  const r = listen((t, fin) => { text = t; box.innerHTML = esc(t) + (fin ? '' : ' …'); }, () => { if (!text) box.textContent = '끝났어요. 다시 하려면 창을 닫고 다시 누르세요.'; });
  if (!r) box.innerHTML = '이 브라우저는 음성 인식을 지원하지 않아요.<br>휴대폰 키보드의 🎤 버튼으로 말해서 「문자·메일 붙여넣기」 칸에 넣어도 됩니다.';
}
