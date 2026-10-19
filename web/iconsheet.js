/* 아이콘 한 장 → 아이콘 여러 장
 *
 * 아이콘을 하나씩 따로 만들면 굵기와 그림체가 제각각이 된다. 그래서 한 섹션의 아이콘을
 * 한 번에 한 장(가로 한 줄 또는 격자)으로 그리게 하고, 올리면 여기서 잘라 자리마다 넣는다.
 *
 * 바탕은 단색(흰색 또는 검정)이라고 본다. 가장자리 색을 바탕으로 잡고, 바탕과 다른 점이
 * 모인 덩어리를 찾는다.
 *   1. 가로로 훑어 덩어리 줄(행)을 찾고, 행마다 세로로 훑어 칸을 찾는다.
 *   2. 칸 수가 자리 수와 같으면 그대로 쓴다.
 *   3. 다르면 같은 간격으로 나눈다(가로 한 줄 또는 3열 격자).
 * 칸마다 내용만 남기고 정사각형 가운데에 놓는다. 바탕색은 그대로 둔다 — 화면에서
 * multiply/screen 으로 지워진다.
 */

const load = (blob) => new Promise((res, rej) => {
  const url = URL.createObjectURL(blob);
  const im = new Image();
  im.onload = () => { URL.revokeObjectURL(url); res(im); };
  im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이미지를 읽지 못했습니다')); };
  im.src = url;
});

/* 값이 있는 구간들. gap 보다 짧은 빈칸은 이어 붙인다. */
function runs(arr, min, gap) {
  const out = [];
  let s = -1;
  let lastOn = -1;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > min) {
      if (s < 0) s = i;
      else if (i - lastOn > gap) { out.push([s, lastOn]); s = i; }
      lastOn = i;
    }
  }
  if (s >= 0) out.push([s, lastOn]);
  return out;
}

/* 한 장을 읽어 덩어리 칸을 찾는다. 나누기 전에 "이게 아이콘 한 장인가"를 볼 때도 쓴다. */
async function analyze(blob) {
  const im = await load(blob);
  const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
  const W = Math.max(1, Math.round(im.naturalWidth * k));
  const H = Math.max(1, Math.round(im.naturalHeight * k));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;

  /* 가장자리 색 = 바탕 */
  let br = 0, bgc = 0, bb = 0, cnt = 0;
  const sample = (x, y) => { const o = (y * W + x) * 4; br += px[o]; bgc += px[o + 1]; bb += px[o + 2]; cnt++; };
  for (let x = 0; x < W; x += 4) { sample(x, 0); sample(x, H - 1); }
  for (let y = 0; y < H; y += 4) { sample(0, y); sample(W - 1, y); }
  const bg = [br / cnt, bgc / cnt, bb / cnt];
  const on = new Uint8Array(W * H);
  for (let i = 0, o = 0; i < W * H; i++, o += 4) {
    const d = Math.max(Math.abs(px[o] - bg[0]), Math.abs(px[o + 1] - bg[1]), Math.abs(px[o + 2] - bg[2]));
    on[i] = d > 48 ? 1 : 0;
  }
  const rowsOf = (x0, x1, y0, y1) => {
    const a = new Array(y1 - y0 + 1).fill(0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y - y0] += on[y * W + x];
    return a;
  };
  const colsOf = (x0, x1, y0, y1) => {
    const a = new Array(x1 - x0 + 1).fill(0);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[x - x0] += on[y * W + x];
    return a;
  };

  /* 행 → 칸. 아이콘보다 훨씬 얇은 줄(아래에 딸려 나온 글씨 같은 것)과 좁은 칸은 버린다. */
  const cells = [];
  let rowBands = runs(rowsOf(0, W - 1, 0, H - 1), 1, Math.round(H * 0.03)).filter(([a, b]) => b - a >= H * 0.04);
  const tallest = Math.max(0, ...rowBands.map(([a, b]) => b - a));
  rowBands = rowBands.filter(([a, b]) => b - a >= tallest * 0.35);
  for (const [y0, y1] of rowBands) {
    let colBands = runs(colsOf(0, W - 1, y0, y1), 1, Math.round(W * 0.025)).filter(([a, b]) => b - a >= W * 0.02);
    const widest = Math.max(0, ...colBands.map(([a, b]) => b - a));
    colBands = colBands.filter(([a, b]) => b - a >= widest * 0.35);
    for (const [x0, x1] of colBands) cells.push({ x0, x1, y0, y1 });
  }
  return { im, k, W, H, bg, cells, rowsOf, colsOf };
}

/* 아이콘이 몇 개 그려져 있나 — 붙여 넣은 그림이 한 장짜리 아이콘 묶음인지 가늠한다 */
export async function countIcons(blob) {
  try { return (await analyze(blob)).cells.length; } catch { return 0; }
}

export async function splitSheet(blob, n) {
  const { im, k, W, H, bg, cells: found, rowsOf, colsOf } = await analyze(blob);
  let cells = found;

  /* 칸 수가 안 맞으면 같은 간격으로 */
  let even = false;
  if (cells.length !== n) {
    even = true;
    const cols = W / H >= n * 0.6 ? n : Math.min(3, n);
    const rows = Math.ceil(n / cols);
    cells = [];
    for (let j = 0; j < n; j++) {
      const c = j % cols;
      const r = Math.floor(j / cols);
      cells.push({ x0: Math.round((c * W) / cols), x1: Math.round(((c + 1) * W) / cols) - 1,
        y0: Math.round((r * H) / rows), y1: Math.round(((r + 1) * H) / rows) - 1 });
    }
  }

  /* 칸마다 내용 상자를 다시 좁혀 정사각형 가운데에 */
  const out = [];
  for (const c of cells) {
    const rr = runs(rowsOf(c.x0, c.x1, c.y0, c.y1), 0, 1e9);
    const cc = runs(colsOf(c.x0, c.x1, c.y0, c.y1), 0, 1e9);
    const x0 = c.x0 + (cc[0] ? cc[0][0] : 0);
    const x1 = c.x0 + (cc[0] ? cc[0][1] : c.x1 - c.x0);
    const y0 = c.y0 + (rr[0] ? rr[0][0] : 0);
    const y1 = c.y0 + (rr[0] ? rr[0][1] : c.y1 - c.y0);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const side = Math.round(Math.max(w, h) * 1.3);
    const sx = (x0 + w / 2) / k;
    const sy = (y0 + h / 2) / k;
    const S = Math.min(512, Math.round(side / k));
    const o = document.createElement('canvas');
    o.width = S;
    o.height = S;
    const og = o.getContext('2d');
    og.fillStyle = `rgb(${bg.map(Math.round).join(',')})`;
    og.fillRect(0, 0, S, S);
    const src = side / k;
    og.drawImage(im, sx - src / 2, sy - src / 2, src, src, 0, 0, S, S);
    out.push(o.toDataURL('image/png'));
  }
  return { icons: out, even };
}
