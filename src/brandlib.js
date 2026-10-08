/* 브랜드 보관함
 *
 * 한 번 올린 브랜드 로고를 브라우저에 담아뒀다가,
 * 다음에 같은 브랜드 이름을 치면 그대로 불러온다.
 *
 * 색은 담지 않는다. 대표색은 제품 사진에서 뽑기 때문에 같은 브랜드라도
 * 제품마다 다르다. 브랜드에 묶어 두면 다음 제품에 엉뚱한 색이 따라붙는다.
 *
 * 지금은 브라우저 localStorage 에만 있다. 기기를 옮기면 따라오지 않는다.
 * 사내 서버로 옮길 때 이 파일의 네 함수만 바꾸면 되도록 떼어 두었다.
 */

const STORE = 'cretec.brands.v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

function write(all) {
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch {
    /* 로고를 여러 개 담으면 용량 한도에 걸린다 */
    return false;
  }
}

/* 띄어쓰기와 대소문자를 무시하고 찾는다. "블루텍" 과 "블루텍 " 은 같은 브랜드다. */
const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function listBrands() {
  return Object.values(read())
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

export function loadBrand(name) {
  const k = norm(name);
  if (!k) return null;
  return read()[k] || null;
}

export function saveBrand(brand) {
  const k = norm(brand.name);
  if (!k) return false;
  const all = read();
  all[k] = { ...all[k], ...brand, savedAt: Date.now() };
  return write(all);
}

export function removeBrand(name) {
  const all = read();
  delete all[norm(name)];
  write(all);
}
