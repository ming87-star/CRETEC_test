/* 개체 편집 — 글상자 · 도형 · 선 · 이미지를 PowerPoint 처럼 다룬다
 *
 *   그리기       위쪽 도구를 고르고 섹션 위에서 끌면 그 크기로, 누르기만 하면 기본 크기로
 *   고르기       누르기 · Shift(Ctrl)+누르기로 더하고 빼기 · 빈 곳에서 끌어 범위 고르기
 *   옮기기       끌기 · 화살표(Shift 는 10px) · 섹션 가운데와 다른 개체 가장자리에 붙는다(Alt 로 끔)
 *                다른 섹션으로 끌어다 놓으면 그 섹션으로 옮겨 간다
 *   크기         모서리·변 손잡이 · Shift 로 비율 유지 · 선은 양 끝을 끈다
 *   정렬         왼쪽/가운데/오른쪽/위/가운데/아래 · 가로/세로 같은 간격
 *                하나만 고르면 섹션 기준, 여럿이면 고른 범위 기준
 *   순서         맨 앞/앞으로/뒤로/맨 뒤 · 본문 뒤로 보내기(글과 사진 아래에 깔기)
 *   그룹         Ctrl+G 로 묶고 Ctrl+Shift+G 로 푼다. 묶인 것은 함께 골라지고 함께 움직인다
 *   그 밖에      Ctrl+D 복제 · Ctrl+C/X/V · Delete · 글상자는 두 번 눌러 글 고치기
 *
 * 좌표는 폭 860 기준 px(DESIGN_W)이다. 화면 px 은 확대 보기와 판 폭에 따라 달라지므로
 * 섹션의 화면 크기에서 배율을 구해 바꾼다.
 *
 * 개체 데이터는 섹션의 objects 배열에 있고, 배열 순서가 쌓는 순서다.
 * 바꾸기 전에는 반드시 api.touch() 를 불러 되돌리기에 남긴다.
 */

import { DESIGN_W, objHtml } from '/src/render.js';
import { FONT_CHOICES } from '/src/presets.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const cloneVal = (v) => Array.isArray(v) ? v.map(cloneVal)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneVal(x)]))
  : v;

const TOOLS = ['text', 'rect', 'round', 'ellipse', 'triangle', 'line', 'arrow'];
const KIND_LABEL = { rect: '사각형', round: '둥근 사각형', ellipse: '원', triangle: '삼각형' };

export function createObjects(api) {
  const { P, q, esc } = api;
  const sections = () => P.draft.sections;
  const paper = () => q('paper3');

  let tool = null;              /* 그릴 도형. null 이면 고르기 */
  let clip = null;              /* 복사한 개체들 */
  let editing = null;           /* 글을 고치는 중인 글상자 { i, id } */
  let swallowUntil = 0;         /* 끌기가 끝난 직후 따라오는 click 을 먹는다 */
  let marq = null;              /* 범위 고르기 사각형 { i, x, y, w, h } */
  let guides = [];              /* 붙기 안내선 */
  let pasteN = 0;

  const uid = () => 'o' + Math.random().toString(36).slice(2, 9);

  /* ------------------------------------------------------------ 찾기 */

  function list(i) {
    const s = sections()[i];
    if (!s) return [];
    if (!Array.isArray(s.objects)) s.objects = [];
    return s.objects;
  }
  const byId = (i, id) => list(i).find((o) => o.id === id);
  const cur = () => {
    const s = api.getSel();
    return s && s.kind === 'obj' ? s : null;
  };
  const selected = () => {
    const s = cur();
    return s ? s.ids.map((id) => byId(s.i, id)).filter(Boolean) : [];
  };
  const pgEl = (i) => paper().querySelector(`.pg[data-i="${i}"]`);
  const obEl = (i, id) => pgEl(i)?.querySelector(`.ob[data-ob="${id}"]`);

  /* 섹션의 화면 위치와 배율. k = 화면 px / 설계 px (확대 보기 포함) */
  function frame(pg) {
    const r = pg.getBoundingClientRect();
    const zoom = r.width / pg.offsetWidth;
    return {
      k: r.width / DESIGN_W,
      left: r.left + pg.clientLeft * zoom,
      top: r.top + pg.clientTop * zoom
    };
  }
  const toD = (e, f) => ({ x: (e.clientX - f.left) / f.k, y: (e.clientY - f.top) / f.k });
  /* 섹션 높이를 설계 px 로 */
  const secH = (pg) => pg.clientHeight / (pg.offsetWidth / DESIGN_W);

  function box(i, o) {
    if (o.type === 'line') {
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    }
    let h = o.h;
    /* 글상자는 글이 넘치면 아래로 자란다. 실제 높이를 잰다. */
    if (o.type === 'text') {
      const el = obEl(i, o.id);
      if (el) h = Math.max(h, el.offsetHeight);
    }
    return { x: o.x, y: o.y, w: o.w, h };
  }
  function union(bs) {
    if (!bs.length) return { x: 0, y: 0, w: 0, h: 0 };
    const x0 = Math.min(...bs.map((b) => b.x));
    const y0 = Math.min(...bs.map((b) => b.y));
    const x1 = Math.max(...bs.map((b) => b.x + b.w));
    const y1 = Math.max(...bs.map((b) => b.y + b.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /* 묶인 개체를 하나라도 고르면 그 묶음 전체를 고른다 */
  function expand(i, ids) {
    const set = new Set(ids);
    const groups = new Set(list(i).filter((o) => set.has(o.id) && o.group).map((o) => o.group));
    return list(i).filter((o) => set.has(o.id) || (o.group && groups.has(o.group))).map((o) => o.id);
  }

  function selectIds(i, ids) {
    if (!ids.length) { api.setSel(null); return; }
    api.setSel({ kind: 'obj', i, ids: expand(i, ids) });
  }

  /* 정렬·간격은 묶음을 한 덩어리로 다룬다 */
  function units(i, objs) {
    const m = new Map();
    for (const o of objs) {
      const k = o.group || o.id;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(o);
    }
    return [...m.values()].map((members) => ({ members, b: union(members.map((o) => box(i, o))) }));
  }

  /* ------------------------------------------------------------ 그리기 */

  /* 한 개체만 다시 그린다. 화면 전체를 다시 그리면 끄는 손이 끊긴다. */
  function redraw(i, objs) {
    const pg = pgEl(i);
    let missing = false;
    for (const o of objs) {
      if (editing && editing.i === i && editing.id === o.id) continue;
      const el = pg && pg.querySelector(`.ob[data-ob="${o.id}"]`);
      if (el) el.outerHTML = objHtml(o, `s${i}`);
      else missing = true;
    }
    if (missing) api.repaint(); else drawUi();
  }

  function clearUi() {
    paper().querySelectorAll('.obj-ui').forEach((e) => e.remove());
  }

  /* 고른 개체의 테두리와 손잡이, 붙기 안내선, 범위 사각형 */
  function drawUi() {
    clearUi();
    const s = cur();
    const i = s ? s.i : marq ? marq.i : null;
    if (i == null) return;
    const pg = pgEl(i);
    if (!pg) return;
    const f = frame(pg);
    const px = 1 / f.k;                   /* 화면 1px 을 설계 px 로 */
    const hs = 10 * px;
    const parts = [];
    const rect = (b, cls, extra = '') =>
      `<div class="${cls}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border-width:${px * 1.5}px${extra}"></div>`;

    const objs = selected();
    if (objs.length === 1 && objs[0].type === 'line') {
      const o = objs[0];
      for (const [hname, x, y] of [['p1', o.x1, o.y1], ['p2', o.x2, o.y2]]) {
        parts.push(`<div class="h round" data-h="${hname}" style="left:${x - hs / 2}px;top:${y - hs / 2}px;width:${hs}px;height:${hs}px;border-width:${px * 1.5}px"></div>`);
      }
    } else if (objs.length) {
      if (objs.length > 1) for (const o of objs) parts.push(rect(box(i, o), 'mem'));
      const B = union(objs.map((o) => box(i, o)));
      parts.push(rect(B, 'sel-box'));
      const pts = {
        nw: [B.x, B.y], n: [B.x + B.w / 2, B.y], ne: [B.x + B.w, B.y], e: [B.x + B.w, B.y + B.h / 2],
        se: [B.x + B.w, B.y + B.h], s: [B.x + B.w / 2, B.y + B.h], sw: [B.x, B.y + B.h], w: [B.x, B.y + B.h / 2]
      };
      for (const [hname, [x, y]] of Object.entries(pts)) {
        parts.push(`<div class="h" data-h="${hname}" style="left:${x - hs / 2}px;top:${y - hs / 2}px;width:${hs}px;height:${hs}px;border-width:${px * 1.5}px"></div>`);
      }
    }

    for (const g of guides) {
      parts.push(g.v != null
        ? `<div class="guide" style="left:${g.v - px / 2}px;top:0;width:${px}px;height:100%"></div>`
        : `<div class="guide" style="left:0;top:${g.hz - px / 2}px;width:${DESIGN_W}px;height:${px}px"></div>`);
    }
    if (marq) parts.push(rect(marq, 'marq'));

    const ui = document.createElement('div');
    ui.className = 'obj-ui';
    ui.innerHTML = parts.join('');
    pg.appendChild(ui);
  }

  /* ------------------------------------------------------------ 끌기 공통 */

  function capture(e, move, up) {
    e.preventDefault();
    const mv = (ev) => move(ev);
    const u = (ev) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', u);
      window.removeEventListener('pointercancel', u);
      swallowUntil = Date.now() + 400;
      up(ev);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', u);
    window.addEventListener('pointercancel', u);
  }

  /* 붙을 자리: 섹션 왼쪽·가운데·오른쪽, 본문 여백선, 위·가운데·아래, 다른 개체의 가장자리와 가운데 */
  function snapTargets(pg, i, skip) {
    const H = secH(pg);
    const padL = parseFloat(getComputedStyle(pg).paddingLeft) / (pg.offsetWidth / DESIGN_W);
    const xs = [0, padL, DESIGN_W / 2, DESIGN_W - padL, DESIGN_W];
    const ys = [0, H / 2, H];
    for (const o of list(i)) {
      if (skip.has(o.id)) continue;
      const b = box(i, o);
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    return { xs, ys };
  }

  function snap(B, T, th) {
    const best = (vals, edges) => {
      let r = null;
      for (const e of edges) for (const v of vals) {
        const d = v - e;
        if (Math.abs(d) <= th && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, v };
      }
      return r;
    };
    const bx = best(T.xs, [B.x, B.x + B.w / 2, B.x + B.w]);
    const by = best(T.ys, [B.y, B.y + B.h / 2, B.y + B.h]);
    const g = [];
    if (bx) g.push({ v: bx.v });
    if (by) g.push({ hz: by.v });
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, guides: g };
  }

  function moveObj(o, st, dx, dy) {
    if (o.type === 'line') {
      o.x1 = r1(st.x1 + dx); o.y1 = r1(st.y1 + dy);
      o.x2 = r1(st.x2 + dx); o.y2 = r1(st.y2 + dy);
    } else {
      o.x = r1(st.x + dx); o.y = r1(st.y + dy);
    }
  }
  const snapshot = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 });

  /* ------------------------------------------------------------ 옮기기 */

  /* narrow — 여럿 고른 상태에서 하나를 눌렀다 떼기만 하면 그것(묶음)만 남긴다 */
  function startMove(e, pg, i, narrow = null) {
    const f = frame(pg);
    const p0 = toD(e, f);
    const objs = selected();
    if (!objs.length) return;
    const starts = objs.map((o) => [o, snapshot(o)]);
    const B0 = union(objs.map((o) => box(i, o)));
    const T = snapTargets(pg, i, new Set(objs.map((o) => o.id)));
    let moved = false;
    const key = `mv:${Date.now()}`;

    capture(e, (ev) => {
      const p = toD(ev, f);
      let dx = p.x - p0.x;
      let dy = p.y - p0.y;
      if (!moved && Math.hypot(dx * f.k, dy * f.k) < 3) return;
      if (!moved) {
        moved = true;
        api.touch(key);
        pg.classList.add('drag-src');
      }
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      guides = [];
      if (!ev.altKey) {
        const sn = snap({ x: B0.x + dx, y: B0.y + dy, w: B0.w, h: B0.h }, T, 6 / f.k);
        dx += sn.dx;
        dy += sn.dy;
        guides = sn.guides;
      }
      for (const [o, st] of starts) moveObj(o, st, dx, dy);
      redraw(i, objs);
    }, (ev) => {
      pg.classList.remove('drag-src');
      guides = [];
      if (moved) reparent(ev, i, objs);
      else if (narrow && narrow.length < objs.length) { selectIds(i, narrow); return; }
      drawUi();
    });
  }

  /* 다른 섹션 위에 놓으면 그 섹션으로 옮긴다. 좌표는 두 섹션의 위치 차이만큼 바꾼다. */
  function reparent(ev, i, objs) {
    const pgs = [...paper().querySelectorAll('.pg')];
    const target = pgs.find((el) => {
      const r = el.getBoundingClientRect();
      return ev.clientY >= r.top && ev.clientY < r.bottom;
    });
    if (!target) return;
    const j = Number(target.dataset.i);
    if (j === i) return;
    const fi = frame(pgEl(i));
    const fj = frame(target);
    const dy = (fi.top - fj.top) / fi.k;
    const set = new Set(objs.map((o) => o.id));
    const from = list(i);
    const moving = from.filter((o) => set.has(o.id));
    sections()[i].objects = from.filter((o) => !set.has(o.id));
    const to = list(j);
    for (const o of moving) {
      /* 받는 섹션에 같은 id 가 있으면(섹션을 복제한 경우) 새 id 를 준다 */
      if (to.some((x) => x.id === o.id)) o.id = uid();
      moveObj(o, snapshot(o), 0, dy);
      to.push(o);
    }
    api.setSel({ kind: 'obj', i: j, ids: moving.map((o) => o.id) });
    api.repaint();
  }

  /* ------------------------------------------------------------ 크기 */

  function startResize(e, pg, i, hname) {
    const f = frame(pg);
    const objs = selected();
    if (!objs.length) return;
    const key = `rs:${Date.now()}`;
    let touched = false;
    const begin = () => { if (!touched) { touched = true; api.touch(key); } };

    if (hname === 'p1' || hname === 'p2') {                     /* 선의 끝 */
      const o = objs[0];
      const ox = hname === 'p1' ? o.x2 : o.x1;
      const oy = hname === 'p1' ? o.y2 : o.y1;
      capture(e, (ev) => {
        begin();
        let p = toD(ev, f);
        if (ev.shiftKey) {                                       /* 45도 단위로 */
          const a = Math.round(Math.atan2(p.y - oy, p.x - ox) / (Math.PI / 4)) * (Math.PI / 4);
          const d = Math.hypot(p.x - ox, p.y - oy);
          p = { x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d };
        }
        if (hname === 'p1') { o.x1 = r1(p.x); o.y1 = r1(p.y); } else { o.x2 = r1(p.x); o.y2 = r1(p.y); }
        redraw(i, objs);
      }, () => drawUi());
      return;
    }

    const starts = objs.map((o) => [o, snapshot(o), box(i, o)]);
    const B0 = union(starts.map(([, , b]) => b));
    capture(e, (ev) => {
      begin();
      const p = toD(ev, f);
      let x0 = B0.x, y0 = B0.y, x1 = B0.x + B0.w, y1 = B0.y + B0.h;
      if (hname.includes('w')) x0 = Math.min(p.x, x1 - 4);
      if (hname.includes('e')) x1 = Math.max(p.x, x0 + 4);
      if (hname.includes('n')) y0 = Math.min(p.y, y1 - 4);
      if (hname.includes('s')) y1 = Math.max(p.y, y0 + 4);
      if (ev.shiftKey && hname.length === 2 && B0.w && B0.h) {   /* 비율 유지 */
        const ratio = B0.w / B0.h;
        let w = x1 - x0;
        let h = y1 - y0;
        if (w / h > ratio) w = h * ratio; else h = w / ratio;
        if (hname.includes('w')) x0 = x1 - w; else x1 = x0 + w;
        if (hname.includes('n')) y0 = y1 - h; else y1 = y0 + h;
      }
      const sx = (x1 - x0) / (B0.w || 1);
      const sy = (y1 - y0) / (B0.h || 1);
      for (const [o, st, b] of starts) {
        if (o.type === 'line') {
          o.x1 = r1(x0 + (st.x1 - B0.x) * sx); o.y1 = r1(y0 + (st.y1 - B0.y) * sy);
          o.x2 = r1(x0 + (st.x2 - B0.x) * sx); o.y2 = r1(y0 + (st.y2 - B0.y) * sy);
        } else {
          o.x = r1(x0 + (b.x - B0.x) * sx);
          o.y = r1(y0 + (b.y - B0.y) * sy);
          o.w = r1(Math.max(4, b.w * sx));
          o.h = r1(Math.max(4, b.h * sy));
        }
      }
      redraw(i, objs);
    }, () => drawUi());
  }

  /* ------------------------------------------------------------ 새 개체 */

  function make(kind, x, y) {
    const key = P.draft.keyColor || '#1F4E79';
    const id = uid();
    if (kind === 'text') {
      return { id, type: 'text', x, y, w: 320, h: 56, text: '텍스트를 입력하세요',
        style: { size: 28, color: '#111111' }, pad: 8 };
    }
    if (kind === 'line' || kind === 'arrow') {
      return { id, type: 'line', x1: x, y1: y, x2: x + 200, y2: y, stroke: '#111111', sw: 4,
        arrow: kind === 'arrow' ? 'end' : 'none' };
    }
    return { id, type: 'shape', shape: kind, x, y, w: 200, h: 140, fill: key, stroke: null, sw: 0,
      r: kind === 'round' ? 24 : 0 };
  }

  function startDraw(e, pg, i) {
    const f = frame(pg);
    const p0 = toD(e, f);
    const kind = tool;
    let o = null;
    capture(e, (ev) => {
      let p = toD(ev, f);
      if (!o && Math.hypot((p.x - p0.x) * f.k, (p.y - p0.y) * f.k) < 4) return;
      if (!o) {
        api.touch(`draw:${Date.now()}`);
        o = make(kind, p0.x, p0.y);
        list(i).push(o);
        api.repaint();
      }
      if (o.type === 'line') {
        if (ev.shiftKey) {
          const a = Math.round(Math.atan2(p.y - p0.y, p.x - p0.x) / (Math.PI / 4)) * (Math.PI / 4);
          const d = Math.hypot(p.x - p0.x, p.y - p0.y);
          p = { x: p0.x + Math.cos(a) * d, y: p0.y + Math.sin(a) * d };
        }
        o.x2 = r1(p.x); o.y2 = r1(p.y);
      } else {
        let w = Math.abs(p.x - p0.x);
        let h = Math.abs(p.y - p0.y);
        if (ev.shiftKey) w = h = Math.max(w, h);
        o.x = r1(p.x < p0.x ? p0.x - w : p0.x);
        o.y = r1(p.y < p0.y ? p0.y - h : p0.y);
        o.w = r1(Math.max(4, w));
        o.h = r1(Math.max(4, h));
      }
      redraw(i, [o]);
    }, () => {
      if (!o) {                                  /* 누르기만 했다 — 기본 크기로 */
        api.touch(`draw:${Date.now()}`);
        o = make(kind, p0.x, p0.y);
        if (o.type === 'shape') { o.x = r1(p0.x - o.w / 2); o.y = r1(p0.y - o.h / 2); }
        list(i).push(o);
      }
      setTool(null);
      api.setSel({ kind: 'obj', i, ids: [o.id] });
      api.repaint();
      if (o.type === 'text') startEdit(i, o.id, true);
    });
  }

  /* 이미지 넣기: 고른 섹션(없으면 화면 가운데 섹션)의 가운데에 */
  function targetSection() {
    const s = api.getSel();
    if (s && s.i != null && sections()[s.i]) return s.i;
    const sc = paper().closest('.scroll');
    const mid = sc ? sc.getBoundingClientRect().top + sc.clientHeight / 2 : window.innerHeight / 2;
    const pgs = [...paper().querySelectorAll('.pg')];
    const hit = pgs.find((el) => { const r = el.getBoundingClientRect(); return mid >= r.top && mid < r.bottom; });
    return hit ? Number(hit.dataset.i) : 0;
  }

  async function insertImage(file) {
    const url = await api.readImage(file);
    const im = await new Promise((res) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => res(null); x.src = url; });
    const i = targetSection();
    const pg = pgEl(i);
    const H = pg ? secH(pg) : 600;
    const w = 360;
    const h = im && im.naturalWidth ? Math.round((w * im.naturalHeight) / im.naturalWidth) : 240;
    api.touch(`img:${Date.now()}`);
    const o = { id: uid(), type: 'image', url, x: (DESIGN_W - w) / 2, y: Math.max(0, (H - h) / 2), w, h, fit: 'cover', r: 0 };
    list(i).push(o);
    api.setSel({ kind: 'obj', i, ids: [o.id] });
    api.repaint();
  }

  /* ------------------------------------------------------------ 범위 고르기 */

  function startMarquee(e, pg, i) {
    const f = frame(pg);
    const p0 = toD(e, f);
    let active = false;
    const mv = (ev) => {
      const p = toD(ev, f);
      if (!active && Math.hypot((p.x - p0.x) * f.k, (p.y - p0.y) * f.k) < 6) return;
      if (!active) {
        active = true;
        paper().classList.add('marquee');
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
      window.getSelection()?.removeAllRanges();
      marq = { i, x: Math.min(p.x, p0.x), y: Math.min(p.y, p0.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
      drawUi();
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      paper().classList.remove('marquee');
      if (!active) return;
      swallowUntil = Date.now() + 400;
      const R = marq;
      marq = null;
      const hit = list(i).filter((o) => {
        const b = box(i, o);
        return b.x < R.x + R.w && b.x + b.w > R.x && b.y < R.y + R.h && b.y + b.h > R.y;
      }).map((o) => o.id);
      if (hit.length) selectIds(i, hit); else drawUi();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /* ------------------------------------------------------------ 글상자 글 고치기 */

  function startEdit(i, id, selectAll = false) {
    const el = obEl(i, id);
    if (!el) return;
    const tx = el.querySelector('.tx');
    if (!tx) return;
    editing = { i, id };
    el.classList.add('editing');
    tx.contentEditable = 'true';
    tx.spellcheck = false;
    tx.focus();
    const r = document.createRange();
    r.selectNodeContents(tx);
    if (!selectAll) r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function finishEdit() {
    if (!editing) return;
    const el = obEl(editing.i, editing.id);
    const tx = el && el.querySelector('.tx');
    if (tx) tx.contentEditable = 'false';
    if (el) el.classList.remove('editing');
    editing = null;
    drawUi();
  }

  function bindText(root) {
    root.addEventListener('input', (e) => {
      const tx = e.target.closest('.ob-text .tx');
      if (!tx || !editing) return;
      const o = byId(editing.i, editing.id);
      if (!o) return;
      api.touch(`obt:${o.id}`);
      o.text = tx.innerText.replace(/\n+$/, '');
      drawUi();
    });
    root.addEventListener('keydown', (e) => {
      const tx = e.target.closest('.ob-text .tx');
      if (!tx || !editing) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(); return; }
      if (e.key === 'Enter') { e.preventDefault(); api.lineBreak(tx); }
    });
    root.addEventListener('paste', (e) => {
      const tx = e.target.closest('.ob-text .tx');
      if (!tx || !editing) return;
      e.preventDefault();
      api.pastePlain(e, tx);
    });
    root.addEventListener('dblclick', (e) => {
      const ob = e.target.closest('.ob-text');
      if (!ob) return;
      const i = Number(ob.closest('.pg').dataset.i);
      startEdit(i, ob.dataset.ob);
    });
  }

  /* ------------------------------------------------------------ 누르기 갈래 */

  /* 처리했으면 true. 편집기가 그 뒤의 다른 처리(섹션 고르기, 크롭)를 막는다. */
  function onPointerDown(e) {
    if (e.button !== 0) return false;
    if (editing) {
      const inEdit = e.target.closest(`.ob[data-ob="${editing.id}"]`) &&
        Number(e.target.closest('.pg')?.dataset.i) === editing.i;
      if (inEdit) return false;               /* 글 고치는 중 — 커서를 옮기게 둔다 */
      finishEdit();
    }
    const pg = e.target.closest('.pg');
    if (!pg) return false;
    const i = Number(pg.dataset.i);

    const h = e.target.closest('.obj-ui .h');
    if (h) { startResize(e, pg, i, h.dataset.h); return true; }

    if (tool) { startDraw(e, pg, i); return true; }

    const ob = e.target.closest('.ob');
    if (ob) {
      /* 본문 글자에 커서가 남아 있으면 Delete 가 그 글을 지운다. 먼저 놓아 준다. */
      if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      const id = ob.dataset.ob;
      const s = cur();
      const multi = e.shiftKey || e.ctrlKey || e.metaKey;
      let ids;
      let narrow = null;
      if (s && s.i === i && multi) {
        const g = expand(i, [id]);
        const all = new Set(s.ids);
        const had = g.every((x) => all.has(x));
        for (const x of g) { if (had) all.delete(x); else all.add(x); }
        ids = [...all];
      } else if (s && s.i === i && s.ids.includes(id)) {
        ids = s.ids;                            /* 여럿을 고른 채로 끌 수 있게 그대로 둔다 */
        narrow = expand(i, [id]);
      } else {
        ids = [id];
      }
      selectIds(i, ids);
      if (ids.includes(id)) startMove(e, pg, i, narrow); else e.preventDefault();
      return true;
    }

    if (!e.target.closest('[data-edit], .pic, .ico, button, label, input, select, textarea, .slot-tools')) {
      startMarquee(e, pg, i);
    }
    return false;
  }

  /* 끌기 직후의 click, 개체를 누른 click 은 섹션 고르기로 번지지 않게 */
  function takeClick(e) {
    if (Date.now() < swallowUntil) return true;
    return !!e.target.closest('.ob, .obj-ui');
  }

  /* ------------------------------------------------------------ 배치 명령 */

  function moveUnits(i, us, f) {
    for (const u of us) {
      const [dx, dy] = f(u);
      for (const o of u.members) moveObj(o, snapshot(o), dx, dy);
    }
  }

  function align(kind) {
    const s = cur();
    if (!s) return;
    const us = units(s.i, selected());
    /* 하나(또는 한 묶음)면 섹션에, 여럿이면 고른 범위에 맞춘다 */
    const ref = us.length === 1
      ? { x: 0, y: 0, w: DESIGN_W, h: secH(pgEl(s.i)) }
      : union(us.map((u) => u.b));
    api.touch(`al:${Date.now()}`);
    moveUnits(s.i, us, ({ b }) => ({
      l: [ref.x - b.x, 0],
      c: [ref.x + ref.w / 2 - (b.x + b.w / 2), 0],
      r: [ref.x + ref.w - (b.x + b.w), 0],
      t: [0, ref.y - b.y],
      m: [0, ref.y + ref.h / 2 - (b.y + b.h / 2)],
      b: [0, ref.y + ref.h - (b.y + b.h)]
    }[kind]));
    redraw(s.i, selected());
  }

  function distribute(axis) {
    const s = cur();
    if (!s) return;
    const us = units(s.i, selected());
    if (us.length < 3) return;
    const pos = (b) => (axis === 'h' ? b.x : b.y);
    const size = (b) => (axis === 'h' ? b.w : b.h);
    us.sort((a, b) => pos(a.b) - pos(b.b));
    const first = us[0].b;
    const last = us[us.length - 1].b;
    const total = us.reduce((t, u) => t + size(u.b), 0);
    const gap = (pos(last) + size(last) - pos(first) - total) / (us.length - 1);
    api.touch(`ds:${Date.now()}`);
    let at = pos(first);
    for (const u of us) {
      const d = at - pos(u.b);
      for (const o of u.members) moveObj(o, snapshot(o), axis === 'h' ? d : 0, axis === 'h' ? 0 : d);
      at += size(u.b) + gap;
    }
    redraw(s.i, selected());
  }

  function order(kind) {
    const s = cur();
    if (!s) return;
    const arr = list(s.i);
    const set = new Set(s.ids);
    api.touch(`or:${Date.now()}`);
    if (kind === 'front' || kind === 'back') {
      const keep = arr.filter((o) => !set.has(o.id));
      const mv = arr.filter((o) => set.has(o.id));
      arr.splice(0, arr.length, ...(kind === 'front' ? [...keep, ...mv] : [...mv, ...keep]));
    } else if (kind === 'forward') {
      for (let k = arr.length - 2; k >= 0; k--) {
        if (set.has(arr[k].id) && !set.has(arr[k + 1].id)) [arr[k], arr[k + 1]] = [arr[k + 1], arr[k]];
      }
    } else if (kind === 'backward') {
      for (let k = 1; k < arr.length; k++) {
        if (set.has(arr[k].id) && !set.has(arr[k - 1].id)) [arr[k], arr[k - 1]] = [arr[k - 1], arr[k]];
      }
    }
    api.repaint();
  }

  function setBehind(flag) {
    const objs = selected();
    if (!objs.length) return;
    api.touch(`bh:${Date.now()}`);
    for (const o of objs) { if (flag) o.behind = true; else delete o.behind; }
    api.repaint();
  }

  function group() {
    const s = cur();
    const objs = selected();
    if (!s || objs.length < 2) return;
    api.touch(`gr:${Date.now()}`);
    const g = 'g' + uid();
    for (const o of objs) o.group = g;
    api.setSel({ kind: 'obj', i: s.i, ids: objs.map((o) => o.id) });
  }

  function ungroup() {
    const s = cur();
    const objs = selected();
    if (!s || !objs.some((o) => o.group)) return;
    api.touch(`ug:${Date.now()}`);
    for (const o of objs) delete o.group;
    api.setSel({ kind: 'obj', i: s.i, ids: objs.map((o) => o.id) });
  }

  /* 새 id 를 주고, 묶음은 새 묶음으로 */
  function cloneSet(objs, d) {
    const gmap = new Map();
    return objs.map((o) => {
      const c = cloneVal(o);
      c.id = uid();
      if (c.group) {
        if (!gmap.has(c.group)) gmap.set(c.group, 'g' + uid());
        c.group = gmap.get(c.group);
      }
      moveObj(c, snapshot(c), d, d);
      return c;
    });
  }

  function duplicate() {
    const s = cur();
    const objs = selected();
    if (!s || !objs.length) return;
    api.touch(`dp:${Date.now()}`);
    const copies = cloneSet(objs, 16);
    list(s.i).push(...copies);
    api.setSel({ kind: 'obj', i: s.i, ids: copies.map((o) => o.id) });
    api.repaint();
  }

  function remove() {
    const s = cur();
    if (!s) return;
    const set = new Set(s.ids);
    api.touch(`rm:${Date.now()}`);
    sections()[s.i].objects = list(s.i).filter((o) => !set.has(o.id));
    api.setSel(null);
    api.repaint();
  }

  function copy() {
    const objs = selected();
    if (!objs.length) return;
    clip = objs.map(cloneVal);
    pasteN = 0;
  }

  function paste() {
    if (!clip || !clip.length) return;
    const i = targetSection();
    pasteN += 1;
    api.touch(`ps:${Date.now()}`);
    const copies = cloneSet(clip, 16 * pasteN);
    list(i).push(...copies);
    api.setSel({ kind: 'obj', i, ids: copies.map((o) => o.id) });
    api.repaint();
  }

  function nudge(dx, dy) {
    const s = cur();
    if (!s) return;
    api.touch('nudge');
    for (const o of selected()) moveObj(o, snapshot(o), dx, dy);
    redraw(s.i, selected());
  }

  /* ------------------------------------------------------------ 키보드 */

  function onKey(e) {
    if (editing) {
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(); return true; }
      return false;
    }
    const typing = e.target.closest && e.target.closest('[contenteditable="true"], input, textarea, select');
    if (typing) return false;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();

    if (e.key === 'Escape' && tool) { setTool(null); return true; }
    if (mod && k === 'v' && clip) { e.preventDefault(); paste(); return true; }

    const s = cur();
    if (!s) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return true; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0);
      return true;
    }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return true; }
    if (mod && k === 'c') { e.preventDefault(); copy(); return true; }
    if (mod && k === 'x') { e.preventDefault(); copy(); remove(); return true; }
    if (mod && k === 'g') { e.preventDefault(); if (e.shiftKey) ungroup(); else group(); return true; }
    if (mod && (e.key === ']' || e.key === '}')) { e.preventDefault(); order(e.shiftKey ? 'front' : 'forward'); return true; }
    if (mod && (e.key === '[' || e.key === '{')) { e.preventDefault(); order(e.shiftKey ? 'back' : 'backward'); return true; }
    if (e.key === 'Enter') {
      const objs = selected();
      if (objs.length === 1 && objs[0].type === 'text') { e.preventDefault(); startEdit(s.i, objs[0].id); return true; }
    }
    if (e.key === 'Escape') { api.setSel(null); return true; }
    return false;
  }

  /* ------------------------------------------------------------ 도구 막대 */

  function setTool(t) {
    tool = TOOLS.includes(t) ? t : null;
    q('drawTools').querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    paper().classList.toggle('drawing', !!tool);
  }

  q('drawTools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    if (b.dataset.tool === 'image') { q('obImgFile').click(); return; }
    setTool(tool === b.dataset.tool ? null : b.dataset.tool);
  });
  q('obImgFile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f && f.type.startsWith('image/')) insertImage(f);
  });

  /* ------------------------------------------------------------ 속성 패널 */

  const title = (o) => o.type === 'text' ? '글상자'
    : o.type === 'line' ? (o.arrow && o.arrow !== 'none' ? '화살표' : '선')
    : o.type === 'image' ? '이미지'
    : KIND_LABEL[o.shape] || '도형';

  function panel() {
    const s = cur();
    const objs = selected();
    if (!s || !objs.length) return '';
    const o = objs[0];
    const many = objs.length > 1;
    const sameGroup = many && objs.every((x) => x.group && x.group === o.group);
    const anyGroup = objs.some((x) => x.group);
    const us = units(s.i, objs);
    const head = many ? (sameGroup ? `그룹 · ${objs.length}개` : `${objs.length}개 고름`) : title(o);
    const fillable = objs.filter((x) => x.type === 'shape' || x.type === 'text');
    const boxy = objs.filter((x) => x.type !== 'line');
    const stroked = objs;
    const val = (v, d) => (v == null ? d : v);
    const color = (c, d) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : d);
    const key = P.draft.keyColor || '#1F4E79';
    const b = box(s.i, o);

    const btn = (act, label, extra = '') => `<button type="button" class="seg" data-oa="${act}"${extra}>${label}</button>`;

    let html = `
      <div class="ins-head"><b>${head}</b><span>${esc(api.sectionLabel(sections()[s.i]))}</span></div>
      <div class="ins-actions">
        <button type="button" class="btn mini" data-oa="dup">복제</button>
        <button type="button" class="btn mini danger" data-oa="del">삭제</button>
        ${many && !sameGroup ? '<button type="button" class="btn mini" data-oa="group">그룹으로 묶기</button>' : ''}
        ${anyGroup ? '<button type="button" class="btn mini" data-oa="ungroup">그룹 풀기</button>' : ''}
      </div>

      <h3>정렬 <span>${us.length === 1 ? '섹션 기준' : '고른 범위 기준'}</span></h3>
      <div class="segs">
        ${btn('al-l', '왼쪽')}${btn('al-c', '가운데')}${btn('al-r', '오른쪽')}
      </div>
      <div class="segs" style="margin-top:4px">
        ${btn('al-t', '위')}${btn('al-m', '중간')}${btn('al-b', '아래')}
      </div>
      <div class="segs" style="margin-top:4px">
        ${btn('ds-h', '가로 같은 간격', us.length < 3 ? ' disabled title="셋 이상 고르면 쓸 수 있습니다"' : '')}
        ${btn('ds-v', '세로 같은 간격', us.length < 3 ? ' disabled title="셋 이상 고르면 쓸 수 있습니다"' : '')}
      </div>

      <h3>순서</h3>
      <div class="segs">
        ${btn('or-front', '맨 앞으로')}${btn('or-forward', '앞으로')}${btn('or-backward', '뒤로')}${btn('or-back', '맨 뒤로')}
      </div>
      <div class="segs" style="margin-top:4px">
        ${objs.every((x) => x.behind)
          ? btn('front-layer', '본문 위로 올리기')
          : btn('back-layer', '본문 뒤로 보내기')}
      </div>`;

    if (!many && o.type !== 'line') {
      html += `
      <h3>위치 · 크기 <span>860 기준 px</span></h3>
      <div class="xywh">
        <label>X <input type="number" data-pos="x" value="${Math.round(b.x)}"></label>
        <label>Y <input type="number" data-pos="y" value="${Math.round(b.y)}"></label>
        <label>W <input type="number" data-pos="w" value="${Math.round(b.w)}" min="4"></label>
        <label>H <input type="number" data-pos="h" value="${Math.round(o.h)}" min="4"></label>
      </div>`;
    }

    if (fillable.length) {
      const f0 = fillable[0];
      html += `
      <h3>채우기</h3>
      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" data-op="fill" value="${color(f0.fill, key)}">
          <label class="auto"><input type="checkbox" data-op-none="fill"${f0.fill ? '' : ' checked'}> 없음</label></div></div>`;
    }

    const s0 = stroked[0];
    html += `
      <h3>외곽선</h3>
      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" data-op="stroke" value="${color(s0.stroke, '#111111')}">
          ${s0.type === 'line' && !many ? '' : `<label class="auto"><input type="checkbox" data-op-none="stroke"${s0.stroke && s0.sw ? '' : ' checked'}> 없음</label>`}</div></div>
      <label class="ins-row"><span>두께</span>
        <input type="range" min="0" max="24" step="0.5" value="${val(s0.sw, 0)}" data-op="sw"><output>${val(s0.sw, 0)}px</output></label>
      <label class="ins-row"><span>모양</span>
        <select data-op="dash">
          ${[['solid', '실선'], ['dashed', '파선'], ['dotted', '점선']].map(([v, l]) => `<option value="${v}"${(s0.dash || 'solid') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>`;

    if (objs.some((x) => x.type === 'line')) {
      const l0 = objs.find((x) => x.type === 'line');
      html += `
      <label class="ins-row"><span>화살촉</span>
        <select data-op="arrow">
          ${[['none', '없음'], ['end', '끝'], ['start', '시작'], ['both', '양쪽']].map(([v, l]) => `<option value="${v}"${(l0.arrow || 'none') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>`;
    }

    if (boxy.some((x) => x.type !== 'shape' || x.shape === 'rect' || x.shape === 'round')) {
      const r0 = boxy.find((x) => x.type !== 'shape' || x.shape === 'rect' || x.shape === 'round');
      html += `
      <label class="ins-row"><span>모서리</span>
        <input type="range" min="0" max="200" step="1" value="${val(r0.r, 0)}" data-op="r"><output>${val(r0.r, 0)}px</output></label>`;
    }

    html += `
      <label class="ins-row"><span>불투명도</span>
        <input type="range" min="0" max="100" step="1" value="${Math.round(val(o.opacity, 1) * 100)}" data-op="opacity"><output>${Math.round(val(o.opacity, 1) * 100)}%</output></label>`;

    const texts = objs.filter((x) => x.type === 'text');
    if (texts.length) {
      const t = texts[0];
      const st = t.style || {};
      const align = (a, l) => `<button type="button" class="seg${(st.align || 'left') === a ? ' on' : ''}" data-ot-align="${a}">${l}</button>`;
      html += `
      <h3>글자</h3>
      ${!many ? '<div class="ins-actions"><button type="button" class="btn mini" data-oa="edit">글 고치기 (두 번 누르기 · Enter)</button></div>' : ''}
      <label class="ins-row"><span>글꼴</span>
        <select data-ot="font"><option value="">스타일 기본</option>
          ${FONT_CHOICES.map((fc) => `<option value="${fc.family}"${st.font === fc.family ? ' selected' : ''}>${fc.label}</option>`).join('')}
        </select></label>
      <label class="ins-row"><span>크기</span>
        <input type="range" min="10" max="160" step="1" value="${val(st.size, 24)}" data-ot="size"><output>${val(st.size, 24)}px</output></label>
      <div class="ins-row"><span>굵기·정렬</span>
        <div class="segs"><button type="button" class="seg${st.bold ? ' on' : ''}" data-ot-bold="1"><b>가</b></button>
          ${align('left', '왼쪽')}${align('center', '가운데')}${align('right', '오른쪽')}</div></div>
      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" data-ot="color" value="${color(st.color, '#111111')}"></div></div>
      <label class="ins-row"><span>줄 간격</span>
        <input type="range" min="0.9" max="2.4" step="0.05" value="${val(st.lh, 1.5)}" data-ot="lh"><output>${val(st.lh, 1.5)}</output></label>
      <label class="ins-row"><span>자간</span>
        <input type="range" min="-0.05" max="0.3" step="0.01" value="${val(st.ls, 0)}" data-ot="ls"><output>${val(st.ls, 0)}em</output></label>
      <label class="ins-row"><span>안쪽 여백</span>
        <input type="range" min="0" max="80" step="1" value="${val(t.pad, 8)}" data-op="pad"><output>${val(t.pad, 8)}px</output></label>`;
    }

    if (!many && o.type === 'image') {
      html += `
      <h3>이미지</h3>
      <div class="ins-actions"><label class="btn mini">이미지 바꾸기<input type="file" accept="image/*" class="js-obimg" hidden></label></div>
      <label class="ins-row"><span>맞춤</span>
        <select data-op="fit">
          <option value="cover"${o.fit !== 'contain' ? ' selected' : ''}>채우기(잘림)</option>
          <option value="contain"${o.fit === 'contain' ? ' selected' : ''}>맞추기(전체)</option>
        </select></label>`;
    }

    html += '<p class="note">Shift 로 여럿 고르기 · 빈 곳에서 끌어 범위 고르기 · Ctrl+G 그룹 · Ctrl+D 복제 · 화살표로 1px(Shift 10px)</p>';
    return html;
  }

  /* 속성 하나를 고른 개체들에 적용 */
  function setProp(k, v) {
    const s = cur();
    const objs = selected();
    if (!s) return;
    api.touch(`op:${k}`);
    for (const o of objs) {
      if (k === 'fill' && !(o.type === 'shape' || o.type === 'text')) continue;
      if ((k === 'r') && o.type === 'line') continue;
      if (k === 'pad' && o.type !== 'text') continue;
      if (k === 'fit' && o.type !== 'image') continue;
      if (k === 'arrow' && o.type !== 'line') continue;
      if (k === 'stroke' && v && !o.sw) o.sw = o.type === 'line' ? 4 : 2;  /* 색을 고르면 보이게 */
      if (v == null) delete o[k]; else o[k] = v;
    }
    redraw(s.i, objs);
  }

  function setTextStyle(patch) {
    const s = cur();
    const texts = selected().filter((o) => o.type === 'text');
    if (!s || !texts.length) return;
    api.touch(`ot:${Object.keys(patch).join()}`);
    for (const t of texts) {
      t.style = { ...(t.style || {}), ...patch };
      for (const k of Object.keys(t.style)) if (t.style[k] === '' || t.style[k] == null) delete t.style[k];
    }
    redraw(s.i, texts);
    api.ensureFonts();
  }

  function setPos(k, v) {
    const s = cur();
    const o = selected()[0];
    if (!s || !o || !Number.isFinite(v)) return;
    api.touch(`pos:${k}`);
    const b = box(s.i, o);
    if (k === 'x') moveObj(o, snapshot(o), v - b.x, 0);
    else if (k === 'y') moveObj(o, snapshot(o), 0, v - b.y);
    else if (k === 'w') o.w = Math.max(4, v);
    else if (k === 'h') o.h = Math.max(4, v);
    redraw(s.i, [o]);
  }

  const out = (el) => el.closest('.ins-row')?.querySelector('output');

  /* 속성 패널의 이벤트. 개체 패널의 것이면 처리하고 true. */
  function onPanel(e) {
    const t = e.target;

    if (e.type === 'click') {
      const go = t.closest('[data-goto-ob]');
      if (go) {
        const [i, id] = go.dataset.gotoOb.split(':');
        selectIds(Number(i), [id]);
        obEl(Number(i), id)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return true;
      }
    }
    if (!cur()) return false;

    if (e.type === 'input') {
      if (t.dataset.op && t.type === 'color') {
        setProp(t.dataset.op, t.value);
        const none = t.closest('.ins-row').querySelector(`[data-op-none="${t.dataset.op}"]`);
        if (none) none.checked = false;
        return true;
      }
      if (t.dataset.op && t.type === 'range') {
        const v = Number(t.value);
        const kk = t.dataset.op;
        setProp(kk, kk === 'opacity' ? v / 100 : v);
        const o2 = out(t);
        if (o2) o2.textContent = kk === 'opacity' ? `${v}%` : `${v}px`;
        return true;
      }
      if (t.dataset.ot) {
        const kk = t.dataset.ot;
        const v = ['size', 'lh', 'ls'].includes(kk) ? Number(t.value) : t.value;
        setTextStyle({ [kk]: v });
        const o2 = out(t);
        if (o2) o2.textContent = kk === 'size' ? `${v}px` : kk === 'ls' ? `${v}em` : String(v);
        return true;
      }
      if (t.dataset.op && t.tagName === 'SELECT') { setProp(t.dataset.op, t.value); return true; }
      if (t.dataset.pos) return true;           /* 다 친 뒤 change 에서 적용 */
      return false;
    }

    if (e.type === 'change') {
      if (t.dataset.opNone) {
        const kk = t.dataset.opNone;
        const picker = t.closest('.ins-row').querySelector(`[data-op="${kk}"]`);
        if (t.checked) {
          setProp(kk, null);
          if (kk === 'stroke') setProp('sw', 0);
        } else {
          setProp(kk, picker ? picker.value : '#111111');
        }
        return true;
      }
      if (t.dataset.pos) { setPos(t.dataset.pos, Number(t.value)); return true; }
      if (t.classList.contains('js-obimg')) {
        const f = t.files[0];
        if (f && f.type.startsWith('image/')) {
          api.readImage(f).then((url) => {
            const s = cur();
            const o = selected()[0];
            if (!s || !o) return;
            api.touch(`oimg:${Date.now()}`);
            o.url = url;
            redraw(s.i, [o]);
          });
        }
        return true;
      }
      return !!(t.dataset.op || t.dataset.ot);
    }

    if (e.type === 'click') {
      const b = t.closest('button');
      if (!b) return false;
      if (b.dataset.otBold) {
        const st = (selected().find((o) => o.type === 'text') || {}).style || {};
        setTextStyle({ bold: !st.bold });
        api.setSel(cur());
        return true;
      }
      if (b.dataset.otAlign) { setTextStyle({ align: b.dataset.otAlign }); api.setSel(cur()); return true; }
      const a = b.dataset.oa;
      if (!a) return false;
      const s = cur();
      if (a.startsWith('al-')) align(a.slice(3));
      else if (a.startsWith('ds-')) distribute(a.slice(3));
      else if (a.startsWith('or-')) order(a.slice(3));
      else if (a === 'back-layer') setBehind(true);
      else if (a === 'front-layer') setBehind(false);
      else if (a === 'group') group();
      else if (a === 'ungroup') ungroup();
      else if (a === 'dup') duplicate();
      else if (a === 'del') remove();
      else if (a === 'edit') { const o = selected()[0]; if (o) startEdit(s.i, o.id); }
      if (cur()) api.setSel(cur());             /* 패널을 새 상태로 */
      return true;
    }
    return false;
  }

  /* 아무것도 안 골랐을 때 패널에 보이는 개체 목록 */
  function listHtml() {
    const rows = [];
    sections().forEach((s, i) => (s.objects || []).forEach((o) => {
      const name = o.type === 'text' ? `글상자 · ${String(o.text || '').split('\n')[0].slice(0, 14)}` : title(o);
      rows.push(`<li><button type="button" data-goto-ob="${i}:${o.id}">
        <span class="nm">${esc(name)}</span><span class="st">${esc(api.sectionLabel(s))}${o.behind ? ' · 본문 뒤' : ''}</span></button></li>`);
    }));
    return `<h3>개체 <span>${rows.length}</span></h3>` + (rows.length
      ? `<ul class="slotlist">${rows.join('')}</ul>`
      : '<p class="note">위쪽 도구로 글상자·도형·선·이미지를 넣습니다. 본문 뒤로 보낸 개체는 여기서 고를 수 있습니다.</p>');
  }

  function validate(s) {
    const ids = s.ids.filter((id) => byId(s.i, id));
    if (!ids.length) return false;
    s.ids = ids;
    return true;
  }

  const root = paper();
  bindText(root);

  return {
    onPointerDown,
    takeClick,
    onKey,
    panel,
    onPanel,
    listHtml,
    drawUi,
    clearUi,
    validate,
    setTool,
    /* 화면을 새로 그리면 글 고치기는 끝난다 */
    afterPaint() { editing = null; },
    get editing() { return editing; }
  };
}
