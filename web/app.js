/* 네 단계 화면
 *
 *   1 입력 → 2 초안 → 3 생성 → 4 완성
 *
 * 문서 하나를 네 화면이 돌아가며 고친다. 뒤로 가도 앞에서 고친 내용은 지우지
 * 않는다 — 1단계를 다시 건드렸다고 2단계에서 쓴 문장이 날아가면 아무도 안 쓴다.
 */

import { PRESETS, PRESET_KEYS } from '/src/presets.js';
import { renderPage } from '/src/render.js';
import { SECTION_TYPES, GRADES } from '/src/sections.js';
import { measureLogoFile, productColorFromFiles } from '/src/brand.js';
import { listBrands, loadBrand, saveBrand } from '/src/brandlib.js';
import { newProject, STEPS, canDraft, missingForDraft, stripPrice } from '/src/project.js';
import { buildDraft } from '/src/draft.js';
import { buildPrompt, listSlots, fillSlot } from '/src/prompt.js';
import { CAN_EXPORT } from '/web/config.js';

const q = (n) => document.querySelector(`[data-el="${n}"]`);
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const P = newProject();

const readUrl = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(new Error('파일을 읽지 못했습니다'));
  fr.readAsDataURL(file);
});

/* ================= 단계 이동 ================= */

const NEXT_LABEL = { 1: '초안 만들기', 2: '페이지 만들기', 3: '사진 채우기', 4: '' };

function go(step) {
  P.step = Math.max(1, Math.min(4, step));
  if (P.step === 2 && !P.draft.sections.length) makeDraft();
  if (P.step >= 3) paintSheet();
  if (P.step === 4) paintSlots();
  paintShell();
}

function paintShell() {
  q('steps').innerHTML = STEPS.map((s) => {
    const state = s.no === P.step ? 'on' : s.no < P.step ? 'done' : '';
    return `<li class="${state}"><b>${s.no}</b>${s.label}</li>`;
  }).join('');

  document.querySelectorAll('.step').forEach((el) => {
    el.hidden = Number(el.dataset.step) !== P.step;
  });

  q('back').hidden = P.step === 1;
  q('next').hidden = P.step === 4;
  q('next').textContent = NEXT_LABEL[P.step];
  q('next').disabled = P.step === 1 && !canDraft(P.input);

  const t = [P.input.brand, P.input.name, P.input.code].filter(Boolean).join(' · ');
  q('docTitle').textContent = t;
}

q('next').addEventListener('click', () => go(P.step + 1));
q('back').addEventListener('click', () => go(P.step - 1));

/* ================= 1 입력 ================= */

q('feats').innerHTML = P.input.features.map((_, i) =>
  `<label class="feat"><span>${i + 1}</span>
     <input class="txt" data-feat="${i}" placeholder="특징 ${i + 1}" autocomplete="off"></label>`
).join('');

q('feats').addEventListener('input', (e) => {
  const i = e.target.dataset.feat;
  if (i === undefined) return;
  P.input.features[Number(i)] = e.target.value;
  paintInput();
});

q('brandName').addEventListener('input', (e) => { P.input.brand = e.target.value; paintInput(); });
q('prodName').addEventListener('input', (e) => { P.input.name = e.target.value; paintInput(); });
q('prodCode').addEventListener('input', (e) => { P.input.code = e.target.value; paintInput(); });

q('brandName').addEventListener('change', (e) => {
  const saved = loadBrand(e.target.value.trim());
  if (saved && saved.logo) P.input.logo = saved.logo;
  paintInput();
});

function paintInput() {
  const n = P.input.features.filter((f) => f.trim()).length;
  q('featCount').textContent = `${n} / 5`;
  q('shotCount').textContent = `${P.input.shots.length}장`;

  const lg = P.input.logo;
  q('logoPrev').classList.toggle('on', !!lg);
  q('logoPrev').innerHTML = lg ? `<img src="${lg.url}" alt="">` : '';
  q('logoHint').textContent = lg
    ? '다른 파일로 바꾸려면 다시 누르세요'
    : '브랜드 로고 — 끌어다 놓거나 눌러서 고르세요';

  const pt = P.input.priceTable;
  q('pricePrev').classList.toggle('on', !!pt);
  q('pricePrev').innerHTML = pt ? `<img src="${pt.url}" alt="">` : '';
  q('priceHint').textContent = pt
    ? '다른 파일로 바꾸려면 다시 누르세요'
    : '카탈로그 가격표 페이지 — 끌어다 놓거나 눌러서 고르세요';

  q('shotPrev').classList.toggle('on', P.input.shots.length > 0);
  q('shotPrev').innerHTML = P.input.shots.map((s) => `<img src="${s.url}" alt="">`).join('');
  q('shotHint').textContent = P.input.shots.length
    ? '다시 누르면 새로 고릅니다'
    : '제품 사진 — 끌어다 놓거나 눌러서 고르세요 · 여러 장 가능';

  const miss = missingForDraft(P.input);
  q('inputMissing').textContent = miss.length ? `아직 없는 것 — ${miss.join(', ')}` : '';
  paintShell();
}

/* 끌어놓기 — 세 칸이 같은 방식으로 움직인다 */
function wireDrop(zone, input, handler, multiple) {
  input.addEventListener('change', () => {
    if (input.files.length) handler(multiple ? [...input.files] : input.files[0]);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (e) => {
    e.preventDefault();
    zone.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((t) => zone.addEventListener(t, (e) => {
    e.preventDefault();
    zone.classList.remove('over');
  }));
  zone.addEventListener('drop', (e) => {
    const fs = e.dataTransfer && [...e.dataTransfer.files];
    if (fs && fs.length) handler(multiple ? fs : fs[0]);
  });
}

wireDrop(q('logoDrop'), q('logoFile'), async (f) => {
  if (!f.type.startsWith('image/')) return;
  const m = await measureLogoFile(f);
  if (m.empty) return;
  P.input.logo = { url: await readUrl(f), dark: m.dark, trim: m.trim, natural: m.natural };
  const name = P.input.brand.trim();
  if (name) { saveBrand({ name, logo: P.input.logo }); paintBrandList(); }
  paintInput();
}, false);

wireDrop(q('priceDrop'), q('priceFile'), async (f) => {
  if (!f.type.startsWith('image/')) return;
  P.input.priceTable = { url: await readUrl(f) };
  paintInput();
}, false);

wireDrop(q('shotDrop'), q('shotFile'), async (fs) => {
  const list = fs.filter((f) => f.type.startsWith('image/'));
  if (!list.length) return;
  P.input.shots = await Promise.all(list.slice(0, 8).map(async (f) => ({ url: await readUrl(f) })));
  P.input.shotFiles = list;
  paintInput();
}, true);

function paintBrandList() {
  document.getElementById('brandList').innerHTML = listBrands()
    .map((b) => `<option value="${esc(b.name)}">`).join('');
}

/* ================= 2 초안 ================= */

async function makeDraft() {
  P.draft.sections = buildDraft(P.input, P.draft.specRows);

  if (P.input.shotFiles && P.input.shotFiles.length) {
    const info = await productColorFromFiles(P.input.shotFiles);
    if (!info.empty && info.key) {
      P.draft.candidates = info.swatches;
      P.draft.keyColor = info.key;
      P.draft.colorAdjusted = info.adjusted;
    }
  }
  paintDraft();
}

function paintDraft() {
  const cs = P.draft.candidates;
  q('swatches').innerHTML = cs.map((s) =>
    `<button class="sw${s.hex === P.draft.keyColor ? ' on' : ''}" data-hex="${s.hex}"
       style="background:${s.hex}"><small>${s.hex}</small></button>`).join('');

  q('colorNote').innerHTML = cs.length
    ? `제품 사진에서 뽑은 후보 ${cs.length}개입니다. 지금 쓰는 색은 <b>${P.draft.keyColor}</b>.` +
      (P.draft.colorAdjusted
        ? ' 사진에서 잰 색이 큰 면으로 깔기엔 어두워서 밝기만 당겼습니다.' : '')
    : '제품 사진이 없어 후보를 뽑지 못했습니다.';

  q('preset').innerHTML = PRESET_KEYS
    .map((k) => `<option value="${k}">${PRESETS[k].name}</option>`).join('');
  q('preset').value = P.draft.preset;
  q('presetNote').textContent = PRESETS[P.draft.preset].for;

  const counts = {};
  q('secCount').textContent = `${P.draft.sections.length}개`;
  q('editor').innerHTML = P.draft.sections.map((s, i) => {
    counts[s.grade] = (counts[s.grade] || 0) + 1;
    const g = GRADES[s.grade] || GRADES.draft;
    const label = SECTION_TYPES[s.type]?.label || s.type;
    return `<div class="sec" data-i="${i}">
      <div class="sec-head">
        <span class="dot ${g.tone}" title="${g.label}"></span>
        <span class="sec-name">${label}${s.type === 'point' ? ` ${s.data.no}` : ''}</span>
        <span class="sec-move">
          <button data-move="-1" title="위로"${i === 0 ? ' disabled' : ''}>↑</button>
          <button data-move="1" title="아래로"${i === P.draft.sections.length - 1 ? ' disabled' : ''}>↓</button>
        </span>
      </div>
      ${editableFields(s, i)}
    </div>`;
  }).join('');

  q('grades').innerHTML = Object.entries(GRADES).map(([k, g]) =>
    `<div class="grade"><span class="dot ${g.tone}"></span>${g.label}<b>${counts[k] || 0}</b></div>`
  ).join('');

  const drafts = counts.draft || 0;
  q('draftHint').textContent = drafts
    ? `초안 ${drafts}개가 아직 작성자 손을 거치지 않았습니다.`
    : '';
}

/* 섹션마다 고칠 수 있는 글자 칸을 만든다 */
const FIELDS = {
  hero: [['eyebrow', '윗줄'], ['title', '제목']],
  problem: [['kicker', '윗줄'], ['headline', '제목']],
  solutionIntro: [['eyebrow', '윗줄'], ['headline', '제목']],
  featuresGrid: [['headline', '제목']],
  coreSolution: [['specLine', '윗줄'], ['headline', '제목']],
  point: [['headline', '제목']],
  compare: [['headline', '제목'], ['desc', '설명']],
  cert: [['headline', '제목'], ['note', '안내']],
  usecase: [['headline', '제목']],
  recommend: [['headline', '제목']],
  spec: [['headline', '제목']],
  care: [['headline', '제목']],
  faq: [['headline', '제목']],
  aiNotice: [['text', '문구']]
};

/* 줄바꿈이 든 글은 한 줄짜리 칸에 넣으면 잘려 보인다 */
const rowsFor = (v) => String(v || '').split('\n').length;

function editableFields(s, i) {
  const fs = FIELDS[s.type] || [];
  const rows = fs.map(([k, label]) =>
    `<label class="fl"><span>${label}</span>
      <textarea data-i="${i}" data-k="${k}" rows="${rowsFor(s.data[k])}"
        placeholder="${label}">${esc(s.data[k] || '')}</textarea></label>`).join('');

  /* 특장점 목록과 사용 장면은 항목이 여러 개라 따로 그린다 */
  const items = (s.data.items || []).map((it, j) => {
    if (typeof it === 'string') {
      return `<label class="fl sub"><span>${j + 1}</span>
        <textarea data-i="${i}" data-item="${j}" data-k="." rows="${rowsFor(it)}">${esc(it)}</textarea></label>`;
    }
    return Object.entries({ label: '', title: '제목', desc: '설명' })
      .filter(([k]) => k in it)
      .map(([k, lab]) => `<label class="fl sub"><span>${lab || j + 1}</span>
        <textarea data-i="${i}" data-item="${j}" data-k="${k}" rows="${rowsFor(it[k])}">${esc(it[k] || '')}</textarea></label>`)
      .join('');
  }).join('');

  return rows + items;
}

q('editor').addEventListener('input', (e) => {
  const t = e.target;
  if (t.tagName !== 'TEXTAREA') return;
  const s = P.draft.sections[Number(t.dataset.i)];
  const item = t.dataset.item;
  if (item === undefined) {
    s.data[t.dataset.k] = t.value;
  } else if (t.dataset.k === '.') {
    s.data.items[Number(item)] = t.value;
  } else {
    s.data.items[Number(item)][t.dataset.k] = t.value;
  }
  /* 사람이 손댄 문장은 더 이상 초안이 아니다 */
  if (s.grade === 'draft') {
    s.grade = 'author';
    paintGradesOnly();
  }
});

function paintGradesOnly() {
  const counts = {};
  for (const s of P.draft.sections) counts[s.grade] = (counts[s.grade] || 0) + 1;
  q('grades').innerHTML = Object.entries(GRADES).map(([k, g]) =>
    `<div class="grade"><span class="dot ${g.tone}"></span>${g.label}<b>${counts[k] || 0}</b></div>`
  ).join('');
  q('draftHint').textContent = counts.draft
    ? `초안 ${counts.draft}개가 아직 작성자 손을 거치지 않았습니다.` : '';
  q('editor').querySelectorAll('.sec').forEach((el, i) => {
    const g = GRADES[P.draft.sections[i].grade] || GRADES.draft;
    const dot = el.querySelector('.dot');
    dot.className = `dot ${g.tone}`;
    dot.title = g.label;
  });
}

q('editor').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-move]');
  if (!b) return;
  const i = Number(b.closest('.sec').dataset.i);
  const j = i + Number(b.dataset.move);
  if (j < 0 || j >= P.draft.sections.length) return;
  const arr = P.draft.sections;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renumberPoints();
  paintDraft();
});

/* 포인트 번호는 자리 순서를 따른다 */
function renumberPoints() {
  let n = 0;
  for (const s of P.draft.sections) if (s.type === 'point') s.data.no = ++n;
}

q('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-hex]');
  if (!b) return;
  P.draft.keyColor = b.dataset.hex;
  paintDraft();
});

q('preset').addEventListener('change', (e) => {
  P.draft.preset = e.target.value;
  q('presetNote').textContent = PRESETS[P.draft.preset].for;
});

/* ================= 3 생성 ================= */

/* 렌더러에 넘길 모양으로 바꾼다. 사진이 아직 없으면 그 자리에 프롬프트를 넣는다. */
function renderDoc() {
  const sections = P.draft.sections.map((s) => ({
    ...s,
    data: withPrompts(s.data)
  }));
  return {
    product: {
      brand: P.input.brand,
      brandMark: P.input.brand,
      name: P.input.name,
      model: P.input.name,
      code: P.input.code,
      logo: P.input.logo
    },
    preset: P.draft.preset,
    keyColor: P.draft.keyColor,
    width: P.width,
    sections
  };
}

function withPrompts(data) {
  const prod = { brand: P.input.brand, name: P.input.name, code: P.input.code };
  const fix = (v) => (v && v.slot ? { ...v, prompt: buildPrompt(v, prod) } : v);
  const out = { ...data, image: fix(data.image) };
  if (data.items) out.items = data.items.map((it) =>
    it && typeof it === 'object' && it.image ? { ...it, image: fix(it.image) } : it);
  if (data.rows) out.rows = stripPrice(data.rows);
  return out;
}

let fontLink = null;

function paintSheet() {
  const { fontLink: href, css, html } = renderPage(renderDoc());
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
  q('dims').textContent = `${P.width}px · ${P.draft.sections.length}섹션`;
}

q('platform').addEventListener('change', (e) => {
  P.width = { naver: 860, coupang: 780, toss: 1080 }[e.target.value] || 860;
  paintSheet();
});

q('zoom').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-z]');
  if (!b) return;
  q('zoom').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  q('zoomwrap').style.transform = `scale(${b.dataset.z})`;
});

/* ================= 4 완성 ================= */

function paintSlots() {
  const slots = listSlots(P.draft.sections);
  const prod = { brand: P.input.brand, name: P.input.name, code: P.input.code };
  const filled = slots.filter((s) => s.filled).length;
  q('slotCount').textContent = `${filled}/${slots.length} 채움`;

  q('slots').innerHTML = slots.map((s) => `
    <div class="shot${s.filled ? ' filled' : ''}" data-path="${s.path}">
      <div class="shot-head">
        <span class="dot ${s.filled ? 'ok' : 'alert'}"></span>
        <b>${esc(s.img.label)}</b>
        <button class="btn mini js-copy">프롬프트 복사</button>
        <label class="btn mini">${s.filled ? '사진 바꾸기' : '사진 올리기'}
          <input type="file" accept="image/*" class="js-fill" hidden></label>
      </div>
      ${s.filled
        ? `<div class="shot-done"><img src="${s.img.url}" alt=""></div>`
        : `<pre class="prompt">${esc(buildPrompt(s.img, prod))}</pre>`}
    </div>`).join('');
}

q('slots').addEventListener('click', async (e) => {
  const copy = e.target.closest('.js-copy');
  if (!copy) return;
  const pre = copy.closest('.shot').querySelector('.prompt');
  try {
    await navigator.clipboard.writeText(pre.textContent);
    copy.textContent = '복사했습니다';
    setTimeout(() => { copy.textContent = '프롬프트 복사'; }, 1400);
  } catch {
    const r = document.createRange();
    r.selectNodeContents(pre);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    copy.textContent = '직접 복사하세요';
  }
});

q('slots').addEventListener('change', async (e) => {
  if (!e.target.classList.contains('js-fill')) return;
  const f = e.target.files[0];
  if (!f || !f.type.startsWith('image/')) return;
  const path = e.target.closest('.shot').dataset.path;
  fillSlot(P.draft.sections, path, await readUrl(f));
  paintSheet();
  paintSlots();
});

if (!CAN_EXPORT) {
  q('export').disabled = true;
  q('result').innerHTML =
    '<p class="hint">이 화면은 미리보기 전용입니다. 내보내기는 섹션마다 헤드리스 ' +
    '브라우저로 찍는 일이라 서버에서 실행할 때만 됩니다. <code>npm start</code> 로 띄우면 쓸 수 있습니다.</p>';
}

q('export').addEventListener('click', async () => {
  const btn = q('export');
  btn.disabled = true;
  btn.textContent = '내보내는 중…';
  q('result').textContent = '헤드리스 브라우저로 찍는 중입니다…';
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: renderDoc(),
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
      `<div class="row"><span>저장 위치</span><b>${r.outDir}/</b></div>`,
      r.warning ? `<p class="hint">${r.warning}</p>` : ''
    ].join('');
  } catch (err) {
    q('result').innerHTML = `<p class="hint">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '이미지로 내보내기';
  }
});

/* ================= 시작 ================= */
paintBrandList();
paintInput();
go(1);
