/* 미리보기 화면 */

import { PRESETS, PRESET_KEYS } from '/src/presets.js';
import { renderPage } from '/src/render.js';
import { sampleDoc, SECTION_TYPES, GRADES } from '/src/sections.js';
import { measureLogoFile, productColorFromFiles } from '/src/brand.js';
import { listBrands, loadBrand, saveBrand } from '/src/brandlib.js';
import { CAN_EXPORT } from '/web/config.js';

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

/* ---------- 브랜드와 대표색 ---------- */
/*
 * 로고는 히어로에 앉히는 데만 쓴다. 색은 제품 사진에서 뽑는다.
 * 로고 색은 브랜드의 색이지 이 제품의 색이 아니라서, 사진과 페이지가 따로 논다.
 */
let colorInfo = null;   /* 마지막 추출 결과 — 후보를 다시 그릴 때 쓴다 */
let shotUrls = [];      /* 올린 제품 사진 미리보기 */

const readUrl = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
  fr.readAsDataURL(file);
});

function paintBrandPanel() {
  const lg = doc.product.logo;
  const prev = q('logoPrev');
  prev.classList.toggle('on', !!(lg && lg.url));
  prev.innerHTML = lg && lg.url ? `<img src="${lg.url}" alt="">` : '';
  q('logoHint').textContent = lg && lg.url
    ? '다른 파일로 바꾸려면 다시 누르세요'
    : '로고 파일을 끌어다 놓거나 눌러서 고르세요';

  const shots = q('shotPrev');
  shots.classList.toggle('on', shotUrls.length > 0);
  shots.innerHTML = shotUrls.map((u) => `<img src="${u}" alt="">`).join('');
  q('shotHint').textContent = shotUrls.length
    ? `${shotUrls.length}장에서 뽑았습니다. 다시 누르면 새로 고릅니다`
    : '제품 사진을 끌어다 놓거나 눌러서 고르세요 · 여러 장 가능';

  const sw = colorInfo && colorInfo.swatches ? colorInfo.swatches : [];
  q('swatches').innerHTML = sw.map((s) =>
    `<button class="sw${s.hex === doc.keyColor ? ' on' : ''}" data-hex="${s.hex}"
       style="background:${s.hex}"
       title="${s.hex} · 제품 면적의 ${(s.share * 100).toFixed(1)}%"></button>`
  ).join('');

  if (!colorInfo) { q('brandNote').textContent = ''; return; }

  const widest = sw[0];
  q('brandNote').innerHTML =
    `쓰는 색 <b>${doc.keyColor}</b><br>` +
    (widest && widest.hex !== doc.keyColor
      ? `면적으로는 <b>${widest.hex}</b> 가 가장 넓지만 대표색으로는 채도가 높은 쪽을 먼저 제안합니다. `
      : '') +
    (colorInfo.adjusted
      ? '사진에서 잰 색이 큰 면으로 깔기엔 어두워서 밝기만 당겼습니다. '
      : '') +
    '다른 색을 쓰려면 눌러서 바꾸세요.';
}

/* 제품 사진 → 대표색 */
async function useShotFiles(files) {
  const list = [...files].filter((f) => f && f.type.startsWith('image/'));
  if (!list.length) return;
  try {
    const info = await productColorFromFiles(list);
    if (info.empty || !info.key) {
      q('brandNote').textContent =
        '제품으로 볼 만한 부분이 없습니다. 배경만 찍힌 사진인지 확인해 주세요.';
      return;
    }
    shotUrls = await Promise.all(list.slice(0, 8).map(readUrl));
    colorInfo = info;
    doc.keyColor = info.key;
    paint();
    paintBrandPanel();
  } catch (err) {
    q('brandNote').textContent = err.message;
  }
}

/* 로고 → 히어로에 앉힐 자리 */
async function useLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    const m = await measureLogoFile(file);
    if (m.empty) {
      q('brandNote').textContent = '칠해진 부분이 없는 이미지입니다. 다른 파일을 올려 주세요.';
      return;
    }
    const url = await readUrl(file);
    doc.product.logo = { url, dark: m.dark, trim: m.trim, natural: m.natural };
    rememberBrand();
    paint();
    paintBrandPanel();
  } catch (err) {
    q('brandNote').textContent = err.message;
  }
}

/* 보관함에는 로고만 담는다. 대표색은 제품마다 달라서 브랜드에 묶을 수 없다. */
function rememberBrand() {
  const name = doc.product.brand;
  if (!name || !doc.product.logo) return;
  if (!saveBrand({ name, logo: doc.product.logo })) {
    q('brandNote').textContent =
      '로고는 적용했지만 보관함에 담지 못했습니다. 브라우저 저장 공간이 찼습니다.';
  }
  paintBrandList();
}

function paintBrandList() {
  document.getElementById('brandList').innerHTML = listBrands()
    .map((b) => `<option value="${b.name}">`).join('');
}

q('brandName').value = doc.product.brand || '';
paintBrandList();

q('brandName').addEventListener('change', (e) => {
  const name = e.target.value.trim();
  doc.product.brand = name;
  const saved = loadBrand(name);
  /* 전에 쓰던 브랜드면 로고를 그대로 불러온다. 색은 건드리지 않는다. */
  if (saved && saved.logo) doc.product.logo = saved.logo;
  paint();
  paintBrandPanel();
});

/* 끌어놓기 — 로고 칸과 사진 칸이 같은 방식으로 움직인다 */
function wireDrop(zoneEl, inputEl, handler, multiple) {
  inputEl.addEventListener('change', () => {
    if (inputEl.files.length) handler(multiple ? inputEl.files : inputEl.files[0]);
    inputEl.value = '';
  });
  ['dragenter', 'dragover'].forEach((t) => zoneEl.addEventListener(t, (e) => {
    e.preventDefault();
    zoneEl.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((t) => zoneEl.addEventListener(t, (e) => {
    e.preventDefault();
    zoneEl.classList.remove('over');
  }));
  zoneEl.addEventListener('drop', (e) => {
    const fs = e.dataTransfer && e.dataTransfer.files;
    if (fs && fs.length) handler(multiple ? fs : fs[0]);
  });
}

wireDrop(q('logoDrop'), q('logoFile'), useLogoFile, false);
wireDrop(q('shotDrop'), q('shotFile'), useShotFiles, true);

q('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-hex]');
  if (!b) return;
  doc.keyColor = b.dataset.hex;
  paint();
  paintBrandPanel();
});

/* ---------- 조작 ---------- */
q('preset').innerHTML = PRESET_KEYS
  .map((k) => `<option value="${k}">${PRESETS[k].name}</option>`).join('');
q('preset').value = doc.preset;

q('preset').addEventListener('change', (e) => {
  doc.preset = e.target.value;
  /* 프리셋을 바꾸면 그 프리셋의 키 색으로 돌아간다.
   * 다만 제품 사진에서 뽑은 대표색은 유지한다 — 제품 색이 프리셋보다 윗길이다. */
  if (!colorInfo) doc.keyColor = PRESETS[doc.preset].tokens.key;
  paint();
  paintBrandPanel();
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

/* 서버가 없는 판에서는 내보내기를 잠근다. 눌렀다가 조용히 실패하는 것보다 낫다. */
if (!CAN_EXPORT) {
  q('export').disabled = true;
  q('export').title = '서버에서 실행할 때만 쓸 수 있습니다';
  q('exportBox').hidden = false;
  q('result').innerHTML =
    '<p class="hint">이 화면은 미리보기 전용입니다. 내보내기는 섹션마다 ' +
    '헤드리스 브라우저로 찍는 일이라 서버에서 실행할 때만 됩니다.<br>' +
    '<code>npm start</code> 로 띄우면 쓸 수 있습니다.</p>';
}

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
paintBrandPanel();
