// 달력 파일(.ics) — 휴대폰 기본 달력(구글 캘린더·삼성 캘린더·아이폰 캘린더)과 주고받는다.
// 내보내면 휴대폰 달력이 알림을 울려 준다 → 오토라이프를 닫아 두어도 알림이 온다.
import { addDays, pad, parseYmd, prettyTime, WEEK_KO } from './dates.js';

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const compact = (d) => d.replace(/-/g, '');
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545: 한 줄 75바이트를 넘으면 접는다 (한글은 3바이트라 글자 단위로 센다) */
export function fold(line) {
  const enc = new TextEncoder();
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function stamp(now) {
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function rrule(ev) {
  const r = ev.repeat || {};
  const f = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.freq];
  if (!f) return null;
  let s = `RRULE:FREQ=${f}`;
  if (r.interval > 1) s += `;INTERVAL=${r.interval}`;
  if (r.freq === 'weekly' && r.weekdays?.length) s += `;BYDAY=${r.weekdays.map((w) => WD[w]).join(',')}`;
  if (r.until) s += `;UNTIL=${compact(r.until)}T235959`;
  return s;
}

/** 일정들 -> .ics 글. 시각은 「기기 지역 시간」(floating)으로 적어 한국 휴대폰에서 그대로 맞는다. */
export function toICS(events, now = new Date(), calName = '오토라이프') {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AutoLife//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(calName)}`];
  for (const ev of events) {
    if (!ev.date || !ev.title) continue;
    L.push('BEGIN:VEVENT', `UID:${ev.id || Math.random().toString(36).slice(2)}@autolife`, `DTSTAMP:${stamp(now)}`, `SUMMARY:${esc(ev.title)}`);
    if (ev.time) {
      const t = ev.time.replace(':', '');
      L.push(`DTSTART:${compact(ev.date)}T${t}00`);
      const [h, m] = ev.time.split(':').map(Number);
      let end = ev.endTime;
      if (!end || end <= ev.time) { const x = Math.min(h * 60 + m + 60, 23 * 60 + 59); end = `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; }
      L.push(`DTEND:${compact(ev.date)}T${end.replace(':', '')}00`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${compact(ev.date)}`, `DTEND;VALUE=DATE:${compact(addDays(ev.date, 1))}`);
    }
    const rr = rrule(ev); if (rr) L.push(rr);
    for (const d of ev.skip || []) L.push(ev.time ? `EXDATE:${compact(d)}T${ev.time.replace(':', '')}00` : `EXDATE;VALUE=DATE:${compact(d)}`);
    if (ev.place) L.push(`LOCATION:${esc(ev.place)}`);
    const desc = [ev.arriveBy && `도착: ${ev.arriveBy}`, (ev.checklist || []).length && `준비: ${ev.checklist.map((c) => (c.done ? '✔' : '□') + c.t).join(', ')}`, ev.note].filter(Boolean).join('\n');
    if (desc) L.push(`DESCRIPTION:${esc(desc)}`);
    for (const mins of ev.remind || []) {
      if (!(mins > 0)) continue;
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, `TRIGGER:-PT${Math.round(mins)}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------- 가져오기
const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/** .ics 글 -> 오토라이프 일정 목록 (UTC 시각은 기기 지역 시간으로 바꾼다) */
export function parseICS(text) {
  const lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null, inAlarm = false;
  for (const raw of lines) {
    if (raw === 'BEGIN:VEVENT') { cur = { remind: [], repeat: { freq: 'none' } }; continue; }
    if (raw === 'END:VEVENT') { if (cur?.date && cur.title) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (raw === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (raw === 'END:VALARM') { inAlarm = false; continue; }
    const i = raw.indexOf(':'); if (i < 0) continue;
    const key = raw.slice(0, i).split(';')[0].toUpperCase(), params = raw.slice(0, i), val = raw.slice(i + 1);
    if (inAlarm) { const m = key === 'TRIGGER' && val.match(/^-P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/); if (m) cur.remind.push((+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0))); continue; }
    if (key === 'SUMMARY') cur.title = unesc(val).trim();
    else if (key === 'LOCATION') cur.place = unesc(val).trim();
    else if (key === 'DESCRIPTION') cur.note = unesc(val).trim().slice(0, 1000);
    else if (key === 'UID') cur.uid = val;
    else if (key === 'DTSTART' || key === 'DTEND') {
      const d = icsTime(val, /VALUE=DATE(?!-)/.test(params));
      if (!d) continue;
      if (key === 'DTSTART') { cur.date = d.date; cur.time = d.time; } else if (d.time && d.date === cur.date) cur.endTime = d.time;
    } else if (key === 'RRULE') {
      const p = Object.fromEntries(val.split(';').map((x) => x.split('=')));
      const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[p.FREQ];
      if (freq) cur.repeat = { freq, interval: Number(p.INTERVAL || 1), until: p.UNTIL ? `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}` : null, weekdays: p.BYDAY ? p.BYDAY.split(',').map((w) => WD.indexOf(w.slice(-2))).filter((x) => x >= 0) : [] };
    }
  }
  return out;
}

function icsTime(v, dateOnly) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  if (dateOnly || !m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
  let d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (m[7]) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** 일정을 카톡·문자로 보낼 글로 — 날짜별로 묶는다. list 는 이미 펼친(반복 포함) 일정, 날짜·시각 순 */
export function scheduleText(list, heading = '📅 앞으로 일정') {
  if (!list.length) return `${heading}\n일정이 없어요.`;
  const lines = [heading];
  let day = '';
  for (const e of list) {
    if (e.date !== day) {
      day = e.date; const d = parseYmd(day);
      lines.push('', `▶ ${d.getMonth() + 1}월 ${d.getDate()}일(${WEEK_KO[d.getDay()]})`);
    }
    lines.push(`· ${e.time ? prettyTime(e.time) : '종일'} ${e.title}${e.place ? ' @' + e.place : ''}`);
  }
  return lines.join('\n');
}
