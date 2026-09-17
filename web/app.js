/* 미리보기 화면 */

import { PRESETS, PRESET_KEYS } from '/src/presets.js';
import { renderPage } from '/src/render.js';
import { sampleDoc, SECTION_TYPES, GRADES } from '/src/sections.js';

const q = (n) => document.querySelector(`[data-el="${n}"]`);
const doc = sampleDoc();

/* 프리셋마다 웹폰트가 달라서 <link> 를 갈아끼운다 */
let fontLink = null;

function paint() {
  const { fontLink: href, css, html } = renderPage(doc);

  if (!fontLink) {
    fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    document.head.appendChild(fontLink);
  }
  if (fontLink.href !== href) fontLink.href = href;

  let style = document.getElementById('sheet-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'sheet-style';
    document.head.appendChild(style);
  }
  style.textContent = css;

  q('paper').innerHTML = html;
  q('dims').textContent = `${doc.width}px · ${doc.sections.length}섹션`;
  q('docTitle').textContent = `${doc.product.brand} ${doc.product.model} · ${doc.product.code}`;
}

function paintSideBar() {
  const counts = {};
  q('secCount').textContent = doc.sections.length;

  q('secList').innerHTML = doc.sections.map((s, i) => {
    const g = GRADES[s.grade] || GRADES.draft;
    counts[s.grade] = (counts[s.grade] || 0) + 1;
    const label = SECTION_TYPES[s.type]?.label || s.type;
    const extra = s.type === 'point' ? ` ${s.data.no}` : '';
    return `<li data-i="${i}" title="${g.label}">
      <span class="dot ${g.tone}"></span>
      <span class="nm">${label}${extra}</span>
    </li>`;
  }).join('');

  q('grades').innerHTML = Object.entries(GRADES).map(([k, g]) =>
    `<div class="grade"><span class="dot ${g.tone}"></span>${g.label}<b>${counts[k] || 0}</b></div>`
  ).join('');

  const drafts = counts.draft || 0;
  q('draftHint').textContent = drafts
    ? `초안 ${drafts}개가 아직 작성자 손을 거치지 않았습니다.`
    : '';
}

/* ---------- 조작 ---------- */
q('preset').innerHTML = PRESET_KEYS
  .map((k) => `<option value="${k}">${PRESETS[k].name}</option>`).join('');
q('preset').value = doc.preset;

q('preset').addEventListener('change', (e) => {
  doc.preset = e.target.value;
  /* 프리셋을 바꾸면 그 프리셋의 키 색으로 돌아간다 */
  doc.keyColor = PRESETS[doc.preset].tokens.key;
  paint();
});

q('platform').addEventListener('change', (e) => {
  const w = { naver: 860, coupang: 780, toss: 1080 }[e.target.value] || 860;
  doc.width = w;
  paint();
});

q('zoom').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-z]');
  if (!b) return;
  q('zoom').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  q('zoomwrap').style.transform = `scale(${b.dataset.z})`;
});

q('secList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  const el = q('paper').querySelector(`.pg[data-i="${li.dataset.i}"]`);
  if (!el) return;
  q('paper').querySelectorAll('.pg.hi').forEach((x) => x.classList.remove('hi'));
  el.classList.add('hi');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

q('export').addEventListener('click', async () => {
  const btn = q('export');
  btn.disabled = true;
  btn.textContent = '내보내는 중…';
  q('exportBox').hidden = false;
  q('result').textContent = '헤드리스 브라우저로 찍는 중입니다…';

  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc,
        platform: q('platform').value,
        quality: q('quality').value,
        merge: q('merge').checked
      })
    });
    const r = await res.json();
    if (r.error) throw new Error(r.error);

    q('result').innerHTML = [
      `<div class="row"><span>${r.platform}</span><b>${r.width}px</b></div>`,
      `<div class="row"><span>페이지</span><b>${r.pages}장</b></div>`,
      `<div class="row"><span>전체 높이</span><b>${r.totalHeight.toLocaleString()}px</b></div>`,
      r.merged ? `<div class="row"><span>합본</span><b>${(r.merged.bytes / 1048576).toFixed(1)}MB</b></div>` : '',
      `<div class="row"><span>저장 위치</span><b>${r.outDir}/</b></div>`,
      r.warning ? `<p class="hint">${r.warning}</p>` : ''
    ].join('');
  } catch (err) {
    q('result').innerHTML = `<p class="hint">${err.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '내보내기';
  }
});

paint();
paintSideBar();
