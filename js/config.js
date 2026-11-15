// ✏️ 수강생·판매용으로 바꿀 때는 이 파일만 고치면 됩니다 (이름·색·소개 글).
export const APP = {
  name: '오토라이프',
  nameEn: 'AutoLife',
  slogan: '내가 기억하지 않아도, 기억하고 준비하고 — 내가 허락하면 해 둡니다',
  version: '0.1.9',
  maker: '오토라이프 만든 이',      // 판매·배포할 때 내 이름(상호)으로
  support: '',                      // 문의처 (메일·카톡 채널 주소 등). 비워 두면 안 보임
  primary: '#3b5bdb',               // 주 색
  accent: '#12b886',                // 보조 색
  dbName: 'autolife',               // 이름을 바꾸면 기존 기록과 섞이지 않는 새 저장소가 됩니다
  // 🎬 오른쪽 위 「영상」 메뉴 — 내 유튜브 주소로 바꾸면 됩니다 (비워 두면 「준비 중」)
  videos: [
    { icon: '📘', title: '사용 방법', desc: '담기·일정·장보기·냉장고까지 한 번에', url: 'https://youtu.be/DaIw5-cH_D4' },
    { icon: '💻', title: '설치 방법', desc: 'PC(exe)·휴대폰(홈 화면) 설치', url: 'https://youtu.be/wTJFEQw5OFA' },
    { icon: '🔑', title: 'AI 키 발급 방법', desc: '무료 Gemini 열쇠 받아 넣기', url: 'https://youtu.be/NvhrXr8kjMM' },
  ],
};
