/* 문서 → 상세페이지 HTML
 *
 * 섹션 하나가 <section class="pg"> 하나이고, 내보낼 때 이미지 한 장이 된다.
 * 브라우저 미리보기와 서버 캡처가 같은 함수를 쓴다.
 */

import { PRESETS, applyBrandColor } from './presets.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* 줄바꿈을 살려서 내보낸다 */
const lines = (s) => esc(s).replace(/\n/g, '<br>');

/* 아이콘 자리 또는 실제 아이콘. 아이콘은 AI 가 만들 자리라 비워둔다. */
function icon(v) {
  if (v && v.url) return `<span class="ico"><img src="${esc(v.url)}" alt=""></span>`;
  return '<span class="ico slot"></span>';
}

/* 이미지 자리 또는 실제 사진 */
function pic(v, cls = '') {
  if (!v) return '';
  if (v.slot) {
    return `<div class="pic slot ${cls}"><span>${esc(v.label)}</span></div>`;
  }
  return `<div class="pic ${cls}"><img src="${esc(v.url)}" alt=""></div>`;
}

/* ---------------- 섹션별 판형 ---------------- */
const R = {
  hero: (d) => `
    <div class="hero-bg">${pic(d.image, 'fill')}</div>
    <div class="hero-scrim"></div>
    <div class="hero-text">
      <p class="mark">${esc(d.mark ?? '')}</p>
      <p class="eyebrow">${lines(d.eyebrow)}</p>
      <h1>${lines(d.title)}</h1>
    </div>`,

  problem: (d) => `
    <p class="kicker center">${lines(d.kicker)}</p>
    <h2 class="key center">${lines(d.headline)}</h2>
    <div class="tick"></div>
    ${pic(d.image, 'round wide')}`,

  solutionIntro: (d) => `
    <p class="eyebrow center spread">${esc(d.eyebrow)}</p>
    <h2 class="center">${lines(d.headline)}</h2>
    ${pic(d.image, 'round wide')}
    <div class="tick short"></div>
    <ul class="circles">
      ${(d.icons || []).map((i) => `
        <li><span class="circ">${icon(i.icon)}</span><em>${esc(i.label)}</em></li>`).join('')}
    </ul>`,

  featuresGrid: (d) => `
    <h2 class="key center">${lines(d.headline)}</h2>
    ${pic(d.image, 'wide')}
    <ul class="grid9">
      ${(d.items || []).map((i) => `
        <li>${icon(i.icon)}<em>${lines(i.label)}</em></li>`).join('')}
    </ul>`,

  coreSolution: (d) => `
    <p class="check">✓</p>
    <p class="kicker center">${lines(d.specLine)}</p>
    <h2 class="center">${lines(d.headline)}</h2>
    ${pic(d.image, 'wide')}`,

  point: (d) => `
    <div class="pt-head">
      <span class="pt-no">| POINT ${String(d.no).padStart(2, '0')}</span>
      <span class="pt-dot">${String(d.no).padStart(2, '0')}</span>
    </div>
    <h2 class="pt-title">${lines(d.headline)}</h2>
    ${pic(d.image, 'round wide')}`,

  pointReason: (d) => (d.blocks || []).map((b) => `
    <div class="reason">
      ${pic(b.image, 'wide')}
      <p class="en">${esc(b.en)}</p>
      <h3>${esc(b.ko)}</h3>
      <hr>
      <p class="soft">${esc(b.desc)}</p>
    </div>`).join(''),

  compare: (d) => `
    <h2>${lines(d.headline)}</h2>
    <p class="soft">${lines(d.desc)}</p>
    <div class="cmp">
      <div class="cmp-col ours">
        <p class="cmp-label">${esc(d.oursLabel)}</p>
        ${pic(d.oursImage, 'wide')}
      </div>
      <div class="cmp-col theirs">
        <p class="cmp-label">${esc(d.theirsLabel)}</p>
        ${pic(d.theirsImage, 'wide')}
      </div>
    </div>
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

  cert: (d) => `
    <h2 class="center">${lines(d.headline)}</h2>
    <ul class="marks">
      ${(d.marks || []).map((m) => `<li>${esc(m.label)}</li>`).join('')}
    </ul>
    <p class="soft center small">${esc(d.note)}</p>`,

  usecase: (d) => `
    <h2>${lines(d.headline)}</h2>
    <ul class="uses">
      ${(d.items || []).map((i) => `
        <li>
          ${pic(i.image, 'tall')}
          <h4>${esc(i.title)}</h4>
          <p class="soft small">${esc(i.desc)}</p>
        </li>`).join('')}
    </ul>`,

  recommend: (d) => `
    <h2 class="key">${lines(d.headline)}</h2>
    <ul class="checks">
      ${(d.items || []).map((t) => `<li>${esc(t)}</li>`).join('')}
    </ul>
    ${pic(d.image, 'circle')}`,

  spec: (d) => `
    ${pic(d.image, 'wide')}
    <h2 class="small-title">${lines(d.headline)}</h2>
    <table class="spec">
      <tbody>
        ${(d.rows || []).map((r) => `
          <tr>
            <th>${esc(r.label)}</th>
            <td${r.value ? '' : ' class="todo"'}>${esc(r.value) || '입력 필요'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`,

  care: (d) => `
    <h2>${lines(d.headline)}</h2>
    <ul class="notes">
      ${(d.items || []).map((t) => `<li>${esc(t)}</li>`).join('')}
    </ul>`,

  faq: (d) => `
    <p class="kicker">${esc(d.model ?? '')}</p>
    <h2>${lines(d.headline)}</h2>
    <div class="qa">
      ${(d.items || []).map((i) => `
        <div class="q"><b>Q.</b> ${esc(i.q)}</div>
        <div class="a"><b>A.</b> ${esc(i.a)}</div>`).join('')}
    </div>
    <p class="credit">${esc(d.credit ?? '')}</p>`,

  aiNotice: (d) => `<p class="ai-note">* ${esc(d.text)}</p>`
};

/* ---------------- 페이지 조립 ---------------- */
export function renderSections(doc) {
  const p = doc.product || {};
  return doc.sections.map((s, i) => {
    const fn = R[s.type];
    if (!fn) return '';
    /* 히어로와 FAQ 는 제품 정보를 함께 쓴다 */
    const data = s.type === 'hero' ? { ...s.data, mark: p.brandMark }
               : s.type === 'faq' ? { ...s.data, model: `${p.brand} ${p.model}` }
               : s.data;
    return `<section class="pg pg-${s.type}" data-i="${i}" data-type="${s.type}">${fn(data)}</section>`;
  }).join('\n');
}

export function renderPage(doc) {
  const preset = applyBrandColor(PRESETS[doc.preset] || PRESETS.catalog, doc.keyColor);
  return {
    fontLink: preset.fonts.link,
    css: buildCss(preset, doc.width || 860),
    html: `<div class="sheet">${renderSections(doc)}</div>`
  };
}

/* ---------------- 스타일 ---------------- */
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
  width:${width}px; margin:0 auto; background:var(--bg); color:var(--ink);
  font-family:var(--body); line-height:1.66; word-break:keep-all;
}
.sheet *{box-sizing:border-box}
.sheet img{display:block;width:100%;height:100%;object-fit:cover}
.sheet p,.sheet h1,.sheet h2,.sheet h3,.sheet h4{margin:0}
.sheet ul{margin:0;padding:0;list-style:none}

.pg{padding:var(--pad);position:relative;background:var(--bg)}
.pg + .pg{border-top:1px solid var(--line)}

h1,h2,h3,h4{font-family:var(--display);font-weight:var(--tw);letter-spacing:var(--tt);line-height:1.24}
h2{font-size:calc(34px * var(--ts));margin-bottom:18px;text-wrap:balance}
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
.pic.slot{display:flex;align-items:center;justify-content:center;border:1px dashed var(--line)}
.pic.slot span{font-size:13px;color:var(--ink-soft);letter-spacing:.04em}

/* 히어로 */
.pg-hero{padding:0;aspect-ratio:3/4;overflow:hidden}
.pg-hero .hero-bg{position:absolute;inset:0}
.pg-hero .hero-bg .pic{height:100%;border:0}
.hero-scrim{position:absolute;inset:0;
  background:linear-gradient(180deg,rgba(10,12,15,.55),rgba(10,12,15,.12) 46%,rgba(10,12,15,0) 66%)}
.hero-text{position:absolute;left:0;right:0;top:7%;padding:0 8%;text-align:center;color:#fff;
  text-shadow:0 2px 16px rgba(0,0,0,.4)}
.hero-text .mark{font-family:var(--display);font-size:26px;letter-spacing:.14em;margin-bottom:16px}
.hero-text .eyebrow{color:rgba(255,255,255,.92);font-size:19px;margin-bottom:6px}
.hero-text h1{font-size:calc(52px * var(--ts));color:#fff}

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
