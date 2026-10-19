/* 끌어다 놓기 · 붙여넣기로 들어온 이미지를 꺼낸다
 *
 * 생성형 AI 창에서 만든 사진을 이 창으로 바로 끌어오거나(Ctrl+C → Ctrl+V) 붙여 넣는다.
 * 브라우저마다 넘겨주는 꼴이 다르다.
 *
 *   파일            다른 창의 <img> 를 끌면 크롬은 대개 파일을 같이 준다. 탐색기에서 끌어도 파일.
 *   data: 주소      직접 풀어서 쓴다(아티팩트 틀 안에서는 fetch(data:) 가 막혀 있다).
 *   http(s) 주소    그 사이트가 허락하면 받아 온다. 안 되면 로컬 서버가 대신 받는다(/api/fetch-image).
 *   blob: 주소      다른 창의 blob 은 이 창에서 열 수 없다 → 붙여넣기를 안내한다.
 */

const isImg = (f) => f && /^image\//.test(f.type || '');

function dataUrlToBlob(url) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/i.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: m[1] });
}

/* 끌어온 HTML 이나 주소 목록에서 이미지 주소 하나 */
function urlFrom(dt) {
  const html = dt.getData && dt.getData('text/html');
  if (html) {
    const m = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html);
    if (m) return m[1].replace(/&amp;/g, '&');
  }
  const list = (dt.getData && (dt.getData('text/uri-list') || dt.getData('text/plain'))) || '';
  const line = list.split(/\r?\n/).find((l) => l && !l.startsWith('#'));
  return line && /^(https?:|data:image\/)/i.test(line.trim()) ? line.trim() : '';
}

export function hasImage(dt) {
  if (!dt) return false;
  const types = [...(dt.types || [])];
  return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html');
}

/* dt → File/Blob. 못 꺼내면 사람이 읽을 이유와 함께 throw.
 * canProxy: 로컬 서버로 띄웠을 때만 true(아티팩트에는 서버가 없다) */
export async function imageFrom(dt, { canProxy = false } = {}) {
  for (const f of dt.files || []) if (isImg(f)) return f;
  for (const it of dt.items || []) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (isImg(f)) return f;
    }
  }
  const url = urlFrom(dt);
  if (!url) throw new Error('이미지를 찾지 못했습니다.');
  if (url.startsWith('data:')) {
    const b = dataUrlToBlob(url);
    if (b) return b;
    throw new Error('이미지를 읽지 못했습니다.');
  }
  if (url.startsWith('blob:')) {
    throw new Error('그 창의 사진은 바로 끌어올 수 없습니다. 사진에서 오른쪽 클릭 → 이미지 복사 후, 여기서 Ctrl+V 로 붙여 넣어 주세요.');
  }
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (r.ok) {
      const b = await r.blob();
      if (isImg(b)) return b;
    }
  } catch { /* 아래로 */ }
  if (canProxy) {
    try {
      const r = await fetch(`/api/fetch-image?url=${encodeURIComponent(url)}`);
      if (r.ok) {
        const b = await r.blob();
        if (isImg(b)) return b;
      }
    } catch { /* 아래로 */ }
  }
  throw new Error('그 사이트가 사진을 넘겨주지 않습니다. 사진에서 오른쪽 클릭 → 이미지 복사 후, 여기서 Ctrl+V 로 붙여 넣거나 저장한 파일을 끌어 놓아 주세요.');
}

/* 붙여넣기(ClipboardEvent)에서 이미지 하나 */
export function imageFromClipboard(e) {
  const cd = e.clipboardData;
  if (!cd) return null;
  for (const f of cd.files || []) if (isImg(f)) return f;
  for (const it of cd.items || []) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (isImg(f)) return f;
    }
  }
  return null;
}
