// 설정 · 처음 안내 · 전체 메뉴 · 사용법 · 잠금
import { db, getSettings, saveSettings, exportAll, importAll, wipeAll, audit } from '../db.js';
import { PROVIDERS, ask } from '../core/ai.js';
import { lock, unlock, sha256 } from '../core/crypt.js';
import { APP } from '../config.js';
import { esc, toast, confirmBox, modal, fieldHtml, bindForm, readForm } from '../ui.js';
import { MODULES } from '../modules.js';

export const USER_TYPES = ['직장인', '대학생·수험생', '프리랜서', '자영업자', '가족·육아', '시니어', '반려인'];

export const MENU = [
  { g: '매일', items: [['#/', '🏠', '홈 브리핑'], ['#/inbox', '📩', '담기(인박스)'], ['#/calendar', '📅', '일정'], ['#/tasks', '✅', '할 일'], ['#/routine', '💊', '루틴·복약'], ['#/ai', '🤖', 'AI 비서']] },
  { g: '돈', items: [['#/money', '💳', '머니 가드'], ['#/subs', '🔁', '구독·고정비'], ['#/m/invoices', '💰', '받을 돈·견적', '프리랜서 자영업자']] },
  { g: '생활', items: [['#/m/people', '👨‍👩‍👧', '사람·기념일'], ['#/m/assets', '🛠️', '집·차·정기 관리'], ['#/m/orders', '📦', '쇼핑·택배·반품'], ['#/docs', '📄', '문서 보관함'], ['#/memos', '📝', '메모·초안']] },
  { g: '일·공부', items: [['#/m/study', '🎓', '공부·시험·과제', '대학생·수험생'], ['#/m/clients', '🤝', '거래처·고객', '프리랜서 자영업자']] },
  { g: '똑똑하게', items: [['#/search', '🔍', '찾기'], ['#/approvals', '🛡️', '승인 센터'], ['#/automations', '⚙️', '자동화'], ['#/memory', '🧠', 'AI 기억'], ['#/report', '📈', '리포트'], ['#/notices', '🔔', '알림'], ['#/audit', '🧾', '실행 기록']] },
  { g: '앱', items: [['#/settings', '⚙️', '설정'], ['#/guide', '📘', '사용법·설치']] },
];

export async function more(el) {
  const s = await getSettings();
  const mine = new Set(s.userTypes);
  el.innerHTML = MENU.map((g) => `<section class="card"><h2>${g.g}</h2><div class="menu-grid">${g.items.map(([h, i, t, who]) => `<a class="menu-item ${who && who.split(' ').some((w) => mine.has(w)) ? 'mine' : ''}" href="${h}"><span>${i}</span>${esc(t)}</a>`).join('')}</div></section>`).join('');
}

// ---------------------------------------------------------------- 처음 안내
export function onboarding(done) {
  const body = `<div class="onb"><p class="big-text">👋 반가워요! <b>${esc(APP.name)}</b>는 일정·할 일·돈·생활을 대신 기억하고 미리 챙겨 드리는 비서예요.</p>
    <ul class="checks"><li>📱 기록은 <b>이 휴대폰 안에만</b> 저장돼요 (서버 없음)</li><li>🛡️ AI 가 하자는 일도 <b>내가 승인해야</b> 실행돼요</li><li>🚫 돈을 보내거나 결제하는 기능은 <b>아예 없어요</b></li><li>🆓 AI 없이도 기본 기능은 모두 무료로 돌아가요</li></ul>
    <form class="form">${fieldHtml({ k: 'name', label: '뭐라고 불러 드릴까요?', placeholder: '예: 별님', half: false })}
    ${fieldHtml({ k: 'userTypes', label: '나는 (여러 개 골라도 돼요)', type: 'chips', options: USER_TYPES })}
    ${fieldHtml({ k: 'senior', label: '큰 글씨·쉬운 화면(시니어 모드)', type: 'checkbox' })}</form></div>`;
  const m = modal({ title: `${APP.name} 시작하기`, body, actions: [{ label: '시작하기', primary: true, onClick: async (el) => {
    const v = readForm(el, [{ k: 'name' }, { k: 'userTypes', type: 'chips' }, { k: 'senior', type: 'checkbox' }]);
    await saveSettings({ ...v, senior: v.senior || v.userTypes.includes('시니어'), onboarded: true });
    await seedFor(v.userTypes);
    done?.();
  } }] });
  bindForm(m.el);
}

/** 고른 유형에 맞춰 처음 한 번 쓸모 있는 기본 자동화·루틴을 깔아 둔다 (빈 화면보다 낫게). 지어낸 기록은 넣지 않는다. */
async function seedFor(types) {
  if ((await db.all('routines')).length) return;
  if (types.includes('시니어')) await db.put('routines', { icon: '💧', name: '물 마시기', kind: '건강', slots: ['오전', '오후', '저녁'] });
  if (types.includes('대학생·수험생')) await db.put('routines', { icon: '📖', name: '오늘 공부 1시간', kind: '공부', slots: [] });
  if (types.includes('반려인')) await db.put('routines', { icon: '🐶', name: '산책', kind: '가족', slots: ['아침', '저녁'] });
  await db.put('routines', { icon: '💰', name: '오늘 지출 확인', kind: '돈', slots: [] });
}

// ---------------------------------------------------------------- 설정
export async function settings(el, ctx) {
  const s = await getSettings();
  const usage = s.ai.usage || [];
  const month = new Date().toISOString().slice(0, 7);
  const mu = usage.filter((u) => u.at.startsWith(month));
  const tok = mu.reduce((a, u) => a + u.inTok + u.outTok, 0);
  el.innerHTML = `
  <section class="card"><h1>⚙️ 설정</h1><form class="form" id="basic">
    ${fieldHtml({ k: 'name', label: '부르는 이름', half: true }, s.name)}
    ${fieldHtml({ k: 'theme', label: '화면', type: 'select', options: [['auto', '기기 설정 따름'], ['light', '밝게'], ['dark', '어둡게']], half: true }, s.theme)}
    ${fieldHtml({ k: 'fontScale', label: '글자 크기', type: 'select', options: [['0.9', '작게'], ['1', '보통'], ['1.15', '크게'], ['1.3', '아주 크게']], half: true }, String(s.fontScale))}
    ${fieldHtml({ k: 'senior', label: '시니어 모드 (큰 버튼·쉬운 홈·답 읽어 주기)', type: 'checkbox', half: true }, s.senior)}
    ${fieldHtml({ k: 'userTypes', label: '나는', type: 'chips', options: USER_TYPES }, s.userTypes)}
    ${fieldHtml({ k: 'autoApproveRisk', label: 'AI·자동화 제안을 바로 실행할 범위', type: 'select', options: [['0', '모두 내가 승인 (가장 안전)'], ['1', '내 기기 안 정리(할 일·가계부·메모)는 바로'], ['2', '일정 만들기까지 바로']], help: '바깥으로 보내는 일·돈 관련 일은 어떤 설정이든 이 앱이 하지 않아요' }, String(s.autoApproveRisk))}
    <button class="btn primary" type="submit">저장</button></form></section>

  <section class="card"><h2>🔔 알림</h2><p class="muted small">앱이 열려 있거나 백그라운드에 있을 때 휴대폰 알림으로도 보여 드려요. 앱을 완전히 닫으면 알림이 오지 않을 수 있어요(웹앱의 한계).</p>
    <button class="btn" id="notif">${s.notify ? '✔ 휴대폰 알림 켜짐 (끄기)' : '휴대폰 알림 켜기'}</button></section>

  <section class="card"><h2>🤖 AI 연결 <small>선택</small></h2>
    <p class="muted small">열쇠(API Key)는 <b>이 기기에만</b> 저장되고, 질문할 때 이 기기에서 AI 회사로 바로 보내요. 요금은 <b>열쇠 주인</b>에게 청구돼요. 하나만 넣어도 되고, 여러 개 넣으면 일 종류에 따라 골라 쓰고 하나가 실패하면 다음 것으로 넘어가요.</p>
    <form class="form" id="aiForm">
      ${fieldHtml({ k: 'mode', label: '먼저 쓸 AI', type: 'select', options: [['auto', '자동 (일 종류에 맞게)'], ...Object.entries(PROVIDERS).map(([k, p]) => [k, p.name])] }, s.ai.mode)}
      ${Object.entries(PROVIDERS).map(([k, p]) => `<fieldset class="prov"><legend>${esc(p.name)} <small>${esc(p.note)}</small></legend>
        ${fieldHtml({ k: `key_${k}`, label: '열쇠', type: 'password', placeholder: s.ai.providers[k]?.key ? '저장됨 (바꾸려면 새로 입력)' : '붙여 넣기', half: true }, '')}
        ${fieldHtml({ k: `model_${k}`, label: '모델 (비우면 기본)', placeholder: p.models[0], half: true, list: p.models }, s.ai.providers[k]?.model)}
        <div class="row-btns"><a class="btn small" href="${p.keyUrl}" target="_blank" rel="noopener">열쇠 받는 곳</a>${s.ai.providers[k]?.key ? `<button type="button" class="btn small" data-test="${k}">연결 확인</button><button type="button" class="btn small danger" data-delkey="${k}">열쇠 지우기</button>` : ''}</div></fieldset>`).join('')}
      <h3>AI 에게 보여 줄 기록</h3>
      ${fieldHtml({ k: 'allow_calendar', label: '일정', type: 'checkbox', half: true }, s.ai.allow.calendar)}
      ${fieldHtml({ k: 'allow_tasks', label: '할 일', type: 'checkbox', half: true }, s.ai.allow.tasks)}
      ${fieldHtml({ k: 'allow_money', label: '돈 요약 (분류별 합계만)', type: 'checkbox', half: true }, s.ai.allow.money)}
      ${fieldHtml({ k: 'allow_memory', label: 'AI 기억', type: 'checkbox', half: true }, s.ai.allow.memory)}
      <p class="help">보내기 전에 전화번호·카드번호·주민번호·계좌번호·메일 주소는 자동으로 가려요.</p>
      <button class="btn primary" type="submit">AI 설정 저장</button></form>
    <p class="muted small">이번 달 AI 호출 ${mu.length}번 · 토큰 ${tok.toLocaleString('ko-KR')}개 (요금은 각 회사 사용량 화면에서 확인하세요)</p></section>

  <section class="card"><h2>🔒 잠금·백업</h2>
    <p class="small" id="storeInfo">저장 공간 확인 중…</p>
    <p class="small">마지막 백업: <b>${s.lastBackup ? esc(s.lastBackup) : '아직 없음'}</b></p>
    <div class="row-btns"><button class="btn" id="pin">${s.pinHash ? '앱 잠금 끄기' : '앱 잠금(비밀번호 4~8자리) 켜기'}</button></div>
    <p class="muted small">휴대폰을 바꾸거나 브라우저 기록을 지우면 기록이 사라질 수 있어요. <b>가끔 백업 파일을 저장</b>해 두세요. 백업에는 AI 열쇠가 들어가지 않아요.</p>
    <div class="row-btns"><button class="btn primary" id="exp">💾 백업 파일 저장</button><button class="btn" id="expLock">🔐 암호 걸어 백업</button><label class="btn">📂 백업 불러오기<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    <div class="row-btns"><button class="btn danger" id="wipe">모든 기록 지우기</button></div></section>

  <section class="card"><h2>ℹ️ 정보</h2><p>${esc(APP.name)} (${esc(APP.nameEn)}) ${esc(APP.version)}<br><span class="muted small">${esc(APP.slogan)}</span></p>${APP.support ? `<p>문의: ${esc(APP.support)}</p>` : ''}<p class="muted small">의료·법률·세무·금융 판단은 전문가와 상의하세요. 이 앱의 정보는 참고용이에요.</p></section>`;

  storageInfo().then((x) => { const e = el.querySelector('#storeInfo'); if (e) e.innerHTML = x; });
  const basic = el.querySelector('#basic'); bindForm(basic);
  basic.onsubmit = async (e) => { e.preventDefault(); const v = readForm(basic, [{ k: 'name' }, { k: 'theme' }, { k: 'fontScale' }, { k: 'senior', type: 'checkbox' }, { k: 'userTypes', type: 'chips' }, { k: 'autoApproveRisk' }]);
    await saveSettings({ ...v, fontScale: Number(v.fontScale), autoApproveRisk: Number(v.autoApproveRisk) }); await audit('settings', `설정 저장 (바로 실행 범위 ${v.autoApproveRisk})`); toast('저장했어요'); ctx.refresh(); };

  el.querySelector('#notif').onclick = async () => {
    if (s.notify) { await saveSettings({ notify: false }); return ctx.refresh(); }
    if (!('Notification' in window)) return toast('이 브라우저는 알림을 지원하지 않아요. 홈 화면에 설치한 뒤 다시 해 보세요');
    const p = await Notification.requestPermission();
    if (p === 'granted') { await saveSettings({ notify: true }); toast('알림을 켰어요'); } else toast('알림이 허용되지 않았어요. 휴대폰 설정에서 허용해 주세요');
    ctx.refresh();
  };

  const aiForm = el.querySelector('#aiForm'); bindForm(aiForm);
  aiForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = (n) => aiForm.querySelector(`[name="${n}"]`);
    const providers = {};
    for (const k of Object.keys(PROVIDERS)) { const nk = f(`key_${k}`).value.trim(); providers[k] = { key: nk || s.ai.providers[k]?.key || '', model: f(`model_${k}`).value.trim() }; }
    const allow = Object.fromEntries(['calendar', 'tasks', 'money', 'memory'].map((k) => [k, f(`allow_${k}`).checked]));
    await saveSettings({ ai: { mode: f('mode').value, providers, allow } });
    await audit('settings', 'AI 설정 저장 (열쇠 값은 기록하지 않음)');
    toast('AI 설정을 저장했어요'); ctx.refresh();
  };
  el.querySelectorAll('[data-test]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('아주 짧은 질문 한 번을 보내 열쇠가 되는지 확인해요. 유료 열쇠라면 아주 적은 요금이 들 수 있어요. 할까요?', '확인하기'))) return;
    b.disabled = true; b.textContent = '확인 중…';
    try { const r = await ask('chat', { prompt: '「연결됨」이라고만 답해.', maxTokens: 20 }, { mode: b.dataset.test, providers: { [b.dataset.test]: s.ai.providers[b.dataset.test] } });
      toast(`✔ 연결됨 — ${r.model} (${(r.ms / 1000).toFixed(1)}초)`); await audit('ai.test', `${b.dataset.test}/${r.model} 연결 확인 성공`, '나'); }
    catch (e) { modal({ title: '연결 실패', body: `<p class="pre">${esc(e.message)}</p><p class="muted small">열쇠가 맞는지, 결제(요금제)가 켜져 있는지, 모델 이름이 맞는지 확인해 주세요. 판단은 이 결과로만 합니다.</p>` }); }
    b.disabled = false; b.textContent = '연결 확인';
  }));
  el.querySelectorAll('[data-delkey]').forEach((b) => (b.onclick = async () => { await saveSettings({ ai: { providers: { [b.dataset.delkey]: { key: '' } } } }); toast('열쇠를 지웠어요'); ctx.refresh(); }));

  el.querySelector('#pin').onclick = async () => {
    if (s.pinHash) { await saveSettings({ pinHash: '' }); toast('잠금을 껐어요'); return ctx.refresh(); }
    const p = prompt('앱을 열 때 쓸 비밀번호 (숫자 4~8자리)'); if (!p) return;
    if (!/^\d{4,8}$/.test(p)) return toast('숫자 4~8자리로 해 주세요');
    if (prompt('한 번 더 입력') !== p) return toast('두 번이 달라요');
    await saveSettings({ pinHash: await sha256(APP.dbName + p) }); toast('잠금을 켰어요. 잊으면 기록을 지우고 백업을 불러와야 해요'); ctx.refresh();
  };
  const download = (text, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  const stamp = () => new Date().toISOString().slice(0, 10);
  el.querySelector('#exp').onclick = async () => { download(JSON.stringify(await exportAll()), `${APP.nameEn}_백업_${stamp()}.json`); await audit('backup', '백업 파일 저장'); await saveSettings({ lastBackup: stamp() }); toast('백업 파일을 저장했어요'); ctx.refresh(); };
  el.querySelector('#expLock').onclick = async () => { const p = prompt('백업 암호 (잊으면 열 수 없어요)'); if (!p) return; download(await lock(JSON.stringify(await exportAll()), p), `${APP.nameEn}_잠금백업_${stamp()}.json`); await audit('backup', '암호 백업 저장'); await saveSettings({ lastBackup: stamp() }); toast('암호 건 백업을 저장했어요'); ctx.refresh(); };
  el.querySelector('#imp').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      let obj = JSON.parse(await f.text());
      if (obj.autolifeLocked) { const p = prompt('백업 암호'); if (!p) return; obj = JSON.parse(await unlock(obj, p)); }
      const replace = await confirmBox('지금 기록을 지우고 백업으로 바꿀까요?\n(취소를 누르면 지금 기록에 더합니다)', '바꾸기');
      const n = await importAll(obj, { replace }); await audit('restore', `백업 불러오기 ${n}줄`); toast(`${n}개 불러왔어요`); ctx.refresh();
    } catch (err) { toast(`불러오기 실패: ${err.message}`); }
  };
  el.querySelector('#wipe').onclick = async () => { if (!(await confirmBox('이 기기의 오토라이프 기록을 모두 지웁니다. 되돌릴 수 없어요. 먼저 백업하셨나요?', '모두 지우기', true))) return; if (prompt('지우려면 「지우기」라고 입력') !== '지우기') return; await wipeAll(); location.reload(); };
}

// ---------------------------------------------------------------- 잠금 화면
export async function lockScreen() {
  const s = await getSettings();
  if (!s.pinHash || sessionStorage.getItem('al_unlocked') === '1') return;
  await new Promise((res) => {
    const w = document.createElement('div');
    w.className = 'lock';
    w.innerHTML = `<div><h1>🔒 ${esc(APP.name)}</h1><input type="password" inputmode="numeric" maxlength="8" placeholder="비밀번호" aria-label="비밀번호" autofocus><button class="btn primary">열기</button><p class="muted small"></p></div>`;
    document.body.appendChild(w);
    const inp = w.querySelector('input'), msg = w.querySelector('p');
    const go = async () => { if ((await sha256(APP.dbName + inp.value)) === s.pinHash) { sessionStorage.setItem('al_unlocked', '1'); w.remove(); res(); } else { msg.textContent = '비밀번호가 달라요'; inp.value = ''; } };
    w.querySelector('button').onclick = go; inp.onkeydown = (e) => e.key === 'Enter' && go();
  });
}

// ---------------------------------------------------------------- 사용법
export function guide(el) {
  el.innerHTML = `<section class="card guide"><h1>📘 사용법</h1>
  <h2>1. 휴대폰에 설치하기 (앱처럼)</h2>
  <ul><li><b>안드로이드(크롬·삼성 인터넷)</b>: 주소를 연 뒤 메뉴 ⋮ → <b>「앱 설치」 또는 「홈 화면에 추가」</b></li>
  <li><b>아이폰(사파리)</b>: 아래 공유 버튼 □↑ → <b>「홈 화면에 추가」</b></li>
  <li>설치하면 인터넷이 없어도 열리고, 안드로이드에서는 문자·카톡의 <b>「공유」 → ${esc(APP.name)}</b>로 글을 바로 보낼 수 있어요.</li></ul>
  <h2>2. 하루 쓰는 법 (3분)</h2>
  <ol><li>아침에 <b>홈</b>을 열고 🔊 를 눌러 브리핑을 들어요.</li><li>받은 예약·결제·택배·고지서 문자는 <b>📩 담기</b>에 붙여 넣어요 → 「등록」.</li><li>할 일은 우선 점수가 높은 것부터. 끝나면 ✔.</li><li>약·물·운동은 <b>💊 루틴</b>에서 체크.</li><li>저녁에 <b>🛡️ 승인 대기</b>가 있으면 확인.</li></ol>
  <h2>3. 담기가 알아듣는 글</h2>
  <ul><li>병원·회의·약속 예약 → 일정 + 준비물 + 전날 준비 할 일</li><li>카드 승인·취소 문자 → 가계부 (분류 자동)</li><li>택배 출고·배송 → 택배 목록 (송장 조회 연결)</li><li>관리비·공과금·청구 → 납부 할 일</li><li>과제·제출 마감 → 할 일</li><li>「점심 김밥 6천원」 → 지출</li><li>사기 의심 문자 → ⚠️ 경고 (112 · 금융감독원 1332)</li></ul>
  <h2>4. 알림을 놓치지 않으려면</h2>
  <p>웹앱은 완전히 닫으면 스스로 알림을 못 보내요. <b>📅 일정 → 「📲 휴대폰 달력과 함께 쓰기」</b>로 일정을 휴대폰 기본 달력에 넣어 두면, 앱을 닫아도 <b>휴대폰이 직접 알림</b>을 울려 줘요. 구글 캘린더에서 내보낸 달력 파일(.ics)도 같은 곳에서 가져올 수 있어요.</p>
  <h2>5. 내 정보는 어디에?</h2>
  <p>모든 기록은 <b>이 휴대폰(브라우저) 안</b>에만 있어요. 만든 사람에게도 보이지 않아요. AI 를 쓸 때만, 고른 기록의 요약이 내 열쇠로 AI 회사에 가요(개인번호는 가려서). 휴대폰을 바꾸기 전에는 <b>설정 → 백업</b>을 꼭 하세요.</p>
  <h2>6. 이 앱이 하지 않는 일</h2>
  <p>송금·결제·구매·해지 대행, 남의 메시지 몰래 읽기, 비밀번호 보관. 대신 <b>미리 알려 주고, 초안을 만들고, 할 일로 바꿔 드려요</b>. 마지막 버튼은 언제나 내가 누릅니다.</p></section>`;
}

/** 저장 공간 보호 상태와 쓰는 양 (브라우저가 공간이 모자랄 때 기록을 지우지 못하게) */
export async function protectStorage() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}
async function storageInfo() {
  const p = await protectStorage();
  let use = '';
  try { const e = await navigator.storage.estimate(); use = ` · 쓰는 양 ${(e.usage / 1048576).toFixed(1)}MB`; } catch {}
  if (p === true) return `🛡️ 저장 공간 보호: <b>켜짐</b> — 휴대폰 공간이 모자라도 브라우저가 기록을 지우지 않아요${use}`;
  if (p === false) return `⚠️ 저장 공간 보호: <b>꺼짐</b> — 앱을 <b>홈 화면에 설치</b>하면 대개 켜져요. 그 전까지는 백업을 자주 해 주세요${use}`;
  return `저장 공간 보호를 이 브라우저가 지원하지 않아요. 백업을 자주 해 주세요${use}`;
}
