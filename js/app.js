/* 이벤트 연결 · 미리보기 갱신 · 이미지 처리 · 내보내기 */
(function () {
  'use strict';

  var q = Panel.q;
  var page, stageZoom, toast;
  var pickTarget = null;      // 이미지 모달이 채울 슬롯 { kind, secId, idx }
  var uploadMode = 'library'; // 'library' | 'pick'

  /* ---------- 공통 ---------- */
  function say(msg) {
    clearTimeout(say._t);
    toast.textContent = msg;
    toast.hidden = false;
    say._t = setTimeout(function () { toast.hidden = true; }, 2200);
  }

  function renderPage() {
    var a = Renderer.rootAttrs();
    page.className = a.cls + (q('editToggle').checked ? ' is-edit' : '');
    page.setAttribute('style', a.style);
    page.innerHTML = Renderer.renderBody(true);
  }

  function refresh() {
    renderPage();
    Panel.sectionList();
    Panel.mainPane();
  }

  /* ---------- 이미지 ---------- */
  var MAX_W = 1600;

  function readImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('이미지 파일이 아닙니다'));
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('파일을 읽지 못했습니다')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('이미지를 열지 못했습니다')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, MAX_W / w);
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          var isPng = /png/i.test(file.type);
          var url = isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
          resolve({ id: Store.uid('img'), name: file.name, url: url, w: cw, h: ch });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return /^image\//.test(f.type);
    });
    if (!files.length) return;

    Promise.all(files.map(function (f) {
      return readImage(f).catch(function () { return null; });
    })).then(function (results) {
      var added = results.filter(Boolean);
      added.forEach(function (im) { Store.state.images.push(im); });
      if (!added.length) { say('이미지를 불러오지 못했습니다'); return; }

      if (uploadMode === 'pick' && pickTarget) {
        assignImage(pickTarget, added[0].id);
        closeModal();
      } else {
        Store.autoAssignImages();
      }
      uploadMode = 'library';
      Panel.imageGrids();
      refresh();
      say(added.length + '장을 추가했습니다');
    });
  }

  function assignImage(target, imageId) {
    var sec = Store.section(target.secId);
    if (!sec) return;
    if (target.kind === 'sec') sec.imageId = imageId;
    else if (target.kind === 'cut') sec.cutImageId = imageId;
    else if (sec.items && sec.items[target.idx]) sec.items[target.idx].imageId = imageId;
    refresh();
  }

  function removeImage(id) {
    Store.state.images = Store.state.images.filter(function (im) { return im.id !== id; });
    Store.state.sections.forEach(function (s) {
      if (s.imageId === id) s.imageId = null;
      if (s.cutImageId === id) s.cutImageId = null;
      (s.items || []).forEach(function (it) { if (it.imageId === id) it.imageId = null; });
    });
    Panel.imageGrids();
    refresh();
  }

  /* ---------- 이미지 선택 모달 ---------- */
  function openModal(target) {
    pickTarget = target;
    var sec = Store.section(target.secId);
    var cur = null;
    if (sec) {
      if (target.kind === 'sec') cur = sec.imageId;
      else if (target.kind === 'cut') cur = sec.cutImageId;
      else cur = (sec.items[target.idx] || {}).imageId;
    }
    Panel.imageGrid(q('pickGrid'), { pick: true, selectedId: cur });
    q('imgModal').hidden = false;
  }
  function closeModal() {
    q('imgModal').hidden = true;
    pickTarget = null;
  }

  /* 이미 만들어진 이미지(데이터 URL 등)를 라이브러리 형식으로 정규화 */
  function adoptImage(url, name) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = function () { resolve({ id: Store.uid('img'), name: name, url: url }); };
      img.onload = function () {
        try {
          var scale = Math.min(1, MAX_W / img.naturalWidth);
          var cw = Math.max(1, Math.round(img.naturalWidth * scale));
          var ch = Math.max(1, Math.round(img.naturalHeight * scale));
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
          resolve({ id: Store.uid('img'), name: name, url: cv.toDataURL('image/jpeg', 0.88), w: cw, h: ch });
        } catch (e) {
          /* 다른 출처 이미지는 캔버스가 오염되어 변환할 수 없다 */
          resolve({ id: Store.uid('img'), name: name, url: url, remote: true });
        }
      };
      img.src = url;
    });
  }

  /* ================= 페이지 생성 파이프라인 ================= */

  var generating = false;
  var genAbort = false;
  var pipeline = [];

  function drawSteps() {
    var box = q('progress');
    if (!pipeline.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = pipeline.map(function (s) {
      return '<div class="pstep is-' + s.state + '"><span class="dot"></span>' +
        Renderer.esc(s.label) +
        (s.sub ? '<span class="sub">' + Renderer.esc(s.sub) + '</span>' : '') +
      '</div>';
    }).join('');
  }

  function step(key, state, sub) {
    pipeline.forEach(function (s) {
      if (s.key !== key) return;
      if (state) s.state = state;
      if (sub != null) s.sub = sub;
    });
    drawSteps();
  }

  function genStatus(html, cls) {
    var box = q('genStatus');
    box.hidden = !html;
    box.className = 'aistatus' + (cls ? ' ' + cls : '');
    box.innerHTML = html || '';
  }

  /* 실제 상태를 훑어 비어 있는 칸을 모은다 (모델 말이 아니라 결과를 믿는다) */
  function collectTodo() {
    var out = [];
    Store.state.sections.forEach(function (s) {
      if (s.type === 'spec') {
        (s.items || []).forEach(function (it) {
          if (!String(it.value || '').trim()) out.push('사양 · ' + (it.label || '이름 없는 항목'));
        });
      } else if (s.type === 'pack') {
        (s.items || []).forEach(function (it) {
          if (!String(it.name || '').trim() || !String(it.qty || '').trim()) {
            out.push('구성품 · ' + (it.name || '이름 없는 항목'));
          }
        });
      }
    });
    return out;
  }

  function showTodo(strategy) {
    var list = collectTodo();
    var box = q('todoBox');
    if (!list.length && !strategy) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML =
      (strategy ? '<strong>설계 방향</strong>' + Renderer.esc(strategy) + '<br><br>' : '') +
      (list.length
        ? '<strong>채워야 할 항목 ' + list.length + '개</strong>' +
          '<ul>' + list.map(function (t) { return '<li>' + Renderer.esc(t) + '</li>'; }).join('') + '</ul>' +
          '지어낸 값을 넣지 않았습니다. 미리보기에서 점선 표시된 칸을 채워주세요.'
        : '<strong>비어 있는 사양 없음</strong>');
  }

  /* 컷마다 어울리는 생성 비율 */
  function ratioFor(secType, heroRatio) {
    if (secType === 'hero') {
      var r = String(heroRatio || '3/5').split('/');
      var v = Number(r[0]) / Number(r[1]);
      if (v <= 0.65) return '9:16';
      if (v <= 0.85) return '3:4';
      if (v <= 1.1) return '1:1';
      return '16:9';
    }
    if (secType === 'usecase') return '3:4';
    return '1:1';
  }

  function assignShot(shot, imageId) {
    var sec = Store.section(shot.secId);
    if (!sec) return;
    if (shot.slot === 'item') {
      if (sec.items && sec.items[shot.idx]) sec.items[shot.idx].imageId = imageId;
    } else {
      sec.imageId = imageId;
    }
  }

  var SHOT_LIMIT = 12;

  function runShots(shots, refUrl) {
    var ai = Store.state.ai;
    var key = AI.loadKey();
    var list = shots.slice(0, SHOT_LIMIT);
    var done = 0;
    var failed = 0;
    var chain = Promise.resolve();

    step('shots', 'run', '0 / ' + list.length);

    list.forEach(function (shot) {
      chain = chain.then(function () {
        if (genAbort) return;
        var sec = Store.section(shot.secId);
        if (!sec) return;

        var prompt = AI.composePrompt({
          product: Store.state.product.name,
          shot: shot.recipe.shot,
          featureText: shot.recipe.featureText,
          emphasis: shot.recipe.emphasis,
          backdrop: shot.recipe.backdrop,
          light: shot.recipe.light,
          useRef: !!refUrl
        });

        return AI.generate({
          provider: ai.provider,
          model: ai.model,
          apiKey: key,
          prompt: prompt,
          ratio: ratioFor(sec.type, sec.ratio),
          count: 1,
          refUrl: refUrl
        }).then(function (res) {
          return adoptImage(res.images[0].url, 'AI ' + (AI.SHOTS[shot.recipe.shot] || {}).ko + ' ' +
            (Store.state.images.length + 1));
        }).then(function (im) {
          Store.state.images.push(im);
          assignShot(shot, im.id);
          done++;
          refresh();
          Panel.imageGrids();
        }, function () {
          failed++;
        }).then(function () {
          step('shots', 'run', (done + failed) + ' / ' + list.length);
        });
      });
    });

    return chain.then(function () {
      return { done: done, failed: failed, total: list.length, skipped: shots.length - list.length };
    });
  }

  function generatePage() {
    /* 실행 중이면 같은 버튼이 중단으로 동작한다 */
    if (generating) {
      genAbort = true;
      genStatus('중단하는 중입니다… 진행 중인 사진 한 장을 마치고 멈춥니다.');
      return;
    }

    var input = {
      brand: String(Store.state.product.brand || '').trim(),
      name: String(Store.state.product.name || '').trim(),
      features: q('bulkFeatures').value
    };
    if (!input.name) {
      genStatus('제품명을 입력해 주세요.', 'is-err');
      return;
    }

    var ai = Store.state.ai;
    var key = AI.loadKey();
    var skipAi = q('skipAi').checked;
    var refIm = Store.state.images[0] || null;
    var refUrl = refIm && !refIm.remote ? refIm.url : null;

    generating = true;
    genAbort = false;
    var btn = document.querySelector('[data-act="generate-page"]');
    btn.textContent = '중단';
    btn.classList.remove('btn-primary');
    q('todoBox').hidden = true;
    genStatus('');

    pipeline = [
      { key: 'design', label: '구성 설계', state: 'run', sub: '' },
      { key: 'shots', label: '사진 생성', state: 'wait', sub: '' }
    ];
    drawSteps();

    var strategy = '';

    Planner.design(input, {
      provider: ai.provider,
      textModel: ai.textModel,
      apiKey: key,
      skipAi: skipAi
    }).then(function (res) {
      var applied = Planner.applyPlan(res.plan, input);
      strategy = applied.strategy;
      step('design', 'done', res.byAi ? 'AI 설계 · 섹션 ' + Store.state.sections.length + '개'
                                      : '규칙 기반 · 섹션 ' + Store.state.sections.length + '개');
      Panel.renderAll();
      refresh();
      showTodo(strategy);

      if (genAbort) return null;
      if (!key || skipAi) {
        step('shots', 'done', '건너뜀');
        return null;
      }
      if (!applied.shots.length) {
        step('shots', 'done', '필요 없음');
        return null;
      }
      return runShots(applied.shots, refUrl);
    }).then(function (res) {
      showTodo(strategy);
      if (genAbort) {
        step('shots', 'fail', '중단됨');
        genStatus('중단했습니다. 여기까지 만들어진 내용은 그대로 남아 있습니다.');
        return;
      }
      if (!res) {
        genStatus(skipAi || !key
          ? '규칙만으로 구성했습니다. 사진은 이미지 탭에서 올리거나 메인 탭에서 생성하세요.'
          : '페이지를 구성했습니다.', 'is-ok');
        return;
      }
      step('shots', res.done ? 'done' : 'fail', res.done + ' / ' + res.total + '장');
      var msg = '페이지를 완성했습니다. 사진 ' + res.done + '장 생성.';
      if (res.failed) msg += ' ' + res.failed + '장은 실패했습니다.';
      if (res.skipped) msg += ' ' + res.skipped + '자리는 한도(' + SHOT_LIMIT + '장)를 넘어 건너뛰었습니다.';
      genStatus(msg, res.failed ? '' : 'is-ok');
    }).catch(function (e) {
      step('design', 'fail');
      var extra = e.raw
        ? '<details><summary>응답 원문 보기</summary><pre>' + Renderer.esc(e.raw) + '</pre></details>'
        : '';
      genStatus(Renderer.esc(e.message || '생성에 실패했습니다') +
        '<br>AI 없이 규칙만으로 구성하려면 아래 체크박스를 켜고 다시 눌러주세요.' + extra, 'is-err');
    }).then(function () {
      generating = false;
      genAbort = false;
      btn.textContent = '상세페이지 생성';
      btn.classList.add('btn-primary');
    });
  }

  /* ---------- AI 메인 사진 생성 ---------- */
  function aiStatus(html, cls) {
    var box = q('aiStatus');
    box.hidden = !html;
    box.className = 'aistatus' + (cls ? ' ' + cls : '');
    box.innerHTML = html || '';
  }

  function rebuildPrompt() {
    var ai = Store.state.ai;
    ai.prompt = AI.composePrompt({
      product: Store.state.product.name,
      shot: ai.shot,
      featureText: ai.featureText,
      emphasis: ai.emphasis,
      backdrop: ai.backdrop,
      light: ai.light,
      note: ai.note,
      useRef: ai.useRef
    });
    Panel.syncForm();
  }

  /* 생성 결과를 지정한 자리에 넣는다 */
  function applyToTarget(target, imageId) {
    var parts = String(target || '').split(':');
    if (parts[0] === 'lib') return '이미지 목록';

    if (parts[0] === 'hero-bg' || parts[0] === 'hero-cut') {
      var hero = Store.hero();
      if (!hero) return '이미지 목록';
      if (parts[0] === 'hero-cut') { hero.cutImageId = imageId; return '메인 제품 컷'; }
      hero.imageId = imageId;
      return '메인 배경';
    }
    var sec = Store.section(parts[1]);
    if (!sec) return '이미지 목록';

    if (parts[0] === 'sec') {
      sec.imageId = imageId;
      return '특징 · ' + (sec.title || '');
    }
    if (parts[0] === 'item' && sec.items && sec.items[parts[2]]) {
      sec.items[parts[2]].imageId = imageId;
      return (sec.title || '항목') + ' ' + (Number(parts[2]) + 1) + '번';
    }
    return '이미지 목록';
  }

  /* 생성된 후보 썸네일 */
  var candidates = [];

  function renderCandidates(activeId) {
    var box = q('aiCands');
    if (!candidates.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<p class="cands-lab">후보 ' + candidates.length +
      '장 · 클릭하면 그 자리에 바뀝니다</p><div class="cands-grid">' +
      candidates.map(function (im) {
        return '<button class="cand' + (im.id === activeId ? ' is-on' : '') +
          '" type="button" data-cand="' + im.id + '"><img src="' + im.url + '" alt=""></button>';
      }).join('') + '</div>';
  }

  function aiGenerate() {
    var ai = Store.state.ai;
    if (!String(ai.prompt || '').trim()) rebuildPrompt();

    var key = AI.loadKey();
    if (!key) { aiStatus('API 키를 먼저 입력해 주세요.', 'is-err'); return; }

    var refUrl = null;
    if (ai.useRef) {
      var refIm = Store.image(ai.refImageId);
      if (!refIm) {
        aiStatus('참조로 쓸 제품 사진을 먼저 올려 주세요.', 'is-err');
        return;
      }
      if (refIm.remote) {
        aiStatus('참조 이미지가 외부 주소라 첨부할 수 없습니다. 파일로 올린 사진을 골라 주세요.', 'is-err');
        return;
      }
      refUrl = refIm.url;
    }

    var btn = document.querySelector('[data-act="ai-generate"]');
    btn.disabled = true;
    candidates = [];
    renderCandidates(null);
    aiStatus('사진을 만드는 중입니다…');

    AI.generate({
      provider: ai.provider,
      model: ai.model,
      apiKey: key,
      prompt: ai.prompt,
      ratio: ai.ratio,
      count: ai.count,
      refUrl: refUrl,
      onProgress: function (i, n) {
        aiStatus('사진을 만드는 중입니다… ' + i + ' / ' + n + '장');
      }
    }).then(function (res) {
      var base = Store.state.images.length + 1;
      var label = (AI.SHOTS[ai.shot] || {}).ko || 'AI';
      return Promise.all(res.images.map(function (im, i) {
        return adoptImage(im.url, 'AI ' + label + ' ' + (base + i));
      })).then(function (adopted) {
        return { adopted: adopted, failures: res.failures };
      });
    }).then(function (res) {
      res.adopted.forEach(function (im) { Store.state.images.push(im); });
      candidates = res.adopted;

      var where = applyToTarget(ai.target, res.adopted[0].id);
      renderCandidates(res.adopted[0].id);
      Panel.imageGrids();
      refresh();

      var msg = res.adopted.length + '장을 만들어 ' + Renderer.esc(where) + '에 넣었습니다.';
      if (res.adopted.some(function (im) { return im.remote; })) {
        msg += ' 일부는 외부 주소로 받아와 내보낸 HTML에 포함되지 않습니다.';
      }
      if (res.failures.length) {
        msg += ' (' + res.failures.length + '장은 실패: ' + Renderer.esc(res.failures[0].message) + ')';
      }
      aiStatus(msg, 'is-ok');
      say('AI 사진을 생성했습니다');
    }).catch(function (e) {
      var extra = e.raw
        ? '<details><summary>응답 원문 보기</summary><pre>' + Renderer.esc(e.raw) + '</pre></details>'
        : '';
      aiStatus(Renderer.esc(e.message || '생성에 실패했습니다') + extra, 'is-err');
    }).then(function () {
      btn.disabled = false;
    });
  }

  /* ---------- 미리보기 직접 편집 ---------- */
  function applyEdit(node) {
    var bind = node.dataset.bind;
    if (!bind) return;
    var parts = bind.split('|');
    var text = node.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/, '');

    if (parts[0] === 'product') {
      Store.state.product[parts[1]] = text;
      Panel.syncForm();
      return;
    }
    if (parts[0] === 'tag') {
      var tags = [];
      page.querySelectorAll('[data-bind^="tag|"]').forEach(function (n) {
        var t = n.innerText.trim();
        if (t) tags.push(t);
      });
      Store.state.product.tagsText = tags.join(', ');
      Panel.syncForm();
      return;
    }
    var sec = Store.section(parts[1]);
    if (!sec) return;
    if (parts[0] === 'sec') sec[parts[2]] = text;
    else if (parts[0] === 'item' && sec.items && sec.items[parts[2]]) sec.items[parts[2]][parts[3]] = text;
    else if (parts[0] === 'bullet' && sec.bullets) sec.bullets[parts[2]] = text;
  }

  /* ---------- 섹션 조작 ---------- */
  function sectionAction(act, id) {
    var i = Store.sectionIndex(id);
    if (i < 0) return;
    var secs = Store.state.sections;

    if (act === 'up' && i > 0) {
      secs.splice(i - 1, 0, secs.splice(i, 1)[0]);
    } else if (act === 'down' && i < secs.length - 1) {
      secs.splice(i + 1, 0, secs.splice(i, 1)[0]);
    } else if (act === 'dup') {
      var copy = JSON.parse(JSON.stringify(secs[i]));
      copy.id = Store.uid('sec');
      (copy.items || []).forEach(function (it) { it.id = Store.uid('it'); });
      secs.splice(i + 1, 0, copy);
    } else if (act === 'del') {
      if (!confirm('이 섹션을 삭제할까요?')) return;
      secs.splice(i, 1);
    } else if (act === 'toggle') {
      secs[i].on = secs[i].on === false;
    }
    refresh();
  }

  function scrollToSection(id) {
    var node = page.querySelector('[data-sec="' + id + '"]');
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 내보내기 ---------- */
  function buildExportHtml() {
    var holder = document.createElement('div');
    holder.innerHTML = Renderer.renderBody(true);

    holder.querySelectorAll('.sec-tools, .add-item, .item-tools, .item-del').forEach(function (n) {
      n.remove();
    });
    holder.querySelectorAll('[contenteditable]').forEach(function (n) {
      n.removeAttribute('contenteditable');
      n.removeAttribute('spellcheck');
      n.removeAttribute('data-bind');
      n.removeAttribute('data-ph');
    });
    holder.querySelectorAll('[data-img], [data-sec]').forEach(function (n) {
      n.removeAttribute('data-img');
      n.removeAttribute('data-sec');
    });

    var a = Renderer.rootAttrs();
    var st = Store.state;
    var title = (st.product.name || '제품 상세페이지') +
      (st.product.model ? ' ' + st.product.model : '');

    return '<!DOCTYPE html>\n<html lang="ko">\n<head>\n' +
      '<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + Renderer.esc(title) + '</title>\n' +
      '<style>\nbody{margin:0;background:#f4f5f7}\n' + window.PAGE_CSS + '\n</style>\n' +
      '</head>\n<body>\n<div class="' + a.cls + '" style="' + a.style + '">\n' +
      holder.innerHTML +
      '\n</div>\n</body>\n</html>\n';
  }

  /* 내려받기. 샌드박스 환경에서 막히면 새 창으로 여는 것까지 시도한다. */
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var ok = false;
    try {
      var link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      ok = true;
    } catch (e) {
      try { ok = !!window.open(url, '_blank'); } catch (e2) { ok = false; }
    }
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return ok;
  }

  function slug(s) {
    return String(s || 'detail').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 60) || 'detail';
  }

  /* ---------- 상단바 동작 ---------- */
  var TOPBAR = {
    save: function () {
      var r = Store.save();
      if (r.ok) say('브라우저에 저장했습니다');
      else say('저장 공간이 부족합니다. 이미지 수를 줄여주세요');
    },
    load: function () {
      if (Store.load()) { Panel.renderAll(); renderPage(); say('저장한 내용을 불러왔습니다'); }
      else say('저장된 내용이 없습니다');
    },
    reset: function () {
      if (!confirm('모든 내용을 초기 상태로 되돌릴까요?')) return;
      Store.reset();
      Panel.renderAll();
      renderPage();
      say('초기화했습니다');
    },
    print: function () { window.print(); },
    export: function () {
      var ok = download(slug(Store.state.product.name) + '_상세페이지.html', buildExportHtml());
      say(ok ? 'HTML 파일을 내려받았습니다' : '내려받기가 막혀 있습니다 · PDF / 인쇄를 이용해 주세요');
    },
    'generate-page': generatePage,
    'prompt-rebuild': function () { rebuildPrompt(); say('프롬프트를 다시 만들었습니다'); },
    'ai-generate': aiGenerate,
    'modal-close': closeModal,
    'modal-upload': function () {
      uploadMode = 'pick';
      q('fileInput').click();
    },
    'modal-clear': function () {
      if (pickTarget) assignImage(pickTarget, null);
      closeModal();
    }
  };

  /* ---------- 초기화 ---------- */
  function init() {
    /* 상세페이지 스타일 주입 */
    var style = document.createElement('style');
    style.id = 'dp-style';
    style.textContent = window.PAGE_CSS;
    document.head.appendChild(style);

    page = q('page');
    stageZoom = q('stageZoom');
    toast = q('toast');

    Panel.init();
    if (!String(Store.state.ai.prompt || '').trim()) rebuildPrompt();
    renderPage();

    /* --- 전역 클릭 --- */
    document.addEventListener('click', function (e) {
      var t = e.target;

      var actBtn = t.closest('[data-act]');
      if (actBtn) {
        var fn = TOPBAR[actBtn.dataset.act];
        if (fn) { fn(); return; }
      }

      var tab = t.closest('.tab');
      if (tab) {
        document.querySelectorAll('.tab').forEach(function (n) { n.classList.toggle('is-on', n === tab); });
        document.querySelectorAll('.tabpane').forEach(function (n) {
          n.classList.toggle('is-on', n.dataset.pane === tab.dataset.tab);
        });
        return;
      }

      var sact = t.closest('[data-sact]');
      if (sact) {
        var p = sact.dataset.sact.split('|');
        sectionAction(p[0], p[1]);
        return;
      }

      var cand = t.closest('[data-cand]');
      if (cand) {
        var where = applyToTarget(Store.state.ai.target, cand.dataset.cand);
        renderCandidates(cand.dataset.cand);
        refresh();
        say(where + '에 적용했습니다');
        return;
      }

      var heroLayout = t.closest('[data-herolayout]');
      if (heroLayout) {
        var h1 = Store.hero();
        if (h1) { h1.layout = heroLayout.dataset.herolayout; refresh(); }
        return;
      }

      var heroAlign = t.closest('[data-heroalign]');
      if (heroAlign) {
        var h2 = Store.hero();
        if (h2) { h2.align = heroAlign.dataset.heroalign; refresh(); }
        return;
      }

      var pickHero = t.closest('[data-pickhero]');
      if (pickHero) {
        var h3 = Store.hero();
        if (h3) openModal({ kind: pickHero.dataset.pickhero, secId: h3.id, idx: null });
        return;
      }

      var clearHero = t.closest('[data-clearhero]');
      if (clearHero) {
        var h4 = Store.hero();
        if (h4) {
          if (clearHero.dataset.clearhero === 'cut') h4.cutImageId = null;
          else h4.imageId = null;
          refresh();
        }
        return;
      }

      var addsec = t.closest('[data-addsec]');
      if (addsec) {
        Store.state.sections.push(Store.makeSection(addsec.dataset.addsec));
        Store.autoAssignImages();
        refresh();
        say('섹션을 추가했습니다');
        return;
      }

      var scrollTo = t.closest('[data-scrollto]');
      if (scrollTo) { scrollToSection(scrollTo.dataset.scrollto); return; }

      var additem = t.closest('[data-additem]');
      if (additem) {
        var s1 = Store.section(additem.dataset.additem);
        if (s1) {
          s1.items = s1.items || [];
          s1.items.push(Store.makeItem(s1.type));
          Store.autoAssignImages();
          refresh();
        }
        return;
      }

      var delitem = t.closest('[data-delitem]');
      if (delitem) {
        var d = delitem.dataset.delitem.split('|');
        var s2 = Store.section(d[0]);
        if (s2 && s2.items) { s2.items.splice(Number(d[1]), 1); refresh(); }
        return;
      }

      var addbullet = t.closest('[data-addbullet]');
      if (addbullet) {
        var s3 = Store.section(addbullet.dataset.addbullet);
        if (s3) { s3.bullets = s3.bullets || []; s3.bullets.push('세부 설명'); refresh(); }
        return;
      }

      var delbullet = t.closest('[data-delbullet]');
      if (delbullet) {
        var b = delbullet.dataset.delbullet.split('|');
        var s4 = Store.section(b[0]);
        if (s4 && s4.bullets) { s4.bullets.splice(Number(b[1]), 1); refresh(); }
        return;
      }

      if (t.closest('[data-addtag]')) {
        var cur = String(Store.state.product.tagsText || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        cur.push('새 태그');
        Store.state.product.tagsText = cur.join(', ');
        Panel.syncForm();
        refresh();
        return;
      }

      var deltag = t.closest('[data-deltag]');
      if (deltag) {
        var tags = String(Store.state.product.tagsText || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        tags.splice(Number(deltag.dataset.deltag), 1);
        Store.state.product.tagsText = tags.join(', ');
        Panel.syncForm();
        refresh();
        return;
      }

      var delimg = t.closest('[data-delimg]');
      if (delimg) { removeImage(delimg.dataset.delimg); return; }

      var imgcard = t.closest('[data-imgid]');
      if (imgcard) {
        if (pickTarget) { assignImage(pickTarget, imgcard.dataset.imgid); closeModal(); }
        return;
      }

      var slot = t.closest('[data-img]');
      if (slot && page.contains(slot) && q('editToggle').checked) {
        var sp = slot.dataset.img.split('|');
        openModal({ kind: sp[0], secId: sp[1], idx: sp[2] == null ? null : Number(sp[2]) });
        return;
      }

      var themeCard = t.closest('[data-theme]');
      if (themeCard) {
        Store.state.theme.preset = themeCard.dataset.theme;
        Panel.themeGrid();
        renderPage();
        return;
      }

      var swatch = t.closest('[data-swatch]');
      if (swatch) {
        Store.state.theme.accent = swatch.dataset.swatch;
        Panel.syncForm();
        renderPage();
        return;
      }

      var zoomBtn = t.closest('[data-zoom]');
      if (zoomBtn) {
        document.querySelectorAll('[data-zoom]').forEach(function (n) { n.classList.toggle('is-on', n === zoomBtn); });
        stageZoom.style.transform = 'scale(' + zoomBtn.dataset.zoom + ')';
        return;
      }

      if (t === q('imgModal')) closeModal();
    });

    /* --- 패널 입력 --- */
    document.querySelector('.panel').addEventListener('input', function (e) {
      var input = e.target.closest('[data-bind], [data-hero]');
      if (!input) return;
      var val = input.type === 'checkbox' ? input.checked : input.value;
      if (input.type === 'range') val = Number(val);

      /* 히어로 섹션 전용 필드 */
      if (input.dataset.hero) {
        var hero = Store.hero();
        if (!hero) return;
        hero[input.dataset.hero] = val;
        Panel.mainPane();
        renderPage();
        return;
      }

      var path = input.dataset.bind;
      Store.set(Store.state, path, val);

      if (/^theme\./.test(path)) {
        q('widthVal').textContent = Store.state.theme.width + 'px';
        q('radiusVal').textContent = Store.state.theme.radius + 'px';
        q('scaleVal').textContent = Store.state.theme.scale + '%';
      }
      /* 프롬프트 재료가 바뀌면 프롬프트를 다시 만든다 */
      if (/^ai\.(shot|featureText|emphasis|backdrop|light|note|useRef)$/.test(path)) {
        rebuildPrompt();
      }
      if (/^ai\./.test(path) && path !== 'ai.prompt') Panel.mainPane();
      if (path === 'product.name') rebuildPrompt();

      renderPage();
      if (/^product\.(name|model)$/.test(path)) Panel.sectionList();
    });

    /* 페이지에 적힌 특징을 고르면 그대로 강조 문구로 넣는다 */
    q('aiFeaturePick').addEventListener('change', function () {
      if (!this.value) return;
      Store.state.ai.featureText = this.value;
      rebuildPrompt();
      Panel.mainPane();
    });

    /* API 키는 상태와 분리해 이 브라우저에만 보관.
       입력란이 생성 탭과 메인 탭 두 곳에 있어 서로 값을 맞춰준다. */
    function keyInputs() { return document.querySelectorAll('.js-aikey'); }
    keyInputs().forEach(function (el) { el.value = AI.loadKey(); });
    document.addEventListener('input', function (e) {
      var el = e.target.closest && e.target.closest('.js-aikey');
      if (!el) return;
      AI.saveKey(el.value.trim());
      keyInputs().forEach(function (other) {
        if (other !== el) other.value = el.value;
      });
    });

    /* --- 미리보기 직접 편집 --- */
    page.addEventListener('input', function (e) {
      var node = e.target.closest('[contenteditable][data-bind]');
      if (node) applyEdit(node);
    });
    page.addEventListener('blur', function (e) {
      var node = e.target.closest && e.target.closest('[contenteditable][data-bind]');
      if (node) { applyEdit(node); Panel.sectionList(); }
    }, true);
    /* 붙여넣기는 서식 없는 텍스트로 */
    page.addEventListener('paste', function (e) {
      if (!e.target.closest('[contenteditable]')) return;
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
    /* 한 줄 필드에서 엔터 → 편집 종료 */
    page.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      var node = e.target.closest('[contenteditable][data-bind]');
      if (!node || node.classList.contains('dp-body')) return;
      e.preventDefault();
      node.blur();
    });

    /* --- 편집 모드 --- */
    q('editToggle').addEventListener('change', function () {
      var on = this.checked;
      page.classList.toggle('is-edit', on);
      q('stageHint').textContent = on
        ? '미리보기의 글자를 클릭하면 바로 수정됩니다'
        : '편집 요소를 숨긴 실제 화면입니다';
      renderPage();
    });

    /* --- 이미지 업로드 --- */
    var drop = q('drop');
    var fileInput = q('fileInput');

    /* 생성 탭의 대표 이미지 영역도 같은 업로드 경로를 쓴다 */
    var genDrop = q('genDrop');
    genDrop.addEventListener('click', function () { uploadMode = 'library'; fileInput.click(); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      genDrop.addEventListener(ev, function (e) { e.preventDefault(); genDrop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      genDrop.addEventListener(ev, function (e) { e.preventDefault(); genDrop.classList.remove('is-over'); });
    });
    genDrop.addEventListener('drop', function (e) {
      uploadMode = 'library';
      addFiles(e.dataTransfer.files);
    });
    /* 파일 입력이 드롭 영역 안에 있어서, 그 클릭이 되돌아오면 대상이 초기화된다 */
    drop.addEventListener('click', function (e) {
      if (e.target === fileInput) return;
      uploadMode = 'library';
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      addFiles(this.files);
      this.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      uploadMode = 'library';
      addFiles(e.dataTransfer.files);
    });
    /* 미리보기 위로 바로 끌어다 놓기 */
    page.addEventListener('dragover', function (e) { e.preventDefault(); });
    page.addEventListener('drop', function (e) {
      var slot = e.target.closest('[data-img]');
      if (!slot || !e.dataTransfer.files.length) return;
      e.preventDefault();
      var sp = slot.dataset.img.split('|');
      pickTarget = { kind: sp[0], secId: sp[1], idx: sp[2] == null ? null : Number(sp[2]) };
      uploadMode = 'pick';
      addFiles(e.dataTransfer.files);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !q('imgModal').hidden) closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); TOPBAR.save(); }
    });

    /* 이전 작업 자동 복구 안내 */
    if (Store.backing.getItem(Store.STORE_KEY)) {
      say('저장된 작업이 있습니다 · 상단 "불러오기"를 눌러주세요');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
