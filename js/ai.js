/* AI 메인 사진 생성
 *
 * 브라우저에서 이미지 생성 API를 직접 호출합니다. API 키는 사용자의 브라우저에만
 * 보관되고 상태(state)나 내보낸 HTML에는 절대 포함되지 않습니다.
 *
 * 주의: 파일을 file:// 로 열면 브라우저가 교차 출처 요청을 막을 수 있습니다.
 *       그때는 `npx serve .` 처럼 로컬 서버로 띄워서 사용하세요.
 */
(function () {
  'use strict';

  var KEY_STORE = 'toolDetailMaker.aiKey';

  /* ---------- 프롬프트 재료 ---------- */
  var PLACES = {
    garden:   { ko: '잔디 마당 · 정원', en: 'a neatly mown backyard lawn beside a suburban house wall, trees softly blurred behind' },
    workshop: { ko: '목공 작업대',      en: 'a wooden workbench in a bright carpentry workshop, sawdust and clamps around' },
    site:     { ko: '건설 현장',        en: 'a construction site with steel framing and concrete, work materials stacked nearby' },
    garage:   { ko: '차고 · 정비소',    en: 'a home garage with a tool chest and a car partly visible in the background' },
    studio:   { ko: '미니멀 스튜디오',  en: 'a minimal seamless studio backdrop in a soft neutral tone' },
    deck:     { ko: '야외 데크 · 테라스', en: 'a wooden outdoor deck with potted plants and a garden beyond' }
  };

  var LIGHTS = {
    golden: { ko: '골든아워 역광',   en: 'warm golden hour backlight with soft lens flare and long shadows' },
    day:    { ko: '부드러운 자연광', en: 'soft diffused daylight, gentle shadows, bright and clean' },
    studio: { ko: '스튜디오 조명',   en: 'controlled studio softbox lighting with a subtle rim light' },
    dark:   { ko: '극적인 로우키',   en: 'dramatic low-key lighting, dark surroundings with a focused highlight on the subject' }
  };

  var RATIOS = ['3:4', '4:5', '1:1', '9:16', '16:9'];

  var MODES = {
    scene:    { ko: '제품이 있는 장면', hint: '설명한 공구가 함께 생성됩니다. 실제 제품과 모양이 다를 수 있습니다.' },
    backdrop: { ko: '배경만 (제품 컷 합성용)', hint: '제품 없는 빈 장면을 만듭니다. 배경 지운 제품 사진을 위에 올려 쓰세요.' }
  };

  /* ---------- 프롬프트 만들기 ---------- */
  function buildPrompt(opts) {
    var place = (PLACES[opts.place] || PLACES.garden).en;
    var light = (LIGHTS[opts.light] || LIGHTS.golden).en;
    var product = (opts.product || '').trim() || 'a cordless power tool';

    var subject = opts.mode === 'backdrop'
      ? 'An empty scene of ' + place + ', with no products, no tools and no people. ' +
        'Leave a clean, uncluttered focal area in the lower middle of the frame where a product will be composited later.'
      : 'A commercial product photograph of ' + product + ', standing in ' + place + '.';

    return [
      subject,
      light + '.',
      'Photorealistic advertising photography, 85mm lens, shallow depth of field, crisp product detail, rich natural colours.',
      'Vertical composition with generous empty sky or wall space across the top third for a text headline.',
      'No text, no lettering, no watermarks, no logos, no brand marks, no people.',
      (opts.note || '').trim()
    ].filter(Boolean).join(' ');
  }

  /* ---------- 응답에서 이미지 찾아내기 ----------
     제공자마다 위치가 다르고 버전에 따라 바뀌기도 해서,
     알려진 키(inlineData/inline_data/b64_json/bytesBase64Encoded)를 재귀로 훑는다. */
  function extractImages(json) {
    var out = [];
    var seen = new Set();

    (function walk(node, depth) {
      if (!node || depth > 12 || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(function (n) { walk(n, depth + 1); });
        return;
      }
      var inline = node.inlineData || node.inline_data;
      if (inline && typeof inline.data === 'string') {
        push(inline.data, inline.mimeType || inline.mime_type);
      }
      if (typeof node.b64_json === 'string') push(node.b64_json, 'image/png');
      if (typeof node.bytesBase64Encoded === 'string') push(node.bytesBase64Encoded, node.mimeType || 'image/png');
      if (typeof node.url === 'string' && /^https?:/.test(node.url)) {
        if (!seen.has(node.url)) { seen.add(node.url); out.push({ url: node.url, remote: true }); }
      }
      Object.keys(node).forEach(function (k) { walk(node[k], depth + 1); });
    })(json, 0);

    function push(b64, mime) {
      var key = b64.slice(0, 64);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ url: 'data:' + (mime || 'image/png') + ';base64,' + b64 });
    }

    return out;
  }

  /* 오류 메시지를 사람이 읽을 수 있게 */
  function describeError(status, bodyText) {
    var msg = '';
    try {
      var j = JSON.parse(bodyText);
      msg = (j.error && (j.error.message || j.error.status)) || j.message || '';
    } catch (e) { /* 본문이 JSON이 아닐 수 있다 */ }
    if (!msg) msg = String(bodyText || '').slice(0, 300);

    if (status === 401 || status === 403) return 'API 키가 거부되었습니다 · ' + msg;
    if (status === 429) return '요청 한도를 초과했습니다 · ' + msg;
    if (status === 400) return '요청이 거부되었습니다 · ' + msg;
    return 'HTTP ' + status + ' · ' + msg;
  }

  /* ---------- 제공자별 호출 ---------- */
  var PROVIDERS = {
    gemini: {
      label: 'Google Gemini',
      defaultModel: 'gemini-2.5-flash-image',
      keyHint: 'aistudio.google.com 에서 발급한 키',
      request: function (model, prompt, ratio) {
        return {
          url: 'https://generativelanguage.googleapis.com/v1beta/models/' +
               encodeURIComponent(model) + ':generateContent',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.key },
          body: {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { imageConfig: { aspectRatio: ratio } }
          }
        };
      }
    },
    openai: {
      label: 'OpenAI',
      defaultModel: 'gpt-image-1',
      keyHint: 'platform.openai.com 에서 발급한 키',
      request: function (model, prompt, ratio) {
        /* OpenAI는 비율 대신 픽셀 크기를 받는다 */
        var size = ratio === '16:9' ? '1536x1024'
                 : ratio === '1:1' ? '1024x1024'
                 : '1024x1536';
        return {
          url: 'https://api.openai.com/v1/images/generations',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.key },
          body: { model: model, prompt: prompt, size: size, n: 1 }
        };
      }
    }
  };

  /* ---------- 실행 ---------- */
  function generate(opts) {
    var provider = PROVIDERS[opts.provider];
    if (!provider) return Promise.reject(new Error('알 수 없는 제공자입니다'));
    if (!opts.apiKey) return Promise.reject(new Error('API 키를 먼저 입력해 주세요'));

    var model = (opts.model || '').trim() || provider.defaultModel;
    var req = provider.request.call({ key: opts.apiKey }, model, opts.prompt, opts.ratio);
    var raw = '';

    return fetch(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body)
    }).then(function (res) {
      return res.text().then(function (text) {
        raw = text;
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
        return images;
      });
    }).catch(function (e) {
      if (e instanceof TypeError) {
        /* fetch 자체가 실패 — CORS, 오프라인, 차단된 환경 */
        var msg = new Error(
          '네트워크 요청이 차단되었습니다. 배포된 미리보기(아티팩트)에서는 외부 호출이 막혀 있습니다. ' +
          '내려받은 파일을 로컬 서버(npx serve .)로 띄운 뒤 다시 시도해 주세요.'
        );
        msg.raw = raw;
        throw msg;
      }
      throw e;
    });
  }

  /* ---------- API 키 보관 (상태와 분리) ---------- */
  function loadKey() {
    try { return Store.backing.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
  }
  function saveKey(v) {
    try { Store.backing.setItem(KEY_STORE, v || ''); } catch (e) { /* 저장 불가 환경 */ }
  }

  window.AI = {
    PLACES: PLACES,
    LIGHTS: LIGHTS,
    RATIOS: RATIOS,
    MODES: MODES,
    PROVIDERS: PROVIDERS,
    buildPrompt: buildPrompt,
    extractImages: extractImages,
    generate: generate,
    loadKey: loadKey,
    saveKey: saveKey
  };
})();
