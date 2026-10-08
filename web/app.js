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
import { newProject, STEPS, canDraft, missingForDraft, stripPrice, isPriceRow } from '/src/project.js';
import { buildDraft, buildFromPlan } from '/src/draft.js';
import { buildFacts, flagsFor } from '/src/plan.js';
import { detectTransport, readCatalog, planPage, errorCopy } from '/src/ai.js';
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
  if (P.step === 2 && !P.draft.sections.length && !planning) makeDraft();
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

  q('cfeatList').innerHTML = c.features.map((f, i) => `
    <div class="srow">
      <input class="txt" data-cfeat="${i}" value="${esc(f)}" placeholder="특징">
      <button class="x" data-cfeat-del="${i}" title="지우기">×</button>
    </div>`).join('');

  q('specCount').textContent = `사양 ${c.specs.length}줄 · 특징 ${c.features.length}`;
  q('readNotes').innerHTML = c.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  q('specVerify').hidden = !c.specs.some((r) => (r.grade || 'draft') === 'draft');
  paintReadBtn();
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
  if (i !== undefined) P.input.catalog.features[Number(i)] = e.target.value;
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

const product = () => ({ brand: P.input.brand, name: P.input.name, code: P.input.code });
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

function setBusy(on, text) {
  q('busy').hidden = !on;
  q('editor').hidden = on;
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
  const colors = (async () => {
    if (P.input.shotFiles && P.input.shotFiles.length) {
      const info = await productColorFromFiles(P.input.shotFiles);
      if (!info.empty && info.key) {
        P.draft.candidates = info.swatches;
        P.draft.keyColor = info.key;
        P.draft.colorAdjusted = info.adjusted;
      }
    }
  })();

  try {
    if (P.ai) {
      const plan = await planPage(P.ai, P.input, { signal: planning.signal, fresh });
      P.draft.sections = buildFromPlan(P.input, plan);
      P.draft.facts = plan.facts;
      P.draft.plan = { angle: plan.angle, order: plan.order, notes: plan.notes };
      P.draft.mode = 'ai';
      P.draft.by = P.ai.label;
    } else {
      P.draft.sections = buildDraft(P.input, []);
      P.draft.facts = buildFacts(P.input);
      P.draft.plan = null;
      P.draft.mode = 'rules';
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

/* ================= 3 생성 ================= */

/* 렌더러에 넘길 모양으로 바꾼다. 사진이 아직 없으면 그 자리에 프롬프트를 넣는다. */
function renderDoc() {
  const sections = P.draft.sections.map((s) => ({
    ...s,
    grade: gradeOf(s),
    data: s.type === 'spec' ? withPrompts({ ...s.data, rows: liveSpecRows() }) : withPrompts(s.data)
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
paintCatalog();
paintInput();
go(1);
