/* AI 제품 사진 생성
 *
 * 프롬프트를 "촬영 지시서"로 조립한다. 무엇을 강조할지(연출)를 정하면
 * 앵글 · 조명 · 배경 · 소품이 따라오고, 거기에 카메라 · 마감 · 금지 항목이 붙는다.
 *
 * 브라우저에서 이미지 생성 API를 직접 호출한다. API 키는 사용자의 브라우저에만
 * 보관되고 상태(state)나 내보낸 HTML에는 절대 포함되지 않는다.
 *
 * 외부 요청이 허용된 곳에서만 동작한다. file:// 로 열면 브라우저가 막을 수 있고,
 * 배포된 아티팩트는 CSP로 차단된다. `npx serve .` 로 띄워서 사용할 것.
 */
(function () {
  'use strict';

  var KEY_STORE = 'toolDetailMaker.aiKey';

  /* ---------- 연출: 무엇을 강조할 것인가 ----------
     strategy 는 "이 특징이 눈에 띄게 하려면 어떻게 찍을 것인가"를 서술한다.
     backdrop / light 는 자동으로 고를 때 쓰는 기본 짝이다. */
  var EMPHASIS = {
    power: {
      ko: '파워 · 토크',
      match: /토크|파워|힘|출력|강력|강한/,
      backdrop: 'concrete', light: 'hard_side',
      strategy: 'a low camera angle looking slightly up so the tool reads as planted and powerful, ' +
        'the chuck and working end turned toward the key light to show machined metal, ' +
        'a faint swirl of dust hanging in the air near the bit'
    },
    light: {
      ko: '경량 · 휴대성',
      match: /경량|가벼|무게|휴대|가볍/,
      backdrop: 'white', light: 'highkey',
      strategy: 'the tool held effortlessly in one hand at a relaxed wrist angle, ' +
        'plenty of open air around it so it reads as light, an airy weightless feel'
    },
    durable: {
      ko: '내구성 · 견고함',
      match: /내구|튼튼|방수|방진|견고|충격/,
      backdrop: 'concrete', light: 'hard_side',
      strategy: 'the tool resting on a rough, worn surface with the light raking across it to reveal ' +
        'every texture of the housing, a few specks of dust and a scuff or two that read as honest field use'
    },
    precision: {
      ko: '정밀 · 제어',
      match: /정밀|정확|제어|조절|단계|속도\s*조절/,
      backdrop: 'dark', light: 'soft_rim',
      strategy: 'a tight macro on the control dial and trigger with a razor-thin plane of focus, ' +
        'the graduations and detents crisply resolved, everything else melting away'
    },
    battery: {
      ko: '배터리 · 런타임',
      match: /배터리|충전|런타임|사용\s*시간|연속/,
      backdrop: 'dark', light: 'lowkey',
      strategy: 'the battery pack seated in the tool with its charge indicator glowing as the only ' +
        'bright accent in a dark frame, the glow spilling faintly onto the housing'
    },
    grip: {
      ko: '그립 · 손목 편안함',
      match: /그립|손목|편안|인체공학|손잡이|피로/,
      backdrop: 'interior', light: 'window',
      strategy: 'a tight crop on the hand wrapped around the grip, fingers relaxed, ' +
        'the soft overmould visibly yielding under the palm, wrist held straight and unstrained'
    },
    speed: {
      ko: '작업 속도',
      match: /속도|빠르|신속|효율|단번|한\s*번에/,
      backdrop: 'bench', light: 'hard_side',
      strategy: 'the decisive moment of the cut or drive, chips and sawdust flung mid-air and frozen ' +
        'razor sharp by a fast flash, the tool itself perfectly still'
    },
    versatile: {
      ko: '다용도 · 호환성',
      match: /다용도|호환|액세서리|비트|다양|겸용/,
      backdrop: 'white', light: 'soft_rim',
      strategy: 'the tool surrounded by its accessories arranged in a clean rhythmic fan, ' +
        'each piece evenly lit and individually legible'
    }
  };

  /* ---------- 배경: 무채색 스튜디오 ↔ 실제 사용환경 ---------- */
  var BACKDROPS = {
    concrete: { ko: '무채색 콘크리트', en: 'a monotone grey concrete floor meeting a seamless concrete wall, cool neutral tones, nothing else in the frame' },
    dark:     { ko: '블랙 로우키 스튜디오', en: 'a seamless near-black studio background with a subtle falloff gradient behind the product' },
    white:    { ko: '화이트 무한대', en: 'a clean seamless white studio cyclorama with a soft contact shadow under the product' },
    bench:    { ko: '목공 작업대', en: 'a solid timber workbench in a carpentry workshop, wood shavings and a few clamps softly out of focus behind' },
    site:     { ko: '건설 현장', en: 'a construction site of raw concrete and steel framing, stacked materials blurred well behind the product' },
    lawn:     { ko: '잔디 마당 · 주택 외벽', en: 'a freshly mown lawn beside a suburban house wall, garden foliage softly blurred in the distance' },
    garage:   { ko: '차고 · 정비소', en: 'a home garage with a steel tool chest and a car partly visible, oil-darkened concrete floor' },
    interior: { ko: '인테리어 시공 현장', en: 'an interior fit-out site with fresh plasterboard, timber studs and dust sheets' }
  };

  /* ---------- 조명 ---------- */
  var LIGHTS = {
    hard_side: { ko: '하드 측광 (질감)', en: 'a hard directional key from the upper left raking across the surfaces to reveal grain and texture, a cool rim light separating the silhouette from the background, deep controlled shadows and no flat fill' },
    soft_rim:  { ko: '소프트박스 + 림라이트', en: 'a large soft key from the front left, a tight rim light along the top edge to carve the silhouette out of the background, gentle even falloff' },
    lowkey:    { ko: '로우키 드라마틱', en: 'low-key lighting with a narrow controlled beam on the product, the surroundings falling away into darkness, strong specular highlights running along the metal edges' },
    highkey:   { ko: '하이키 클린', en: 'bright high-key lighting, almost shadowless, airy and clean with only a faint contact shadow' },
    golden:    { ko: '골든아워 역광', en: 'warm golden-hour backlight with long raking shadows and a restrained lens flare, warm light rimming the top of the product' },
    window:    { ko: '실내 창가 자연광', en: 'soft directional daylight from a large window, natural falloff across the frame, calm neutral white balance' }
  };

  /* ---------- 컷 종류 ---------- */
  var SHOTS = {
    hero:   { ko: '히어로 컷',     framing: 'tight three-quarter hero framing showing the whole product', camera: '100mm lens at f/5.6, sharp from front to back', reserve: true },
    detail: { ko: '디테일 매크로', framing: 'an extreme close-up macro of the key mechanism filling the frame', camera: '100mm macro at f/4, a thin plane of focus on the critical edge', reserve: false },
    action: { ko: '사용 중 액션',  framing: 'the product mid-task in real use, hands in frame, caught at the decisive moment', camera: '35mm lens at f/2.8, slight handheld immediacy but no blur on the product', reserve: false, people: true },
    scale:  { ko: '크기 비교',     framing: 'the product beside one familiar everyday object so its size reads instantly', camera: '50mm lens at f/8, square-on and undistorted', reserve: false },
    kit:    { ko: '구성품 배치',   framing: 'a neat top-down knolling layout of the product with its accessories, evenly spaced on a flat surface', camera: '50mm lens at f/8, shot straight down, perfectly level', reserve: false }
  };

  var RATIOS = ['3:4', '4:5', '1:1', '9:16', '16:9'];
  var COUNTS = [1, 2, 3, 4];

  /* 모든 컷에 공통으로 붙는 마감 품질과 금지 사항 */
  var FINISH = 'high micro-contrast, a restrained cinematic colour grade, matte plastic and anodised metal ' +
    'rendered with accurate material response, surfaces clean with no fingerprints, ' +
    'photorealistic commercial advertising photography at medium-format digital quality';

  var FORBID = 'Do not include any text, lettering, numbers, logos, watermarks or brand marks anywhere in the image. ' +
    'No distorted or physically implausible tool geometry.';

  var RESERVE = 'Leave the top third of the frame as clean, uncluttered empty space so a headline can be placed over it.';

  var REF_NOTE = 'Use the attached photograph as the exact reference for the product: keep its shape, proportions, ' +
    'colour, materials and details faithful to it. Place that same product into the scene described below and ' +
    'relight it so it sits naturally in that light.';

  /* ---------- 특징 문장에서 연출 추론 ---------- */
  function inferEmphasis(text) {
    var s = String(text || '');
    var keys = Object.keys(EMPHASIS);
    for (var i = 0; i < keys.length; i++) {
      if (EMPHASIS[keys[i]].match.test(s)) return keys[i];
    }
    return 'power';
  }

  /* ---------- 프롬프트 조립 ---------- */
  function composePrompt(r) {
    var shot = SHOTS[r.shot] || SHOTS.hero;
    var emKey = r.emphasis && r.emphasis !== 'auto' ? r.emphasis : inferEmphasis(r.featureText);
    var em = EMPHASIS[emKey] || EMPHASIS.power;

    var backKey = r.backdrop && r.backdrop !== 'auto' ? r.backdrop : em.backdrop;
    var lightKey = r.light && r.light !== 'auto' ? r.light : em.light;
    var back = BACKDROPS[backKey] || BACKDROPS.concrete;
    var light = LIGHTS[lightKey] || LIGHTS.hard_side;

    var product = String(r.product || '').trim() || 'a cordless power tool';
    var feature = String(r.featureText || '').trim();

    var lines = [];

    if (r.useRef) lines.push(REF_NOTE);

    lines.push('Commercial advertising photograph of ' + product + ', ' + shot.framing + '.');

    lines.push('The shot is built to make ' + (feature ? '"' + feature + '"' : 'this quality') +
      ' unmistakable at a glance: ' + em.strategy + '.');

    lines.push('Setting: ' + back.en + '.');
    lines.push('Lighting: ' + light.en + '.');
    lines.push('Camera: ' + shot.camera + '.');
    lines.push('Finish: ' + FINISH + '.');

    if (shot.reserve) lines.push('Layout: ' + RESERVE);

    var forbid = FORBID;
    if (!shot.people) forbid += ' No people, no hands.';
    else forbid += ' Hands only, no faces, no extra limbs.';
    lines.push(forbid);

    var note = String(r.note || '').trim();
    if (note) lines.push(note);

    return lines.join('\n');
  }

  /* ---------- 데이터 URL 다루기 ---------- */
  function splitDataUrl(url) {
    var m = /^data:([^;,]+)?(?:;base64)?,(.*)$/.exec(String(url || ''));
    if (!m) return null;
    return { mime: m[1] || 'image/png', b64: m[2] };
  }

  function dataUrlToBlob(url) {
    var p = splitDataUrl(url);
    if (!p) return null;
    var bin = atob(p.b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type: p.mime });
  }

  /* ---------- 응답에서 이미지 찾아내기 ----------
     제공자와 버전마다 위치가 달라서, 알려진 키를 재귀로 훑는다. */
  function extractImages(json) {
    var out = [];
    var seen = new Set();

    function push(b64, mime) {
      var key = b64.slice(0, 64);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ url: 'data:' + (mime || 'image/png') + ';base64,' + b64 });
    }

    (function walk(node, depth) {
      if (!node || depth > 12 || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(function (n) { walk(n, depth + 1); });
        return;
      }
      var inline = node.inlineData || node.inline_data;
      if (inline && typeof inline.data === 'string') push(inline.data, inline.mimeType || inline.mime_type);
      if (typeof node.b64_json === 'string') push(node.b64_json, 'image/png');
      if (typeof node.bytesBase64Encoded === 'string') push(node.bytesBase64Encoded, node.mimeType || 'image/png');
      if (typeof node.url === 'string' && /^https?:/.test(node.url) && !seen.has(node.url)) {
        seen.add(node.url);
        out.push({ url: node.url, remote: true });
      }
      Object.keys(node).forEach(function (k) { walk(node[k], depth + 1); });
    })(json, 0);

    return out;
  }

  function describeError(status, bodyText) {
    var msg = '';
    try {
      var j = JSON.parse(bodyText);
      msg = (j.error && (j.error.message || j.error.status)) || j.message || '';
    } catch (e) { /* JSON이 아닐 수 있다 */ }
    if (!msg) msg = String(bodyText || '').slice(0, 300);

    if (status === 401 || status === 403) return 'API 키가 거부되었습니다 · ' + msg;
    if (status === 429) return '요청 한도를 초과했습니다 · ' + msg;
    if (status === 400) return '요청이 거부되었습니다 · ' + msg;
    return 'HTTP ' + status + ' · ' + msg;
  }

  /* ---------- 제공자 ---------- */
  var PROVIDERS = {
    gemini: {
      label: 'Google Gemini',
      defaultModel: 'gemini-2.5-flash-image',
      keyHint: 'aistudio.google.com 에서 발급한 키',
      supportsRef: true,
      request: function (c) {
        var parts = [];
        /* 참조 이미지를 먼저 넣어야 지시문이 그 이미지를 가리킨다 */
        if (c.ref) parts.push({ inlineData: { mimeType: c.ref.mime, data: c.ref.b64 } });
        parts.push({ text: c.prompt });

        return {
          url: 'https://generativelanguage.googleapis.com/v1beta/models/' +
               encodeURIComponent(c.model) + ':generateContent',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
          body: JSON.stringify({
            contents: [{ parts: parts }],
            generationConfig: { imageConfig: { aspectRatio: c.ratio } }
          })
        };
      }
    },
    openai: {
      label: 'OpenAI',
      defaultModel: 'gpt-image-1',
      keyHint: 'platform.openai.com 에서 발급한 키',
      supportsRef: true,
      request: function (c) {
        /* OpenAI는 비율 대신 픽셀 크기를 받는다 */
        var size = c.ratio === '16:9' ? '1536x1024'
                 : c.ratio === '1:1' ? '1024x1024'
                 : '1024x1536';

        if (c.ref) {
          /* 참조 이미지가 있으면 편집 엔드포인트를 쓴다 (multipart) */
          var fd = new FormData();
          fd.append('model', c.model);
          fd.append('prompt', c.prompt);
          fd.append('size', size);
          fd.append('n', '1');
          /* 확장자가 실제 형식과 어긋나면 거부될 수 있다 */
          var ext = /jpe?g/i.test(c.ref.mime) ? '.jpg' : /webp/i.test(c.ref.mime) ? '.webp' : '.png';
          fd.append('image', c.ref.blob, 'product' + ext);
          return {
            url: 'https://api.openai.com/v1/images/edits',
            /* multipart 경계는 브라우저가 붙이므로 Content-Type을 지정하지 않는다 */
            headers: { Authorization: 'Bearer ' + c.key },
            body: fd
          };
        }

        return {
          url: 'https://api.openai.com/v1/images/generations',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.key },
          body: JSON.stringify({ model: c.model, prompt: c.prompt, size: size, n: 1 })
        };
      }
    }
  };

  /* ---------- 글 생성 (페이지 설계용) ----------
     JSON 한 덩어리를 돌려받는다. 제공자마다 엔드포인트와 응답 위치가 다르다. */
  var TEXT_MODELS = { gemini: 'gemini-2.5-pro', openai: 'gpt-4o' };

  function textRequest(provider, model, prompt, key) {
    if (provider === 'openai') {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      };
    }
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/' +
           encodeURIComponent(model) + ':generateContent',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.8 }
      })
    };
  }

  /* 응답 어디에 글이 들어 있든 찾아낸다.
     Gemini는 candidates[].content.parts[].text, OpenAI는 choices[].message.content 에 담는다.
     content 가 문자열이면 본문이고 객체면 더 들어가야 하므로 타입으로 갈라야 한다. */
  function extractText(json) {
    var out = [];
    (function walk(node, depth) {
      if (!node || depth > 10 || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(function (n) { walk(n, depth + 1); }); return; }

      if (typeof node.text === 'string' && node.text.trim()) out.push(node.text);
      if (typeof node.content === 'string' && node.content.trim()) out.push(node.content);

      Object.keys(node).forEach(function (k) {
        if (typeof node[k] !== 'string') walk(node[k], depth + 1);
      });
    })(json, 0);
    return out.join('\n').trim();
  }

  /* 모델이 ```json 울타리를 붙여 보내는 경우가 흔하다 */
  function parseJsonLoose(text) {
    var t = String(text || '').trim();
    var fence = /```(?:json)?\s*([\s\S]*?)```/.exec(t);
    if (fence) t = fence[1].trim();
    try { return JSON.parse(t); } catch (e) { /* 앞뒤에 설명이 붙은 경우 */ }
    var a = t.indexOf('{');
    var b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) { /* 실패 */ }
    }
    return null;
  }

  function generateText(opts) {
    if (!opts.apiKey) return Promise.reject(new Error('API 키를 먼저 입력해 주세요'));
    var model = (opts.model || '').trim() || TEXT_MODELS[opts.provider] || TEXT_MODELS.gemini;
    var req = textRequest(opts.provider, model, opts.prompt, opts.apiKey);

    return fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) throw new Error(describeError(res.status, text));
          var json;
          try { json = JSON.parse(text); } catch (e) {
            throw new Error('응답을 해석하지 못했습니다 · ' + text.slice(0, 200));
          }
          var raw = extractText(json);
          var parsed = parseJsonLoose(raw);
          if (!parsed) {
            var err = new Error('설계 결과를 JSON으로 읽지 못했습니다.');
            err.raw = (raw || text).slice(0, 2000);
            throw err;
          }
          return parsed;
        });
      })
      .catch(function (e) {
        if (e instanceof TypeError) {
          throw new Error(
            '네트워크 요청이 차단되었습니다. 배포된 미리보기(아티팩트)에서는 외부 호출이 막혀 있습니다. ' +
            '내려받은 파일을 로컬 서버(npx serve .)로 띄운 뒤 다시 시도해 주세요.'
          );
        }
        throw e;
      });
  }

  /* ---------- 한 장 생성 ---------- */
  function generateOne(opts) {
    var provider = PROVIDERS[opts.provider];
    var model = (opts.model || '').trim() || provider.defaultModel;

    var ref = null;
    if (opts.refUrl) {
      var parts = splitDataUrl(opts.refUrl);
      if (parts) {
        ref = { mime: parts.mime, b64: parts.b64, blob: dataUrlToBlob(opts.refUrl) };
      }
    }

    var req = provider.request({
      key: opts.apiKey, model: model, prompt: opts.prompt, ratio: opts.ratio, ref: ref
    });

    return fetch(req.url, { method: 'POST', headers: req.headers, body: req.body })
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) throw new Error(describeError(res.status, text));
          var json;
          try {
            json = JSON.parse(text);
          } catch (e) {
            throw new Error('응답을 해석하지 못했습니다 · ' + text.slice(0, 200));
          }
          var images = extractImages(json);
          if (!images.length) {
            var err = new Error('응답에 이미지가 없습니다. 모델 이름을 확인해 주세요.');
            err.raw = text.slice(0, 2000);
            throw err;
          }
          return images[0];
        });
      })
      .catch(function (e) {
        if (e instanceof TypeError) {
          throw new Error(
            '네트워크 요청이 차단되었습니다. 배포된 미리보기(아티팩트)에서는 외부 호출이 막혀 있습니다. ' +
            '내려받은 파일을 로컬 서버(npx serve .)로 띄운 뒤 다시 시도해 주세요.'
          );
        }
        throw e;
      });
  }

  /* ---------- 여러 장 순차 생성 ----------
     한 장이라도 나오면 성공으로 보고, 실패는 따로 모아 돌려준다. */
  function generate(opts) {
    if (!PROVIDERS[opts.provider]) return Promise.reject(new Error('알 수 없는 제공자입니다'));
    if (!opts.apiKey) return Promise.reject(new Error('API 키를 먼저 입력해 주세요'));

    var count = Math.max(1, Math.min(4, Number(opts.count) || 1));
    var images = [];
    var failures = [];
    var chain = Promise.resolve();

    for (var i = 0; i < count; i++) {
      (function (idx) {
        chain = chain.then(function () {
          if (opts.onProgress) opts.onProgress(idx + 1, count);
          return generateOne(opts).then(function (im) {
            images.push(im);
          }, function (e) {
            failures.push(e);
          });
        });
      })(i);
    }

    return chain.then(function () {
      if (!images.length) throw failures[0] || new Error('생성에 실패했습니다');
      return { images: images, failures: failures };
    });
  }

  /* ---------- API 키 보관 (상태와 분리) ----------
     입력한 값이 우선하고, 없으면 js/local-key.js 의 값을 쓴다.
     local-key.js 는 커밋되지도, 번들에 들어가지도 않는다. */
  function loadKey() {
    var saved = '';
    try { saved = Store.backing.getItem(KEY_STORE) || ''; } catch (e) { /* 저장 불가 환경 */ }
    return saved || window.LOCAL_AI_KEY || '';
  }
  function saveKey(v) {
    try { Store.backing.setItem(KEY_STORE, v || ''); } catch (e) { /* 저장 불가 환경 */ }
  }

  window.AI = {
    EMPHASIS: EMPHASIS,
    BACKDROPS: BACKDROPS,
    LIGHTS: LIGHTS,
    SHOTS: SHOTS,
    RATIOS: RATIOS,
    COUNTS: COUNTS,
    PROVIDERS: PROVIDERS,
    TEXT_MODELS: TEXT_MODELS,
    generateText: generateText,
    parseJsonLoose: parseJsonLoose,
    inferEmphasis: inferEmphasis,
    composePrompt: composePrompt,
    extractImages: extractImages,
    splitDataUrl: splitDataUrl,
    generate: generate,
    loadKey: loadKey,
    saveKey: saveKey
  };
})();
