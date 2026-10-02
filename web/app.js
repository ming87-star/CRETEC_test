/* 미리보기 화면 */

import { PRESETS, PRESET_KEYS } from '/src/presets.js';
import { renderPage } from '/src/render.js';
import { sampleDoc, SECTION_TYPES, GRADES } from '/src/sections.js';
import { analyzeLogoFile } from '/src/brand.js';
import { listBrands, loadBrand, saveBrand } from '/src/brandlib.js';

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

/* ---------- 브랜드 ---------- */
/* 마지막으로 뽑은 분석 결과. 색 후보를 다시 그릴 때 쓴다. */
let logoInfo = null;

function paintBrandPanel() {
  const lg = doc.product.logo;
  const prev = q('logoPrev');
  prev.classList.toggle('on', !!(lg && lg.url));
  prev.innerHTML = lg && lg.url ? `<img src="${lg.url}" alt="">` : '';
  q('logoHint').textContent = lg && lg.url
    ? '다른 파일로 바꾸려면 다시 누르세요'
    : '로고 파일을 끌어다 놓거나 눌러서 고르세요';

  const sw = logoInfo && logoInfo.swatches ? logoInfo.swatches : [];
  q('swatches').innerHTML = sw.map((s) =>
    `<button class="sw${s.hex === doc.keyColor ? ' on' : ''}" data-hex="${s.hex}"
       style="background:${s.hex}" title="${s.hex} · 로고 면적의 ${(s.ratio * 100).toFixed(1)}%"></button>`
  ).join('');

  const widest = sw[0];
  q('brandNote').innerHTML = logoInfo
    ? `쓰는 색 <b>${doc.keyColor}</b><br>` +
      (widest && widest.hex !== doc.keyColor
        ? `면적으로는 <b>${widest.hex}</b> 가 가장 넓지만 브랜드 색으로는 채도가 높은 쪽을 먼저 제안합니다. `
        : '') +
      '다른 색을 쓰려면 눌러서 바꾸세요.'
    : '';
}

async function useLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  try {
    const info = await analyzeLogoFile(file);
    if (info.empty) {
      q('brandNote').textContent = '칠해진 부분이 없는 이미지입니다. 다른 파일을 올려 주세요.';
      return;
    }
    const url = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
      fr.readAsDataURL(file);
    });

    logoInfo = info;
    doc.product.logo = { url, dark: info.dark, trim: info.trim, natural: info.natural };
    if (info.key) doc.keyColor = info.key;

    rememberBrand();
    paint();
    paintBrandPanel();
  } catch (err) {
    q('brandNote').textContent = err.message;
  }
}

function rememberBrand() {
  const name = doc.product.brand;
  if (!name) return;
  const ok = saveBrand({
    name,
    logo: doc.product.logo || null,
    keyColor: doc.keyColor,
    swatches: logoInfo ? logoInfo.swatches : []
  });
  if (!ok) {
    q('brandNote').textContent =
      '브랜드는 적용했지만 보관함에 담지 못했습니다. 브라우저 저장 공간이 찼습니다.';
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
  if (saved) {
    /* 전에 쓰던 브랜드 — 로고와 색을 그대로 불러온다 */
    doc.product.logo = saved.logo || null;
    if (saved.keyColor) doc.keyColor = saved.keyColor;
    logoInfo = saved.swatches && saved.swatches.length ? { swatches: saved.swatches } : null;
  }
  paint();
  paintBrandPanel();
});

const drop = q('logoDrop');
const logoFile = q('logoFile');

logoFile.addEventListener('change', () => {
  if (logoFile.files[0]) useLogoFile(logoFile.files[0]);
  logoFile.value = '';
});

['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => {
  e.preventDefault();
  drop.classList.add('over');
}));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => {
  e.preventDefault();
  drop.classList.remove('over');
}));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) useLogoFile(f);
});

q('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-hex]');
  if (!b) return;
  doc.keyColor = b.dataset.hex;
  rememberBrand();
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
   * 다만 로고에서 뽑은 브랜드 색은 유지한다 — 브랜드 색이 프리셋보다 윗길이다. */
  if (!doc.product.logo) doc.keyColor = PRESETS[doc.preset].tokens.key;
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
