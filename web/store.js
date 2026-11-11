/* 작업 저장 · 불러오기
 *
 * 작업은 지금까지 창의 메모리에만 있었다. 새로고침 한 번이면 사라지고, 미리보기 판(아티팩트)에서
 * 만든 걸 로컬 서버 창으로 옮길 길도 없었다. 그래서 셋을 둔다.
 *
 *   자동 저장   바뀔 때마다 이 브라우저의 IndexedDB 에. 다음에 열면 "이어서 하기"를 묻는다.
 *               (localStorage 는 5MB 가 한계라 사진이 든 작업은 못 담는다.)
 *   파일        .json 으로 내려받고, 다른 창에서 그 파일을 고르거나 끌어다 놓으면 그대로 돌아온다.
 *   클립보드    내려받기가 막힌 창(아티팩트)에서는 복사 → 다른 창에서 Ctrl+V.
 *
 * 저장하는 것은 작업 문서(P) 전부다 — 입력, 가격표에서 읽은 것, 초안, 3단계에서 옮긴 개체까지.
 * 모델 전송 객체(ai)와 File 객체는 뺀다. 사진은 data URL 이라 그대로 들어간다.
 */

export const APP = 'cretec-detail';
const DB = 'cretec-detail';
const STORE = 'kv';
const KEY = 'autosave';

/* ---------- IndexedDB — 키 하나짜리 ---------- */
function open() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in globalThis)) return rej(new Error('저장소가 없습니다'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('저장소를 열지 못했습니다'));
  });
}
async function put(value) {
  const db = await open();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}
async function get() {
  const db = await open();
  const v = await new Promise((res, rej) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return v;
}
export async function clearAutosave() {
  try { await put(null); } catch { /* 저장소가 막힌 환경 */ }
}

/* ---------- 스냅샷 ---------- */
const SKIP = new Set(['ai', 'file']);

/* handoff: 편집·저장 전용으로 넘긴다 — 받는 쪽에서는 1·2단계가 잠긴다(입력·기획은 작성자 몫). */
export function snapshot(P, { handoff = false } = {}) {
  const project = JSON.parse(JSON.stringify(P, (k, v) => (SKIP.has(k) ? undefined : v)));
  if (handoff) {
    project.handoff = true;
    project.step = Math.max(3, Number(project.step) || 3);
  }
  return { app: APP, v: 1, savedAt: new Date().toISOString(), project };
}

/* 작업이라 부를 만한 게 있나 — 빈 문서를 저장하거나 "이어서 하기"를 묻지 않으려고 */
export function hasWork(project) {
  const i = project?.input || {};
  return !!(String(i.name || '').trim() || String(i.brand || '').trim() || (i.shots || []).length
    || i.priceTable || String(i.featText || '').trim() || (project?.draft?.sections || []).length);
}

/* 파일이나 클립보드에서 온 글 → 스냅샷. 아니면 null. */
export function parseSnapshot(text) {
  try {
    const j = typeof text === 'string' ? JSON.parse(text) : text;
    if (!j || j.app !== APP || !j.project || typeof j.project !== 'object') return null;
    return j;
  } catch {
    return null;
  }
}

/* 짧은 설명 — "동청 DCJZ 2060ADM · 3단계 · 11.09 14:20" */
export function describe(snap) {
  const p = snap.project || {};
  const name = [p.input?.brand, p.input?.name].filter((s) => String(s || '').trim()).join(' ') || '이름 없는 작업';
  const step = p.handoff ? '편집·저장 전용' : p.step ? `${p.step}단계` : '';
  let when = '';
  const d = new Date(snap.savedAt);
  if (!Number.isNaN(d.getTime())) {
    when = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  return [name, step, when].filter(Boolean).join(' · ');
}

/* ---------- 자동 저장 ---------- */
let timer = null;
let lastSig = '';
/* 잦은 입력마다 수 MB 를 직렬화하지 않으려고 1.5초 모아서 한 번 */
export function scheduleAutosave(P) {
  clearTimeout(timer);
  timer = setTimeout(() => autosave(P), 1500);
}
export async function autosave(P) {
  clearTimeout(timer);
  const snap = snapshot(P);
  if (!hasWork(snap.project)) return;
  /* 그대로면 쓰지 않는다 — 길이와 단계와 섹션 수로 싸게 본다 */
  const body = JSON.stringify(snap.project);
  const sig = `${body.length}:${snap.project.step}:${body.slice(0, 2000)}`;
  if (sig === lastSig) return;
  lastSig = sig;
  try { await put(snap); } catch { /* 저장소가 막힌 환경 — 조용히 */ }
}
export async function loadAutosave() {
  try {
    const v = await get();
    return v && parseSnapshot(v) && hasWork(v.project) ? v : null;
  } catch {
    return null;
  }
}

/* ---------- 파일 ---------- */
export function fileName(snap) {
  const p = snap.project || {};
  const base = [p.input?.brand, p.input?.name].filter((s) => String(s || '').trim()).join('-').replace(/[\\/:*?"<>|]+/g, '') || '상세페이지-작업';
  const d = new Date(snap.savedAt);
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${base}-${ymd}${p.handoff ? '-편집용' : ''}.json`;
}

/* 내려받기. 막힌 창에서는 false — 그러면 클립보드로 */
export function download(snap) {
  try {
    const blob = new Blob([JSON.stringify(snap)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(snap);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export async function copyToClipboard(snap) {
  const text = JSON.stringify(snap);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* 권한이 없으면 옛 방식 */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const readText = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result || ''));
  fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
  fr.readAsText(file);
});
