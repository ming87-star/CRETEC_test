/* 네 단계 화면
 *
 *   1 입력 → 2 초안 → 3 사진 생성·편집 → 4 저장
 *
 * 3단계가 작업대다. 사진·아이콘을 채우고 페이지를 고치는 일이 전부 여기서 끝나고,
 * 4단계는 고치지 않고 이미지로 저장만 한다.
 *
 * 문서 하나를 네 화면이 돌아가며 고친다. 뒤로 가도 앞에서 고친 내용은 지우지
 * 않는다 — 1단계를 다시 건드렸다고 2단계에서 쓴 문장이 날아가면 아무도 안 쓴다.
 */

import { PRESETS, PRESET_KEYS, FONT_CHOICES, fontsUrl } from '/src/presets.js';
import { renderPage, darkBg } from '/src/render.js';
import { SECTION_TYPES, GRADES } from '/src/sections.js';
import { measureLogoFile, productColorFromFiles } from '/src/brand.js';
import { listBrands, loadBrand, saveBrand } from '/src/brandlib.js';
import { newProject, STEPS, canDraft, missingForDraft, stripPrice, isPriceRow } from '/src/project.js';
import { buildDraft, buildFromPlan } from '/src/draft.js';
import { buildFacts, flagsFor } from '/src/plan.js';
import { detectTransport, readCatalog, planPage, errorCopy } from '/src/ai.js';
import { listSlots } from '/src/prompt.js';
import { createEditor } from '/web/editor.js';
import { freezeSections } from '/web/freeze.js';
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

/* 올린 사진은 긴 변 2400px 로 줄여서 쓴다. 휴대폰 사진(5MB 안팎)을 그대로 두면
 * 문서와 내보내기 요청이 수십 MB 가 되고, 페이지를 다시 그릴 때마다 느려진다.
 * PNG 는 PNG 로 둔다(아이콘이 투명 배경일 수 있다). */
async function shrinkImage(file, maxSide = 2400) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('이미지를 읽지 못했습니다'));
      i.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
    /* 끌어오거나 붙여 넣은 사진은 avif · svg 같은 꼴일 수 있다. 페이지에 넣을 수 있는 꼴로 바꾼다. */
    if (k === 1 && file.size < 1.5e6 && /^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return readUrl(file);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(im.naturalWidth * k));
    cv.height = Math.max(1, Math.round(im.naturalHeight * k));
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return file.type === 'image/png' ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ================= 단계 이동 ================= */

const NEXT_LABEL = { 1: '초안 만들기', 2: '사진 생성·편집으로', 3: '이미지로 저장하기', 4: '' };

const hasDraft = () => P.draft.sections.length > 0;

/* 갈 수 있는 단계인가. 뒤로는 언제나. 앞으로는 거기까지 갈 재료가 있을 때만. */
function reachable(n) {
  if (n <= P.step) return true;
  if (n === 2) return canDraft(P.input);
  return hasDraft();
}

function go(step) {
  P.step = Math.max(1, Math.min(4, step));
  if (P.step === 2) {
    if (!hasDraft() && !planning) makeDraft();
    else {
      paintDraft(); /* 3단계에서 고친 글이 2단계 칸에도 보여야 한다 */
      if (P.draft.colorSig !== shotsSig()) refreshColors().then(paintDraft); /* 사진을 더하거나 뺐다 */
    }
  }
  if (P.step >= 3) ensureFonts();
  /* 화면 전환을 먼저 한다. 페이지를 그리다 실패해도 사용자가 다음 화면에 있어야 한다. */
  paintShell();
  if (P.step >= 3) paintSheet();
}

/* 상단 단계 표시를 눌러 그 단계로 간다 */
function goTo(n) {
  if (n === P.step) return;
  if (!reachable(n)) {
    if (n === 2) {
      const miss = missingForDraft(P.input);
      q('inputMissing').textContent = miss.length ? `초안을 만들려면 먼저 — ${miss.join(', ')}` : '';
    }
    return;
  }
  go(n);
}

q('steps').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-go]');
  if (li) goTo(Number(li.dataset.go));
});
q('steps').addEventListener('keydown', (e) => {
  const li = e.target.closest('li[data-go]');
  if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goTo(Number(li.dataset.go)); }
});

function paintShell() {
  q('steps').innerHTML = STEPS.map((s) => {
    const state = s.no === P.step ? 'on' : s.no < P.step ? 'done' : '';
    const lock = reachable(s.no) ? '' : ' locked';
    const why = lock ? (s.no === 2 ? ' title="입력을 먼저 채워 주세요"' : ' title="초안을 먼저 만들어 주세요"') : '';
    return `<li class="${state}${lock}" data-go="${s.no}" role="button" tabindex="0"${why}><b>${s.no}</b>${s.label}</li>`;
  }).join('');

  document.querySelectorAll('.step').forEach((el) => {
    el.hidden = Number(el.dataset.step) !== P.step;
  });

  q('back').hidden = P.step === 1;
  q('next').hidden = P.step === 4;
  q('next').textContent = NEXT_LABEL[P.step];
  q('next').disabled = (P.step === 1 && !canDraft(P.input)) ||
    (P.step === 2 && (!!planning || !hasDraft()));

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

  paintShots();

  const miss = missingForDraft(P.input);
  q('inputMissing').textContent = miss.length ? `아직 없는 것 — ${miss.join(', ')}` : '';
  paintReadBtn();
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

/* 제품 사진은 더하고 뺄 수 있다. 다시 고르면 지워지던 것을 고쳤다. */
const MAX_SHOTS = 8;

function paintShots() {
  const n = P.input.shots.length;
  q('shotThumbs').innerHTML = P.input.shots.map((s, i) => `
    <div class="thumb"><img src="${s.url}" alt="">
      <button type="button" class="x2" data-shot-del="${i}" title="이 사진 빼기">×</button></div>`).join('');
  q('shotHint').textContent = n >= MAX_SHOTS
    ? `최대 ${MAX_SHOTS}장입니다. 더 넣으려면 먼저 빼 주세요`
    : '＋ 사진 추가 — 끌어다 놓거나 눌러서 고르세요 (최대 8장)';
  q('shotDrop').classList.toggle('full', n >= MAX_SHOTS);
}

q('shotThumbs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-shot-del]');
  if (!b) return;
  P.input.shots.splice(Number(b.dataset.shotDel), 1);
  paintInput();
});

wireDrop(q('shotDrop'), q('shotFile'), async (fs) => {
  const room = MAX_SHOTS - P.input.shots.length;
  const list = fs.filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
  if (!list.length) return;
  /* 미리보기는 작게, 대표색은 원본 파일에서 뽑는다 */
  const add = await Promise.all(list.map(async (f) => ({ url: await shrinkImage(f, 600), file: f })));
  P.input.shots.push(...add);
  paintInput();
}, true);

function paintBrandList() {
  document.getElementById('brandList').innerHTML = listBrands()
    .map((b) => `<option value="${esc(b.name)}">`).join('');
}

/* ================= 1-b 가격표에서 읽기 ================= */

/* 쓸 수 있는 모델 경로. 감지가 끝나기 전에 누르는 경우를 위해 약속을 들고 있는다. */
const aiReady = detectTransport().then((t) => {
  P.ai = t;
  paintReadBtn();
  if (P.step === 2) paintPlan();
});

let reading = null; /* 읽는 중이면 AbortController */

const gradeInfo = (r) => GRADES[r.grade || 'draft'];

function paintCatalog() {
  const c = P.input.catalog;

  q('specList').innerHTML = c.specs.map((r, i) => `
    <div class="srow${isPriceRow(r) ? ' bad' : ''}">
      <span class="dot ${gradeInfo(r).tone}" title="${gradeInfo(r).label}"></span>
      <input class="txt" data-spec="${i}" data-k="label" value="${esc(r.label)}" placeholder="항목">
      <input class="txt" data-spec="${i}" data-k="value" value="${esc(r.value)}" placeholder="값">
      <button class="x" data-spec-del="${i}" title="지우기">×</button>
    </div>`).join('');

  q('cfeatList').innerHTML = (c.features.length ? '' : '<p class="note">읽은 특징이 없습니다. 가격표에 인쇄된 특징 문구가 없는 제품일 수 있습니다.</p>') + c.features.map((f, i) => `
    <div class="srow">
      <input class="txt" data-cfeat="${i}" value="${esc(f)}" placeholder="특징">
      <button class="x" data-cfeat-del="${i}" title="지우기">×</button>
    </div>`).join('');

  q('specCount').textContent = `사양 ${c.specs.length}줄 · 특징 ${c.features.length}`;
  q('readNotes').innerHTML = c.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  q('specVerify').hidden = !c.specs.some((r) => (r.grade || 'draft') === 'draft');
  paintReadBtn();
  paintShell();
}

function paintReadBtn() {
  const btn = q('readBtn');
  const c = P.input.catalog;
  let why = '';
  if (!P.input.priceTable) why = '가격표 페이지를 먼저 올려 주세요.';
  else if (!P.ai) why = '이 화면에서는 모델을 쓸 수 없습니다. 사양을 직접 입력해 주세요.';
  else if (!P.input.name.trim() && !P.input.code.trim()) why = '제품명이나 상품코드가 있어야 표에서 행을 찾습니다.';

  if (reading) {
    btn.textContent = '멈추기';
    btn.disabled = false;
    q('readState').textContent = `${P.ai.label} 로 읽는 중입니다. 10~60초 걸립니다.`;
    return;
  }
  btn.textContent = c.specs.length ? '다시 읽기' : '가격표에서 읽기';
  btn.disabled = !!why;
  q('readState').textContent = c.state || why;
}

q('readBtn').addEventListener('click', async () => {
  if (reading) { reading.abort(); return; }
  const c = P.input.catalog;
  reading = new AbortController();
  c.state = '';
  paintReadBtn();

  try {
    const r = await readCatalog(P.ai, {
      image: P.input.priceTable.url,
      brand: P.input.brand, name: P.input.name, code: P.input.code,
      signal: reading.signal
    });
    c.notes = r.notes;
    if (!r.matched) {
      c.state = '가격표에서 이 제품의 행을 찾지 못했습니다. 제품명과 상품코드를 확인해 주세요.';
      return;
    }
    c.specs = r.specs.map((x) => ({ ...x, grade: 'draft' }));
    c.features = r.features;
    c.state = `${r.model || '제품'} 행을 읽었습니다. 원본과 대조해 주세요.`;

    /* 상품코드를 안 적었는데 표에서 읽었으면 채워 준다. 채웠다는 걸 말한다. */
    if (!P.input.code.trim() && r.code) {
      P.input.code = r.code;
      q('prodCode').value = r.code;
      c.state += ` 상품코드 ${r.code} 를 가져왔습니다.`;
    }
  } catch (e) {
    c.state = errorCopy(e);
  } finally {
    reading = null;
    paintCatalog();
    paintInput();
  }
});

q('specList').addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.spec === undefined) return;
  const r = P.input.catalog.specs[Number(t.dataset.spec)];
  r[t.dataset.k] = t.value;
  r.grade = 'author'; /* 사람이 고친 값 */
  const row = t.closest('.srow');
  row.classList.toggle('bad', isPriceRow(r));
  const dot = row.querySelector('.dot');
  dot.className = `dot ${GRADES.author.tone}`;
  dot.title = GRADES.author.label;
  q('specVerify').hidden = !P.input.catalog.specs.some((x) => (x.grade || 'draft') === 'draft');
});

q('cfeatList').addEventListener('input', (e) => {
  const i = e.target.dataset.cfeat;
  if (i === undefined) return;
  P.input.catalog.features[Number(i)] = e.target.value;
  paintInput(); /* 특징이 하나라도 있으면 다음 단계로 갈 수 있다 */
});

q('specList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-spec-del]');
  if (!b) return;
  P.input.catalog.specs.splice(Number(b.dataset.specDel), 1);
  paintCatalog();
});
q('cfeatList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cfeat-del]');
  if (!b) return;
  P.input.catalog.features.splice(Number(b.dataset.cfeatDel), 1);
  paintCatalog();
});

q('specAdd').addEventListener('click', () => {
  P.input.catalog.specs.push({ label: '', value: '', grade: 'author' });
  paintCatalog();
  const rows = q('specList').querySelectorAll('.srow');
  rows[rows.length - 1].querySelector('input').focus();
});
q('cfeatAdd').addEventListener('click', () => {
  P.input.catalog.features.push('');
  paintCatalog();
  const rows = q('cfeatList').querySelectorAll('.srow');
  rows[rows.length - 1].querySelector('input').focus();
});

/* 원본과 대조한 값은 확인됨. 대조는 사람이 한다 — 모델이 읽은 값은 틀릴 수 있다. */
q('specVerify').addEventListener('click', () => {
  for (const r of P.input.catalog.specs) if ((r.grade || 'draft') === 'draft') r.grade = 'confirmed';
  paintCatalog();
});

/* ================= 2 초안 ================= */

let planning = null; /* 기획 중이면 AbortController */

/* 프롬프트에 들어가는 제품 정보. 아이콘 프롬프트는 키 색과 바탕의 밝기를 쓴다. */
const product = () => ({
  brand: P.input.brand,
  name: P.input.name,
  code: P.input.code,
  keyColor: P.draft.keyColor,
  darkBg: darkBg((PRESETS[P.draft.preset] || PRESETS.catalog).tokens.bg),
  /* 촬영 장소를 고를 때 공구 종류를 가늠하는 데만 쓴다. 프롬프트에 사실로 넣지 않는다. */
  hints: [...P.input.features, ...(P.input.catalog?.features || [])].filter(Boolean).join(' ')
});
const factsSig = () => JSON.stringify(buildFacts(P.input).map((f) => f.text));

/* 사양표는 문서에 복사해 두지 않고 1단계 값에서 그때그때 만든다.
 * 복사해 두면 1단계에서 고친 값과 어긋난다. */
function liveSpecRows() {
  const own = [];
  const brand = P.input.brand.trim();
  const code = P.input.code.trim();
  if (brand) own.push({ label: '브랜드', value: brand, grade: 'author' });
  if (code) own.push({ label: '상품코드', value: code, grade: 'author' });
  const dup = (r) => (code && /상품\s*코드/.test(r.label)) || (brand && /브랜드/.test(r.label));
  return stripPrice([...own, ...P.input.catalog.specs.filter((r) => !dup(r))]);
}

/* 사양표 섹션의 등급은 그 안의 값들에서 나온다 */
function gradeOf(s) {
  if (s.type !== 'spec') return s.grade;
  const cat = P.input.catalog.specs.filter((r) => !isPriceRow(r));
  if (!cat.length) return 'draft';
  if (cat.some((r) => (r.grade || 'draft') === 'draft')) return 'draft';
  return cat.every((r) => r.grade === 'confirmed') ? 'confirmed' : 'author';
}

/* 제품 사진이 바뀌었는지 알아보는 표시 */
const shotsSig = () => P.input.shots.map((x) => `${x.url.length}:${x.url.slice(-24)}`).join('|');

async function refreshColors() {
  const files = P.input.shots.map((x) => x.file).filter(Boolean);
  P.draft.colorSig = shotsSig();
  if (!files.length) {
    P.draft.candidates = [];
    return;
  }
  const info = await productColorFromFiles(files);
  if (!info.empty && info.key) {
    P.draft.candidates = info.swatches;
    P.draft.keyColor = info.key;
    P.draft.colorAdjusted = info.adjusted;
  }
}

function setBusy(on, text) {
  q('busy').hidden = !on;
  q('editor').hidden = on;
  paintShell(); /* 기획 중에는 다음 단추를 잠근다 */
  if (text) q('busyText').textContent = text;
}

async function makeDraft({ fresh = false } = {}) {
  await aiReady;
  P.draft.error = '';
  P.draft.sections = [];
  paintDraft();
  planning = new AbortController();
  setBusy(true, P.ai ? `${P.ai.label} 가 기획 중입니다` : '초안을 만드는 중입니다');

  /* 대표색은 이 컴퓨터 안에서 바로 나온다. 기획을 기다리지 않는다. */
  const colors = refreshColors();

  try {
    if (P.ai) {
      const plan = await planPage(P.ai, P.input, { signal: planning.signal, fresh });
      P.draft.sections = buildFromPlan(P.input, plan);
      P.draft.facts = plan.facts;
      P.draft.plan = { angle: plan.angle, order: plan.order, notes: plan.notes };
      P.draft.mode = 'ai';
      P.draft.by = P.ai.label;
      editor.reset();
    } else {
      P.draft.sections = buildDraft(P.input, []);
      P.draft.facts = buildFacts(P.input);
      P.draft.plan = null;
      P.draft.mode = 'rules';
      editor.reset();
    }
    P.draft.sig = factsSig();
  } catch (e) {
    if (e && e.code === 'cancelled') { planning = null; setBusy(false); go(1); return; }
    /* 기획이 실패해도 작업이 멈추면 안 된다. 규칙 초안으로 이어 가되 실패를 숨기지 않는다. */
    P.draft.sections = buildDraft(P.input, []);
    P.draft.facts = buildFacts(P.input);
    P.draft.plan = null;
    P.draft.mode = 'rules';
    P.draft.error = `기획에 실패했습니다 — ${errorCopy(e)}`;
    editor.reset();
    P.draft.sig = factsSig();
  }

  await colors;
  planning = null;
  setBusy(false);
  paintDraft();
}

q('busyStop').addEventListener('click', () => planning && planning.abort());

/* 다시 기획하면 손으로 고친 문장이 사라진다. 확인창은 아티팩트에서 안 뜨니 두 번 누르게 한다. */
let replanArmed = null;
q('replan').addEventListener('click', () => {
  const edited = P.draft.sections.some((s) => gradeOf(s) === 'author');
  if (edited && !replanArmed) {
    q('replan').textContent = '고친 문장이 사라집니다 — 한 번 더 누르면 다시 기획';
    replanArmed = setTimeout(() => { replanArmed = null; q('replan').textContent = '다시 기획'; }, 5000);
    return;
  }
  clearTimeout(replanArmed);
  replanArmed = null;
  q('replan').textContent = '다시 기획';
  makeDraft({ fresh: true });
});

function paintPlan() {
  const d = P.draft;
  const mode = d.mode === 'ai'
    ? `${d.by || '모델'} 가 입력한 사실을 재구성해 기획했습니다.`
    : d.mode === 'rules'
      ? '규칙으로 만든 초안입니다. 입력한 특징에 순위만 매겨 옮긴 것이라 기획이 아닙니다. 모델을 쓸 수 있을 때 다시 기획해 주세요.'
      : '';
  q('planMode').textContent = d.error ? `${d.error}\n${mode}` : mode;

  const pl = d.plan;
  q('planAngle').textContent = pl && pl.angle ? `기획 의도 — ${pl.angle}` : '';
  q('planRank').innerHTML = pl
    ? pl.order.map((id) => {
        const f = d.facts.find((x) => x.id === id);
        return f ? `<li><span>${esc(f.src)}</span>${esc(f.text)}</li>` : '';
      }).join('')
    : '';
  q('planNotes').innerHTML = pl ? pl.notes.map((n) => `<li>${esc(n)}</li>`).join('') : '';

  const stale = d.sections.length && d.sig && d.sig !== factsSig();
  q('planStale').textContent = stale
    ? '1단계 입력이 기획 뒤에 바뀌었습니다. 다시 기획하면 반영됩니다.' : '';
  q('replan').hidden = !P.ai;
}

const flagsHtml = (s) => (s.flags || []).map((f) => `<span class="flag">${esc(f)}</span>`).join('');

function basisHtml(s) {
  if (P.draft.mode !== 'ai') return '';
  const cited = (s.basis || []).map((id) => P.draft.facts.find((f) => f.id === id)).filter(Boolean);
  if (cited.length) {
    return `<div class="basis"><span>근거</span>${
      cited.map((f) => `<em title="${esc(f.src)}">${esc(f.text)}</em>`).join('')}</div>`;
  }
  if (['problem', 'usecase', 'recommend'].includes(s.type)) {
    return '<div class="basis gen"><span>일반</span>이 공구 종류의 일반적인 현장 이야기입니다. 제품 사실이 아닙니다.</div>';
  }
  return '';
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

  q('secCount').textContent = P.draft.sections.length ? `${P.draft.sections.length}개` : '';
  q('editor').innerHTML = P.draft.sections.map((s, i) => {
    const g = GRADES[gradeOf(s)] || GRADES.draft;
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
      <div class="flags" data-flags="${i}">${flagsHtml(s)}</div>
      ${basisHtml(s)}
      ${editableFields(s, i)}
    </div>`;
  }).join('');

  paintGradesOnly();
  paintPlan();
}

/* 섹션마다 고칠 수 있는 글자 칸을 만든다 */
const FIELDS = {
  hero: [['eyebrow', '윗줄'], ['title', '제목']],
  problem: [['kicker', '윗줄'], ['headline', '제목']],
  solutionIntro: [['eyebrow', '윗줄'], ['headline', '제목']],
  featuresGrid: [['headline', '제목']],
  coreSolution: [['specLine', '윗줄'], ['headline', '제목']],
  point: [['headline', '제목'], ['desc', '근거']],
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

  /* 항목이 여러 개인 섹션: 특장점·사용 장면·추천은 items, 해결 제시의 아이콘은 icons */
  const list = (arr) => (s.data[arr] || []).map((it, j) => {
    const ta = (k, lab, v) => `<label class="fl sub"><span>${lab}</span>
      <textarea data-i="${i}" data-arr="${arr}" data-item="${j}" data-k="${k}"
        rows="${rowsFor(v)}">${esc(v || '')}</textarea></label>`;
    if (typeof it === 'string') return ta('.', j + 1, it);
    return Object.entries({ label: j + 1, title: '제목', desc: '설명' })
      .filter(([k]) => k in it).map(([k, lab]) => ta(k, lab, it[k])).join('');
  }).join('');

  const spec = s.type === 'spec'
    ? `<p class="note">사양표 ${liveSpecRows().length}줄은 1단계에서 읽은 값입니다. 값은 1단계에서 고칩니다.</p>`
    : '';

  return rows + list('items') + list('icons') + spec;
}

q('editor').addEventListener('input', (e) => {
  const t = e.target;
  if (t.tagName !== 'TEXTAREA') return;
  const idx = Number(t.dataset.i);
  const s = P.draft.sections[idx];
  const arr = t.dataset.arr;
  if (arr === undefined) {
    s.data[t.dataset.k] = t.value;
  } else if (t.dataset.k === '.') {
    s.data[arr][Number(t.dataset.item)] = t.value;
  } else {
    s.data[arr][Number(t.dataset.item)][t.dataset.k] = t.value;
  }
  /* 사람이 손댄 문장은 더 이상 초안이 아니다 */
  if (s.grade === 'draft') s.grade = 'author';

  /* 고친 글도 근거 검사를 다시 받는다. 작성자가 숫자를 잘못 쓸 수도 있다. */
  if (P.draft.mode === 'ai') {
    s.flags = flagsFor(s, P.draft.facts, product());
    const box = q('editor').querySelector(`[data-flags="${idx}"]`);
    if (box) box.innerHTML = flagsHtml(s);
  }
  paintGradesOnly();
});

function paintGradesOnly() {
  const counts = {};
  for (const s of P.draft.sections) {
    const g = gradeOf(s);
    counts[g] = (counts[g] || 0) + 1;
  }
  q('grades').innerHTML = Object.entries(GRADES).map(([k, g]) =>
    `<div class="grade"><span class="dot ${g.tone}"></span>${g.label}<b>${counts[k] || 0}</b></div>`
  ).join('');

  const flagged = P.draft.sections.filter((s) => (s.flags || []).length).length;
  q('draftHint').textContent = [
    counts.draft ? `초안 ${counts.draft}개가 아직 작성자 손을 거치지 않았습니다.` : '',
    flagged ? `근거 확인이 필요한 곳이 ${flagged}개 있습니다.` : ''
  ].filter(Boolean).join(' ');

  q('editor').querySelectorAll('.sec').forEach((el, i) => {
    const g = GRADES[gradeOf(P.draft.sections[i])] || GRADES.draft;
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

/* ================= 3 사진 생성·편집 · 4 저장 ================= */

/* 값만 복제한다. 문자열은 같은 값을 가리킨 채로 둔다 — structuredClone 은 사진 data URL 을
 * 매번 통째로 복사해서, 사진이 여러 장이면 글자 한 자 고칠 때마다 버벅인다. */
const cloneVal = (v) => Array.isArray(v) ? v.map(cloneVal)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneVal(x)]))
  : v;

/* 렌더러에 넘길 모양으로 바꾼다. 상태를 건드리지 않도록 섹션 data 를 복제해서 쓴다.
 * 사진 자리에는 경로(path)를 달아 둔다 — 편집 화면이 그 자리를 찾을 때 쓴다. */
function renderDoc() {
  const sections = P.draft.sections.map((s) => {
    const data = cloneVal(s.data);
    if (s.type === 'spec') data.rows = liveSpecRows();
    return { ...s, grade: gradeOf(s), data };
  });
  for (const { path, img } of listSlots(sections)) img.path = path;

  return {
    product: docProduct(),
    preset: P.draft.preset,
    keyColor: P.draft.keyColor,
    width: P.width,
    sections
  };
}

function docProduct() {
  return {
    brand: P.input.brand,
    brandMark: P.input.brand,
    name: P.input.name,
    model: P.input.name,
    code: P.input.code,
    logo: P.input.logo
  };
}

/* 개체 하나를 다시 그릴 때 쓰는 값 — renderDoc 과 같은 data 를 준다 */
function renderCtx(i) {
  const s = P.draft.sections[i];
  if (!s) return { data: {}, product: docProduct(), i };
  const data = s.type === 'spec' ? { ...s.data, rows: liveSpecRows() } : s.data;
  return { data, product: docProduct(), i };
}

let fontLink = null;
let extraLink = null;
let allFonts = null;

const linkEl = () => {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  document.head.appendChild(l);
  return l;
};

/* 편집 화면에서는 고를 수 있는 글꼴을 미리 다 받아 둔다. 골랐을 때 바로 보여야 한다.
 * (내보낼 때는 실제로 쓴 글꼴만 받는다.) */
function ensureFonts() {
  if (allFonts) return;
  allFonts = linkEl();
  allFonts.href = fontsUrl(FONT_CHOICES.map((f) => f.family));
}

const paperOf = () => q(P.step === 4 ? 'paper4' : 'paper3');

function paintSheet() {
  if (P.step < 3) return;
  const { fontLink: href, extraFontLink, css, html } = renderPage(renderDoc());
  fontLink = fontLink || linkEl();
  if (fontLink.href !== href) fontLink.href = href;
  if (extraFontLink) {
    extraLink = extraLink || linkEl();
    if (extraLink.href !== extraFontLink) extraLink.href = extraFontLink;
  }

  let style = document.getElementById('sheet-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'sheet-style';
    document.head.appendChild(style);
  }
  style.textContent = css;

  /* 쓰지 않는 쪽 화면은 비운다. 사진이 두 번 메모리에 올라가고, 숨은 화면에 같은 글이 남는다. */
  q(P.step === 4 ? 'paper3' : 'paper4').innerHTML = '';
  paperOf().innerHTML = html;

  const slots = listSlots(P.draft.sections);
  const photos = slots.filter((x) => !x.icon);
  const icons = slots.filter((x) => x.icon);
  const n = (arr) => arr.filter((x) => x.filled).length;
  const label = `사진 ${n(photos)}/${photos.length} · 아이콘 ${n(icons)}/${icons.length}`;
  q('slotSum3').textContent = label;
  q('slotSum4').textContent = label;
  q('dims3').textContent = `${P.width}px · ${P.draft.sections.length}섹션`;

  if (P.step === 3) editor.afterPaint();
  if (P.step === 3 && P.draft.sections.some((s) => !s.free && !s.stuck)) scheduleFreeze();
}

/* 3단계에 들어오면 판형 섹션을 낱개 개체로 푼다(web/freeze.js).
 * 글 높이를 재야 하므로 웹폰트가 붙은 뒤에 한다. 먼저 판형 그대로 그려 두고, 풀고 나서 다시 그린다 —
 * 보이는 모양은 같고, 그때부터 하나하나 옮길 수 있다. */
let freezing = null;
const linkReady = (l) => (!l || l.sheet ? Promise.resolve() : new Promise((res) => {
  l.addEventListener('load', res, { once: true });
  l.addEventListener('error', res, { once: true });
  setTimeout(res, 4000);
}));
function scheduleFreeze() {
  if (freezing) return;
  freezing = (async () => {
    try {
      await linkReady(fontLink);
      await linkReady(extraLink);
      const preset = PRESETS[P.draft.preset] || PRESETS.catalog;
      const fams = [preset.fonts.display, preset.fonts.body].map((f) => f.split(',')[0]);
      await Promise.race([
        Promise.all(fams.flatMap((f) => [document.fonts.load(`400 20px ${f}`), document.fonts.load(`700 20px ${f}`)])),
        new Promise((r) => setTimeout(r, 4000))
      ]).catch(() => {});
      await document.fonts.ready;
      if (P.step !== 3) return;
      const targets = P.draft.sections.map((s, i) => (s.free || s.stuck ? -1 : i)).filter((i) => i >= 0);
      if (freezeSections(renderDoc(), P.draft.sections, targets)) paintSheet();
    } finally {
      freezing = null;
    }
  })();
}

/* ---------- 플랫폼 · 확대 (3·4단계가 같이 쓴다) ---------- */
document.querySelectorAll('[data-platform]').forEach((sel) => {
  sel.addEventListener('change', (e) => {
    P.width = { naver: 860, coupang: 780, toss: 1080 }[e.target.value] || 860;
    document.querySelectorAll('[data-platform]').forEach((x) => { x.value = e.target.value; });
    paintSheet();
  });
});

for (const n of ['3', '4']) {
  q(`zoom${n}`).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-z]');
    if (!b) return;
    q(`zoom${n}`).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    q(`zoomwrap${n}`).style.transform = `scale(${b.dataset.z})`;
  });
}

/* 클립보드가 막힌 환경(아티팩트 틀 안 등)이 있다. 세 단계로 물러선다:
 * clipboard API → 선택해서 복사 → 직접 복사 창. 어디서도 조용히 실패하지 않는다. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* 다음 방법 */ }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) return true;
  } catch { /* 다음 방법 */ }

  q('manualText').value = text;
  q('manual').hidden = false;
  q('manualText').focus();
  q('manualText').select();
  return false;
}

q('manualClose').addEventListener('click', () => { q('manual').hidden = true; });

/* 편집기: 글자·사진·아이콘·섹션을 고르고 오른쪽 패널에서 고친다. 자세한 건 editor.js */
const editor = createEditor({
  P, q, esc,
  repaint: () => paintSheet(),
  product,
  copyText,
  readImage: (f) => shrinkImage(f),
  ensureFonts,
  renderCtx,
  canProxy: CAN_EXPORT
});

document.addEventListener('keydown', (e) => { if (P.step === 3) editor.onKey(e); });

/* ---------- 4 저장 ---------- */
q('toEdit').addEventListener('click', () => go(3));

if (!CAN_EXPORT) {
  q('export').disabled = true;
  q('export').title = '서버에서 실행할 때만 쓸 수 있습니다';
  q('result').hidden = false;
  q('result').innerHTML =
    '이 화면은 미리보기 전용입니다. 이미지로 저장하는 일은 섹션마다 헤드리스 브라우저로 찍는 일이라 ' +
    '서버에서 실행할 때만 됩니다. <code>npm start</code> 로 띄우면 쓸 수 있습니다.';
}

q('export').addEventListener('click', async () => {
  const btn = q('export');
  btn.disabled = true;
  btn.textContent = '저장하는 중…';
  q('result').hidden = false;
  q('result').textContent = '헤드리스 브라우저로 찍는 중입니다…';
  try {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc: renderDoc(),
        platform: document.querySelector('[data-step="4"] [data-platform]').value,
        quality: q('quality').value,
        merge: q('merge').checked
      })
    });
    const r = await res.json();
    if (r.error) throw new Error(r.error);

    const slots = listSlots(P.draft.sections);
    const emptyPhotos = slots.filter((x) => !x.icon && !x.filled).length;
    const emptyIcons = slots.filter((x) => x.icon && !x.filled).length;
    const flagged = P.draft.sections.filter((s) => (s.flags || []).length).length;
    q('result').innerHTML = [
      `<b>${esc(r.platform)}</b> ${r.width}px · ${r.pages}장 · 전체 높이 ${r.totalHeight.toLocaleString()}px`,
      `→ <code>${esc(r.outDir)}/</code>`,
      r.warning ? `<span class="warn">${esc(r.warning)}</span>` : '',
      emptyPhotos ? `<span class="warn">사진이 비어 있는 곳 ${emptyPhotos}군데는 자리 표시로 나갔습니다.</span>` : '',
      emptyIcons ? `<span class="warn">아이콘이 비어 있는 곳 ${emptyIcons}군데는 점선 상자로 나갔습니다.</span>` : '',
      flagged ? `<span class="warn">근거 확인이 필요한 섹션 ${flagged}개가 남아 있습니다.</span>` : ''
    ].filter(Boolean).join('<br>');
  } catch (err) {
    q('result').innerHTML = `<span class="warn">${esc(err.message)}</span>`;
  } finally {
    btn.disabled = !CAN_EXPORT;
    btn.textContent = '이미지로 저장';
  }
});

/* ================= 시작 ================= */
paintBrandList();
paintCatalog();
paintInput();
go(1);
