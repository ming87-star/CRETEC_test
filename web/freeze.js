/* 판형 → 낱개 개체
 *
 * 2단계 초안은 판형(src/render.js 의 R)으로 그린다. 판형은 글과 사진의 자리를 정해 두고
 * 값만 바꾸게 한다. 3단계에서는 PowerPoint 처럼 제목 하나, 사진 하나, 아이콘 하나를 따로
 * 옮기고 겹치고 순서를 바꿔야 한다. 그래서 3단계에 들어가면 판형이 그린 화면을 재서
 * 보이는 그대로 개체로 바꾼다. 바꾼 뒤의 섹션은 free 이고 화면에 보이는 건 전부 개체다.
 *
 *   글(data-edit)        → 글상자. 섹션 data 의 그 칸과 묶인다(bind). 글을 고치면 data 가 바뀐다.
 *   사진 자리(.pic)      → 이미지. data 의 사진 자리와 묶인다. 프롬프트 · 올리기 · 크롭이 그대로 된다.
 *   아이콘 자리(.ico)    → 이미지. 바탕 지우기(multiply · screen)를 개체에 건다.
 *   바탕·테두리가 있는 상자 → 도형(사각형 · 둥근 사각형 · 원). 한쪽 테두리는 얇은 사각형.
 *   그라데이션 막        → 그라데이션 도형
 *   표 · 문답 · 인증 마크 · 브랜드 표시 → 덩어리(block). 줄이 늘고 주는 것이라 통째로 둔다.
 *
 * 상자(바탕이 있는 칸) 안에서 나온 개체는 그 상자와 한 묶음이 된다 — 원 안의 아이콘처럼.
 *
 * 색은 스타일 색(대표색 · 글자색 …)과 같으면 이름으로 남긴다. 2단계에서 대표색을 바꿔도
 * 풀어 놓은 섹션이 따라 바뀐다.
 *
 * 화면 밖에 폭 860 으로 한 번 그려서 잰다. 웹폰트가 붙은 뒤에 재야 글 높이가 맞는다.
 */

import { DESIGN_W, renderSections, getPath, darkBg } from '/src/render.js';
import { FONT_CHOICES } from '/src/presets.js';

const FAMILIES = new Set(FONT_CHOICES.map((f) => f.family));
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const uid = () => 'o' + Math.random().toString(36).slice(2, 9);

/* 'rgb(1, 2, 3)' / 'rgba(1, 2, 3, .5)' → { r, g, b, a } */
function rgba(c) {
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(c || '');
  if (!m) return null;
  let a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (!Number.isFinite(a)) a = 1;
  return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]), a };
}
const hex2 = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
const toHex = (c) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

/* 섹션 하나를 개체로 바꾸는 데 필요한 값들 */
function readEnv(sheet) {
  const probe = document.createElement('i');
  sheet.appendChild(probe);
  const tok = {};
  for (const t of ['key', 'key-deep', 'on-key', 'ink', 'ink-soft', 'bg', 'bg-alt', 'line']) {
    probe.style.color = `var(--${t})`;
    tok[t] = rgba(getComputedStyle(probe).color);
  }
  probe.style.color = '';
  probe.style.fontFamily = 'var(--display)';
  const display = getComputedStyle(probe).fontFamily;
  probe.style.fontFamily = 'var(--body)';
  const body = getComputedStyle(probe).fontFamily;
  probe.remove();
  return { tok, faces: { display, body }, dark: darkBg(tok.bg ? toHex(tok.bg) : '#ffffff') };
}

const same = (a, b) => a && b && a.r === b.r && a.g === b.g && b.b === a.b;

/* 색 → 저장할 값. 스타일 색과 같으면 이름으로.
 * 쓰임(role)마다 후보가 다르다 — 흰 글자를 바탕색(흰색) 이름으로 두면 어두운 스타일로
 * 바꿨을 때 글자가 검게 변한다. */
function colorOf(css, role, env, onKey = false) {
  const c = rgba(css);
  if (!c || c.a === 0) return null;
  if (c.a >= 0.999) {
    const cand = role === 'text' ? ['ink', 'ink-soft', 'key', ...(onKey ? ['on-key'] : [])]
      : role === 'line' ? ['line', 'key', 'ink', 'ink-soft']
      : ['bg', 'bg-alt', 'key', 'key-deep', 'line', 'ink'];
    for (const t of cand) if (same(c, env.tok[t])) return `var:${t}`;
    return toHex(c);
  }
  return toHex(c) + hex2(Math.round(c.a * 255));
}

/* 'linear-gradient(rgba(..) 0%, ...)' → { angle, stops } */
function gradOf(img) {
  if (!img || !img.startsWith('linear-gradient(')) return null;
  const body = img.slice('linear-gradient('.length, -1);
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  let angle = 180;
  if (/^(-?[\d.]+)deg$/.test(parts[0])) angle = parseFloat(parts.shift());
  else if (/^to /.test(parts[0])) {
    const d = parts.shift();
    angle = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270 }[d] ?? 180;
  }
  const stops = parts.map((p) => {
    const m = /^(rgba?\([^)]*\))\s*([\d.]+%)?$/.exec(p);
    if (!m) return null;
    const c = rgba(m[1]);
    return c && { c: toHex(c), a: r3(c.a), p: m[2] ? parseFloat(m[2]) : null };
  });
  if (stops.some((x) => !x) || stops.length < 2) return null;
  /* 위치가 빠진 멈춤점은 양 끝을 0 · 100 으로 */
  if (stops[0].p == null) stops[0].p = 0;
  if (stops[stops.length - 1].p == null) stops[stops.length - 1].p = 100;
  return { angle, stops: stops.map((s) => (s.p == null ? { c: s.c, a: s.a } : s)) };
}

const px = (v) => parseFloat(v) || 0;

function edges(cs) {
  return {
    bt: px(cs.borderTopWidth), br: px(cs.borderRightWidth), bb: px(cs.borderBottomWidth), bl: px(cs.borderLeftWidth),
    pt: px(cs.paddingTop), pr: px(cs.paddingRight), pb: px(cs.paddingBottom), pl: px(cs.paddingLeft)
  };
}

const BLOCKS = [['table.spec', 'spec'], ['table.cmp-table', 'cmpTable'], ['.qa', 'qa'], ['.marks', 'marks'],
  ['.logo', 'brand'], ['.mark', 'brand'], ['.credit-line', 'credit']];

/* 섹션 하나를 잰다 */
function convert(pg, s, env) {
  const O = pg.getBoundingClientRect();
  const ox = O.left + pg.clientLeft;
  const oy = O.top + pg.clientTop;
  const rel = (r) => ({ x: r.left - ox, y: r.top - oy, w: r.width, h: r.height });
  const out = [];
  const keyBg = (el) => {
    /* 글 뒤에 깔린 바탕이 대표색인가 — 그렇다면 흰 글자는 '대표색 위 글자색'이다 */
    for (let e = el; e && e !== pg.parentElement; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) return same(c, env.tok.key) || same(c, env.tok['key-deep']);
    }
    return false;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let e = el; e && e !== pg; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity) || 1;
    return r3(o);
  };

  function textStyle(cs, el) {
    const st = {};
    const fam = cs.fontFamily;
    const first = fam.split(',')[0].replace(/["']/g, '').trim();
    if (fam === env.faces.display) st.face = 'display';
    else if (fam === env.faces.body) st.face = 'body';
    else if (FAMILIES.has(first)) st.font = first;
    else st.face = 'body';
    const size = px(cs.fontSize) || 16;
    st.size = r1(size);
    st.weight = Number(cs.fontWeight) || 400;
    const col = colorOf(cs.color, 'text', env, keyBg(el));
    if (col) st.color = col;
    st.align = cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end') ? 'right' : 'left';
    st.lh = cs.lineHeight === 'normal' ? 1.3 : r3(px(cs.lineHeight) / size);
    st.ls = cs.letterSpacing === 'normal' ? 0 : r3(px(cs.letterSpacing) / size);
    if (cs.textTransform === 'uppercase') st.upper = true;
    if (cs.textShadow && cs.textShadow !== 'none') st.shadow = 'soft';
    if (/balance/.test(cs.textWrap || cs.textWrapStyle || '')) st.balance = true;
    return st;
  }

  /* 바탕 · 테두리 → 도형. 만든 도형을 돌려준다(없으면 null). */
  function boxOf(el, cs, R) {
    const bg = rgba(cs.backgroundColor);
    const grad = gradOf(cs.backgroundImage);
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({
      w: px(cs[`border${k}Width`]), st: cs[`border${k}Style`], c: cs[`border${k}Color`]
    }));
    const vis = sides.map((sd) => sd.w > 0 && sd.st !== 'none' && sd.st !== 'hidden');
    const uniform = vis.every(Boolean) && sides.every((sd) => sd.w === sides[0].w && sd.c === sides[0].c);
    const rad = cs.borderTopLeftRadius;
    let r = rad.endsWith('%') ? (parseFloat(rad) / 100) * Math.min(R.w, R.h) : px(rad);
    const op = opacityOf(el);
    let shape = null;
    if ((bg && bg.a > 0) || grad || uniform) {
      const round = r > 0 && Math.min(R.w, R.h) > 4 && r >= Math.min(R.w, R.h) / 2 - 0.5;
      shape = {
        id: uid(), type: 'shape', tpl: true,
        shape: round ? 'ellipse' : r > 0 ? 'round' : 'rect',
        x: r1(R.x), y: r1(R.y), w: r1(R.w), h: r1(R.h), r: round ? 0 : r1(r)
      };
      /* 사진 위에 까는 그라데이션 막은 잠가 둔다 — 안 그러면 그 아래 사진을 누를 수도, 사진을 끌어 놓을 수도 없다 */
      if (grad) { shape.grad = grad; shape.lock = true; }
      else if (bg && bg.a > 0) shape.fill = colorOf(cs.backgroundColor, 'bg', env);
      if (uniform) {
        shape.stroke = colorOf(sides[0].c, 'line', env);
        shape.sw = r1(sides[0].w);
        if (sides[0].st === 'dashed' || sides[0].st === 'dotted') shape.dash = sides[0].st;
      }
      if (op < 1) shape.opacity = op;
      out.push(shape);
    } else if (vis.some(Boolean)) {
      /* 한쪽 테두리(괘선)는 얇은 사각형으로 */
      const [t, rt, b, l] = sides;
      const add = (sd, x, y, w, h) => out.push({ id: uid(), type: 'shape', tpl: true, shape: 'rect',
        x: r1(x), y: r1(y), w: r1(Math.max(w, 0.5)), h: r1(Math.max(h, 0.5)), fill: colorOf(sd.c, 'line', env),
        ...(op < 1 ? { opacity: op } : {}), line: true });
      if (vis[0]) add(t, R.x, R.y, R.w, t.w);
      if (vis[2]) add(b, R.x, R.y + R.h - b.w, R.w, b.w);
      if (vis[3]) add(l, R.x, R.y, l.w, R.h);
      if (vis[1]) add(rt, R.x + R.w - rt.w, R.y, rt.w, R.h);
    }
    return shape;
  }

  /* 글상자 하나. 블록 글은 내용 상자 폭을 그대로 쓰고(고쳐 쓴 글도 같은 폭에서 줄바꿈),
   * 가운데로 모아 둔 칸(flex)의 글은 글자가 실제로 앉은 자리를 쓴다. */
  function textOf(el, cs, R, bind) {
    const e = edges(cs);
    let box;
    const inline = cs.display.startsWith('inline') && !cs.display.includes('flex') && !cs.display.includes('block');
    if (/flex|grid/.test(cs.display)) {
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const t = rel(rg.getBoundingClientRect());
      const w = Math.max(t.w + 6, 8);
      box = { x: t.x + t.w / 2 - w / 2, y: t.y, w, h: Math.max(t.h, px(cs.lineHeight) || px(cs.fontSize) * 1.3) };
    } else if (inline && el.parentElement) {
      const pr = rel(el.parentElement.getBoundingClientRect());
      const pcs = getComputedStyle(el.parentElement);
      const pe = edges(pcs);
      box = { x: pr.x + pe.bl + pe.pl, y: R.y, w: pr.w - pe.bl - pe.br - pe.pl - pe.pr, h: R.h };
    } else {
      box = { x: R.x + e.bl + e.pl, y: R.y + e.bt + e.pt, w: R.w - e.bl - e.br - e.pl - e.pr, h: R.h - e.bt - e.bb - e.pt - e.pb };
    }
    const st = textStyle(cs, el);
    const lineH = st.size * st.lh;
    const o = {
      id: uid(), type: 'text', tpl: true,
      x: r1(box.x - 0.5), y: r1(box.y), w: r1(box.w + 1), h: r1(Math.max(box.h, lineH)),
      pad: 0, style: st
    };
    if (bind) o.bind = bind; else o.text = el.innerText.replace(/\n+$/, '');
    const op = opacityOf(el);
    if (op < 1) o.opacity = op;
    out.push(o);
    return o;
  }

  function pseudoText(el, which) {
    const ps = getComputedStyle(el, which);
    const c = ps.content;
    if (!c || c === 'none' || c === 'normal') return;
    const txt = c.replace(/^["']|["']$/g, '');
    if (!txt.trim()) return;
    const R = rel(el.getBoundingClientRect());
    const ecs = getComputedStyle(el);
    const e = edges(ecs);
    const size = px(ps.fontSize) || 16;
    let x = R.x + e.bl + e.pl;
    let y = R.y + e.bt + e.pt;
    if (ps.position === 'absolute') {
      x = R.x + e.bl + (ps.left === 'auto' ? 0 : px(ps.left));
      y = R.y + e.bt + (ps.top === 'auto' ? 0 : px(ps.top));
    }
    const st = textStyle(ps, el);
    out.push({ id: uid(), type: 'text', tpl: true, text: txt, pad: 0, style: { ...st, align: 'left' },
      x: r1(x), y: r1(y), w: r1(size * 1.6), h: r1(size * st.lh) });
  }

  function picOf(el, cs, R, isIcon) {
    const full = el.dataset.path || '';
    const bind = full.split('.').slice(1).join('.');
    const rad = cs.borderTopLeftRadius;
    const circle = rad.endsWith('%') && parseFloat(rad) >= 50;
    const o = { id: uid(), type: 'image', tpl: true, x: r1(R.x), y: r1(R.y), w: r1(R.w), h: r1(R.h) };
    if (circle) o.shape = 'ellipse'; else if (px(rad)) o.r = r1(px(rad));
    if (bind) o.bind = bind;
    else {
      const img = el.querySelector('img');
      if (!img || !/^data:image\//.test(img.getAttribute('src') || '')) return null;
      o.url = img.getAttribute('src');
    }
    if (isIcon) {
      o.fit = 'contain';
      const slot = bind ? getPath(s.data, bind) : null;
      o.blend = (slot && slot.on === 'key') || el.closest('.circ') || env.dark ? 'screen' : 'multiply';
    }
    const op = opacityOf(el);
    if (op < 1) o.opacity = op;
    out.push(o);
    return o;
  }

  function blockOf(el, cs, R, part) {
    let box = R;
    if (part === 'brand' && el.parentElement && /inline/.test(cs.display)) {
      const pr = rel(el.parentElement.getBoundingClientRect());
      const pe = edges(getComputedStyle(el.parentElement));
      box = { x: pr.x + pe.bl + pe.pl, y: R.y, w: pr.w - pe.bl - pe.br - pe.pl - pe.pr, h: R.h };
    }
    const st = {};
    const col = colorOf(cs.color, 'text', env, keyBg(el));
    if (col) st.color = col;
    if (cs.textShadow && cs.textShadow !== 'none') st.shadow = 'soft';
    out.push({ id: uid(), type: 'block', tpl: true, part, x: r1(box.x), y: r1(box.y), w: r1(box.w), h: r1(box.h),
      ...(Object.keys(st).length ? { style: st } : {}) });
  }

  function walk(el, top = false) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    if (!top && el.matches('.layer, .pg-flagbar, .slot-tools, .obj-ui')) return;
    const R = rel(el.getBoundingClientRect());
    const start = out.length;

    if (!top) {
      const part = BLOCKS.find(([sel]) => el.matches(sel));
      if (part) { blockOf(el, cs, R, part[1]); return; }
      if (el.matches('.pic')) { picOf(el, cs, R, false); return; }
      if (el.matches('.ico')) { picOf(el, cs, R, true); return; }
    }

    const box = top ? null : boxOf(el, cs, R);
    if (!top) pseudoText(el, '::before');

    if (!top && el.dataset.edit != null) {
      textOf(el, cs, R, el.dataset.edit);
    } else if (!top && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      textOf(el, cs, R, null);                                    /* 판형에 박힌 글(POINT 01 · ✓) */
    } else {
      for (const c of el.children) if (!c.matches('br')) walk(c);
    }
    if (!top) pseudoText(el, '::after');

    /* 바탕이 있는 칸과 그 안의 것은 한 묶음 — 원 안의 아이콘, 사진 카드 */
    const made = out.slice(start);
    if (box && made.length > 1 && R.w * R.h < DESIGN_W * pg.clientHeight * 0.6) {
      const g = 'g' + uid();
      for (const o of made) if (!o.group) o.group = g;
    }
  }

  walk(pg, true);
  return out;
}

/* 섹션들을 개체로 푼다.
 *   doc      renderDoc() 의 결과(사진 자리에 path 가 달린 것)
 *   targets  풀 섹션 번호
 *   sections 실제 문서(P.draft.sections) — 여기에 결과를 쓴다
 * 판형이 없는 섹션이나 재다가 실패한 섹션은 그대로 둔다. */
export function freezeSections(doc, sections, targets) {
  if (!targets.length) return 0;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:absolute;left:-40000px;top:0;width:${DESIGN_W}px;pointer-events:none`;
  host.innerHTML = `<div class="sheet" style="width:${DESIGN_W}px;--k:1">${renderSections({ ...doc, width: DESIGN_W })}</div>`;
  document.body.appendChild(host);
  let n = 0;
  try {
    const sheet = host.firstElementChild;
    const env = readEnv(sheet);
    for (const i of targets) {
      const s = sections[i];
      const pg = sheet.querySelector(`.pg[data-i="${i}"]`);
      if (!s || s.free) continue;
      if (!pg) { s.stuck = true; continue; }        /* 판형이 없는 섹션 — 다시 시도하지 않는다 */
      try {
        const objs = convert(pg, doc.sections[i], env);
        const user = (s.objects || []).map((o) => ({ ...o }));
        for (const o of user) delete o.behind;
        const back = (s.objects || []).filter((o) => o.behind).map((o) => user.find((u) => u.id === o.id));
        const front = user.filter((o) => !back.includes(o));
        const cs = getComputedStyle(pg);
        const bg = colorOf(cs.backgroundColor, 'bg', env);
        s.objects = [...back, ...objs, ...front];
        s.h = r1(pg.clientHeight);
        s.style = { ...(bg ? { bg } : {}) };
        s.free = true;
        n++;
      } catch (e) {
        console.warn('섹션을 개체로 풀지 못했습니다', i, e);
        s.stuck = true;
      }
    }
  } finally {
    host.remove();
  }
  return n;
}

/* 판형으로 되돌린다. 판형에서 나온 개체(tpl)만 지우고 사람이 넣은 개체는 남긴다. */
export function unfreeze(s) {
  s.objects = (s.objects || []).filter((o) => !o.tpl);
  delete s.stuck;
  delete s.free;
  delete s.h;
  if (s.style) delete s.style.bg;
  /* 지웠던 사진 자리를 되살린다 */
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (v.off) delete v.off;
      Object.values(v).forEach(walk);
    }
  };
  walk(s.data);
}
