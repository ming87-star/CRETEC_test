/* 가격표 읽기와 기획을 실제 카탈로그로 시험한다
 *
 *   node scripts/ai-check.js extract   가격표 읽기만
 *   node scripts/ai-check.js plan      읽은 값으로 기획까지
 *
 * 화면에서 쓰는 프롬프트와 검증을 그대로 쓴다. 여기서 맞으면 화면에서도 맞고,
 * 여기서 틀리면 화면에서도 틀린다.
 *
 * 모델 호출은 비용이 든다. 사례는 CASES 에 정답과 함께 적어 두고 일부만 돌린다.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../server/gemini.js';
import {
  buildExtractPrompt, parseExtract, buildFacts, buildPlanPrompt, parsePlan, parseJsonLoose
} from '../src/plan.js';
import { isPriceRow } from '../src/project.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataUrl = (f) =>
  `data:image/jpeg;base64,${fs.readFileSync(path.join(ROOT, f)).toString('base64')}`;

/* 정답은 카탈로그 이미지에서 사람이 직접 읽은 값이다 */
export const CASES = {
  /* 같은 표의 다른 제품 행이 섞이지 않는지, 특징 문구가 제 것만 붙는지 본다 */
  drill: {
    image: 'docs/카탈로그-샘플/04-동청-전동공구.jpg',
    product: { brand: '동청', name: 'DCJZ 2060ADM', code: '585-0075' },
    expectSpecs: { '모델명': 'DCJZ 2060ADM', '작업능력': '13', '최대토크': '60', '중량': '1.4' },
    mustHaveValue: ['20/2.0', '0~600/2,300'],
    /* 이 행 값이 아니다 — 옆 행(DCJZ 2060iEM)의 1.7 / 20/4.0 */
    mustNotHaveValue: ['1.7', '20/4.0', '197,000', '132,000'],
    featureWords: ['2단 속도 조절', '20+1 토크'],
    /* 옆 제품(DCJZ 1202iD)에 붙은 문구 */
    featureMustNot: ['20+2']
  },
  /* 특징 문구가 이 제품에 인쇄돼 있지 않다 — 비워야 한다 */
  noFeatures: {
    image: 'docs/카탈로그-샘플/04-동청-전동공구.jpg',
    product: { brand: '동청', name: 'DCJZ 2060iEM', code: '585-0084' },
    expectSpecs: { '작업능력': '13', '최대토크': '60', '중량': '1.7' },
    mustHaveValue: ['20/4.0'],
    mustNotHaveValue: ['197,000', '1.4', '20/2.0'],
    featureMustNot: ['20+2', '20+1', '2단 속도 조절']
  },
  /* 표에 없는 코드 — matched:false 여야 한다 */
  absent: {
    image: 'docs/카탈로그-샘플/04-동청-전동공구.jpg',
    product: { brand: '동청', name: 'ZZZ 9999', code: '999-9999' },
    expectNotMatched: true
  }
};

const ok = (b) => (b ? '✓' : '✗');
let failures = 0;
const check = (cond, msg) => { if (!cond) failures++; console.log(`    ${ok(cond)} ${msg}`); };

/* 읽은 결과를 저장해 둔다. 기획만 다시 시험할 때 가격표 읽기에 또 돈을 쓰지 않으려고.
 * FRESH=1 이면 새로 읽는다. */
const CACHE = path.join(ROOT, 'out-ai');

export async function runExtract(name) {
  const c = CASES[name];
  const cacheFile = path.join(CACHE, `extract-${name}.json`);
  const t0 = Date.now();
  let r, model;

  if (!process.env.FRESH && fs.existsSync(cacheFile)) {
    ({ r, model } = JSON.parse(fs.readFileSync(cacheFile, 'utf8')));
    model += ' · 저장된 결과';
  } else {
    const prompt = buildExtractPrompt({ ...c.product, tiled: false });
    const out = await generate({
      prompt, images: [dataUrl(c.image)], tier: 'complex', temperature: 0
    });
    r = parseExtract(parseJsonLoose(out.text));
    model = out.model;
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ r, model }, null, 1));
  }
  console.log(`\n  ${name} — ${c.product.name} ${c.product.code}  (${model}, ${((Date.now() - t0) / 1000).toFixed(0)}초)`);

  if (c.expectNotMatched) {
    check(r.matched === false, `못 찾았다고 답함 (matched=${r.matched})`);
    check(!r.specs.length && !r.features.length, '값을 지어내지 않음');
    return r;
  }

  console.log(`    matched=${r.matched} model=${r.model} code=${r.code}`);
  for (const s of r.specs) console.log(`      ${s.label.padEnd(18)} ${s.value}`);
  for (const f of r.features) console.log(`      특징: ${f}`);
  for (const n of r.notes) console.log(`      메모: ${n}`);

  check(r.matched, '제품 행을 찾음');
  const vals = r.specs.map((s) => s.value);
  const all = r.specs.map((s) => `${s.label}=${s.value}`).join('|');
  for (const [k, v] of Object.entries(c.expectSpecs || {})) {
    const row = r.specs.find((s) => s.label.includes(k) || s.value === v && k === '모델명');
    check(row && row.value.includes(v), `${k} = ${v}  (읽은 값: ${row ? row.value : '없음'})`);
  }
  for (const v of c.mustHaveValue || []) check(vals.includes(v), `값 ${v} 있음`);
  for (const v of c.mustNotHaveValue || []) check(!vals.includes(v), `값 ${v} 없음`);
  check(!r.specs.some(isPriceRow), '가격이 한 줄도 안 섞임');
  for (const w of c.featureWords || [])
    check(r.features.some((f) => f.includes(w)), `특징에 "${w}" 있음`);
  for (const w of c.featureMustNot || [])
    check(!r.features.some((f) => f.includes(w)), `옆 제품 문구 "${w}" 안 가져옴`);
  void all;
  return r;
}

export async function runPlan(userFeatures, extracted, product) {
  const input = {
    features: userFeatures,
    catalog: { specs: extracted?.specs || [], features: extracted?.features || [] }
  };
  const facts = buildFacts(input);
  const prompt = buildPlanPrompt(product, facts);
  const t0 = Date.now();
  const { text, model } = await generate({ prompt, tier: 'complex', temperature: 0.4 });
  const plan = parsePlan(parseJsonLoose(text), facts, product);
  return { plan, facts, model, sec: ((Date.now() - t0) / 1000).toFixed(0) };
}

/* CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] || 'extract';
  const names = process.argv.slice(3).length ? process.argv.slice(3) : Object.keys(CASES);

  if (mode === 'extract') {
    for (const n of names) await runExtract(n);
  } else if (mode === 'plan') {
    const n = names[0] || 'drill';
    const ex = await runExtract(n);
    const { plan, facts, model, sec } = await runPlan(
      ['최대토크 60N·m', '2단 속도 조절', '브러시리스 모터', '가볍고 손에 잘 잡히는 그립'],
      ex, CASES[n].product);
    console.log(`\n  기획 (${model}, ${sec}초)\n  angle: ${plan.angle}`);
    console.log('  강한 순서:', plan.order.map((id) => `${id} ${facts.find((f) => f.id === id).text}`).join('  >  '));
    for (const s of plan.sections) {
      console.log(`\n  ── ${s.type}  근거 [${s.basis.join(', ')}]${s.flags.length ? '  ⚠ ' + s.flags.join(', ') : ''}`);
      console.log('    ' + JSON.stringify(s.data));
    }
    for (const n2 of plan.notes) console.log('  메모:', n2);
  }

  console.log(failures ? `\n  ✗ ${failures}건 틀림\n` : '\n  전부 맞음\n');
  process.exit(failures ? 1 : 0);
}
