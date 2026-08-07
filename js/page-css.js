/* 생성되는 상세페이지의 스타일.
   미리보기에 <style>로 주입되고, HTML 내보내기 시 그대로 함께 저장됩니다.
   모든 선택자는 .dp-root 하위로 한정되어 에디터 UI와 섞이지 않습니다. */
window.PAGE_CSS = `
.dp-root{
  --dp-accent:#f5b301;
  --dp-w:860px;
  --dp-radius:14px;
  --dp-scale:1;
  --dp-bg:#ffffff;
  --dp-ink:#14181d;
  --dp-sub:#5c646e;
  --dp-line:#e6e9ed;
  --dp-soft:#f5f6f8;
  --dp-on-accent:#1a1a1a;
  width:var(--dp-w);
  max-width:100%;
  margin:0 auto;
  background:var(--dp-bg);
  color:var(--dp-ink);
  font-family:"Pretendard","Apple SD Gothic Neo","Malgun Gothic",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  line-height:1.6;
  overflow:hidden;
  word-break:keep-all;
}
.dp-root *{box-sizing:border-box}
.dp-root img{max-width:100%;display:block}
.dp-root p{margin:0}
.dp-root h1,.dp-root h2,.dp-root h3,.dp-root h4{margin:0;line-height:1.3;font-weight:800;letter-spacing:-.02em}
.dp-root ul{margin:0;padding:0;list-style:none}

.dp-theme-dark{
  --dp-bg:#101317; --dp-ink:#f2f5f8; --dp-sub:#a3acb7;
  --dp-line:#252b33; --dp-soft:#181d23; --dp-on-accent:#101317;
}
.dp-theme-industrial{
  --dp-bg:#f6f6f4; --dp-ink:#1b1a17; --dp-sub:#5a564e;
  --dp-line:#deded8; --dp-soft:#ecebe5; --dp-on-accent:#1b1a17;
}

/* 공통 섹션 */
.dp-sec{padding:64px 48px;position:relative}
.dp-sec + .dp-sec{border-top:1px solid var(--dp-line)}
.dp-sec-soft{background:var(--dp-soft)}
.dp-eyebrow{
  font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--dp-accent);margin-bottom:12px;
}
.dp-h2{font-size:calc(30px * var(--dp-scale));margin-bottom:12px}
.dp-lead{color:var(--dp-sub);font-size:15px;margin-bottom:36px;max-width:38em}
.dp-pic{background:var(--dp-soft);border-radius:var(--dp-radius);overflow:hidden}
.dp-pic img{width:100%;height:100%;object-fit:cover}
.dp-pic-empty{
  display:flex;align-items:center;justify-content:center;min-height:180px;
  color:var(--dp-sub);font-size:13px;border:1px dashed var(--dp-line);
}

/* HERO — 오버레이형: 사진 전체 위에 문구를 얹는다 */
.dp-hero-ov{padding:0;position:relative;overflow:hidden;container-type:inline-size}
.dp-hero-ov .dp-ov-bg{position:absolute;inset:0}
.dp-hero-ov .dp-ov-bg img{width:100%;height:100%;object-fit:cover}
.dp-hero-ov .dp-pic-empty{height:100%;border:0;background:var(--dp-soft)}
/* 글자가 밝은 사진 위에서도 읽히도록 위아래를 살짝 덮는다 */
.dp-hero-ov .dp-ov-scrim{
  position:absolute;inset:0;pointer-events:none;
  background:
    linear-gradient(180deg, rgba(12,14,18,var(--dp-scrim)) 0%, rgba(12,14,18,calc(var(--dp-scrim) * .45)) 34%, rgba(12,14,18,0) 60%),
    linear-gradient(0deg, rgba(12,14,18,calc(var(--dp-scrim) * .5)) 0%, rgba(12,14,18,0) 22%);
}
.dp-hero-ov .dp-ov-cut{
  position:absolute;transform:translate(-50%,-50%);
  max-width:92%;pointer-events:none;
}
.dp-hero-ov .dp-ov-cut img{width:auto;height:100%;max-width:100%;object-fit:contain}
.dp-hero-ov .dp-ov-cut.has-shadow img{filter:drop-shadow(0 24px 34px rgba(0,0,0,.42))}

.dp-hero-ov .dp-ov-text{
  position:absolute;left:0;right:0;z-index:2;
  display:flex;flex-direction:column;gap:1.4cqw;
  padding:0 7cqw;color:#fff;text-align:center;align-items:center;
  text-shadow:0 2px 14px rgba(0,0,0,.42);
}
.dp-hero-ov .dp-ov-text.is-left{text-align:left;align-items:flex-start}
.dp-hero-ov .dp-ov-text.is-right{text-align:right;align-items:flex-end}
.dp-ov-name{font-size:26px;font-size:3.1cqw;font-weight:800;letter-spacing:-.01em;margin:0}
.dp-ov-model{font-size:24px;font-size:2.9cqw;font-weight:500;opacity:.92;margin:0;letter-spacing:.01em}
.dp-ov-head{
  font-size:56px;font-size:6.8cqw;font-weight:800;line-height:1.16;letter-spacing:-.035em;
  white-space:pre-line;margin:.5cqw 0 .2cqw;text-wrap:balance;
}
.dp-ov-badge{
  display:inline-block;background:#fff;color:#16181c;
  font-size:20px;font-size:2.5cqw;font-weight:700;
  padding:1.2cqw 3.4cqw;border-radius:999px;margin-top:.8cqw;
  text-shadow:none;box-shadow:0 4px 18px rgba(0,0,0,.18);
}
.dp-ov-logo{
  position:absolute;left:0;right:0;bottom:3.4cqw;z-index:2;text-align:center;
  color:#fff;font-size:30px;font-size:3.6cqw;font-weight:800;letter-spacing:-.02em;
  text-shadow:0 2px 14px rgba(0,0,0,.42);
}

/* HERO — 기본형: 사진 아래에 문구 */
.dp-hero{padding:0}
.dp-hero-media{position:relative;aspect-ratio:4/3;border-radius:0}
.dp-hero-media .dp-pic-empty{height:100%;border-radius:0}
.dp-hero-body{padding:44px 48px 52px}
.dp-hero .dp-brand{font-size:13px;font-weight:700;letter-spacing:.08em;color:var(--dp-accent)}
.dp-hero h1{font-size:calc(42px * var(--dp-scale));margin:10px 0 14px}
.dp-hero .dp-tagline{font-size:17px;color:var(--dp-sub);margin-bottom:22px}
.dp-model{
  display:inline-block;font-size:12px;padding:4px 10px;border-radius:999px;
  border:1px solid var(--dp-line);color:var(--dp-sub);margin-bottom:20px;
}
.dp-tags{display:flex;flex-wrap:wrap;gap:8px}
.dp-tags li{
  font-size:13px;font-weight:600;padding:6px 13px;border-radius:999px;
  background:var(--dp-accent);color:var(--dp-on-accent);
}

/* 핵심 포인트 */
.dp-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.dp-key{
  padding:26px 20px;border-radius:var(--dp-radius);background:var(--dp-soft);
  border:1px solid var(--dp-line);
}
.dp-key .dp-key-ico{font-size:26px;margin-bottom:12px}
.dp-key h3{font-size:calc(17px * var(--dp-scale));margin-bottom:7px}
.dp-key p{font-size:13.5px;color:var(--dp-sub)}

/* 특징 */
.dp-feature{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.dp-feature.is-rev .dp-feature-media{order:2}
.dp-feature-media{aspect-ratio:1/1}
.dp-badge{
  display:inline-block;font-size:12px;font-weight:800;letter-spacing:.1em;
  color:var(--dp-accent);margin-bottom:10px;
}
.dp-feature h3{font-size:calc(27px * var(--dp-scale));margin-bottom:14px}
.dp-feature .dp-desc{color:var(--dp-sub);font-size:15px;margin-bottom:18px}
.dp-bullets li{
  position:relative;padding-left:20px;font-size:14px;margin-bottom:8px;color:var(--dp-ink);
}
.dp-bullets li::before{
  content:"";position:absolute;left:2px;top:9px;width:7px;height:7px;border-radius:2px;
  background:var(--dp-accent);
}

/* 갤러리 */
.dp-gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.dp-gallery figure{margin:0}
.dp-gallery .dp-pic{aspect-ratio:4/3}
.dp-gallery figcaption{font-size:13px;color:var(--dp-sub);margin-top:8px;text-align:center}

/* 사용 장면 */
.dp-uses{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.dp-use .dp-pic{aspect-ratio:3/4;margin-bottom:12px}
.dp-use h3{font-size:calc(16px * var(--dp-scale));margin-bottom:5px}
.dp-use p{font-size:13px;color:var(--dp-sub)}

/* 사양표 */
.dp-spec{width:100%;border-collapse:collapse;border-top:2px solid var(--dp-ink)}
.dp-spec tr{border-bottom:1px solid var(--dp-line)}
.dp-spec th,.dp-spec td{padding:14px 16px;text-align:left;font-size:14px;vertical-align:top}
.dp-spec th{width:34%;background:var(--dp-soft);font-weight:700}
.dp-spec td{color:var(--dp-sub)}
.dp-spec .item-tools{float:right}

/* 구성품 */
.dp-pack{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.dp-pack li{
  display:flex;gap:10px;align-items:baseline;padding:14px 16px;
  border:1px solid var(--dp-line);border-radius:10px;font-size:14px;
}
.dp-pack li b{color:var(--dp-accent)}

/* 안내 */
.dp-notice{background:var(--dp-soft)}
.dp-notice ul li{
  position:relative;padding-left:16px;font-size:13.5px;color:var(--dp-sub);margin-bottom:9px;
}
.dp-notice ul li::before{content:"·";position:absolute;left:4px;top:-1px;font-weight:800}

/* 자유 텍스트 */
.dp-text .dp-body{font-size:15px;color:var(--dp-sub);white-space:pre-wrap}

/* CTA / 푸터 */
.dp-cta{background:var(--dp-accent);color:var(--dp-on-accent);text-align:center}
.dp-cta h2{font-size:calc(30px * var(--dp-scale));margin-bottom:12px}
.dp-cta p{font-size:15px;opacity:.85}
.dp-foot{
  padding:30px 48px;text-align:center;font-size:12px;color:var(--dp-sub);
  border-top:1px solid var(--dp-line);
}

@media (max-width:760px){
  .dp-sec{padding:40px 22px}
  .dp-hero,.dp-hero-ov{padding:0}
  .dp-hero-body{padding:30px 22px 36px}
  .dp-hero h1{font-size:calc(30px * var(--dp-scale))}
  .dp-keys,.dp-uses,.dp-pack{grid-template-columns:1fr}
  .dp-feature{grid-template-columns:1fr;gap:22px}
  .dp-feature.is-rev .dp-feature-media{order:0}
  .dp-gallery{grid-template-columns:1fr}
  .dp-foot{padding:24px 22px}
}
`;
