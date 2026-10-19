/* 문서 → 상세페이지 HTML
 *
 * 섹션 하나가 <section class="pg"> 하나이고, 내보낼 때 이미지 한 장이 된다.
 * 브라우저 미리보기와 서버 캡처가 같은 함수를 쓴다.
 */

import { PRESETS, applyBrandColor, FONT_CHOICES, fontsUrl } from './presets.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* 줄바꿈을 살려서 내보낸다 */
const lines = (s) => esc(s).replace(/\n/g, '<br>');

/* 아이콘 자리 또는 실제 아이콘. 아이콘은 AI 가 만들 자리라 비워둔다. */
function icon(v) {
  const path = v && v.path ? ` data-path="${esc(v.path)}"` : '';
  if (v && v.url) return `<span class="ico"${path}><img src="${esc(v.url)}" alt=""></span>`;
  return `<span class="ico slot"${path}></span>`;
}

/* 브랜드 표시 — 로고를 올렸으면 로고, 아니면 글자
 *
 * 로고가 어두운 색 위주면(UDT 처럼 검은 워드마크) 어두운 히어로 위에서 사라진다.
 * 그럴 때만 흰 판 위에 올린다. 밝은 로고는 그대로 둔다. */
const MARK_H = 42; /* 로고 마크가 차지할 높이(px) */

function brandMark(d) {
  const lg = d.logo;
  if (lg && lg.url) {
    /* 로고 파일마다 여백이 제각각이라 그대로 앉히면 크기가 들쭉날쭉해진다.
     * 분석 때 재 둔 상자(trim)만큼 잘라내서 마크 자체를 같은 높이로 맞춘다. */
    let box = '';
    let im = `height:${MARK_H}px`;
    if (lg.trim && lg.natural && lg.trim.h) {
      const s = MARK_H / lg.trim.h;
      box = `width:${Math.round(lg.trim.w * s)}px;height:${MARK_H}px`;
      im = `height:${Math.round(lg.natural.h * s)}px;` +
           `margin:${-Math.round(lg.trim.y * s)}px 0 0 ${-Math.round(lg.trim.x * s)}px`;
    }
    return `<div class="logo${lg.dark ? ' plate' : ''}"><span class="logo-box" style="${box}">
      <img src="${esc(lg.url)}" style="${im}" alt="${esc(d.mark ?? '')}"></span></div>`;
  }
  if (!d.mark) return '';
  return `<p class="mark">${esc(d.mark)}</p>`;
}

/* ------------------------------------------------------------------
   서식 → CSS

   편집 화면에서 고른 값(글꼴·크기·색 …)은 문서에 숫자와 이름으로만 저장하고, 여기서
   CSS 로 바꾼다. 불러온 문서가 CSS 를 끼워 넣지 못하도록 값마다 모양을 검사한다.
------------------------------------------------------------------ */
const KR_FALLBACK = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',sans-serif";
const FAMILIES = new Set(FONT_CHOICES.map((f) => f.family));
const HEX = /^#[0-9a-f]{6}$/i;
const num = (v, lo, hi) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};
const escAttr = (v) => esc(v).replace(/"/g, '&quot;');

/* 색은 '#RRGGBB'(뒤에 불투명도 두 자리를 붙여도 된다) 또는 스타일 색 이름('var:key')이다.
 * 이름으로 두면 2단계에서 대표색이나 스타일을 바꿔도 그 색을 따라간다. */
export const COLOR_TOKENS = ['key', 'key-deep', 'on-key', 'ink', 'ink-soft', 'bg', 'bg-alt', 'line'];
const HEX8 = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
export function paint(c) {
  if (typeof c !== 'string') return null;
  if (HEX8.test(c)) return c;
  const m = /^var:([a-z-]+)$/.exec(c);
  return m && COLOR_TOKENS.includes(m[1]) ? `var(--${m[1]})` : null;
}
/* 색 + 불투명도. 그라데이션 멈춤점에 쓴다. */
function paintA(c, a) {
  const n = Number(a);
  const alpha = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
  if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) {
    const v = parseInt(c.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
  }
  const p = paint(c);
  if (!p) return null;
  return alpha >= 1 ? p : `color-mix(in srgb, ${p} ${Math.round(alpha * 100)}%, transparent)`;
}

export const TEXT_SHADOWS = {
  soft: '0 2px 14px rgba(0,0,0,.45)',
  strong: '0 1px 3px rgba(0,0,0,.7),0 2px 18px rgba(0,0,0,.5)'
};

export function textCss(st) {
  if (!st) return '';
  const o = [];
  if (st.font && FAMILIES.has(st.font)) o.push(`font-family:'${st.font}',${KR_FALLBACK}`);
  else if (st.face === 'display' || st.face === 'body') o.push(`font-family:var(--${st.face})`);
  const size = st.size != null ? num(st.size, 8, 240) : null;
  if (size != null) o.push(`font-size:${size}px`);
  const col = paint(st.color);
  if (col) o.push(`color:${col}`);
  if (st.bold === true) o.push('font-weight:700');
  else if (st.bold === false) o.push('font-weight:400');
  else if (st.weight != null) {
    const w = num(st.weight, 100, 900);
    if (w != null) o.push(`font-weight:${Math.round(w / 100) * 100}`);
  }
  if (['left', 'center', 'right'].includes(st.align)) o.push(`text-align:${st.align}`);
  const lh = st.lh != null && st.lh !== '' ? num(st.lh, 0.8, 3) : null;
  if (lh != null) o.push(`line-height:${lh}`);
  const ls = st.ls != null && st.ls !== '' ? num(st.ls, -0.2, 1) : null;
  if (ls != null) o.push(`letter-spacing:${ls}em`);
  if (st.upper === true) o.push('text-transform:uppercase');
  if (st.balance === true) o.push('text-wrap:balance');
  if (TEXT_SHADOWS[st.shadow]) o.push(`text-shadow:${TEXT_SHADOWS[st.shadow]}`);
  return o.join(';');
}

/* 섹션 서식 → CSS. 여백과 높이가 곧 페이지 길이다. */
export function sectionCss(s) {
  const st = s.style;
  if (!st) return '';
  const o = [];
  const pt = num(st.padTop, 0, 600);
  const pb = num(st.padBottom, 0, 600);
  if (pt != null && st.padTop != null) o.push(`padding-top:${pt}px`);
  if (pb != null && st.padBottom != null) o.push(`padding-bottom:${pb}px`);
  const h = num(st.minH, 0, 4000);
  if (h != null && st.minH != null) {
    /* 히어로는 비율로 높이가 정해지는 자리라 높이를 직접 준다 */
    o.push(s.type === 'hero' ? `height:${h}px;aspect-ratio:auto` : `min-height:${h}px`);
  }
  const bg = paint(st.bg);
  if (bg) o.push(`background:${bg}`);
  return o.join(';');
}

/* 글자를 화면에서 바로 고칠 수 있도록 편집 위치를 단다.
 * 값은 섹션 data 안의 경로다(headline, items.2.label …). 내보낼 때는 그냥 속성일 뿐이다. */
const ed = (k, d) => {
  const css = textCss(d && d.styles && d.styles[k]);
  return ` data-edit="${k}"${css ? ` style="${escAttr(css)}"` : ''}`;
};

/* 크롭: 사진을 확대하고(zoom) 보여 줄 중심(x, y: 0~100%)을 정한다.
 * 확대한 상자를 틀 안에서 밀어 중심이 보이게 한다. */
export function cropStyle(c) {
  const z = num(c.zoom, 1, 5) ?? 1;
  const x = num(c.x, 0, 100) ?? 50;
  const y = num(c.y, 0, 100) ?? 50;
  return `position:absolute;max-width:none;width:${z * 100}%;height:${z * 100}%;` +
    `left:${-(z - 1) * x}%;top:${-(z - 1) * y}%;object-fit:cover;object-position:${x}% ${y}%`;
}

const ASPECT = /^\d{1,2}\/\d{1,2}$/;

/* 이미지 자리 또는 실제 사진.
 * data-path 는 편집 화면이 이 자리를 찾는 표시다.
 * 프롬프트 글 자체는 자리 안에 넣지 않는다 — 자리는 사진이 앉을 자리지 글을 읽는 곳이 아니다. */
function pic(v, cls = '') {
  if (!v) return '';
  const path = v.path ? ` data-path="${esc(v.path)}"` : '';
  const ar = v.aspect && ASPECT.test(v.aspect) && cls !== 'fill' ? ` style="aspect-ratio:${v.aspect}"` : '';
  if (v.slot) {
    return `<div class="pic slot ${cls}"${path}${ar}><span class="pic-label">${esc(v.label)}</span></div>`;
  }
  const im = v.crop ? ` style="${cropStyle(v.crop)}"` : '';
  return `<div class="pic ${cls}"${path}${ar}><img src="${esc(v.url)}" alt=""${im}></div>`;
}

/* ---------------- 여러 판형이 같이 쓰는 덩어리 ----------------
 * 3단계에서 판형을 낱개 개체로 풀 때도 표·문답처럼 줄이 늘고 주는 것은 한 덩어리(block)로
 * 남는다. 그 덩어리를 그리는 함수가 이것들이다. */
const PARTS = {
  brand: (d, p) => brandMark({ mark: p.brandMark, logo: p.logo }),
  spec: (d) => `
    <table class="spec">
      <tbody>
        ${(d.rows || []).map((r) => `
          <tr>
            <th>${esc(r.label)}</th>
            <td${r.value ? '' : ' class="todo"'}>${esc(r.value) || '입력 필요'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`,
  cmpTable: (d) => `
    <table class="cmp-table">
      <tbody>
        ${(d.rows || []).map((r) => `
          <tr>
            <th>${esc(r.label)}</th>
            <td class="win">${esc(r.ours)}</td>
            <td>${esc(r.theirs)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`,
  qa: (d) => `
    <div class="qa">
      ${(d.items || []).map((i) => `
        <div class="q"><b>Q.</b> ${esc(i.q)}</div>
        <div class="a"><b>A.</b> ${esc(i.a)}</div>`).join('')}
    </div>`,
  marks: (d) => `
    <ul class="marks">
      ${(d.marks || []).map((m) => `<li>${esc(m.label)}</li>`).join('')}
    </ul>`
};
export const PART_LABEL = { brand: '브랜드 표시', spec: '사양표', cmpTable: '비교표', qa: '문답', marks: '인증 마크' };

/* 포인트 머리(번호) */
const ptHead = (d) => `
    <div class="pt-head">
      <span class="pt-no">| POINT ${String(d.no).padStart(2, '0')}</span>
      <span class="pt-dot">${String(d.no).padStart(2, '0')}</span>
    </div>`;

/* ---------------- 섹션별 판형 ----------------
 * layout 이 'overlay' 계열이면 사진을 섹션 가득 깔고 그 위에 글을 얹는다.
 * 글이 놓이는 쪽에만 어두운 그라데이션(scrim)을 깔아 대비를 확보한다 — 사진 전체를 덮으면
 * 사진이 죽는다. 생성 프롬프트도 그 자리를 비워 두라고 쓴다(prompt.js). */
const R = {
  hero: (d) => `
    <div class="hero-bg">${pic(d.image, 'fill')}</div>
    <div class="hero-scrim"></div>
    <div class="hero-text">
      ${brandMark(d)}
      <p class="eyebrow"${ed('eyebrow', d)}>${lines(d.eyebrow)}</p>
      <h1${ed('title', d)}>${lines(d.title)}</h1>
    </div>`,

  problem: (d) => d.layout === 'overlay' ? `
    <div class="ov-bg">${pic(d.image, 'fill')}</div>
    <div class="ov-scrim top"></div>
    <div class="ov-text top center">
      <p class="kicker"${ed('kicker', d)}>${lines(d.kicker)}</p>
      <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    </div>` : `
    <p class="kicker center"${ed('kicker', d)}>${lines(d.kicker)}</p>
    <h2 class="key center"${ed('headline', d)}>${lines(d.headline)}</h2>
    <div class="tick"></div>
    ${pic(d.image, 'round wide')}`,

  solutionIntro: (d) => `
    <p class="eyebrow center spread"${ed('eyebrow', d)}>${esc(d.eyebrow)}</p>
    <h2 class="center"${ed('headline', d)}>${lines(d.headline)}</h2>
    ${pic(d.image, 'round wide')}
    <div class="tick short"></div>
    <ul class="circles">
      ${(d.icons || []).map((i, n) => `
        <li><span class="circ">${icon(i.icon)}</span><em${ed(`icons.${n}.label`, d)}>${esc(i.label)}</em></li>`).join('')}
    </ul>`,

  featuresGrid: (d) => `
    <h2 class="key center"${ed('headline', d)}>${lines(d.headline)}</h2>
    ${pic(d.image, 'wide')}
    <ul class="grid9">
      ${(d.items || []).map((i, n) => `
        <li>${icon(i.icon)}<em${ed(`items.${n}.label`, d)}>${lines(i.label)}</em></li>`).join('')}
    </ul>`,

  coreSolution: (d) => d.layout === 'overlay' ? `
    <div class="ov-bg">${pic(d.image, 'fill')}</div>
    <div class="ov-scrim top"></div>
    <div class="ov-text top center">
      <p class="check">✓</p>
      <p class="kicker"${ed('specLine', d)}>${lines(d.specLine)}</p>
      <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    </div>` : `
    <p class="check">✓</p>
    <p class="kicker center"${ed('specLine', d)}>${lines(d.specLine)}</p>
    <h2 class="center"${ed('headline', d)}>${lines(d.headline)}</h2>
    ${pic(d.image, 'wide')}`,

  point: (d) => (d.layout === 'overlay' || d.layout === 'overlay-top') ? `
    <div class="ov-bg">${pic(d.image, 'fill')}</div>
    <div class="ov-scrim ${d.layout === 'overlay-top' ? 'top' : 'bottom'}"></div>
    <div class="ov-text ${d.layout === 'overlay-top' ? 'top' : 'bottom'}">
      ${ptHead(d)}
      <h2 class="pt-title"${ed('headline', d)}>${lines(d.headline)}</h2>
      ${d.desc ? `<p class="pt-desc"${ed('desc', d)}>${lines(d.desc)}</p>` : ''}
    </div>` : `
    ${ptHead(d)}
    <h2 class="pt-title"${ed('headline', d)}>${lines(d.headline)}</h2>
    ${d.desc ? `<p class="pt-desc"${ed('desc', d)}>${lines(d.desc)}</p>` : ''}
    ${pic(d.image, 'round wide')}`,

  pointReason: (d) => (d.blocks || []).map((b, n) => `
    <div class="reason">
      ${pic(b.image, 'wide')}
      <p class="en"${ed(`blocks.${n}.en`, d)}>${esc(b.en)}</p>
      <h3${ed(`blocks.${n}.ko`, d)}>${esc(b.ko)}</h3>
      <hr>
      <p class="soft"${ed(`blocks.${n}.desc`, d)}>${esc(b.desc)}</p>
    </div>`).join(''),

  compare: (d) => `
    <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    <p class="soft"${ed('desc', d)}>${lines(d.desc)}</p>
    <div class="cmp">
      <div class="cmp-col ours">
        <p class="cmp-label"${ed('oursLabel', d)}>${esc(d.oursLabel)}</p>
        ${pic(d.oursImage, 'wide')}
      </div>
      <div class="cmp-col theirs">
        <p class="cmp-label"${ed('theirsLabel', d)}>${esc(d.theirsLabel)}</p>
        ${pic(d.theirsImage, 'wide')}
      </div>
    </div>
    ${PARTS.cmpTable(d)}`,

  cert: (d) => `
    <h2 class="center"${ed('headline', d)}>${lines(d.headline)}</h2>
    ${PARTS.marks(d)}
    <p class="soft center small"${ed('note', d)}>${esc(d.note)}</p>`,

  usecase: (d) => d.layout === 'overlay' ? `
    <h2 class="center"${ed('headline', d)}>${lines(d.headline)}</h2>
    <ul class="uses-ov">
      ${(d.items || []).map((i, n) => `
        <li>
          ${pic(i.image, 'fill')}
          <div class="ov-scrim bottom"></div>
          <div class="cap">
            <h4${ed(`items.${n}.title`, d)}>${esc(i.title)}</h4>
            <p${ed(`items.${n}.desc`, d)}>${esc(i.desc)}</p>
          </div>
        </li>`).join('')}
    </ul>` : `
    <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    <ul class="uses">
      ${(d.items || []).map((i, n) => `
        <li>
          ${pic(i.image, 'tall')}
          <h4${ed(`items.${n}.title`, d)}>${esc(i.title)}</h4>
          <p class="soft small"${ed(`items.${n}.desc`, d)}>${esc(i.desc)}</p>
        </li>`).join('')}
    </ul>`,

  recommend: (d) => d.layout === 'overlay' ? `
    <div class="rc-top">
      ${pic(d.image, 'fill')}
      <div class="ov-scrim bottom"></div>
      <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    </div>
    <ul class="checks">
      ${(d.items || []).map((t, n) => `<li${ed(`items.${n}`, d)}>${esc(t)}</li>`).join('')}
    </ul>` : `
    <h2 class="key"${ed('headline', d)}>${lines(d.headline)}</h2>
    <ul class="checks">
      ${(d.items || []).map((t, n) => `<li${ed(`items.${n}`, d)}>${esc(t)}</li>`).join('')}
    </ul>
    ${pic(d.image, 'circle')}`,

  spec: (d) => `
    ${pic(d.image, 'wide')}
    <h2 class="small-title"${ed('headline', d)}>${lines(d.headline)}</h2>
    ${PARTS.spec(d)}`,

  care: (d) => `
    <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    <ul class="notes">
      ${(d.items || []).map((t, n) => `<li${ed(`items.${n}`, d)}>${esc(t)}</li>`).join('')}
    </ul>`,

  faq: (d) => `
    <p class="kicker">${esc(d.model ?? '')}</p>
    <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    ${PARTS.qa(d)}
    <p class="credit">${esc(d.credit ?? '')}</p>`,

  textBlock: (d) => `
    <h2${ed('headline', d)}>${lines(d.headline)}</h2>
    <p class="body"${ed('body', d)}>${lines(d.body)}</p>`,

  imageBlock: (d) => `
    ${pic(d.image, 'wide')}
    <p class="caption"${ed('caption', d)}>${lines(d.caption)}</p>`,

  photoText: (d) => `
    <div class="ov-bg">${pic(d.image, 'fill')}</div>
    <div class="ov-scrim bottom"></div>
    <div class="ov-text bottom">
      <h2${ed('headline', d)}>${lines(d.headline)}</h2>
      <p class="ov-body"${ed('body', d)}>${lines(d.body)}</p>
    </div>`,

  spacer: () => '<div class="sp"></div>',

  aiNotice: (d) => `<p class="ai-note"${ed('text', d)}>* ${esc(d.text)}</p>`
};

/* 판형마다 고를 수 있는 배치. 첫 번째가 기본이다. */
export const LAYOUTS = {
  problem: [['', '글 위 · 사진 아래'], ['overlay', '사진 위에 글']],
  coreSolution: [['', '글 위 · 사진 아래'], ['overlay', '사진 위에 글']],
  point: [['', '컬러 바탕 · 사진 아래'], ['overlay', '사진 위에 글(아래쪽)'], ['overlay-top', '사진 위에 글(위쪽)']],
  usecase: [['', '세 칸 나란히'], ['overlay', '큰 사진 위에 글']],
  recommend: [['', '목록 · 원형 사진'], ['overlay', '사진 위 제목 · 목록']]
};

/* ------------------------------------------------------------------
   개체 층 — 섹션 위에 자유롭게 놓는 글상자 · 도형 · 선 · 이미지 · 덩어리

   PowerPoint 의 슬라이드처럼 개체는 섹션에 붙어 있다. 섹션 순서를 바꾸면 따라가고,
   내보낼 때 섹션 한 장에 같이 찍힌다.

   3단계에 들어가면 판형으로 그린 섹션을 낱개 개체로 푼다(web/freeze.js). 그 뒤로 그 섹션은
   free 이고, 화면에 보이는 것은 전부 개체다. 글과 사진 자리는 섹션 data 와 묶여(bind) 있어서
   개체를 옮기거나 키워도 글은 data 에 남는다 — 근거 검사와 2단계 글 칸이 그대로 그 글을 본다.

   좌표는 폭 860 기준(DESIGN_W)의 px 다. 쿠팡(780)·토스(1080)로 내보내면 층 전체를
   폭에 맞춰 늘리거나 줄인다(--k). 그래서 개체끼리의 배치는 어느 폭에서나 같다.

   개체 하나는 이렇게 생겼다.
     { id, type: 'text' | 'shape' | 'line' | 'image' | 'block', x, y, w, h, rot,
       shape: 'rect' | 'round' | 'ellipse' | 'triangle',   (shape)
       grad: { angle, stops: [{ c, a, p }] },              (shape 그라데이션)
       x1, y1, x2, y2, arrow: 'none' | 'end' | 'start' | 'both',  (line)
       fill, stroke, sw, dash, r, opacity, shadow,
       text, style: {font, face, size, weight, color, …}, pad,   (text)
       url, crop, fit, blend,                             (image)
       part,                                              (block — 사양표·문답처럼 줄이 많은 덩어리)
       bind: 'headline' | 'items.0.image' …  — 섹션 data 의 그 자리를 보여 준다(text · image)
       behind: true 이면 본문 뒤, group: 같은 값끼리 한 묶음,
       lock: true 이면 화면에서 눌러지지 않는다(사진 위 그라데이션 막처럼) — 레이어 목록에서 고른다 }
------------------------------------------------------------------ */
export const DESIGN_W = 860;
export const SHAPE_KINDS = ['rect', 'round', 'ellipse', 'triangle'];
const DASHES = ['solid', 'dashed', 'dotted'];
const IMG_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const nn = (v, lo, hi, d) => num(v, lo, hi) ?? d;
const safeId = (v) => String(v || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
const BIND = /^[A-Za-z]+(\.(\d{1,3}|[A-Za-z]+))*$/;

/* data 안의 경로('items.2.image')를 따라간다 */
export function getPath(obj, path) {
  if (!obj || typeof path !== 'string' || !BIND.test(path)) return undefined;
  let node = obj;
  for (const k of path.split('.')) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[/^\d+$/.test(k) ? Number(k) : k];
  }
  return node;
}

function gradCss(g) {
  if (!g || !Array.isArray(g.stops) || g.stops.length < 2) return null;
  const ang = nn(g.angle, -360, 360, 180);
  const stops = g.stops.slice(0, 8).map((st) => {
    const c = paintA(st && st.c, st && st.a);
    if (!c) return null;
    const p = st.p != null ? num(st.p, 0, 100) : null;
    return p == null ? c : `${c} ${p}%`;
  });
  return stops.some((x) => !x) ? null : `linear-gradient(${ang}deg,${stops.join(',')})`;
}

/* 틀(글상자·도형·이미지)의 바깥선과 채우기 */
function boxCss(o) {
  const fill = paint(o.fill);
  const grad = gradCss(o.grad);
  const stroke = paint(o.stroke);
  const sw = nn(o.sw, 0, 40, 0);
  const dash = DASHES.includes(o.dash) ? o.dash : 'solid';
  const out = [];
  if (grad) out.push(`background:${grad}`);
  else if (fill) out.push(`background:${fill}`);
  if (stroke && sw > 0) out.push(`border:${sw}px ${dash} ${stroke}`);
  return out;
}

export const BOX_SHADOWS = {
  soft: '0 8px 28px rgba(0,0,0,.18)',
  strong: '0 16px 44px rgba(0,0,0,.38)'
};

/* 회전 · 불투명도 · 그림자 · 합성 */
function fx(o, { shadow = true } = {}) {
  const out = [];
  const rot = nn(o.rot, -360, 360, 0);
  if (rot) out.push(`transform:rotate(${rot}deg)`);
  const op = nn(o.opacity, 0, 1, 1);
  if (op < 1) out.push(`opacity:${op}`);
  if (shadow && BOX_SHADOWS[o.shadow]) out.push(`box-shadow:${BOX_SHADOWS[o.shadow]}`);
  /* 흰(검은) 바탕에 그린 아이콘의 바탕을 지운다. 개체 자신에 걸어야 아래 층과 섞인다. */
  if (o.blend === 'multiply' || o.blend === 'screen') out.push(`mix-blend-mode:${o.blend}`);
  return out;
}

function lineSvg(o, uid) {
  const x1 = nn(o.x1, -2000, 4000, 0), y1 = nn(o.y1, -2000, 20000, 0);
  const x2 = nn(o.x2, -2000, 4000, 100), y2 = nn(o.y2, -2000, 20000, 0);
  const sw = nn(o.sw, 0.5, 40, 3);
  const stroke = paint(o.stroke) || '#111111';
  const dash = o.dash === 'dashed' ? `${sw * 3} ${sw * 2}` : o.dash === 'dotted' ? `0.1 ${sw * 2}` : '';
  const pad = sw * 4 + 12;
  const left = Math.min(x1, x2) - pad;
  const top = Math.min(y1, y2) - pad;
  const W = Math.abs(x2 - x1) + pad * 2;
  const H = Math.abs(y2 - y1) + pad * 2;
  const a = ['end', 'start', 'both'].includes(o.arrow) ? o.arrow : 'none';
  /* 화살촉은 선 굵기에 따라 커진다. 시작 쪽은 orient 로 뒤집어 바깥을 향하게 한다. */
  const mk = a === 'none' ? '' : `<defs><marker id="${uid}" viewBox="0 0 10 10" refX="7" refY="5"
      markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${stroke}"/></marker></defs>`;
  const ends = (a === 'end' || a === 'both' ? ` marker-end="url(#${uid})"` : '') +
               (a === 'start' || a === 'both' ? ` marker-start="url(#${uid})"` : '');
  const X = (x) => (x - left).toFixed(1);
  const Y = (y) => (y - top).toFixed(1);
  return {
    box: `left:${left}px;top:${top}px;width:${W}px;height:${H}px`,
    svg: `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${mk}
      <line class="hit" x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}"
        stroke="transparent" stroke-width="${sw + 16}" stroke-linecap="round"/>
      <line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}"
        stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${ends}/></svg>`
  };
}

/* 개체 하나 → HTML.
 * prefix 는 화살촉 id 가 문서 안에서 겹치지 않게 붙인다.
 * ctx = { data, product, i } — 묶인(bind) 개체가 섹션 data 와 제품 정보를 읽는다. */
export function objHtml(o, prefix = '', ctx = {}) {
  if (!o || typeof o !== 'object') return '';
  const id = safeId(o.id);
  const x = nn(o.x, -2000, 4000, 0);
  const y = nn(o.y, -2000, 20000, 0);
  const w = nn(o.w, 0.5, 4000, 160);
  const h = nn(o.h, 0.5, 20000, 100);
  const r = nn(o.r, 0, 2000, 0);
  const base = [`left:${x}px`, `top:${y}px`, `width:${w}px`];
  const lk = o.lock ? ' locked' : '';
  const open = (cls, css, extra = '') =>
    `<div class="ob ${cls}${lk}" data-ob="${id}"${extra} style="${escAttr(css.filter(Boolean).join(';'))}">`;

  if (o.type === 'line') {
    const { box, svg } = lineSvg(o, `ar${prefix}${id}`);
    const op = nn(o.opacity, 0, 1, 1);
    return `<div class="ob ob-line${lk}" data-ob="${id}" style="${box}${op < 1 ? `;opacity:${op}` : ''}">${svg}</div>`;
  }

  if (o.type === 'text') {
    const pad = nn(o.pad, 0, 200, 8);
    const text = o.bind ? getPath(ctx.data, o.bind) : o.text;
    if (o.bind && typeof text !== 'string') return '';
    const css = [...base, `min-height:${h}px`, `padding:${pad}px`, `border-radius:${r}px`, ...boxCss(o),
      ...fx(o, { shadow: !!(paint(o.fill) || o.grad) })];
    return `${open('ob-text', css)}<div class="tx" style="${escAttr(textCss(o.style))}">${lines(text)}</div></div>`;
  }

  if (o.type === 'image') {
    const radius = o.shape === 'ellipse' ? '50%' : `${r}px`;
    const css = [...base, `height:${h}px`, `border-radius:${radius}`, ...boxCss(o), ...fx(o)];
    if (o.bind) {
      const v = getPath(ctx.data, o.bind);
      if (!v || typeof v !== 'object' || v.off) return '';
      const path = ` data-path="${escAttr(`${ctx.i}.${o.bind}`)}"`;
      const isIcon = v.cut === 'icon';
      if (v.url && IMG_URL.test(v.url)) {
        const im = v.crop ? cropStyle(v.crop) : `object-fit:${isIcon || o.fit === 'contain' ? 'contain' : 'cover'}`;
        return `${open('ob-image', css, path)}<img src="${v.url}" alt="" style="${im}"></div>`;
      }
      return isIcon
        ? `${open('ob-image ob-slot ob-ico', css, path)}</div>`
        : `${open('ob-image ob-slot', css, path)}<span class="pic-label">${esc(v.label)}</span></div>`;
    }
    if (!IMG_URL.test(o.url || '')) return '';
    const im = o.crop ? cropStyle(o.crop) : `object-fit:${o.fit === 'contain' ? 'contain' : 'cover'}`;
    return `${open('ob-image', css)}<img src="${o.url}" alt="" style="${im}"></div>`;
  }

  if (o.type === 'block') {
    const fn = PARTS[o.part];
    if (!fn) return '';
    const css = [...base, `min-height:${h}px`, ...fx(o, { shadow: false }), textCss(o.style)];
    return `${open(`ob-block ob-${o.part}`, css)}${fn(ctx.data || {}, ctx.product || {})}</div>`;
  }

  /* 도형 */
  const kind = SHAPE_KINDS.includes(o.shape) ? o.shape : 'rect';
  if (kind === 'triangle') {
    const fill = paint(o.fill);
    const stroke = paint(o.stroke);
    const sw = nn(o.sw, 0, 40, 0);
    const dash = o.dash === 'dashed' ? `${sw * 3} ${sw * 2}` : o.dash === 'dotted' ? `${sw} ${sw * 1.6}` : '';
    return `${open('ob-shape ob-tri', [...base, `height:${h}px`, ...fx(o, { shadow: false })])}
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="50,0 100,100 0,100" fill="${fill || 'none'}"
          stroke="${stroke && sw ? stroke : 'none'}" stroke-width="${sw}" vector-effect="non-scaling-stroke"
          stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/></svg></div>`;
  }
  const radius = kind === 'ellipse' ? '50%' : kind === 'round' ? `${Math.max(r, 1)}px` : `${r}px`;
  return `${open(`ob-shape ob-${kind}`, [...base, `height:${h}px`, `border-radius:${radius}`, ...boxCss(o), ...fx(o)])}</div>`;
}

/* 판형 섹션 위에 얹은 개체: 본문 뒤 층과 앞 층으로 나눠 그린다. 배열 순서가 곧 쌓는 순서다. */
function layersHtml(s, i, ctx) {
  const objs = Array.isArray(s.objects) ? s.objects : [];
  if (!objs.length) return '';
  const part = (arr, cls) => (arr.length
    ? `<div class="layer ${cls}">${arr.map((o) => objHtml(o, `s${i}`, ctx)).join('')}</div>` : '');
  return part(objs.filter((o) => o.behind), 'back') + part(objs.filter((o) => !o.behind), 'front');
}

/* ---------------- 페이지 조립 ---------------- */
export function renderSections(doc) {
  const p = doc.product || {};
  const k = (doc.width || DESIGN_W) / DESIGN_W;
  return doc.sections.map((s, i) => {
    const ctx = { data: s.data || {}, product: p, i };

    /* 낱개 개체로 푼 섹션. 높이는 860 기준 px 로 들고 있다. */
    if (s.free) {
      const h = nn(s.h, 20, 20000, 600);
      const bg = paint(s.style && s.style.bg);
      const css = `height:${(h * k).toFixed(2)}px${bg ? `;background:${bg}` : ''}`;
      const objs = Array.isArray(s.objects) ? s.objects : [];
      const ordered = [...objs.filter((o) => o.behind), ...objs.filter((o) => !o.behind)];
      return `<section class="pg pg-${s.type} pg-free" data-i="${i}" data-type="${s.type}" style="${escAttr(css)}"><div class="layer">${
        ordered.map((o) => objHtml(o, `s${i}`, ctx)).join('')}</div></section>`;
    }

    const fn = R[s.type];
    if (!fn) return '';
    /* 히어로와 FAQ 는 제품 정보를 함께 쓴다 */
    const data = s.type === 'hero' ? { ...s.data, mark: p.brandMark, logo: p.logo }
               : s.type === 'faq' ? { ...s.data, model: `${p.brand} ${p.model}` }
               : s.data;
    const css = sectionCss(s);
    const lay = s.data && LAYOUTS[s.type] && LAYOUTS[s.type].some(([v]) => v && v === s.data.layout)
      ? ` ov ov-${s.data.layout}` : '';
    return `<section class="pg pg-${s.type}${lay}" data-i="${i}" data-type="${s.type}"${css ? ` style="${escAttr(css)}"` : ''}>${fn(data)}${layersHtml(s, i, ctx)}</section>`;
  }).join('\n');
}

export function renderPage(doc) {
  const preset = applyBrandColor(PRESETS[doc.preset] || PRESETS.catalog, doc.keyColor);

  /* 편집 화면에서 고른 글꼴만 따로 받는다. 안 쓴 글꼴까지 받으면 내보내기가 느려진다. */
  const used = new Set();
  for (const s of doc.sections || []) {
    for (const st of Object.values((s.data && s.data.styles) || {})) if (st && st.font) used.add(st.font);
    for (const o of s.objects || []) if (o && o.style && o.style.font) used.add(o.style.font);
  }
  return {
    fontLink: preset.fonts.link,
    extraFontLink: fontsUrl([...used]),
    css: buildCss(preset, doc.width || 860),
    html: `<div class="sheet">${renderSections(doc)}</div>`
  };
}

/* ---------------- 스타일 ---------------- */
/* 어두운 바탕인가 — 아이콘 합성 방식과 프롬프트의 배경색이 달라진다 */
export function darkBg(hex) {
  const m = HEX.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.4;
}

export function buildCss(preset, width) {
  const t = preset.tokens;
  return `
.sheet{
  --key:${t.key}; --key-deep:${t.keyDeep}; --on-key:${t.onKey};
  --ink:${t.ink}; --ink-soft:${t.inkSoft};
  --bg:${t.bg}; --bg-alt:${t.bgAlt}; --line:${t.line};
  --r:${t.radius}; --pad:${t.pad};
  --ts:${t.titleScale}; --tw:${t.titleWeight}; --tt:${t.titleTracking};
  --display:${preset.fonts.display};
  --body:${preset.fonts.body};
  --k:${(width / DESIGN_W).toFixed(5)};
  width:${width}px; margin:0 auto; background:var(--bg); color:var(--ink);
  font-family:var(--body); line-height:1.66; word-break:keep-all;
}
.sheet *{box-sizing:border-box}
.sheet img{display:block;width:100%;height:100%;object-fit:cover}
.sheet p,.sheet h1,.sheet h2,.sheet h3,.sheet h4{margin:0}
.sheet ul{margin:0;padding:0;list-style:none}

.pg{padding:var(--pad);position:relative;z-index:0;background:var(--bg)}

/* 개체 층. 폭 860 기준 좌표를 쓰고 판 폭에 맞춰 통째로 늘리거나 줄인다.
 * 본문 뒤 층은 섹션 배경 위, 본문 아래에 깔린다(z-index -1 + 섹션이 쌓임 맥락). */
.layer{position:absolute;left:0;top:0;width:${DESIGN_W}px;height:calc(100% / var(--k));
  transform:scale(var(--k));transform-origin:0 0;overflow:hidden;pointer-events:none}
.layer.back{z-index:-1}
.layer.front{z-index:6}
.ob{position:absolute;pointer-events:auto}
.ob-text{word-break:keep-all;overflow-wrap:break-word}
.ob-text .tx{font-size:24px;line-height:1.5;color:var(--ink);min-height:1em}
.ob-image{overflow:hidden}
.ob-image img{width:100%;height:100%;display:block}
.ob-slot{display:flex;align-items:center;justify-content:center;background:var(--bg-alt);
  border:1px dashed var(--line);text-align:center}
.ob-slot .pic-label{font-size:13px;color:var(--ink-soft);letter-spacing:.04em;padding:0 10px}
.ob-slot.ob-ico{background:transparent;border:1.5px dashed rgba(128,128,128,.65);border-radius:4px}
.ob-block{color:var(--ink)}
.ob-brand .logo{display:flex;justify-content:center}
.ob-brand .logo-box{display:block;overflow:hidden}
.ob-brand .logo img{width:auto;max-width:none;object-fit:contain;filter:drop-shadow(0 2px 12px rgba(0,0,0,.45))}
.ob-brand .logo.plate{display:flex;width:max-content;padding:14px 20px;border-radius:calc(var(--r) + 2px);
  background:rgba(255,255,255,.95);margin:0 auto}
.ob-brand .logo.plate img{filter:none}
.ob-brand .mark{font-family:var(--display);font-size:26px;letter-spacing:.14em;text-align:center}
.ob-spec .spec,.ob-cmpTable .cmp-table,.ob-qa .qa,.ob-marks .marks{margin-top:0}

/* 낱개 개체로 푼 섹션. 높이는 인라인으로 주고, 바탕은 개체 층이 이어받는다 —
 * 아이콘의 합성(multiply·screen)이 층 안에서 일어나므로 층에 바탕이 있어야 한다. */
.pg-free{padding:0!important;box-sizing:content-box;aspect-ratio:auto!important;min-height:0!important;
  overflow:hidden;border-top:0!important}
.pg-free > .layer{background:inherit;z-index:auto}
.ob-tri svg{display:block;overflow:visible}
.ob-line{pointer-events:none}
.ob-line svg{display:block;overflow:visible}
.ob-line .hit{pointer-events:stroke}
.pg + .pg{border-top:1px solid var(--line)}

h1,h2,h3,h4{font-family:var(--display);font-weight:var(--tw);letter-spacing:var(--tt);line-height:1.24}
h2{font-size:calc(38px * var(--ts));margin-bottom:18px;text-wrap:balance}
h2.small-title{font-size:calc(24px * var(--ts))}
h3{font-size:calc(24px * var(--ts))}
h4{font-size:calc(17px * var(--ts));margin-bottom:5px}
.center{text-align:center}
.key{color:var(--key)}
.soft{color:var(--ink-soft);font-size:15px}
.small{font-size:13.5px}
.kicker{color:var(--ink-soft);font-size:16px;margin-bottom:12px;line-height:1.5}
.eyebrow{font-size:14px;letter-spacing:.06em;color:var(--ink-soft);margin-bottom:10px}
.eyebrow.spread{letter-spacing:.16em;font-size:12.5px;text-transform:uppercase}

.pic{background:var(--bg-alt);border-radius:var(--r);overflow:hidden}
.pic.wide{aspect-ratio:4/3;margin-top:22px}
.pic.tall{aspect-ratio:3/4}
.pic.round{border-radius:calc(var(--r) * 2)}
.pic.circle{aspect-ratio:1;border-radius:50%;max-width:62%;margin:26px auto 0}
.pic.fill{width:100%;height:100%;border-radius:0}
.pic{position:relative}
.pic.slot{display:flex;align-items:center;justify-content:center;
  border:1px dashed var(--line);padding:18px;overflow:hidden}
.pic.slot .pic-label{font-size:13px;color:var(--ink-soft);letter-spacing:.04em}

/* 히어로 */
.pg-hero{padding:0;aspect-ratio:3/4;overflow:hidden}
.pg-hero .hero-bg{position:absolute;inset:0}
.pg-hero .hero-bg .pic{height:100%;border:0}
/* 사진 위에 얹힌 막과 글이 클릭을 가로채지 않게 한다. 미리보기의 사진 단추가 그 아래에 있다. */
.hero-scrim,.hero-text{pointer-events:none}
.hero-text [data-edit]{pointer-events:auto}
.hero-scrim{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(10,12,15,.55),rgba(10,12,15,.12) 46%,rgba(10,12,15,0) 66%)}
.hero-text{position:absolute;left:0;right:0;top:7%;padding:0 8%;text-align:center;color:#fff;
  text-shadow:0 2px 16px rgba(0,0,0,.4)}
.hero-text .mark{font-family:var(--display);font-size:26px;letter-spacing:.14em;margin-bottom:16px}
.hero-text .logo{display:flex;justify-content:center;margin-bottom:20px}
.hero-text .logo-box{display:block;overflow:hidden}
.hero-text .logo img{width:auto;max-width:none;object-fit:contain;
  filter:drop-shadow(0 2px 12px rgba(0,0,0,.45))}
/* 어두운 로고는 어두운 히어로에 묻히므로 흰 판 위에 올린다 */
.hero-text .logo.plate{display:inline-flex;padding:14px 20px;border-radius:calc(var(--r) + 2px);
  background:rgba(255,255,255,.95);margin:0 auto 20px}
.hero-text .logo.plate img{filter:none}
.hero-text .eyebrow{color:rgba(255,255,255,.92);font-size:19px;margin-bottom:6px}
.hero-text h1{font-size:calc(56px * var(--ts));color:#fff}

/* 사진 위에 글 — 사진을 섹션 가득 깔고, 글이 놓이는 쪽에만 그라데이션을 깐다 */
/* 사진이 섹션 전체를 덮는 배치(문제 · 핵심 · 포인트)만 어두운 바탕. 사용 장면 · 추천은 바탕 위의 사진 카드다. */
.pg-problem.ov,.pg-point.ov,.pg-coreSolution.ov{padding:0;overflow:hidden;background:#15171a;color:#fff}
.pg-problem.ov{aspect-ratio:1/1}
.pg-photoText{padding:0;aspect-ratio:4/5;overflow:hidden;background:#15171a;color:#fff}
.pg-photoText .pic.slot{background:#2b2e33;border:0}
.pg-photoText .pic.slot .pic-label{color:rgba(255,255,255,.6)}
.ov-text .ov-body{font-size:19px;line-height:1.6;opacity:.92}
.pg-point.ov,.pg-coreSolution.ov{aspect-ratio:4/5}
.ov-bg{position:absolute;inset:0}
.ov-bg .pic,.uses-ov .pic,.rc-top .pic{position:absolute;inset:0;height:100%;border:0;border-radius:0}
.ov .pic.slot{background:#2b2e33;border:0}
.ov .pic.slot .pic-label{color:rgba(255,255,255,.6)}
.pg-usecase.ov h2{text-align:center}
.ov-scrim{position:absolute;inset:0;pointer-events:none}
.ov-scrim.top{background:linear-gradient(180deg,rgba(8,10,12,.74) 0%,rgba(8,10,12,.42) 30%,rgba(8,10,12,0) 56%)}
.ov-scrim.bottom{background:linear-gradient(0deg,rgba(8,10,12,.8) 0%,rgba(8,10,12,.44) 30%,rgba(8,10,12,0) 56%)}
.ov-text{position:absolute;left:0;right:0;padding:0 56px;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.35)}
.ov-text [data-edit]{pointer-events:auto}
.ov-text.top{top:76px}
.ov-text.bottom{bottom:76px}
.ov-text h2{font-size:calc(46px * var(--ts));color:#fff;margin-bottom:14px}
.ov-text .kicker{color:rgba(255,255,255,.86);font-size:19px}
.ov-text .check{color:#fff}
.pg-point.ov .pt-head{opacity:.92;margin-bottom:16px}
.pg-point.ov .pt-title{font-size:calc(46px * var(--ts))}
.pg-point.ov .pt-desc{font-size:19px;opacity:.94}
.uses-ov{display:grid;gap:18px;margin-top:26px}
.uses-ov li{position:relative;aspect-ratio:16/10;border-radius:var(--r);overflow:hidden;background:#2b2e33}
.uses-ov .cap{position:absolute;left:32px;right:32px;bottom:28px;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.35)}
.uses-ov h4{font-size:calc(28px * var(--ts));margin-bottom:6px;color:#fff}
.uses-ov .cap p{font-size:17px;opacity:.92}
.pg-recommend.ov{padding:0 0 64px}
.rc-top{position:relative;aspect-ratio:16/11;overflow:hidden;background:#2b2e33}
.rc-top h2{position:absolute;left:48px;right:48px;bottom:44px;margin:0;color:#fff;
  font-size:calc(46px * var(--ts));text-shadow:0 2px 14px rgba(0,0,0,.35)}
.pg-recommend.ov .checks{margin:28px 48px 0}
.pg-recommend.ov .checks li{font-size:20px;padding:18px 0 18px 40px;margin:0;border-bottom:1px solid var(--line)}
.pg-recommend.ov .checks li::before{left:6px;top:18px}

/* 문제 · 솔루션 도입 */
.pg-problem{background:var(--bg-alt)}
.tick{width:1px;height:28px;background:var(--line);margin:20px auto 0}
.tick.short{height:20px;margin:18px auto 0}
.circles{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:18px;text-align:center}
.circles .circ{display:flex;align-items:center;justify-content:center;
  width:74px;height:74px;border-radius:50%;background:var(--key);color:var(--on-key);
  margin:0 auto 10px}
.circles .circ .ico{margin:0;width:34px;height:34px}
.circles .circ .ico.slot{border-color:rgba(255,255,255,.5)}
.circles em{font-style:normal;color:var(--key);font-weight:600;font-size:14.5px}

/* 특장점 9칸 */
.grid9{display:grid;grid-template-columns:repeat(3,1fr);margin-top:26px;
  border-top:1px solid var(--line);border-left:1px solid var(--line)}
.grid9 li{border-right:1px solid var(--line);border-bottom:1px solid var(--line);
  padding:24px 12px;text-align:center}
.ico{display:block;width:40px;height:40px;margin:0 auto 12px}
.ico img{width:100%;height:100%;object-fit:contain}
.ico.slot{border:1px dashed var(--line);border-radius:4px}
/* 생성형 AI 는 투명 배경을 잘 못 낸다. 그래서 흰 바탕(또는 검은 바탕)에 그린 아이콘을 받아
 * 합성 모드로 바탕을 지운다. 밝은 면 위 아이콘은 multiply 로 흰색이, 색 원이나 어두운 면 위
 * 아이콘은 screen 으로 검정이 사라진다. */
.ico{position:relative}
.ico img{mix-blend-mode:multiply}
.circles .circ .ico img{mix-blend-mode:screen}
${darkBg(t.bg) ? '.ico img{mix-blend-mode:screen}' : ''}
.grid9 em{font-style:normal;font-size:13.5px;line-height:1.5}

.check{text-align:center;font-size:20px;color:var(--on-key);margin-bottom:14px}
.pg-coreSolution .check{width:38px;height:38px;border-radius:50%;background:var(--key-deep);
  display:flex;align-items:center;justify-content:center;margin:0 auto 18px}

/* 포인트 — 컬러 풀블리드 */
.pg-point{background:var(--key);color:var(--on-key)}
.pg-point .pt-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;
  font-size:13px;letter-spacing:.12em;opacity:.9}
.pg-point .pt-dot{width:24px;height:24px;border-radius:50%;
  border:1px solid currentColor;display:flex;align-items:center;justify-content:center;font-size:11px}
.pg-point .pt-title{font-size:calc(38px * var(--ts))}
/* 제목이 이득을 말하면, 이 줄이 그 근거(수치)를 댄다 */
.pg-point .pt-desc{font-size:16px;line-height:1.55;opacity:.92;margin:12px 0 6px}
.pg-point .pic{background:rgba(0,0,0,.14);border-color:rgba(255,255,255,.35)}
.pg-point .pic.slot span{color:rgba(255,255,255,.7)}

/* 포인트 이유 */
.reason + .reason{margin-top:48px}
.reason .en{font-size:12.5px;letter-spacing:.14em;color:var(--ink-soft);margin:22px 0 6px}
.reason hr{border:0;border-top:1px solid var(--line);margin:14px 0}

/* 비교 */
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
.cmp-label{font-size:14px;font-weight:600;padding:9px 12px;text-align:center}
.cmp-col.ours .cmp-label{background:var(--key);color:var(--on-key)}
.cmp-col.theirs .cmp-label{background:var(--bg-alt);color:var(--ink-soft)}
.cmp-col .pic{margin-top:0;border-radius:0}
.cmp-col.theirs .pic{opacity:.62}
.cmp-table{width:100%;border-collapse:collapse;margin-top:20px;font-size:14px}
.cmp-table th{text-align:left;padding:11px 12px;background:var(--bg-alt);width:24%;font-weight:600}
.cmp-table td{padding:11px 12px;border-bottom:1px solid var(--line);color:var(--ink-soft)}
.cmp-table td.win{color:var(--ink);font-weight:600}

/* 인증 */
.marks{display:flex;gap:14px;justify-content:center;margin:24px 0 18px}
.marks li{width:78px;height:78px;border:2px solid var(--ink);border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;
  font-family:var(--display)}

/* 사용 장면 */
.uses{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px}
.uses h4{margin-top:12px}

/* 추천 */
.checks{margin-top:20px}
.checks li{position:relative;padding-left:30px;margin-bottom:12px;font-size:16px}
.checks li::before{content:"✓";position:absolute;left:4px;top:0;color:var(--key);font-weight:700}

/* 사양 */
.spec{width:100%;border-collapse:collapse;margin-top:16px;font-size:14.5px}
.spec th{text-align:left;padding:12px 4px;width:30%;font-weight:600;vertical-align:top}
.spec td{padding:12px 4px;color:var(--ink-soft);border-bottom:1px solid var(--line)}
.spec tr:first-child td,.spec tr:first-child th{border-top:1px solid var(--line)}
.spec td.todo{color:#B8860B;border:1px dashed #D9A441;border-radius:3px;padding:6px 8px}

/* 자유 블록 */
.pg-textBlock .body{font-size:16px;line-height:1.75;color:var(--ink-soft);margin-top:14px}
.pg-imageBlock .caption{font-size:13.5px;color:var(--ink-soft);margin-top:12px;text-align:center}
.pg-spacer{padding:0;min-height:120px;border-top:0!important;background:transparent}
.pg-spacer .sp{min-height:inherit}

/* 안내 · FAQ */
.pg-care{background:var(--bg-alt)}
.notes{margin-top:18px}
.notes li{position:relative;padding-left:16px;margin-bottom:11px;font-size:14.5px;color:var(--ink-soft)}
.notes li::before{content:"·";position:absolute;left:4px;font-weight:800}
.qa{margin-top:22px}
.qa .q{background:var(--bg-alt);padding:14px 16px;font-weight:600;font-size:15.5px;border-radius:var(--r)}
.qa .a{padding:14px 16px 24px;color:var(--ink-soft);font-size:14.5px}
.qa b{color:var(--key);margin-right:8px}
.credit{margin-top:14px;text-align:right;font-size:12.5px;color:var(--ink-soft)}

.pg-aiNotice{padding:18px 48px;background:var(--bg-alt)}
.ai-note{font-size:12px;color:var(--ink-soft);text-align:center}
`;
}
