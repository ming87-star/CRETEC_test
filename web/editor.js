/* 3단계 편집기 — 사진·아이콘을 채우고, 페이지를 PowerPoint 처럼 고친다
 *
 * 모델은 하나다. 페이지 위의 무엇이든 눌러 "고르면", 오른쪽 속성 패널이 그것에 맞는 조절 장치를
 * 보여 준다.
 *
 *   글자     글꼴 · 크기 · 굵기 · 정렬 · 색 · 줄 간격 · 자간
 *   사진     프롬프트 복사 · 올리기/바꾸기/빼기 · 비율 · 확대 · 끌어서 위치 (크롭)
 *   아이콘   프롬프트 복사 · 올리기/바꾸기/빼기
 *   섹션     순서 · 복제 · 삭제 · 최소 높이 · 위아래 여백 · 배경색   ← 페이지 길이는 여기서 정한다
 *
 * 바뀐 값은 문서(P.draft.sections)에만 쓴다. 화면은 그 값에서 다시 그린다. 슬라이더를 끄는 동안처럼
 * 자주 바뀌는 값은 다시 그리지 않고 그 요소의 스타일만 바로 바꾼다 — 다시 그리면 끌던 손잡이와
 * 글자 커서를 잃는다.
 *
 * 되돌리기는 섹션 목록을 통째로 복제해 쌓는다. 사진 data URL 은 문자열이라 복제해도 같은 값을
 * 가리키므로 사진이 많아도 메모리가 늘지 않는다.
 */

import { FONT_CHOICES } from '/src/presets.js';
import { listSlots, fillSlot, clearSlot, buildPrompt, CUT_KEYS, cutLabel } from '/src/prompt.js';
import { SECTION_TYPES, SLOT } from '/src/sections.js';
import { flagsFor } from '/src/plan.js';
import { textCss, sectionCss, cropStyle } from '/src/render.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cloneVal = (v) => Array.isArray(v) ? v.map(cloneVal)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneVal(x)]))
  : v;

const ASPECTS = [
  ['', '틀 기본'], ['1/1', '1 : 1'], ['4/3', '4 : 3'], ['3/4', '3 : 4'],
  ['16/9', '16 : 9'], ['3/2', '3 : 2'], ['21/9', '21 : 9 (띠)']
];

function rgbToHex(c) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || '');
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
}

export function createEditor(ctx) {
  const { P, q, esc } = ctx;

  let sel = null;                 /* { kind: 'text' | 'pic' | 'section', i, path } */
  let hist = [];
  let redo = [];
  let lastKey = '';
  let lastT = 0;

  const sections = () => P.draft.sections;
  const paper = () => q('paper3');
  const slotAt = (path) => listSlots(sections()).find((x) => x.path === path);

  /* ------------------------------------------------------------ 되돌리기 */

  /* 바꾸기 "전에" 부른다. 같은 key 로 0.9초 안에 이어지면 한 번으로 묶는다 —
   * 글자를 한 자 칠 때마다 되돌리기가 쌓이면 쓸 수가 없다. */
  function touch(key) {
    const now = Date.now();
    if (key !== lastKey || now - lastT > 900) {
      hist.push(cloneVal(sections()));
      if (hist.length > 80) hist.shift();
      redo = [];
    }
    lastKey = key;
    lastT = now;
    buttons();
  }

  function buttons() {
    q('undo').disabled = !hist.length;
    q('redo').disabled = !redo.length;
  }

  function undo() {
    if (!hist.length) return;
    redo.push(cloneVal(sections()));
    P.draft.sections = hist.pop();
    lastKey = '';
    ctx.repaint();
  }

  function redoOne() {
    if (!redo.length) return;
    hist.push(cloneVal(sections()));
    P.draft.sections = redo.pop();
    lastKey = '';
    ctx.repaint();
  }

  /* ------------------------------------------------------------ 선택 */

  function select(next) {
    sel = next;
    markSel();
    inspector();
  }

  function validSel() {
    if (!sel) return false;
    if (sel.i >= sections().length) return false;
    if (sel.kind === 'pic') return !!slotAt(sel.path);
    return true;
  }

  function markSel() {
    const root = paper();
    root.querySelectorAll('.is-sel').forEach((e) => e.classList.remove('is-sel'));
    if (!sel) return;
    let el = null;
    if (sel.kind === 'section') el = root.querySelector(`.pg[data-i="${sel.i}"]`);
    else if (sel.kind === 'text') el = root.querySelector(`.pg[data-i="${sel.i}"] [data-edit="${sel.path}"]`);
    else el = root.querySelector(`[data-path="${sel.path}"]`);
    if (el) el.classList.add('is-sel');
  }

  const selEl = () => {
    const root = paper();
    if (!sel) return null;
    if (sel.kind === 'section') return root.querySelector(`.pg[data-i="${sel.i}"]`);
    if (sel.kind === 'text') return root.querySelector(`.pg[data-i="${sel.i}"] [data-edit="${sel.path}"]`);
    return root.querySelector(`[data-path="${sel.path}"]`);
  };

  /* ------------------------------------------------------------ 그린 뒤 */

  function afterPaint() {
    const root = paper();
    root.querySelectorAll('[data-edit]').forEach((el) => {
      el.contentEditable = 'true';
      el.spellcheck = false;
    });

    /* 비어 있는 사진 자리 한가운데에 복사·업로드 단추 — 처음 보는 사람이 바로 알아본다 */
    root.querySelectorAll('.pic.slot[data-path]').forEach((el) => {
      const tools = document.createElement('div');
      tools.className = 'slot-tools';
      tools.innerHTML =
        '<button type="button" class="tb js-copy">프롬프트 복사</button>' +
        '<label class="tb">사진 올리기<input type="file" accept="image/*" class="js-fill" hidden></label>';
      el.appendChild(tools);
    });

    root.querySelectorAll('.pg').forEach((pg) => {
      const flag = document.createElement('div');
      flag.className = 'pg-flagbar';
      flag.dataset.flagbar = pg.dataset.i;
      pg.appendChild(flag);
      paintFlagBar(Number(pg.dataset.i), pg);
    });

    if (!validSel()) sel = null;
    markSel();
    inspector();
    buttons();
  }

  function paintFlagBar(i, pg) {
    const s = sections()[i];
    const el = pg || paper().querySelector(`.pg[data-i="${i}"]`);
    if (!el || !s) return;
    const flags = s.flags || [];
    el.classList.toggle('flagged', flags.length > 0);
    const bar = el.querySelector('[data-flagbar]');
    if (bar) bar.textContent = flags.length ? `근거 확인 필요 — ${flags.join(' · ')}` : '';
  }

  /* ------------------------------------------------------------ 글자 편집 */

  const setPath = (obj, parts, value) => {
    let node = obj;
    for (let k = 0; k < parts.length - 1; k++) node = node[/^\d+$/.test(parts[k]) ? Number(parts[k]) : parts[k]];
    const last = parts[parts.length - 1];
    node[/^\d+$/.test(last) ? Number(last) : last] = value;
  };

  function insertAtCaret(nodes, host) {
    const s = window.getSelection();
    if (!s.rangeCount) return;
    const r = s.getRangeAt(0);
    r.deleteContents();
    const frag = document.createDocumentFragment();
    nodes.forEach((n) => frag.appendChild(n));
    r.insertNode(frag);
    const after = document.createRange();
    after.setStartAfter(nodes[0]);
    after.collapse(true);
    s.removeAllRanges();
    s.addRange(after);
    host.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function bindCanvas() {
    const root = paper();

    root.addEventListener('input', (e) => {
      const el = e.target.closest('[data-edit]');
      if (!el) return;
      const pg = el.closest('.pg');
      const i = Number(pg.dataset.i);
      const s = sections()[i];
      touch(`text:${i}:${el.dataset.edit}`);

      /* 줄바꿈은 <br> 로 보이고 innerText 로는 \n 으로 읽힌다. 끝에 붙는 빈 줄은 뺀다. */
      setPath(s.data, el.dataset.edit.split('.'), el.innerText.replace(/\n+$/, ''));
      if (s.grade === 'draft') s.grade = 'author';

      /* 고친 글도 근거 검사를 다시 받는다. 작성자가 숫자를 잘못 쓸 수도 있다. */
      if (P.draft.mode === 'ai') {
        s.flags = flagsFor(s, P.draft.facts, ctx.product());
        paintFlagBar(i, pg);
      }
    });

    /* 붙여넣기는 글자만. 서식이 딸려 들어오면 내보낸 이미지에서 모양이 깨진다. */
    root.addEventListener('paste', (e) => {
      const host = e.target.closest('[data-edit]');
      if (!host) return;
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (document.execCommand('insertText', false, t)) return;
      const node = document.createTextNode(t);
      insertAtCaret([node], host);
      const s = window.getSelection();
      const end = document.createRange();
      end.setStartAfter(node);
      end.collapse(true);
      s.removeAllRanges();
      s.addRange(end);
    });

    /* 엔터는 <div> 가 아니라 줄바꿈으로. execCommand 가 막힌 환경에서는 직접 넣는다. */
    root.addEventListener('keydown', (e) => {
      const host = e.target.closest('[data-edit]');
      if (e.key !== 'Enter' || !host) return;
      e.preventDefault();
      if (document.execCommand('insertLineBreak')) return;

      /* 줄 끝의 <br> 하나는 브라우저가 자리표시자로 보고 커서를 그 앞으로 되돌린다.
       * 뒤에 글이 없으면 <br> 를 두 개 넣고 둘 사이에 커서를 둔다. */
      const s = window.getSelection();
      const r = s.rangeCount ? s.getRangeAt(0) : null;
      let tail = '';
      if (r) {
        const probe = document.createRange();
        probe.selectNodeContents(host);
        probe.setStart(r.endContainer, r.endOffset);
        tail = probe.toString();
      }
      const nodes = [document.createElement('br')];
      if (!tail) nodes.push(document.createElement('br'));
      insertAtCaret(nodes, host);
    });

    /* 누른 것을 고른다. 글자 > 사진·아이콘 > 섹션 순으로 가장 안쪽 것이 이긴다. */
    root.addEventListener('click', (e) => {
      if (e.target.closest('.js-copy') || e.target.closest('label.tb')) {
        const pic = e.target.closest('[data-path]');
        if (pic) select({ kind: 'pic', i: Number(pic.dataset.path.split('.')[0]), path: pic.dataset.path });
        return;
      }
      const ed = e.target.closest('[data-edit]');
      const pg = e.target.closest('.pg');
      if (!pg) return;
      const i = Number(pg.dataset.i);
      if (ed) return select({ kind: 'text', i, path: ed.dataset.edit });
      const pic = e.target.closest('[data-path]');
      if (pic) return select({ kind: 'pic', i, path: pic.dataset.path });
      select({ kind: 'section', i });
    });

    root.addEventListener('focusin', (e) => {
      const ed = e.target.closest('[data-edit]');
      if (!ed) return;
      const i = Number(ed.closest('.pg').dataset.i);
      if (!(sel && sel.kind === 'text' && sel.i === i && sel.path === ed.dataset.edit)) {
        select({ kind: 'text', i, path: ed.dataset.edit });
      }
    });

    root.addEventListener('click', onCopyOrFill);
    root.addEventListener('change', onFill);
    bindCropDrag(root);
  }

  /* ------------------------------------------------------------ 사진·아이콘 */

  const promptFor = (hit) =>
    buildPrompt({ ...hit.img, concept: hit.concept }, ctx.product());

  async function onCopyOrFill(e) {
    const btn = e.target.closest('.js-copy');
    if (!btn) return;
    const path = btn.dataset.path || btn.closest('[data-path]')?.dataset.path;
    const hit = path && slotAt(path);
    if (!hit) return;
    const ok = await ctx.copyText(promptFor(hit));
    if (ok) {
      const before = btn.textContent;
      btn.textContent = '복사했습니다';
      setTimeout(() => { btn.textContent = before; }, 1400);
    }
  }

  async function onFill(e) {
    if (!e.target.classList.contains('js-fill')) return;
    const f = e.target.files[0];
    if (!f || !f.type.startsWith('image/')) return;
    const path = e.target.dataset.path || e.target.closest('[data-path]')?.dataset.path;
    if (!path) return;
    const url = await ctx.readImage(f);
    touch(`up:${path}:${Date.now()}`);
    fillSlot(sections(), path, url);
    sel = { kind: 'pic', i: Number(path.split('.')[0]), path };
    ctx.repaint();
  }

  /* 크롭: 고른 사진을 끌면 보이는 부분이 움직인다.
   * 확대한 상자를 틀 안에서 밀기 때문에, 한 번 끌 때 움직일 수 있는 거리는
   * (확대한 사진의 크기 − 틀의 크기)다. 마우스가 그만큼 움직이면 0~100% 를 다 훑는다. */
  function bindCropDrag(root) {
    root.addEventListener('pointerdown', (e) => {
      const pic = e.target.closest('.pic[data-path]:not(.slot)');
      if (!pic || e.target.closest('.slot-tools')) return;
      const hit = slotAt(pic.dataset.path);
      const img = pic.querySelector('img');
      if (!hit || hit.icon || !img) return;

      /* 처음 누르는 사진도 바로 끌 수 있게, 고르는 것을 먼저 한다 */
      if (!(sel && sel.kind === 'pic' && sel.path === pic.dataset.path)) {
        select({ kind: 'pic', i: Number(pic.dataset.path.split('.')[0]), path: pic.dataset.path });
      }

      e.preventDefault();
      pic.setPointerCapture(e.pointerId);
      pic.classList.add('dragging');

      const c0 = { zoom: 1, x: 50, y: 50, ...(hit.img.crop || {}) };
      const W = pic.offsetWidth;
      const H = pic.offsetHeight;
      const scale = pic.getBoundingClientRect().width / W; /* 확대 보기 중이면 화면 픽셀 ≠ 문서 픽셀 */
      const s = Math.max((c0.zoom * W) / img.naturalWidth, (c0.zoom * H) / img.naturalHeight);
      const Tx = img.naturalWidth * s - W;
      const Ty = img.naturalHeight * s - H;
      const sx = e.clientX;
      const sy = e.clientY;
      const key = `crop:${pic.dataset.path}`;

      const move = (ev) => {
        const dx = (ev.clientX - sx) / scale;
        const dy = (ev.clientY - sy) / scale;
        touch(key);
        hit.img.crop = {
          zoom: c0.zoom,
          x: Tx > 1 ? clamp(c0.x - (dx / Tx) * 100, 0, 100) : c0.x,
          y: Ty > 1 ? clamp(c0.y - (dy / Ty) * 100, 0, 100) : c0.y
        };
        img.setAttribute('style', cropStyle(hit.img.crop));
      };
      const up = () => {
        pic.classList.remove('dragging');
        pic.removeEventListener('pointermove', move);
        pic.removeEventListener('pointerup', up);
        pic.removeEventListener('pointercancel', up);
      };
      pic.addEventListener('pointermove', move);
      pic.addEventListener('pointerup', up);
      pic.addEventListener('pointercancel', up);
    });
  }

  /* ------------------------------------------------------------ 섹션 조작 */

  function renumber() {
    let n = 0;
    for (const s of sections()) if (s.type === 'point') s.data.no = ++n;
  }

  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= sections().length) return;
    touch(`move:${Date.now()}`);
    const a = sections();
    [a[i], a[j]] = [a[j], a[i]];
    renumber();
    sel = { kind: 'section', i: j };
    ctx.repaint();
  }

  function duplicate(i) {
    touch(`dup:${Date.now()}`);
    const copy = cloneVal(sections()[i]);
    /* 복제한 쪽은 새로 만든 것이라 근거 표시를 이어받지 않는다 */
    sections().splice(i + 1, 0, copy);
    renumber();
    sel = { kind: 'section', i: i + 1 };
    ctx.repaint();
  }

  function remove(i) {
    touch(`del:${Date.now()}`);
    sections().splice(i, 1);
    renumber();
    sel = null;
    ctx.repaint();
  }

  function addSection(type) {
    if (!type) return;
    const mk = {
      textBlock: () => ({ type, grade: 'author', basis: [], flags: [],
        data: { headline: '제목을 입력하세요', body: '내용을 입력하세요.' } }),
      imageBlock: () => ({ type, grade: 'author', basis: [], flags: [],
        data: { image: SLOT('사진', 'product'), caption: '설명을 입력하세요' } }),
      spacer: () => ({ type, grade: 'author', basis: [], flags: [], data: {}, style: { minH: 120 } })
    }[type];
    if (!mk) return;

    touch(`add:${Date.now()}`);
    const a = sections();
    /* 고른 섹션 바로 뒤. 고른 게 없으면 사양표 앞(본문 끝). */
    let at = sel ? sel.i + 1 : a.findIndex((s) => s.type === 'spec');
    if (at < 0) at = a.length;
    a.splice(at, 0, mk());
    renumber();
    sel = { kind: 'section', i: at };
    ctx.repaint();
    paper().querySelector(`.pg[data-i="${at}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  /* ------------------------------------------------------------ 속성 패널 */

  const sectionLabel = (s) => SECTION_TYPES[s.type]?.label || s.type;

  function inspector() {
    const el = q('inspector');
    if (!sel || !validSel()) { el.innerHTML = overview(); return; }
    if (sel.kind === 'text') el.innerHTML = textPanel();
    else if (sel.kind === 'pic') el.innerHTML = picPanel();
    else el.innerHTML = sectionPanel();
  }

  /* 아무것도 안 골랐을 때: 사진·아이콘이 어디 남았는지 한눈에 */
  function overview() {
    const slots = listSlots(sections());
    const photos = slots.filter((x) => !x.icon);
    const icons = slots.filter((x) => x.icon);
    const row = (x) => `
      <li><button type="button" data-goto="${x.path}">
        <span class="dot ${x.filled ? 'ok' : 'alert'}"></span>
        <span class="nm">${esc(x.icon ? (x.concept || '').replace(/\s*\n\s*/g, ' ') || '아이콘' : x.img.label)}</span>
        <span class="st">${x.filled ? '채움' : '비어 있음'}</span>
      </button></li>`;
    const list = (title, arr) => `
      <h3>${title} <span>${arr.filter((x) => x.filled).length} / ${arr.length}</span></h3>
      ${arr.length ? `<ul class="slotlist">${arr.map(row).join('')}</ul>` : '<p class="note">없음</p>'}`;

    return `
      <div class="ins-head"><b>속성</b><span>고른 것이 없습니다</span></div>
      <p class="note">페이지에서 글자·사진·아이콘·섹션을 누르면 여기서 고칠 수 있습니다.</p>
      ${list('사진', photos)}
      ${list('아이콘', icons)}`;
  }

  /* ---- 글자 ---- */
  function textState() {
    const s = sections()[sel.i];
    const el = selEl();
    const st = (s.data.styles && s.data.styles[sel.path]) || {};
    const cs = el ? getComputedStyle(el) : null;
    const fs = cs ? parseFloat(cs.fontSize) : 16;
    return {
      font: st.font || '',
      size: st.size ?? Math.round(fs),
      color: st.color || (cs ? rgbToHex(cs.color) : '#000000'),
      bold: st.bold ?? (cs ? parseInt(cs.fontWeight, 10) >= 600 : false),
      align: st.align || (cs ? (cs.textAlign === 'start' ? 'left' : cs.textAlign) : 'left'),
      lh: st.lh ?? (cs && cs.lineHeight !== 'normal' ? +(parseFloat(cs.lineHeight) / fs).toFixed(2) : 1.3),
      ls: st.ls ?? (cs && cs.letterSpacing !== 'normal' ? +(parseFloat(cs.letterSpacing) / fs).toFixed(2) : 0),
      touched: !!Object.keys(st).length
    };
  }

  function textPanel() {
    const t = textState();
    const key = ctx.P.draft.keyColor || '#1F4E79';
    const sw = [key, '#111111', '#555555', '#FFFFFF', '#E03131', '#F2C200']
      .map((c) => `<button type="button" class="sw2" data-ts-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
    const align = (a, label) =>
      `<button type="button" class="seg${t.align === a ? ' on' : ''}" data-ts-align="${a}">${label}</button>`;

    return `
      <div class="ins-head"><b>글자</b><span>${esc(sectionLabel(sections()[sel.i]))}</span></div>

      <label class="ins-row"><span>글꼴</span>
        <select data-ts="font">
          <option value="">스타일 기본</option>
          ${FONT_CHOICES.map((f) => `<option value="${f.family}"${t.font === f.family ? ' selected' : ''}>${f.label}</option>`).join('')}
        </select></label>

      <label class="ins-row"><span>크기</span>
        <input type="range" min="10" max="140" step="1" value="${t.size}" data-ts="size">
        <output>${t.size}px</output></label>

      <div class="ins-row"><span>굵기·정렬</span>
        <div class="segs">
          <button type="button" class="seg${t.bold ? ' on' : ''}" data-ts-bold="1"><b>가</b></button>
          ${align('left', '왼쪽')}${align('center', '가운데')}${align('right', '오른쪽')}
        </div></div>

      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" value="${t.color}" data-ts="color">${sw}</div></div>

      <label class="ins-row"><span>줄 간격</span>
        <input type="range" min="0.9" max="2.4" step="0.05" value="${t.lh}" data-ts="lh">
        <output>${t.lh}</output></label>

      <label class="ins-row"><span>자간</span>
        <input type="range" min="-0.05" max="0.3" step="0.01" value="${t.ls}" data-ts="ls">
        <output>${t.ls}em</output></label>

      <div class="ins-actions">
        <button type="button" class="btn mini" data-act="text-reset"${t.touched ? '' : ' disabled'}>서식 초기화</button>
      </div>`;
  }

  function setText(patch, key) {
    const s = sections()[sel.i];
    touch(key);
    s.data.styles = s.data.styles || {};
    const st = (s.data.styles[sel.path] = { ...(s.data.styles[sel.path] || {}), ...patch });
    for (const k of Object.keys(st)) if (st[k] === undefined || st[k] === '') delete st[k];
    if (!Object.keys(st).length) delete s.data.styles[sel.path];
    if (!Object.keys(s.data.styles).length) delete s.data.styles;
    const el = selEl();
    if (el) {
      const css = textCss((s.data.styles || {})[sel.path]);
      if (css) el.setAttribute('style', css); else el.removeAttribute('style');
    }
    ctx.ensureFonts();
  }

  /* ---- 사진 · 아이콘 ---- */
  function picPanel() {
    const hit = slotAt(sel.path);
    const { img, filled, icon } = hit;
    const title = icon ? `아이콘 · ${(hit.concept || '').replace(/\s*\n\s*/g, ' ')}` : img.label;
    const hero = sections()[sel.i].type === 'hero';
    const c = { zoom: 1, ...(img.crop || {}) };

    const cutOpts = CUT_KEYS.filter((k) => k !== 'icon')
      .map((k) => `<option value="${k}"${img.cut === k ? ' selected' : ''}>${cutLabel(k)}</option>`).join('');

    return `
      <div class="ins-head"><b>${icon ? '아이콘' : '사진'}</b><span>${esc(title)}</span></div>

      ${icon ? '' : `<label class="ins-row"><span>컷 종류</span>
        <select data-pic="cut">${cutOpts}</select></label>
        <p class="note">컷 종류에 따라 프롬프트가 달라집니다.</p>`}

      <div class="ins-actions">
        <button type="button" class="btn primary js-copy" data-path="${sel.path}">프롬프트 복사</button>
        <label class="btn">${filled ? (icon ? '아이콘 바꾸기' : '사진 바꾸기') : (icon ? '아이콘 올리기' : '사진 올리기')}
          <input type="file" accept="image/*" class="js-fill" data-path="${sel.path}" hidden></label>
        ${filled ? '<button type="button" class="btn" data-act="pic-clear">빼기</button>' : ''}
      </div>
      ${icon ? '<p class="note">흰 바탕(또는 검은 바탕)에 그린 아이콘을 올리면 배경이 자동으로 지워집니다.</p>' : ''}

      ${filled && !icon ? `
        <h3>크롭</h3>
        ${hero ? '' : `<label class="ins-row"><span>비율</span>
          <select data-pic="aspect">${ASPECTS.map(([v, l]) => `<option value="${v}"${(img.aspect || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`}
        <label class="ins-row"><span>확대</span>
          <input type="range" min="1" max="4" step="0.05" value="${c.zoom}" data-cr="zoom">
          <output>${Number(c.zoom).toFixed(2)}×</output></label>
        <p class="note">사진을 끌어서 보이는 부분을 옮깁니다. 확대하면 그만큼 옮길 수 있습니다.</p>
        <div class="ins-actions"><button type="button" class="btn mini" data-act="crop-reset"${img.crop ? '' : ' disabled'}>위치·확대 초기화</button></div>` : ''}`;
  }

  /* ---- 섹션 ---- */
  function sectionPanel() {
    const s = sections()[sel.i];
    const pg = selEl();
    const st = s.style || {};
    const cs = pg ? getComputedStyle(pg) : null;
    const hero = s.type === 'hero';
    const spacer = s.type === 'spacer';
    const curH = pg ? Math.round(pg.offsetHeight / 10) * 10 : 400;
    const padT = st.padTop ?? (cs ? Math.round(parseFloat(cs.paddingTop)) : 0);
    const padB = st.padBottom ?? (cs ? Math.round(parseFloat(cs.paddingBottom)) : 0);
    /* 배경이 투명이면 rgb 로는 검정(0,0,0,0)으로 읽힌다. 실제로 보이는 건 페이지 바탕색이다. */
    const sheetBg = getComputedStyle(paper().querySelector('.sheet') || document.body).backgroundColor;
    const bg = st.bg || (cs && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)
      ? rgbToHex(cs.backgroundColor) : rgbToHex(sheetBg));
    const last = sections().length - 1;

    return `
      <div class="ins-head"><b>섹션</b><span>${esc(sectionLabel(s))} · ${sel.i + 1} / ${last + 1}</span></div>

      <div class="ins-actions">
        <button type="button" class="btn mini" data-act="sec-up"${sel.i === 0 ? ' disabled' : ''}>↑ 위로</button>
        <button type="button" class="btn mini" data-act="sec-down"${sel.i === last ? ' disabled' : ''}>↓ 아래로</button>
        <button type="button" class="btn mini" data-act="sec-dup">복제</button>
        <button type="button" class="btn mini danger" data-act="sec-del">삭제</button>
      </div>

      <h3>길이</h3>
      <div class="ins-row"><span>${hero || spacer ? '높이' : '최소 높이'}</span>
        <label class="auto"><input type="checkbox" data-sc-auto="minH"${st.minH == null ? ' checked' : ''}${spacer ? ' disabled' : ''}> 자동</label></div>
      <label class="ins-row"><span></span>
        <input type="range" min="0" max="2400" step="10" value="${st.minH ?? curH}" data-sc="minH"${st.minH == null ? ' disabled' : ''}>
        <output>${st.minH ?? curH}px</output></label>

      ${hero || spacer ? '' : `
      <div class="ins-row"><span>위 여백</span>
        <label class="auto"><input type="checkbox" data-sc-auto="padTop"${st.padTop == null ? ' checked' : ''}> 기본</label></div>
      <label class="ins-row"><span></span>
        <input type="range" min="0" max="400" step="4" value="${padT}" data-sc="padTop"${st.padTop == null ? ' disabled' : ''}>
        <output>${padT}px</output></label>
      <div class="ins-row"><span>아래 여백</span>
        <label class="auto"><input type="checkbox" data-sc-auto="padBottom"${st.padBottom == null ? ' checked' : ''}> 기본</label></div>
      <label class="ins-row"><span></span>
        <input type="range" min="0" max="400" step="4" value="${padB}" data-sc="padBottom"${st.padBottom == null ? ' disabled' : ''}>
        <output>${padB}px</output></label>`}

      <h3>배경</h3>
      <div class="ins-row"><span>배경색</span>
        <div class="colors"><input type="color" value="${bg}" data-sc-bg="1">
          <button type="button" class="btn mini" data-act="bg-reset"${st.bg ? '' : ' disabled'}>기본으로</button></div></div>`;
  }

  function setSection(patch, key) {
    const s = sections()[sel.i];
    touch(key);
    s.style = { ...(s.style || {}), ...patch };
    for (const k of Object.keys(s.style)) if (s.style[k] === undefined) delete s.style[k];
    if (!Object.keys(s.style).length) delete s.style;
    const pg = selEl();
    if (pg) {
      const css = sectionCss(s);
      if (css) pg.setAttribute('style', css); else pg.removeAttribute('style');
    }
  }

  /* ------------------------------------------------------------ 패널 이벤트 */

  const out = (el) => el.closest('.ins-row')?.querySelector('output');

  function bindInspector() {
    const el = q('inspector');

    el.addEventListener('input', (e) => {
      const t = e.target;
      if (!sel) return;

      if (t.dataset.ts) {                          /* 글자 */
        const k = t.dataset.ts;
        let v = t.value;
        if (['size', 'lh', 'ls'].includes(k)) v = Number(v);
        setText({ [k]: v }, `ts:${sel.i}:${sel.path}:${k}`);
        const o = out(t);
        if (o) o.textContent = k === 'size' ? `${v}px` : k === 'ls' ? `${v}em` : String(v);
      } else if (t.dataset.cr) {                   /* 크롭 확대 */
        const hit = slotAt(sel.path);
        if (!hit) return;
        touch(`cr:${sel.path}`);
        hit.img.crop = { x: 50, y: 50, ...(hit.img.crop || {}), zoom: Number(t.value) };
        paper().querySelector(`[data-path="${sel.path}"] img`)?.setAttribute('style', cropStyle(hit.img.crop));
        const o = out(t);
        if (o) o.textContent = `${Number(t.value).toFixed(2)}×`;
        el.querySelector('[data-act="crop-reset"]')?.removeAttribute('disabled');
      } else if (t.dataset.sc) {                   /* 섹션 길이·여백 */
        const v = Number(t.value);
        setSection({ [t.dataset.sc]: v }, `sc:${sel.i}:${t.dataset.sc}`);
        const o = out(t);
        if (o) o.textContent = `${v}px`;
      } else if (t.dataset.scBg) {
        setSection({ bg: t.value }, `bg:${sel.i}`);
        el.querySelector('[data-act="bg-reset"]')?.removeAttribute('disabled');
      }
    });

    el.addEventListener('change', (e) => {
      const t = e.target;
      if (!sel) return;

      if (t.dataset.pic === 'cut') {
        const hit = slotAt(sel.path);
        touch(`cut:${sel.path}`);
        hit.img.cut = t.value;
      } else if (t.dataset.pic === 'aspect') {
        const hit = slotAt(sel.path);
        touch(`asp:${sel.path}`);
        if (t.value) hit.img.aspect = t.value; else delete hit.img.aspect;
        ctx.repaint();
      } else if (t.dataset.scAuto) {
        const k = t.dataset.scAuto;
        const range = el.querySelector(`[data-sc="${k}"]`);
        if (t.checked) {
          setSection({ [k]: undefined }, `auto:${sel.i}:${k}`);
          range.disabled = true;
        } else {
          range.disabled = false;
          setSection({ [k]: Number(range.value) }, `auto:${sel.i}:${k}`);
        }
      } else if (t.classList.contains('js-fill')) {
        onFill(e);
      }
    });

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;

      if (b.dataset.goto) {                       /* 목록에서 찾아가기 */
        const path = b.dataset.goto;
        const i = Number(path.split('.')[0]);
        select({ kind: 'pic', i, path });
        paper().querySelector(`[data-path="${path}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (b.classList.contains('js-copy')) { onCopyOrFill(e); return; }
      if (!sel) return;

      if (b.dataset.tsColor) { setText({ color: b.dataset.tsColor }, `tc:${sel.i}:${sel.path}`); inspector(); return; }
      if (b.dataset.tsBold) { setText({ bold: !textState().bold }, `tb:${sel.i}:${sel.path}`); inspector(); return; }
      if (b.dataset.tsAlign) { setText({ align: b.dataset.tsAlign }, `ta:${sel.i}:${sel.path}`); inspector(); return; }

      switch (b.dataset.act) {
        case 'text-reset': {
          const s = sections()[sel.i];
          touch(`tr:${Date.now()}`);
          if (s.data.styles) delete s.data.styles[sel.path];
          ctx.repaint();
          break;
        }
        case 'pic-clear':
          touch(`clr:${Date.now()}`);
          clearSlot(sections(), sel.path);
          ctx.repaint();
          break;
        case 'crop-reset': {
          const hit = slotAt(sel.path);
          touch(`crr:${Date.now()}`);
          delete hit.img.crop;
          ctx.repaint();
          break;
        }
        case 'sec-up': move(sel.i, -1); break;
        case 'sec-down': move(sel.i, 1); break;
        case 'sec-dup': duplicate(sel.i); break;
        case 'sec-del': remove(sel.i); break;
        case 'bg-reset':
          setSection({ bg: undefined }, `bgr:${Date.now()}`);
          inspector();
          break;
        default:
      }
    });
  }

  /* ------------------------------------------------------------ 키보드 */

  /* 글자를 치는 중에는 브라우저의 되돌리기에 맡긴다(그 입력도 우리 문서에 반영된다).
   * 그 밖에서는 이 편집기의 되돌리기를 쓴다. */
  function onKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    const typing = e.target.closest && e.target.closest('[contenteditable="true"], input:not([type="range"]), textarea, select');
    if (mod && !typing && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoOne(); else undo();
    } else if (mod && !typing && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redoOne();
    } else if (e.key === 'Escape' && sel) {
      sel = null;
      markSel();
      inspector();
    }
  }

  /* ------------------------------------------------------------ 시작 */

  bindCanvas();
  bindInspector();
  q('undo').addEventListener('click', undo);
  q('redo').addEventListener('click', redoOne);
  q('addSection').addEventListener('change', (e) => {
    addSection(e.target.value);
    e.target.value = '';
  });

  return {
    afterPaint,
    onKey,
    undo,
    redo: redoOne,
    /* 새 초안을 만들면 이전 초안의 되돌리기는 의미가 없다 */
    reset() { hist = []; redo = []; sel = null; lastKey = ''; buttons(); },
    get selection() { return sel; },
    select
  };
}
