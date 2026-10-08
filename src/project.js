/* 작업 문서 — 네 단계가 같은 문서 하나를 고쳐 나간다
 *
 *   1 입력   사람이 넣는 것만 들어온다
 *   2 초안   입력에서 만들어진 것. 전부 고칠 수 있다
 *   3 생성   조판된 페이지. 사진 자리에는 그 컷을 만들 프롬프트가 들어간다
 *   4 완성   생성한 사진으로 프롬프트 자리를 채우고 이미지로 내보낸다
 *
 * 단계가 뒤로 가도 앞 단계 내용은 지우지 않는다. 2단계에서 고친 문장이
 * 1단계를 다시 건드렸다고 날아가면 아무도 안 쓴다.
 */

export const STEPS = [
  { no: 1, key: 'input', label: '입력' },
  { no: 2, key: 'draft', label: '초안' },
  { no: 3, key: 'page', label: '생성' },
  { no: 4, key: 'done', label: '완성' }
];

export function newProject() {
  return {
    step: 1,
    input: {
      brand: '',
      logo: null,            /* { url, dark, trim, natural } */
      name: '',
      code: '',
      features: ['', '', '', '', ''],
      priceTable: null,      /* { url } — 사양과 상품코드만 읽는다 */
      shots: [],             /* [{ url }] — 대표색을 뽑는다 */
      /* 가격표에서 읽은 것. 입력한 특징(features)과 섞지 않는다 — 출처를 알아야 한다.
       * specs 는 [{ label, value, grade }]. 읽은 직후는 draft, 원본과 대조하면 confirmed. */
      catalog: { specs: [], features: [], notes: [], state: '' }
    },
    draft: {
      candidates: [],        /* 대표색 후보 4개 */
      keyColor: null,        /* 그중 작성자가 고른 하나 */
      preset: 'catalog',
      specRows: [],          /* [{ label, value, grade }] — 가격 줄은 들어올 수 없다 */
      sections: []
    },
    width: 860
  };
}

/* ------------------------------------------------------------------
   가격 차단

   가격은 상세페이지 어디에도 넣지 않는다. 쇼핑몰이 가격을 따로 보여주고,
   페이지에 박힌 가격은 바뀌어도 안 바뀐다.

   가격표 페이지에서는 사양과 상품코드만 읽는다. 읽는 쪽에서 거르는 것으로는
   모자라서, 문서에 들어가는 길목에서 한 번 더 막는다.
------------------------------------------------------------------ */

const PRICE_LABEL = /(표준\s*가격|소비자\s*가|판매\s*가|공급\s*가|출고\s*가|정가|단가|가격|금액|price|\bmsrp\b)/i;
/* 라벨이 가격이 아니어도 값이 가격 꼴이면 의심한다. 카탈로그 표에서 가격 칸이
 * 엉뚱한 이름으로 넘어오는 일이 있다.
 *
 * 다만 공구 사양에는 쉼표 찍힌 수가 흔하다 — 회전수 1,600 RPM 같은 것.
 * 그래서 1만 이상일 때만 가격으로 본다. 회전수나 중량이 1만을 넘는 일은 없고,
 * 가격이 1만 아래인 일도 거의 없다. */
const PRICE_SHAPE = /^[₩$]?\s*(\d{1,3}(?:,\d{3})+)\s*(원|won)?$/i;

export function isPriceRow(row) {
  if (!row) return false;
  if (PRICE_LABEL.test(row.label || '')) return true;
  const v = String(row.value || '').trim();
  const m = PRICE_SHAPE.exec(v);
  if (!m) return false;
  /* 원·₩·$ 가 붙어 있으면 액수와 상관없이 가격이다 */
  if (m[2] || /^[₩$]/.test(v)) return true;
  return Number(m[1].replace(/,/g, '')) >= 10000;
}

/* 가격 줄을 걸러낸 사양표를 돌려준다 */
export function stripPrice(rows) {
  return (rows || []).filter((r) => !isPriceRow(r));
}

/* 내보내기 직전에 한 번 더 본다. 여기서 걸리면 거르지 말고 멈춘다 —
 * 조용히 지우면 왜 사라졌는지 아무도 모른다. */
export function assertNoPrice(doc) {
  const hits = [];
  const walk = (rows, where) => {
    for (const r of rows || []) if (isPriceRow(r)) hits.push(`${where}: ${r.label} = ${r.value}`);
  };
  walk(doc?.draft?.specRows, '사양');
  for (const s of doc?.draft?.sections || []) walk(s.data?.rows, s.type);
  for (const s of doc?.sections || []) walk(s.data?.rows, s.type);

  if (hits.length) {
    throw new Error(
      '가격으로 보이는 값이 남아 있습니다. 상세페이지에는 가격을 넣지 않습니다.\n  ' +
      hits.join('\n  '));
  }
}

/* ------------------------------------------------------------------
   입력이 다 찼는지
------------------------------------------------------------------ */

export function inputStatus(input) {
  const feat = input.features.filter((f) => f.trim()).length;
  return {
    brand: !!input.brand.trim(),
    name: !!input.name.trim(),
    code: !!input.code.trim(),
    features: feat,
    priceTable: !!input.priceTable,
    shots: input.shots.length
  };
}

/* 다음 단계로 갈 수 있는 최소 조건.
 * 상품코드와 가격표는 없어도 넘어간다 — 없으면 사양을 손으로 채우면 된다. */
export function canDraft(input) {
  const s = inputStatus(input);
  return s.brand && s.name && s.features >= 1 && s.shots >= 1;
}

export function missingForDraft(input) {
  const s = inputStatus(input);
  const out = [];
  if (!s.brand) out.push('브랜드');
  if (!s.name) out.push('제품명');
  if (!s.features) out.push('제품특징 (최소 1개)');
  if (!s.shots) out.push('제품 사진 (대표색을 뽑습니다)');
  return out;
}
