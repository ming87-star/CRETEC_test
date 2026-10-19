/* 개체 편집 — 글상자 · 도형 · 선 · 이미지를 PowerPoint 처럼 다룬다
 *
 * 3단계에 들어오면 섹션의 제목·사진·아이콘·장식이 전부 개체로 풀린다(web/freeze.js).
 * 그래서 여기서 하는 일이 곧 페이지 편집이다.
 *
 *   그리기       위쪽 도구를 고르고 섹션 위에서 끌면 그 크기로, 누르기만 하면 기본 크기로
 *                "사진 자리"는 프롬프트가 딸린 빈 사진 틀이다
 *   고르기       누르기 · Shift(Ctrl)+누르기로 더하고 빼기 · 빈 곳에서 끌어 범위 고르기
 *                묶음을 고른 채로 그 안의 하나를 한 번 더 누르면 그것만 고른다
 *   옮기기       끌기 · 화살표(Shift 는 10px) · 섹션 가운데와 다른 개체 가장자리에 붙는다(Alt 로 끔)
 *                다른 섹션으로 끌어다 놓으면 그 섹션으로 옮겨 간다
 *   크기·회전    모서리·변 손잡이 · Shift 로 비율 유지 · 위쪽 동그란 손잡이로 회전(Shift 는 15도씩)
 *   사진         두 번 누르면 사진 위치 조정(끌기 · 휠로 확대) · 다른 창에서 끌어다 놓기 · Ctrl+V
 *   정렬·순서    왼쪽/가운데/오른쪽/위/중간/아래 · 같은 간격 · 맨 앞/앞으로/뒤로/맨 뒤 · 레이어 목록
 *   그룹         Ctrl+G 로 묶고 Ctrl+Shift+G 로 푼다
 *   그 밖에      Ctrl+D 복제 · Ctrl+C/X/V · Delete · 글상자는 두 번 눌러 글 고치기
 *
 * 묶인 개체(bind)는 섹션 data 의 글·사진 자리를 보여 준다. 글을 고치면 data 가 바뀌고,
 * 복제하거나 다른 섹션으로 옮기면 묶음을 풀어 사본이 된다(사진은 새 사진 자리가 된다).
 *
 * 좌표는 폭 860 기준 px(DESIGN_W)이다. 화면 px 은 확대 보기와 판 폭에 따라 달라지므로
 * 섹션의 화면 크기에서 배율을 구해 바꾼다.
 *
 * 개체 데이터는 섹션의 objects 배열에 있고, 배열 순서가 쌓는 순서다.
 * 바꾸기 전에는 반드시 api.touch() 를 불러 되돌리기에 남긴다.
 */

import { DESIGN_W, objHtml, getPath, PART_LABEL, cropStyle } from '/src/render.js';
import { FONT_CHOICES } from '/src/presets.js';
import { hasImage, imageFrom, imageFromClipboard } from '/web/drop.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const cloneVal = (v) => Array.isArray(v) ? v.map(cloneVal)
  : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cloneVal(x)]))
  : v;
const RAD = Math.PI / 180;

const TOOLS = ['text', 'rect', 'round', 'ellipse', 'triangle', 'line', 'arrow', 'slot'];
const KIND_LABEL = { rect: '사각형', round: '둥근 사각형', ellipse: '원', triangle: '삼각형' };
const RATIOS = [['1/1', '1:1'], ['4/5', '4:5'], ['3/4', '3:4'], ['4/3', '4:3'], ['3/2', '3:2'], ['16/9', '16:9']];

export function createObjects(api) {
  const { P, q, esc } = api;
  const sections = () => P.draft.sections;
  const paper = () => q('paper3');

  let tool = null;              /* 그릴 도형. null 이면 고르기 */
  let clip = null;              /* 복사한 개체들 */
  let editing = null;           /* 글을 고치는 중인 글상자 { i, id } */
  let cropping = null;          /* 사진 위치를 고치는 중인 이미지 { i, id } */
  let swallowUntil = 0;         /* 끌기가 끝난 직후 따라오는 click 을 먹는다 */
  let marq = null;              /* 범위 고르기 사각형 { i, x, y, w, h } */
  let guides = [];              /* 붙기 안내선 */
  let pasteN = 0;
  let pastedImage = false;      /* Ctrl+V 가 이미지 붙여넣기였는지 */

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
  const isFree = (i) => !!(sections()[i] && sections()[i].free);
  const slotOf = (i, o) => (o && o.type === 'image' && o.bind ? getPath(sections()[i].data, o.bind) : null);

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

  /* 돌리기 전의 틀 */
  function box(i, o) {
    if (o.type === 'line') {
      return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    }
    let h = o.h;
    /* 글상자·덩어리는 내용이 넘치면 아래로 자란다. 실제 높이를 잰다. */
    if (o.type === 'text' || o.type === 'block') {
      const el = obEl(i, o.id);
      if (el) h = Math.max(h, el.offsetHeight);
    }
    return { x: o.x, y: o.y, w: o.w, h };
  }
  /* 돌린 뒤 차지하는 범위 — 정렬·붙기·범위 고르기에 쓴다 */
  function aabb(i, o) {
    const b = box(i, o);
    const rot = o.type === 'line' ? 0 : Number(o.rot) || 0;
    if (!rot) return b;
    const c = Math.abs(Math.cos(rot * RAD));
    const s = Math.abs(Math.sin(rot * RAD));
    const w = b.w * c + b.h * s;
    const h = b.w * s + b.h * c;
    return { x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h };
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

  function selectIds(i, ids, raw = false) {
    if (!ids.length) { api.setSel(null); return; }
    api.setSel({ kind: 'obj', i, ids: raw ? ids : expand(i, ids) });
  }

  /* 정렬·간격은 묶음을 한 덩어리로 다룬다 */
  function units(i, objs) {
    const m = new Map();
    for (const o of objs) {
      const k = o.group || o.id;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(o);
    }
    return [...m.values()].map((members) => ({ members, b: union(members.map((o) => aabb(i, o))) }));
  }

  const ctxOf = (i) => api.renderCtx(i);

  /* ------------------------------------------------------------ 그리기 */

  /* 한 개체만 다시 그린다. 화면 전체를 다시 그리면 끄는 손이 끊긴다. */
  function redraw(i, objs) {
    const pg = pgEl(i);
    let missing = false;
    const ctx = ctxOf(i);
    for (const o of objs) {
      if (editing && editing.i === i && editing.id === o.id) continue;
      const el = pg && pg.querySelector(`.ob[data-ob="${o.id}"]`);
      if (el) {
        const html = objHtml(o, `s${i}`, ctx);
        if (html) el.outerHTML = html; else missing = true;
      } else missing = true;
    }
    if (missing) api.repaint(); else { api.decorate(pg); drawUi(); }
  }

  function clearUi() {
    paper().querySelectorAll('.obj-ui').forEach((e) => e.remove());
    paper().querySelectorAll('.ob.cropping').forEach((e) => e.classList.remove('cropping'));
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
    const bw = `border-width:${px * 1.5}px`;
    const parts = [];
    const rect = (b, cls) =>
      `<div class="${cls}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;${bw}"></div>`;
    const handle = (name, x, y, extra = '') =>
      `<div class="h${extra}" data-h="${name}" style="left:${x - hs / 2}px;top:${y - hs / 2}px;width:${hs}px;height:${hs}px;${bw}"></div>`;

    const objs = selected();
    if (objs.length === 1 && objs[0].type === 'line') {
      const o = objs[0];
      parts.push(handle('p1', o.x1, o.y1, ' round'), handle('p2', o.x2, o.y2, ' round'));
    } else if (objs.length === 1) {
      /* 하나: 돌린 틀 그대로 손잡이를 단다 */
      const o = objs[0];
      const b = box(i, o);
      const rot = Number(o.rot) || 0;
      const isCrop = cropping && cropping.i === i && cropping.id === o.id;
      const hn = [['nw', 0, 0], ['n', 0.5, 0], ['ne', 1, 0], ['e', 1, 0.5], ['se', 1, 1], ['s', 0.5, 1], ['sw', 0, 1], ['w', 0, 0.5]];
      const inner = isCrop ? '' : hn.map(([n, fx, fy]) => handle(n, fx * b.w, fy * b.h)).join('') +
        `<div class="stem" style="left:${b.w / 2 - px / 2}px;top:${-26 * px}px;width:${px}px;height:${26 * px}px"></div>` +
        handle('rot', b.w / 2, -26 * px, ' rot');
      /* 테두리 대신 outline — 테두리 두께만큼 안쪽 손잡이 자리가 밀리지 않게 */
      parts.push(`<div class="sel-frame${isCrop ? ' crop' : ''}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline-width:${px * 1.5}px;transform:rotate(${rot}deg)">${inner}</div>`);
      if (isCrop) obEl(i, o.id)?.classList.add('cropping');
    } else if (objs.length) {
      for (const o of objs) parts.push(rect(aabb(i, o), 'mem'));
      const B = union(objs.map((o) => aabb(i, o)));
      parts.push(rect(B, 'sel-box'));
      const pts = {
        nw: [B.x, B.y], n: [B.x + B.w / 2, B.y], ne: [B.x + B.w, B.y], e: [B.x + B.w, B.y + B.h / 2],
        se: [B.x + B.w, B.y + B.h], s: [B.x + B.w / 2, B.y + B.h], sw: [B.x, B.y + B.h], w: [B.x, B.y + B.h / 2]
      };
      for (const [n, [x, y]] of Object.entries(pts)) parts.push(handle(n, x, y));
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
      swallowUntil = Date.now() + 80;   /* 끌기 끝에 바로 따라오는 click 만 */
      up(ev);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', u);
    window.addEventListener('pointercancel', u);
  }

  /* 붙을 자리: 섹션 왼쪽·가운데·오른쪽, 본문 여백선, 위·가운데·아래, 다른 개체의 가장자리와 가운데 */
  function snapTargets(pg, i, skip) {
    const H = secH(pg);
    const padL = isFree(i) ? 48 : parseFloat(getComputedStyle(pg).paddingLeft) / (pg.offsetWidth / DESIGN_W);
    const xs = [0, padL, DESIGN_W / 2, DESIGN_W - padL, DESIGN_W];
    const ys = [0, H / 2, H];
    for (const o of list(i)) {
      if (skip.has(o.id)) continue;
      const b = aabb(i, o);
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
  const snapshot = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, rot: o.rot });

  /* ------------------------------------------------------------ 옮기기 */

  /* narrow — 여럿 고른 상태에서 하나를 눌렀다 떼기만 하면 그것(묶음)만 남긴다 */
  function startMove(e, pg, i, narrow = null) {
    const f = frame(pg);
    const p0 = toD(e, f);
    const objs = selected();
    if (!objs.length) return;
    const starts = objs.map((o) => [o, snapshot(o)]);
    const B0 = union(objs.map((o) => aabb(i, o)));
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
      else if (narrow && narrow.ids.length < objs.length) { selectIds(i, narrow.ids, narrow.raw); return; }
      drawUi();
    });
  }

  /* 섹션을 옮겨 가거나 복사해 갈 때 묶음을 푼다.
   * 글은 지금 글을 그대로 갖고 가고, 사진은 받는 섹션에 새 사진 자리를 만든다. */
  function detach(o, fromI) {
    const c = cloneVal(o);
    delete c.tpl;
    if (c.bind) {
      const v = getPath(sections()[fromI].data, c.bind);
      if (c.type === 'text') c.text = typeof v === 'string' ? v : '';
      else if (c.type === 'image' && v && typeof v === 'object') c._slot = cloneVal(v);
      delete c.bind;
    }
    if (c.type === 'block') c._data = cloneVal(sections()[fromI].data);
    return c;
  }
  function attach(c, toI) {
    if (c._slot) {
      const { off, ...slot } = c._slot;
      c.bind = api.newSlot(toI, slot);
      delete c._slot;
    }
    if (c.type === 'block') {
      /* 사양표·문답은 그 섹션 data 를 그린다. 다른 섹션에는 그릴 data 가 없다. */
      const same = !c._data || JSON.stringify(c._data.rows || c._data.items || c._data.marks) ===
        JSON.stringify((sections()[toI].data || {}).rows || (sections()[toI].data || {}).items || (sections()[toI].data || {}).marks);
      delete c._data;
      if (!same && c.part !== 'brand') return null;
    }
    return c;
  }
  /* 원래 자리를 비운다 — 안 보이는 글이 근거 검사에 걸리지 않게, 빈 사진 자리가 목록에 남지 않게 */
  function vacate(i, o) {
    if (!o.bind) return;
    if (o.type === 'text') api.setBound(i, o.bind, '');
    else if (o.type === 'image') api.offSlot(i, o.bind);
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
    const moving = from.filter((o) => set.has(o.id) && !(o.type === 'block' && o.part !== 'brand'));
    if (!moving.length) return;
    const gone = new Set(moving.map((o) => o.id));
    const to = list(j);
    const ids = [];
    for (const o of moving) {
      const c = attach(detach(o, i), j);
      vacate(i, o);
      if (!c) continue;
      if (to.some((x) => x.id === c.id)) c.id = uid();
      moveObj(c, snapshot(c), 0, dy);
      to.push(c);
      ids.push(c.id);
    }
    sections()[i].objects = from.filter((o) => !gone.has(o.id));
    api.setSel({ kind: 'obj', i: j, ids });
    api.repaint();
  }

  /* ------------------------------------------------------------ 크기 · 회전 */

  function startResize(e, pg, i, hname) {
    const f = frame(pg);
    const objs = selected();
    if (!objs.length) return;
    const key = `rs:${Date.now()}`;
    let touched = false;
    const begin = () => { if (!touched) { touched = true; api.touch(key); } };

    if (hname === 'rot') { startRotate(e, pg, i, objs[0]); return; }

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

    if (objs.length === 1) {
      /* 하나: 돌린 틀 안에서 키운다. 반대쪽 모서리(변)는 제자리에 둔다. */
      const o = objs[0];
      const b = box(i, o);
      const th = (Number(o.rot) || 0) * RAD;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      const sx = hname.includes('e') ? 1 : hname.includes('w') ? -1 : 0;
      const sy = hname.includes('s') ? 1 : hname.includes('n') ? -1 : 0;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const ax = cx + cos * (-sx * b.w / 2) - sin * (-sy * b.h / 2);
      const ay = cy + sin * (-sx * b.w / 2) + cos * (-sy * b.h / 2);
      capture(e, (ev) => {
        begin();
        const p = toD(ev, f);
        const dx = p.x - ax;
        const dy = p.y - ay;
        const lx = cos * dx + sin * dy;                         /* 틀 기준 좌표 */
        const ly = -sin * dx + cos * dy;
        let w = sx ? Math.max(4, sx * lx) : b.w;
        let h = sy ? Math.max(4, sy * ly) : b.h;
        if (ev.shiftKey && sx && sy && b.w && b.h) {
          const ratio = b.w / b.h;
          if (w / h > ratio) w = h * ratio; else h = w / ratio;
        }
        const ox = sx * w / 2;
        const oy = sy * h / 2;
        const ncx = ax + cos * ox - sin * oy;
        const ncy = ay + sin * ox + cos * oy;
        o.x = r1(ncx - w / 2);
        o.y = r1(ncy - h / 2);
        o.w = r1(w);
        o.h = r1(h);
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

  function startRotate(e, pg, i, o) {
    const f = frame(pg);
    const b = box(i, o);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const key = `rot:${Date.now()}`;
    let touched = false;
    capture(e, (ev) => {
      if (!touched) { touched = true; api.touch(key); }
      const p = toD(ev, f);
      let a = Math.atan2(p.y - cy, p.x - cx) / RAD + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      else if (Math.abs(((a % 90) + 90) % 90) < 2 || Math.abs(((a % 90) + 90) % 90) > 88) a = Math.round(a / 90) * 90;
      a = ((a + 180) % 360 + 360) % 360 - 180;
      o.rot = Math.round(a * 10) / 10;
      if (!o.rot) delete o.rot;
      redraw(i, [o]);
    }, () => { drawUi(); api.setSel(cur()); });
  }

  /* ------------------------------------------------------------ 새 개체 */

  function make(kind, i, x, y) {
    const id = uid();
    if (kind === 'text') {
      return { id, type: 'text', x, y, w: 320, h: 56, text: '텍스트를 입력하세요',
        style: { size: 28, color: 'var:ink', face: 'body' }, pad: 8 };
    }
    if (kind === 'line' || kind === 'arrow') {
      return { id, type: 'line', x1: x, y1: y, x2: x + 200, y2: y, stroke: '#111111', sw: 4,
        arrow: kind === 'arrow' ? 'end' : 'none' };
    }
    if (kind === 'slot') {
      const n = list(i).filter((o) => o.type === 'image' && o.bind && o.bind.startsWith('extra.')).length + 1;
      const bind = api.newSlot(i, { slot: true, label: `사진 자리 ${n}`, cut: 'product' });
      return { id, type: 'image', bind, x, y, w: 360, h: 270, r: 12 };
    }
    return { id, type: 'shape', shape: kind, x, y, w: 200, h: 140, fill: 'var:key', stroke: null, sw: 0,
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
        o = make(kind, i, p0.x, p0.y);
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
        o = make(kind, i, p0.x, p0.y);
        if (o.type !== 'line' && o.type !== 'text') { o.x = r1(p0.x - o.w / 2); o.y = r1(p0.y - o.h / 2); }
        list(i).push(o);
      }
      setTool(null);
      api.setSel({ kind: 'obj', i, ids: [o.id] });
      api.repaint();
      if (o.type === 'text') startEdit(i, o.id, true);
    });
  }

  /* 사진을 넣을 섹션: 고른 섹션, 없으면 화면 가운데 섹션 */
  function targetSection() {
    const s = api.getSel();
    if (s && s.i != null && sections()[s.i]) return s.i;
    const sc = paper().closest('.scroll');
    const mid = sc ? sc.getBoundingClientRect().top + sc.clientHeight / 2 : window.innerHeight / 2;
    const pgs = [...paper().querySelectorAll('.pg')];
    const hit = pgs.find((el) => { const r = el.getBoundingClientRect(); return mid >= r.top && mid < r.bottom; });
    return hit ? Number(hit.dataset.i) : 0;
  }

  async function insertImage(file, i = targetSection(), at = null) {
    const url = await api.readImage(file);
    const im = await new Promise((res) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => res(null); x.src = url; });
    const pg = pgEl(i);
    const H = pg ? secH(pg) : 600;
    const w = 360;
    const h = im && im.naturalWidth ? Math.round((w * im.naturalHeight) / im.naturalWidth) : 240;
    api.touch(`img:${Date.now()}`);
    const x = at ? at.x - w / 2 : (DESIGN_W - w) / 2;
    const y = at ? at.y - h / 2 : Math.max(0, (H - h) / 2);
    const o = { id: uid(), type: 'image', url, x: r1(x), y: r1(y), w, h, fit: 'cover', r: 0 };
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
      swallowUntil = Date.now() + 80;   /* 끌기 끝에 바로 따라오는 click 만 */
      const R = marq;
      marq = null;
      /* 범위 안에 다 들어온 것만 — 섹션 가득 깔린 사진까지 딸려 오지 않게 */
      const hit = list(i).filter((o) => {
        if (o.lock) return false;
        const b = aabb(i, o);
        return b.x >= R.x - 1 && b.y >= R.y - 1 && b.x + b.w <= R.x + R.w + 1 && b.y + b.h <= R.y + R.h + 1;
      }).map((o) => o.id);
      if (hit.length) selectIds(i, hit); else drawUi();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }

  /* ------------------------------------------------------------ 글상자 글 고치기 */

  function startEdit(i, id, selectAll = false) {
    endCrop();
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
      const text = tx.innerText.replace(/\n+$/, '');
      if (o.bind) api.setBound(editing.i, o.bind, text, `obt:${o.id}`);
      else { api.touch(`obt:${o.id}`); o.text = text; }
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
      e.stopPropagation();
      api.pastePlain(e, tx);
    });
    root.addEventListener('dblclick', (e) => {
      const ob = e.target.closest('.ob');
      if (!ob) return;
      const i = Number(ob.closest('.pg').dataset.i);
      const o = byId(i, ob.dataset.ob);
      if (!o) return;
      if (o.type === 'text') { selectIds(i, [o.id], true); startEdit(i, o.id); return; }
      if (o.type === 'image') {
        const slot = slotOf(i, o);
        if (o.bind && !(slot && slot.url)) { api.pickFile(`${i}.${o.bind}`); return; }  /* 빈 사진 자리 */
        selectIds(i, [o.id], true);
        startCrop(i, o.id);
      }
    });
  }

  /* ------------------------------------------------------------ 사진 위치 조정 (크롭) */

  const cropTarget = (i, o) => (o.bind ? slotOf(i, o) : o);

  function startCrop(i, id) {
    cropping = { i, id };
    drawUi();
    api.setSel(cur());
  }
  function endCrop() {
    if (!cropping) return;
    cropping = null;
    drawUi();
  }

  function cropDrag(e, pg, i, o) {
    const el = obEl(i, o.id);
    const img = el && el.querySelector('img');
    const t = cropTarget(i, o);
    if (!img || !t) return;
    const f = frame(pg);
    const p0 = toD(e, f);
    const c0 = { zoom: 1, x: 50, y: 50, ...(t.crop || {}) };
    const W = o.w;
    const H = o.h;
    const s = Math.max((c0.zoom * W) / img.naturalWidth, (c0.zoom * H) / img.naturalHeight);
    const Tx = img.naturalWidth * s - W;
    const Ty = img.naturalHeight * s - H;
    const key = `crop:${o.id}`;
    capture(e, (ev) => {
      const p = toD(ev, f);
      api.touch(key);
      t.crop = {
        zoom: c0.zoom,
        x: Tx > 1 ? r1(clamp(c0.x - ((p.x - p0.x) / Tx) * 100, 0, 100)) : c0.x,
        y: Ty > 1 ? r1(clamp(c0.y - ((p.y - p0.y) / Ty) * 100, 0, 100)) : c0.y
      };
      img.setAttribute('style', cropStyle(t.crop));
    }, () => {});
  }

  function cropZoom(i, o, z) {
    const t = cropTarget(i, o);
    if (!t) return;
    api.touch(`cz:${o.id}`);
    t.crop = { x: 50, y: 50, ...(t.crop || {}), zoom: r1(clamp(z, 1, 4) * 10) / 10 };
    obEl(i, o.id)?.querySelector('img')?.setAttribute('style', cropStyle(t.crop));
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

    if (cropping) {
      const o = byId(cropping.i, cropping.id);
      const on = e.target.closest(`.ob[data-ob="${cropping.id}"]`) || e.target.closest('.obj-ui .sel-frame.crop');
      if (o && on && cropping.i === i) { cropDrag(e, pg, i, o); return true; }
      endCrop();
    }

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
      let raw = false;
      if (s && s.i === i && multi) {
        const g = expand(i, [id]);
        const all = new Set(s.ids);
        const had = g.every((x) => all.has(x));
        for (const x of g) { if (had) all.delete(x); else all.add(x); }
        ids = [...all];
      } else if (s && s.i === i && s.ids.includes(id)) {
        ids = s.ids;                            /* 여럿을 고른 채로 끌 수 있게 그대로 둔다 */
        const o = byId(i, id);
        /* 묶음 하나가 통째로 골라져 있으면, 떼었을 때 누른 것만 고른다(묶음 안으로 들어간다) */
        const whole = o && o.group && s.ids.length > 1 && s.ids.every((x) => byId(i, x)?.group === o.group);
        narrow = whole ? { ids: [id], raw: true } : { ids: expand(i, [id]), raw: false };
        raw = true;
      } else {
        ids = [id];
      }
      selectIds(i, ids, raw);
      if (e.target.closest('.slot-tools')) return true;          /* 사진 자리의 단추 */
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

  function order(kind, i = cur()?.i, idsIn = cur()?.ids) {
    if (i == null || !idsIn) return;
    const arr = list(i);
    const set = new Set(idsIn);
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
    /* 하나만 골랐어도 그 묶음 전체를 푼다 */
    const gs = new Set(objs.map((o) => o.group).filter(Boolean));
    const members = list(s.i).filter((o) => gs.has(o.group));
    for (const o of members) delete o.group;
    api.setSel({ kind: 'obj', i: s.i, ids: members.map((o) => o.id) });
  }

  /* 사본 — 새 id, 묶음은 새 묶음으로, 묶인 글·사진은 풀어서 */
  function cloneSet(items, toI, d) {
    const gmap = new Map();
    const out = [];
    for (const it of items) {
      const c = attach(cloneVal(it), toI);
      if (!c) continue;
      c.id = uid();
      if (c.group) {
        if (!gmap.has(c.group)) gmap.set(c.group, 'g' + uid());
        c.group = gmap.get(c.group);
      }
      moveObj(c, snapshot(c), d, d);
      out.push(c);
    }
    return out;
  }

  function duplicate() {
    const s = cur();
    const objs = selected();
    if (!s || !objs.length) return;
    api.touch(`dp:${Date.now()}`);
    const copies = cloneSet(objs.map((o) => detach(o, s.i)), s.i, 16);
    list(s.i).push(...copies);
    api.setSel({ kind: 'obj', i: s.i, ids: copies.map((o) => o.id) });
    api.repaint();
  }

  function remove() {
    const s = cur();
    if (!s) return;
    const set = new Set(s.ids);
    api.touch(`rm:${Date.now()}`);
    for (const o of list(s.i)) if (set.has(o.id)) vacate(s.i, o);
    sections()[s.i].objects = list(s.i).filter((o) => !set.has(o.id));
    endCrop();
    api.setSel(null);
    api.repaint();
  }

  function copy() {
    const s = cur();
    const objs = selected();
    if (!s || !objs.length) return;
    clip = objs.map((o) => detach(o, s.i));
    pasteN = 0;
  }

  function paste() {
    if (!clip || !clip.length) return;
    const i = targetSection();
    pasteN += 1;
    api.touch(`ps:${Date.now()}`);
    const copies = cloneSet(clip, i, 16 * pasteN);
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

  /* ------------------------------------------------------------ 사진 넣기: 끌어다 놓기 · 붙여넣기 */

  /* 놓을 자리. 이미지 개체 위면 그 개체, 아니면 섹션의 그 지점 */
  function dropTarget(e) {
    const pg = e.target.closest && e.target.closest('.pg');
    if (!pg) return null;
    const i = Number(pg.dataset.i);
    /* 사진 위에 글이나 막이 얹혀 있어도 그 아래의 사진에 놓는다 */
    const under = (document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [e.target])
      .map((el) => el.closest && el.closest('.ob-image'))
      .find((el) => el && pg.contains(el));
    const ob = (e.target.closest && e.target.closest('.ob-image')) || under;
    if (ob) return { kind: 'image', i, id: ob.dataset.ob };
    return { kind: 'section', i, at: toD(e, frame(pg)) };
  }

  async function place(blob, t) {
    if (!t) return;
    if (t.kind === 'image') {
      const o = byId(t.i, t.id);
      if (!o) return;
      if (o.bind) { await api.fillBlob(t.i, o.bind, blob); return; }
      const url = await api.readImage(blob);
      api.touch(`oimg:${Date.now()}`);
      o.url = url;
      delete o.crop;
      selectIds(t.i, [o.id], true);
      api.repaint();
      return;
    }
    await insertImage(blob, t.i, t.at);
  }

  function bindDrop(root) {
    let hot = null;
    const mark = (el) => {
      if (hot === el) return;
      hot?.classList.remove('drop-hot');
      hot = el;
      hot?.classList.add('drop-hot');
    };
    root.addEventListener('dragover', (e) => {
      if (P.step !== 3 || !hasImage(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const t = dropTarget(e);
      mark(t && t.kind === 'image' ? obEl(t.i, t.id) : e.target.closest('.pg'));
    });
    root.addEventListener('dragleave', (e) => {
      if (!root.contains(e.relatedTarget)) mark(null);
    });
    root.addEventListener('drop', async (e) => {
      if (P.step !== 3 || !hasImage(e.dataTransfer)) return;
      e.preventDefault();
      mark(null);
      const t = dropTarget(e);
      try {
        const blob = await imageFrom(e.dataTransfer, { canProxy: api.canProxy });
        await place(blob, t);
      } catch (err) {
        api.toast(err.message);
      }
    });

    document.addEventListener('paste', async (e) => {
      if (P.step !== 3) return;
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
      const f = imageFromClipboard(e);
      if (!f) return;
      e.preventDefault();
      pastedImage = true;
      const s = cur();
      const objs = selected();
      const sel = api.getSel();
      /* 고른 것(묶음이어도) 안에 사진이 하나면 그 사진에 */
      const imgs = objs.filter((o) => o.type === 'image');
      if (s && imgs.length === 1) await place(f, { kind: 'image', i: s.i, id: imgs[0].id });
      else if (sel && sel.kind === 'pic') await api.fillBlob(sel.i, sel.path.split('.').slice(1).join('.'), f);
      else await insertImage(f, targetSection());
    });
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

    if (e.key === 'Escape' && cropping) { endCrop(); return true; }
    if (e.key === 'Escape' && tool) { setTool(null); return true; }
    /* Ctrl+V 는 기본 동작을 막지 않는다 — 클립보드에 이미지가 있으면 paste 이벤트가 먼저 받는다 */
    if (mod && k === 'v') {
      pastedImage = false;
      if (clip) setTimeout(() => { if (!pastedImage) paste(); }, 120);
      return true;
    }

    const s = cur();
    if (!s) return false;
    if (e.key === 'Enter' && cropping) { e.preventDefault(); endCrop(); return true; }
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

  function title(i, o) {
    if (o.type === 'text') {
      const t = o.bind ? getPath(sections()[i].data, o.bind) : o.text;
      return `글상자 · ${String(t || '').split('\n')[0].slice(0, 16) || '(빈 글)'}`;
    }
    if (o.type === 'line') return o.arrow && o.arrow !== 'none' ? '화살표' : '선';
    if (o.type === 'block') return PART_LABEL[o.part] || '덩어리';
    if (o.type === 'image') {
      const v = slotOf(i, o);
      if (v) return v.cut === 'icon' ? '아이콘' : `사진 · ${v.label || ''}`;
      return '이미지';
    }
    if (o.grad) return '그라데이션';
    if (o.line) return '괘선';
    return KIND_LABEL[o.shape] || '도형';
  }

  /* 색 고르기 칸에 넣을 #RRGGBB. 스타일 색 이름이면 지금 값을 읽는다. */
  function hexOf(c, d) {
    if (typeof c === 'string' && /^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7);
    const m = /^var:([a-z-]+)$/.exec(c || '');
    if (m) {
      const sheet = paper().querySelector('.sheet');
      const v = sheet && getComputedStyle(sheet).getPropertyValue(`--${m[1]}`).trim();
      if (/^#[0-9a-f]{6}$/i.test(v || '')) return v;
    }
    return d;
  }
  const swatches = (attr, cur0) => [['var:key', '대표색'], ['var:ink', '글자색'], ['#FFFFFF', '흰색'], ['#111111', '검정'], ['var:bg-alt', '연한 바탕']]
    .map(([v, l]) => `<button type="button" class="sw2${cur0 === v ? ' on' : ''}" ${attr}="${v}" title="${l}${v.startsWith('var:') ? ' (스타일을 따라감)' : ''}" style="background:${hexOf(v, '#888888')}"></button>`).join('');

  /* 섹션의 레이어 목록. 위에 있는 것이 앞이다. */
  function layersHtml(i) {
    const objs = list(i);
    if (!objs.length) return '<p class="note">이 섹션에는 개체가 없습니다.</p>';
    const s = cur();
    const on = new Set(s && s.i === i ? s.ids : []);
    const rows = [...objs].reverse().map((o) => `
      <li class="${on.has(o.id) ? 'on' : ''}">
        <button type="button" class="nm" data-goto-ob="${i}:${o.id}">${esc(title(i, o))}${o.group ? ' <em>묶음</em>' : ''}</button>
        <button type="button" class="lk${o.lock ? ' on' : ''}" data-lock="${i}:${o.id}" title="${o.lock ? '잠금 풀기' : '잠그기 — 화면에서 눌러지지 않게'}">${o.lock ? '🔒' : '🔓'}</button>
        <button type="button" class="ar" data-lay="${i}:${o.id}:forward" title="앞으로">▲</button>
        <button type="button" class="ar" data-lay="${i}:${o.id}:backward" title="뒤로">▼</button>
      </li>`).join('');
    return `<ul class="layers">${rows}</ul>`;
  }

  function panel() {
    const s = cur();
    const objs = selected();
    if (!s || !objs.length) return '';
    const o = objs[0];
    const many = objs.length > 1;
    const free = isFree(s.i);
    const sameGroup = many && objs.every((x) => x.group && x.group === o.group);
    const anyGroup = objs.some((x) => x.group);
    const us = units(s.i, objs);
    const head = many ? (sameGroup ? `그룹 · ${objs.length}개` : `${objs.length}개 고름`) : title(s.i, o);
    const fillable = objs.filter((x) => x.type === 'shape' || x.type === 'text');
    const boxy = objs.filter((x) => x.type !== 'line');
    const val = (v, d) => (v == null ? d : v);
    const b = box(s.i, o);
    const slot = !many ? slotOf(s.i, o) : null;

    const btn = (act, label, extra = '') => `<button type="button" class="seg" data-oa="${act}"${extra}>${label}</button>`;

    let html = `
      <div class="ins-head"><b>${esc(head)}</b><span>${esc(api.sectionLabel(sections()[s.i]))}</span></div>
      <div class="ins-actions">
        <button type="button" class="btn mini" data-oa="dup">복제</button>
        <button type="button" class="btn mini danger" data-oa="del">삭제</button>
        ${many && !sameGroup ? '<button type="button" class="btn mini" data-oa="group">그룹으로 묶기</button>' : ''}
        ${anyGroup ? '<button type="button" class="btn mini" data-oa="ungroup">그룹 풀기</button>' : ''}
        ${!many && o.type === 'text' ? '<button type="button" class="btn mini" data-oa="edit">글 고치기</button>' : ''}
        <button type="button" class="btn mini" data-oa="lock" title="잠근 개체는 화면에서 눌러지지 않습니다. 레이어 목록에서 고릅니다.">${objs.every((x) => x.lock) ? '🔒 잠금 풀기' : '잠그기'}</button>
      </div>
      ${objs.some((x) => x.lock) ? '<p class="note">잠긴 개체는 화면에서 눌러지지 않고 그 아래 개체가 눌립니다. 레이어 목록에서 고릅니다.</p>' : ''}`;

    /* 사진 자리: 프롬프트 · 올리기 · 바꾸기 */
    if (slot) html += api.slotPanel(s.i, o.bind, o);

    if (!many && o.type === 'image' && !o.bind) {
      html += `
      <h3>이미지</h3>
      <div class="ins-actions"><label class="btn mini">이미지 바꾸기<input type="file" accept="image/*" class="js-obimg" hidden></label></div>
      <div class="dropzone" data-drop-ob="${s.i}:${o.id}">여기에 끌어다 놓거나, 고른 채로 Ctrl+V</div>`;
    }
    if (!many && o.type === 'image' && ((slot && slot.url) || (!o.bind && o.url))) {
      const c = { zoom: 1, ...((slot || o).crop || {}) };
      const isCrop = cropping && cropping.id === o.id;
      html += `
      <h3>사진 위치 <span>두 번 눌러 끌기</span></h3>
      <div class="ins-actions">
        <button type="button" class="btn mini${isCrop ? ' primary' : ''}" data-oa="crop">${isCrop ? '위치 조정 끝내기' : '사진 위치 조정'}</button>
        <button type="button" class="btn mini" data-oa="crop-reset"${(slot || o).crop ? '' : ' disabled'}>처음대로</button>
      </div>
      <label class="ins-row"><span>확대</span>
        <input type="range" min="1" max="4" step="0.05" value="${c.zoom}" data-ocr="zoom"><output>${Number(c.zoom).toFixed(2)}×</output></label>`;
    }
    if (!many && o.type === 'image') {
      html += `
      <div class="ins-row"><span>틀 비율</span>
        <div class="segs">${RATIOS.map(([v, l]) => btn(`ratio-${v}`, l)).join('')}</div></div>
      <p class="note">비율을 누르면 너비는 두고 높이를 맞춥니다. 프롬프트의 사진 비율도 이 틀을 따릅니다.</p>`;
    }

    html += `
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
      ${free ? '' : `<div class="segs" style="margin-top:4px">
        ${objs.every((x) => x.behind) ? btn('front-layer', '본문 위로 올리기') : btn('back-layer', '본문 뒤로 보내기')}
      </div>`}`;

    if (!many && o.type !== 'line') {
      html += `
      <h3>위치 · 크기 · 회전 <span>860 기준 px</span></h3>
      <div class="xywh">
        <label>X <input type="number" data-pos="x" value="${Math.round(b.x)}"></label>
        <label>Y <input type="number" data-pos="y" value="${Math.round(b.y)}"></label>
        <label>W <input type="number" data-pos="w" value="${Math.round(b.w)}" min="4"></label>
        <label>H <input type="number" data-pos="h" value="${Math.round(o.h)}" min="4"></label>
      </div>`;
    }
    if (boxy.length) {
      const rot = Number(boxy[0].rot) || 0;
      html += `
      <label class="ins-row"><span>회전</span>
        <input type="range" min="-180" max="180" step="1" value="${rot}" data-op="rot"><output>${rot}°</output></label>
      <div class="segs">${btn('rot-0', '0°')}${btn('rot--90', '−90°')}${btn('rot-90', '+90°')}${btn('rot-180', '180°')}</div>`;
    }

    if (fillable.length) {
      const f0 = fillable[0];
      html += `
      <h3>채우기</h3>
      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" data-op="fill" value="${hexOf(f0.fill, hexOf('var:key', '#1F4E79'))}">
          ${swatches('data-sw-fill', f0.fill)}
          <label class="auto"><input type="checkbox" data-op-none="fill"${f0.fill || f0.grad ? '' : ' checked'}> 없음</label></div></div>
      ${f0.grad ? '<p class="note">그라데이션입니다. 색을 고르면 단색으로 바뀝니다.</p>' : ''}`;
    }

    const s0 = objs[0];
    html += `
      <h3>외곽선</h3>
      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" data-op="stroke" value="${hexOf(s0.stroke, '#111111')}">
          ${swatches('data-sw-stroke', s0.stroke)}
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
      <h3>효과</h3>
      <label class="ins-row"><span>불투명도</span>
        <input type="range" min="0" max="100" step="1" value="${Math.round(val(o.opacity, 1) * 100)}" data-op="opacity"><output>${Math.round(val(o.opacity, 1) * 100)}%</output></label>`;
    if (objs.some((x) => x.type === 'shape' || x.type === 'image')) {
      html += `
      <label class="ins-row"><span>그림자</span>
        <select data-op="shadow">
          ${[['', '없음'], ['soft', '부드럽게'], ['strong', '진하게']].map(([v, l]) => `<option value="${v}"${(o.shadow || '') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>`;
    }

    const texts = objs.filter((x) => x.type === 'text');
    if (texts.length) {
      const t = texts[0];
      const st = t.style || {};
      const bold = st.bold ?? (Number(st.weight) >= 600);
      const align = (a, l) => `<button type="button" class="seg${(st.align || 'left') === a ? ' on' : ''}" data-ot-align="${a}">${l}</button>`;
      html += `
      <h3>글자</h3>
      <label class="ins-row"><span>글꼴</span>
        <select data-ot="font"><option value="">스타일 기본</option>
          ${FONT_CHOICES.map((fc) => `<option value="${fc.family}"${st.font === fc.family ? ' selected' : ''}>${fc.label}</option>`).join('')}
        </select></label>
      <label class="ins-row"><span>크기</span>
        <input type="range" min="10" max="160" step="1" value="${val(st.size, 24)}" data-ot="size"><output>${val(st.size, 24)}px</output></label>
      <div class="ins-row"><span>굵기·정렬</span>
        <div class="segs"><button type="button" class="seg${bold ? ' on' : ''}" data-ot-bold="1"><b>가</b></button>
          ${align('left', '왼쪽')}${align('center', '가운데')}${align('right', '오른쪽')}</div></div>
      <div class="ins-row"><span>색</span>
        <div class="colors"><input type="color" data-ot="color" value="${hexOf(st.color, '#111111')}">${swatches('data-sw-text', st.color)}</div></div>
      <label class="ins-row"><span>글자 그림자</span>
        <select data-ot="shadow">
          ${[['', '없음'], ['soft', '부드럽게'], ['strong', '진하게']].map(([v, l]) => `<option value="${v}"${(st.shadow || '') === v ? ' selected' : ''}>${l}</option>`).join('')}
        </select></label>
      <label class="ins-row"><span>줄 간격</span>
        <input type="range" min="0.9" max="2.4" step="0.05" value="${val(st.lh, 1.5)}" data-ot="lh"><output>${val(st.lh, 1.5)}</output></label>
      <label class="ins-row"><span>자간</span>
        <input type="range" min="-0.05" max="0.3" step="0.01" value="${val(st.ls, 0)}" data-ot="ls"><output>${val(st.ls, 0)}em</output></label>
      <label class="ins-row"><span>안쪽 여백</span>
        <input type="range" min="0" max="80" step="1" value="${val(t.pad, 8)}" data-op="pad"><output>${val(t.pad, 8)}px</output></label>`;
    }

    html += `
      <h3>레이어 <span>위가 앞</span></h3>
      ${layersHtml(s.i)}
      <p class="note">Shift 로 여럿 고르기 · 빈 곳에서 끌어 범위 고르기 · 묶음은 한 번 더 누르면 하나만 · Ctrl+G 그룹 · Ctrl+D 복제 · 화살표 1px(Shift 10px)</p>`;
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
      if ((k === 'r' || k === 'rot') && o.type === 'line') continue;
      if (k === 'pad' && o.type !== 'text') continue;
      if (k === 'arrow' && o.type !== 'line') continue;
      if (k === 'shadow' && !(o.type === 'shape' || o.type === 'image')) continue;
      if (k === 'fill') delete o.grad;
      if (k === 'stroke' && v && !o.sw) o.sw = o.type === 'line' ? 4 : 2;  /* 색을 고르면 보이게 */
      if (v == null || v === '' || (k === 'rot' && !v)) delete o[k]; else o[k] = v;
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
        selectIds(Number(i), [id], true);
        obEl(Number(i), id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return true;
      }
      const lk = t.closest('[data-lock]');
      if (lk) {
        const [i, id] = lk.dataset.lock.split(':');
        const o = byId(Number(i), id);
        if (o) {
          api.touch(`lock:${Date.now()}`);
          if (o.lock) delete o.lock; else o.lock = true;
          redraw(Number(i), [o]);
          api.setSel(api.getSel());
        }
        return true;
      }
      const lay = t.closest('[data-lay]');
      if (lay) {
        const [i, id, kind] = lay.dataset.lay.split(':');
        order(kind, Number(i), [id]);
        api.setSel(api.getSel());
        return true;
      }
    }
    if (e.type === 'drop' || e.type === 'dragover') {
      const z = t.closest('[data-drop-ob]');
      if (!z) return false;
      e.preventDefault();
      if (e.type === 'drop') {
        const [i, id] = z.dataset.dropOb.split(':');
        imageFrom(e.dataTransfer, { canProxy: api.canProxy })
          .then((blob) => place(blob, { kind: 'image', i: Number(i), id }))
          .catch((err) => api.toast(err.message));
      }
      return true;
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
        if (o2) o2.textContent = kk === 'opacity' ? `${v}%` : kk === 'rot' ? `${v}°` : `${v}px`;
        return true;
      }
      if (t.dataset.ocr) {
        const s = cur();
        const o = selected()[0];
        if (o) cropZoom(s.i, o, Number(t.value));
        const o2 = out(t);
        if (o2) o2.textContent = `${Number(t.value).toFixed(2)}×`;
        return true;
      }
      if (t.dataset.ot) {
        const kk = t.dataset.ot;
        const v = ['size', 'lh', 'ls'].includes(kk) ? Number(t.value) : t.value;
        setTextStyle(kk === 'color' ? { color: v } : { [kk]: v });
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
          if (kk === 'fill') { for (const o of selected()) delete o.grad; redraw(cur().i, selected()); }
        } else {
          setProp(kk, picker ? picker.value : '#111111');
        }
        return true;
      }
      if (t.dataset.pos) { setPos(t.dataset.pos, Number(t.value)); return true; }
      if (t.classList.contains('js-obimg')) {
        const f = t.files[0];
        if (f && f.type.startsWith('image/')) {
          const s = cur();
          const o = selected()[0];
          if (s && o) place(f, { kind: 'image', i: s.i, id: o.id });
        }
        return true;
      }
      return !!(t.dataset.op || t.dataset.ot || t.dataset.ocr);
    }

    if (e.type === 'click') {
      const b = t.closest('button');
      if (!b) return false;
      if (b.dataset.otBold) {
        const st = (selected().find((o) => o.type === 'text') || {}).style || {};
        const bold = st.bold ?? (Number(st.weight) >= 600);
        setTextStyle({ bold: !bold });
        api.setSel(cur());
        return true;
      }
      if (b.dataset.otAlign) { setTextStyle({ align: b.dataset.otAlign }); api.setSel(cur()); return true; }
      if (b.dataset.swFill) { setProp('fill', b.dataset.swFill); api.setSel(cur()); return true; }
      if (b.dataset.swStroke) { setProp('stroke', b.dataset.swStroke); api.setSel(cur()); return true; }
      if (b.dataset.swText) { setTextStyle({ color: b.dataset.swText }); api.setSel(cur()); return true; }
      const a = b.dataset.oa;
      if (!a) return false;
      const s = cur();
      const o = selected()[0];
      if (a.startsWith('al-')) align(a.slice(3));
      else if (a.startsWith('ds-')) distribute(a.slice(3));
      else if (a.startsWith('or-')) order(a.slice(3));
      else if (a.startsWith('rot-')) setProp('rot', Number(a.slice(4)));
      else if (a.startsWith('ratio-') && o) {
        const [rw, rh] = a.slice(6).split('/').map(Number);
        api.touch(`ratio:${Date.now()}`);
        o.h = r1(o.w * rh / rw);
        redraw(s.i, [o]);
      } else if (a === 'crop' && o) { if (cropping && cropping.id === o.id) endCrop(); else startCrop(s.i, o.id); }
      else if (a === 'crop-reset' && o) {
        const tt = cropTarget(s.i, o);
        if (tt) { api.touch(`cr:${Date.now()}`); delete tt.crop; redraw(s.i, [o]); }
      }
      else if (a === 'lock') {
        api.touch(`lock:${Date.now()}`);
        const all = selected().every((x) => x.lock);
        for (const x of selected()) { if (all) delete x.lock; else x.lock = true; }
        redraw(s.i, selected());
      }
      else if (a === 'back-layer') setBehind(true);
      else if (a === 'front-layer') setBehind(false);
      else if (a === 'group') group();
      else if (a === 'ungroup') ungroup();
      else if (a === 'dup') duplicate();
      else if (a === 'del') remove();
      else if (a === 'edit') { if (o) startEdit(s.i, o.id); }
      if (cur()) api.setSel(cur());             /* 패널을 새 상태로 */
      return true;
    }
    return false;
  }

  function validate(s) {
    const ids = s.ids.filter((id) => byId(s.i, id));
    if (!ids.length) return false;
    s.ids = ids;
    return true;
  }

  const root = paper();
  bindText(root);
  bindDrop(root);
  root.addEventListener('wheel', (e) => {
    if (!cropping) return;
    const on = e.target.closest(`.ob[data-ob="${cropping.id}"]`);
    if (!on) return;
    e.preventDefault();
    const o = byId(cropping.i, cropping.id);
    const t = o && cropTarget(cropping.i, o);
    if (!t) return;
    cropZoom(cropping.i, o, ((t.crop && t.crop.zoom) || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
  }, { passive: false });

  return {
    onPointerDown,
    takeClick,
    onKey,
    panel,
    onPanel,
    layersHtml,
    drawUi,
    clearUi,
    validate,
    setTool,
    /* 하나 고른 사진 개체의 사진 자리 경로('3.items.0.image') */
    slotPath() {
      const s = cur();
      const o = selected()[0];
      return s && o && selected().length === 1 && o.type === 'image' && o.bind ? `${s.i}.${o.bind}` : null;
    },
    /* 화면을 새로 그리면 글 고치기는 끝난다 */
    afterPaint() { editing = null; drawUi(); },
    get editing() { return editing; }
  };
}
