// 화면 도우미 — 글 이스케이프, 알림 띠, 창, 입력 양식 만들기.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const won = (n) => `${Math.round(Number(n || 0)).toLocaleString('ko-KR')}원`;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, ms);
}

/** 아래에서 올라오는 창 */
export function modal({ title, body, actions = [], wide = false, onOpen }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="닫기">✕</button></div>
    <div class="modal-body">${body}</div>
    ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-a="${i}">${esc(a.label)}</button>`).join('')}</div>` : ''}
  </div>`;
  const close = () => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 200); history.state?.modal && history.back(); };
  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap || e.target.closest('[data-x]')) return close();
    const b = e.target.closest('[data-a]');
    if (b) { const r = await actions[+b.dataset.a].onClick?.(wrap, close); if (r !== false && !actions[+b.dataset.a].keep) close(); }
  });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('on'));
  onOpen?.(wrap, close);
  return { el: wrap, close };
}

export function confirmBox(text, okLabel = '확인', danger = false) {
  return new Promise((res) => {
    let done = false;
    const m = modal({ title: '확인', body: `<p class="pre">${esc(text)}</p>`, actions: [
      { label: '취소', onClick: () => { done = true; res(false); } },
      { label: okLabel, primary: !danger, danger, onClick: () => { done = true; res(true); } }] });
    m.el.addEventListener('click', (e) => { if (!done && (e.target === m.el || e.target.closest('[data-x]'))) res(false); });
  });
}

// ---------------------------------------------------------------- 양식
// field: {k, label, type, options, placeholder, help, required, half, min, step, show:(v)=>bool}
export function fieldHtml(f, v) {
  const val = v ?? f.default ?? '';
  const id = `f_${f.k}`;
  const lab = `<label for="${id}">${esc(f.label)}${f.required ? ' <b class="req">*</b>' : ''}</label>`;
  const help = f.help ? `<small class="help">${esc(f.help)}</small>` : '';
  let input;
  switch (f.type) {
    case 'textarea': input = `<textarea id="${id}" name="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || '')}">${esc(val)}</textarea>`; break;
    case 'select': input = `<select id="${id}" name="${f.k}">${(f.options || []).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`; break;
    case 'chips': {
      const set = new Set(Array.isArray(val) ? val : []);
      input = `<div class="chips" data-chips="${f.k}">${(f.options || []).map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<button type="button" class="chip ${set.has(ov) ? 'on' : ''}" data-v="${esc(ov)}">${esc(ol)}</button>`; }).join('')}</div>`;
      break;
    }
    case 'checkbox': return `<div class="field check ${f.half ? 'half' : ''}"><label><input type="checkbox" name="${f.k}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>${help}</div>`;
    case 'money': input = `<div class="money-in"><input id="${id}" name="${f.k}" inputmode="numeric" placeholder="${esc(f.placeholder || '0')}" value="${val === '' ? '' : Number(val).toLocaleString('ko-KR')}" data-money><span>원</span></div>`; break;
    case 'file': input = `<input id="${id}" name="${f.k}" type="file" accept="${f.accept || 'image/*,application/pdf'}" ${f.capture ? 'capture="environment"' : ''}>`; break;
    case 'list': {
      const items = Array.isArray(val) ? val : [];
      input = `<div class="checklist-edit" data-list="${f.k}">${items.map((it) => listRow(it)).join('')}<button type="button" class="btn small" data-add-row>+ 항목 추가</button></div>`;
      break;
    }
    default: input = `<input id="${id}" name="${f.k}" type="${f.type || 'text'}" value="${esc(val)}" placeholder="${esc(f.placeholder || '')}" ${f.min != null ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.type === 'number' ? 'inputmode="decimal"' : ''} ${f.list ? `list="dl_${f.k}"` : ''}>${f.list ? `<datalist id="dl_${f.k}">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}`;
  }
  return `<div class="field ${f.half ? 'half' : ''}" data-field="${f.k}">${lab}${input}${help}</div>`;
}
const listRow = (it) => `<div class="cl-row"><input type="checkbox" ${it.done ? 'checked' : ''}><input type="text" value="${esc(it.t)}"><button type="button" class="icon-btn" data-del-row aria-label="지우기">✕</button></div>`;

export function bindForm(root) {
  root.addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (c && c.closest('[data-chips]')) { c.classList.toggle('on'); return; }
    if (e.target.closest('[data-add-row]')) { e.target.closest('[data-add-row]').insertAdjacentHTML('beforebegin', listRow({ t: '', done: false })); return; }
    if (e.target.closest('[data-del-row]')) e.target.closest('.cl-row').remove();
  });
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-money]')) {
      const n = e.target.value.replace(/[^\d-]/g, '');
      e.target.value = n ? Number(n).toLocaleString('ko-KR') : '';
    }
  });
}

export function readForm(root, fields) {
  const o = {};
  for (const f of fields) {
    if (f.type === 'chips') { o[f.k] = $$(`[data-chips="${f.k}"] .chip.on`, root).map((c) => c.dataset.v); continue; }
    if (f.type === 'list') { o[f.k] = $$(`[data-list="${f.k}"] .cl-row`, root).map((r) => ({ t: r.querySelector('input[type=text]').value.trim(), done: r.querySelector('input[type=checkbox]').checked })).filter((x) => x.t); continue; }
    const el = root.querySelector(`[name="${f.k}"]`); if (!el) continue;
    if (f.type === 'checkbox') o[f.k] = el.checked;
    else if (f.type === 'file') o[f.k] = el.files?.[0] || undefined;
    else if (f.type === 'money') o[f.k] = el.value ? Number(el.value.replace(/[^\d-]/g, '')) : null;
    else if (f.type === 'number') o[f.k] = el.value === '' ? null : Number(el.value);
    else o[f.k] = el.value.trim();
    if (o[f.k] === '' && (f.type === 'date' || f.type === 'time')) o[f.k] = null;
  }
  return o;
}

/** 양식 창 하나로 만들기·고치기·지우기 */
export function formDialog({ title, fields, value = {}, onSave, onDelete, extra = '', saveLabel = '저장' }) {
  const body = `<form class="form" novalidate>${extra}${fields.map((f) => fieldHtml(f, value[f.k])).join('')}</form>`;
  const actions = [];
  if (onDelete) actions.push({ label: '지우기', danger: true, onClick: async (el, close) => { if (await confirmBox('지울까요? 되돌릴 수 없습니다.', '지우기', true)) { await onDelete(); close(); } return false; } });
  actions.push({ label: saveLabel, primary: true, onClick: async (el) => {
    const v = readForm(el, fields);
    const miss = fields.filter((f) => f.required && (v[f.k] == null || v[f.k] === '' || (Array.isArray(v[f.k]) && !v[f.k].length)));
    if (miss.length) { toast(`「${miss[0].label}」을(를) 넣어 주세요`); return false; }
    try { await onSave(v, el); } catch (err) { toast(`저장 실패: ${err.message}`); console.error(err); return false; }
  } });
  const m = modal({ title, body, actions });
  bindForm(m.el);
  m.el.querySelector('input,textarea,select')?.focus({ preventScroll: true });
  return m;
}

export function empty(icon, text, btn = '') {
  return `<div class="empty"><div class="empty-ico">${icon}</div><p>${text}</p>${btn}</div>`;
}

export function ddayBadge(left) {
  if (left == null) return '';
  const cls = left < 0 ? 'danger' : left <= 3 ? 'warn' : '';
  const t = left === 0 ? 'D-DAY' : left > 0 ? `D-${left}` : `${-left}일 지남`;
  return `<span class="badge ${cls}">${t}</span>`;
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

/** 큰 사진을 줄여 저장 공간을 아낀다 (긴 변 1600px, JPEG 0.85) */
export async function shrinkImage(file, max = 1600) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 900000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/jpeg', 0.85));
  } catch { return file; }
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}

/** 말로 넣기 (브라우저 음성 인식, 한국어). 안 되는 기기면 null */
export function listen(onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'ko-KR'; r.interimResults = true; r.continuous = false;
  r.onresult = (e) => onText([...e.results].map((x) => x[0].transcript).join(''), e.results[e.results.length - 1].isFinal);
  r.onend = () => onEnd?.();
  r.onerror = (e) => { toast(e.error === 'not-allowed' ? '마이크 권한을 허용해 주세요' : `음성 인식 오류: ${e.error}`); onEnd?.(); };
  r.start();
  return r;
}

/** 부르는 이름 + 님 (이미 「님」으로 끝나면 또 붙이지 않는다) */
export const honor = (n) => (n ? (/님$/.test(n.trim()) ? n.trim() : `${n.trim()}님`) : '');

/** 파일을 휴대폰에 넘긴다: 공유창(→ 달력 앱 등)이 되면 공유, 안 되면 내려받기 */
/** 글 보내기 — 휴대폰은 공유 창(카톡·문자), 안 되면 복사 → 'shared' | 'copied' | 'canceled' | 'shown' */
export async function shareText(text, title = '') {
  try {
    if (navigator.share) { await navigator.share({ text, title }); return 'shared'; }
  } catch (e) { if (e.name === 'AbortError') return 'canceled'; }
  try { await navigator.clipboard.writeText(text); toast('글을 복사했어요. 카톡·문자에 붙여 넣어 주세요', 3500); return 'copied'; } catch {}
  modal({ title: '이 글을 길게 눌러 복사하세요', body: `<textarea class="input" rows="10" readonly>${esc(text)}</textarea>`, actions: [{ label: '닫기', primary: true }] });
  return 'shown';
}

export async function shareFile(text, filename, mime) {
  const file = new File([text], filename, { type: mime });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return 'shared'; }
  } catch (e) { if (e.name === 'AbortError') return 'canceled'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return 'downloaded';
}
