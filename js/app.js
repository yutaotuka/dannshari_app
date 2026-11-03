/* =========================================================
 * app.js — 画面の描画とイベント処理
 * 画面はハッシュ（#home / #judge / #records / #settings）で切り替える
 * ========================================================= */
(() => {
  'use strict';

  /* ---------- 小さなユーティリティ ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const toDateStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = n => { const d = startOfToday(); d.setDate(d.getDate() + n); return toDateStr(d); };
  const daysUntil = dateStr => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return Math.round((new Date(y, m - 1, d) - startOfToday()) / 86400000);
  };
  const fmtDate = iso => { const d = new Date(iso); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
  const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  const tagNo = n => 'No.' + String(n || 0).padStart(4, '0');
  const signed = n => (n > 0 ? '+' : '') + n;
  const isSafePhoto = p => typeof p === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(p);

  const STATUS_LABEL = { keep: '残す', hold: '保留', discard: '手放した' };
  const DECIDE_LABEL = { keep: '残す', hold: '保留にする', discard: '手放す' };
  const METHODS = ['捨てる', '売る', '譲る', '寄付する'];
  const HOLD_DAYS = [14, 30, 90];
  const VIEWS = ['home', 'judge', 'records', 'settings'];

  const app = $('#app');
  const modal = $('#modal');
  const toastEl = $('#toast');

  /* ---------- 状態 ---------- */
  let items = [];
  let J = null; // 判定中のデータ
  const recFilter = { status: 'all', category: 'all', q: '' };
  let exportText = '';

  const isDue = it => it.status === 'hold' && it.remindAt && daysUntil(it.remindAt) <= 0;
  const nextNo = () => items.reduce((m, it) => Math.max(m, it.no || 0), 0) + 1;
  const upsert = it => { const i = items.findIndex(x => x.id === it.id); if (i >= 0) items[i] = it; else items.push(it); };

  /* ---------- 共通パーツ ---------- */
  function thumb(item, cls = 'thumb') {
    if (isSafePhoto(item.photo)) return `<img class="${cls}" src="${esc(item.photo)}" alt="">`;
    return `<div class="${cls} ph" aria-hidden="true"><span>${esc(catOf(item.category).mark)}</span></div>`;
  }

  function statusPill(it) {
    const text = STATUS_LABEL[it.status] + (it.status === 'discard' && it.method ? `・${it.method}` : '');
    return `<span class="pill pill-${it.status}">${esc(text)}</span>`;
  }

  function holdNote(it) {
    if (it.status !== 'hold' || !it.remindAt) return '';
    const d = daysUntil(it.remindAt);
    return d <= 0
      ? `<span class="hold-note is-due">再判定の時期です</span>`
      : `<span class="hold-note">あと${d}日で再判定</span>`;
  }

  function card(it) {
    return `
      <button class="card" type="button" data-action="open" data-id="${esc(it.id)}">
        ${thumb(it)}
        <span class="card-body">
          <span class="tag-no">${tagNo(it.no)}${it.sample ? '<span class="sample-mark">サンプル</span>' : ''}</span>
          <span class="card-name">${esc(it.name)}</span>
          <span class="card-meta">${esc(catOf(it.category).label)}</span>
          <span class="card-foot">${statusPill(it)}${holdNote(it)}</span>
        </span>
      </button>`;
  }

  function sampleBanner() {
    if (!items.some(it => it.sample)) return '';
    return `
      <div class="banner">
        <span>いま表示しているのはサンプルの記録です。自分の物を判定したら、サンプルは消してかまいません。</span>
        <button class="btn btn-sm btn-outline" type="button" data-action="clear-sample">サンプルを消す</button>
      </div>`;
  }

  function counts(list = items) {
    const c = { total: list.length, keep: 0, hold: 0, discard: 0 };
    list.forEach(it => { c[it.status] = (c[it.status] || 0) + 1; });
    return c;
  }

  /* =========================================================
   * ホーム
   * ========================================================= */
  function viewHome() {
    const c = counts();
    const due = items.filter(isDue);
    const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4);
    const rate = c.total ? Math.round(c.discard / c.total * 100) : 0;

    const catRows = CATEGORIES.map(cat => {
      const list = items.filter(it => it.category === cat.id);
      const cc = counts(list);
      const w = n => (cc.total ? (n / cc.total * 100).toFixed(1) : 0);
      return `
        <li class="cat-row ${cc.total ? '' : 'is-empty'}">
          <span class="cat-mark" aria-hidden="true">${esc(cat.mark)}</span>
          <div class="cat-body">
            <div class="cat-line">
              <span class="cat-name">${esc(cat.label)}</span>
              <span class="cat-num">${cc.total
                ? `手放した <b>${cc.discard}</b>・保留 <b>${cc.hold}</b>・残す <b>${cc.keep}</b>`
                : 'まだ判定していません'}</span>
            </div>
            <div class="bar" role="img" aria-label="${esc(cat.label)}：判定${cc.total}件のうち手放した${cc.discard}件、保留${cc.hold}件、残す${cc.keep}件">
              <span class="seg seg-discard" style="width:${w(cc.discard)}%"></span>
              <span class="seg seg-hold" style="width:${w(cc.hold)}%"></span>
              <span class="seg seg-keep" style="width:${w(cc.keep)}%"></span>
            </div>
          </div>
        </li>`;
    }).join('');

    return `
      ${sampleBanner()}
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">断捨離の判定アプリ</p>
          <h1>迷ったら、<br>8つの質問で決める。</h1>
          <p class="lead">答えるだけで「残す・保留・手放す」を判定します。写真つきで記録して、片付けの進み具合も見えるようにします。</p>
          <button class="btn btn-primary btn-lg" type="button" data-action="new">判定をはじめる</button>
        </div>
        <div class="hero-stamps" aria-hidden="true">
          <span class="stamp stamp-keep" style="--r:-14deg;--x:6px;--y:8px;--d:.05s">残す</span>
          <span class="stamp stamp-hold" style="--r:9deg;--x:120px;--y:34px;--d:.25s">保留</span>
          <span class="stamp stamp-discard" style="--r:-6deg;--x:48px;--y:118px;--d:.45s">手放す</span>
        </div>
      </section>

      <section class="stats" aria-label="これまでの集計">
        <div class="stat"><span class="stat-label">判定した物</span><span class="stat-num">${c.total}</span><span class="stat-sub">件</span></div>
        <div class="stat s-discard"><span class="stat-label">手放した</span><span class="stat-num">${c.discard}</span><span class="stat-sub">全体の${rate}%</span></div>
        <div class="stat s-hold"><span class="stat-label">保留中</span><span class="stat-num">${c.hold}</span><span class="stat-sub">${due.length ? `${due.length}件が再判定の時期` : '期限前'}</span></div>
        <div class="stat s-keep"><span class="stat-label">残す</span><span class="stat-num">${c.keep}</span><span class="stat-sub">件</span></div>
      </section>

      ${due.length ? `
      <section class="panel panel-due">
        <div class="panel-head"><h2>再判定の時期です</h2><span class="count">${due.length}件</span></div>
        <p class="muted small">保留にした期限が来ました。いまの気持ちで、もう一度判定してみましょう。</p>
        <ul class="due-list">
          ${due.map(it => `
            <li>
              ${thumb(it, 'thumb thumb-sm')}
              <div class="due-body"><span class="card-name">${esc(it.name)}</span><span class="small muted">${fmtDate(it.updatedAt)}に保留・${esc(catOf(it.category).label)}</span></div>
              <button class="btn btn-sm btn-primary" type="button" data-action="rejudge" data-id="${esc(it.id)}">再判定する</button>
            </li>`).join('')}
        </ul>
      </section>` : ''}

      <section class="panel">
        <div class="panel-head">
          <h2>カテゴリ別の進み具合</h2>
          <div class="legend" aria-hidden="true">
            <span><i class="dot seg-discard"></i>手放した</span><span><i class="dot seg-hold"></i>保留</span><span><i class="dot seg-keep"></i>残す</span>
          </div>
        </div>
        <ul class="cat-progress">${catRows}</ul>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>最近の記録</h2><a class="link" href="#records">すべて見る</a></div>
        ${recent.length ? `<div class="card-grid">${recent.map(card).join('')}</div>`
          : `<p class="empty">まだ記録がありません。「判定をはじめる」から1つ目を判定してみましょう。</p>`}
      </section>`;
  }

  /* =========================================================
   * 判定
   * ========================================================= */
  function newJudge(from) {
    J = from ? {
      step: 0, editingId: from.id, name: from.name, category: from.category,
      photo: from.photo || null, memo: from.memo || '', answers: { ...(from.answers || {}) },
      decision: null, holdDays: 30, method: from.method || '捨てる', animate: false,
    } : {
      step: 0, editingId: null, name: '', category: CATEGORIES[0].id,
      photo: null, memo: '', answers: {}, decision: null, holdDays: 30, method: '捨てる', animate: false,
    };
  }

  function viewJudge() {
    if (!J) newJudge();
    if (J.step === 0) return viewJudgeInfo();
    if (J.step <= QUESTIONS.length) return viewQuestion();
    return viewResult();
  }

  function viewJudgeInfo() {
    return `
      <section class="judge">
        <div class="judge-head">
          <span class="step-label mono">${J.editingId ? '再判定' : '準備'}</span>
          <h1 tabindex="-1">${J.editingId ? 'もう一度、判定します。' : '何を判定しますか？'}</h1>
        </div>
        <form id="itemForm" class="form" novalidate>
          <div class="field">
            <label for="f-name">物の名前</label>
            <input id="f-name" type="text" data-bind="name" value="${esc(J.name)}" placeholder="例：去年買ったワンピース" maxlength="60" autocomplete="off" required>
            <p class="error" id="nameErr" hidden>物の名前を入力してください。</p>
          </div>
          <fieldset class="field">
            <legend>カテゴリ</legend>
            <div class="chips">
              ${CATEGORIES.map(c => `
                <label class="chip"><input type="radio" name="cat" value="${c.id}" ${J.category === c.id ? 'checked' : ''}><span>${esc(c.label)}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="field">
            <span class="label">写真（任意）</span>
            <div class="photo-field">
              ${isSafePhoto(J.photo) ? `<img class="thumb thumb-lg" src="${esc(J.photo)}" alt="登録する写真">` : `<div class="thumb thumb-lg ph" aria-hidden="true"><span>${esc(catOf(J.category).mark)}</span></div>`}
              <div class="photo-actions">
                <label class="btn btn-outline" for="f-photo">${J.photo ? '写真を変える' : '写真を撮る・選ぶ'}</label>
                <input id="f-photo" type="file" accept="image/*" class="visually-hidden">
                ${J.photo ? '<button class="btn btn-ghost" type="button" data-action="photo-remove">写真を外す</button>' : ''}
                <p class="small muted">写真は縮小して、このブラウザの中だけに保存します。</p>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="f-memo">メモ（任意）</label>
            <textarea id="f-memo" data-bind="memo" rows="2" maxlength="200" placeholder="例：結婚式で1回着ただけ">${esc(J.memo)}</textarea>
          </div>
          <div class="actions">
            ${J.editingId || J.name ? '<button class="btn btn-ghost" type="button" data-action="new">最初からやり直す</button>' : ''}
            <button class="btn btn-primary btn-lg" type="submit">質問に進む</button>
          </div>
        </form>
      </section>`;
  }

  function viewQuestion() {
    const q = QUESTIONS[J.step - 1];
    const sel = J.answers[q.id];
    return `
      <section class="judge">
        <div class="q-progress">
          <button class="btn btn-ghost btn-sm" type="button" data-action="back">← 戻る</button>
          <span class="mono">Q${J.step} / ${QUESTIONS.length}</span>
        </div>
        <div class="progress" aria-hidden="true"><span style="width:${((J.step - 1) / QUESTIONS.length * 100).toFixed(1)}%"></span></div>
        <p class="q-item">判定中：<b>${esc(J.name)}</b></p>
        <h1 class="q-text" tabindex="-1">${esc(q.q)}</h1>
        ${q.hint ? `<p class="q-hint">${esc(q.hint)}</p>` : ''}
        <div class="options" role="group" aria-label="${esc(q.q)}">
          ${q.options.map((o, i) => `
            <button class="option ${sel === i ? 'is-selected' : ''}" type="button" data-action="answer" data-i="${i}" aria-pressed="${sel === i}">
              <span class="opt-key mono" aria-hidden="true">${i + 1}</span><span>${esc(o.label)}</span>
            </button>`).join('')}
        </div>
        <p class="small muted kbd-hint">キーボードの数字キーでも選べます。</p>
      </section>`;
  }

  function viewResult() {
    const r = judgeItem(J.answers);
    if (!J.decision) J.decision = r.verdict;
    const span = SCORE_MAX - SCORE_MIN;
    const zDiscard = ((SCORE_DISCARD + 0.5 - SCORE_MIN) / span * 100).toFixed(2);
    const zHold = ((SCORE_KEEP - SCORE_DISCARD - 1) / span * 100).toFixed(2);
    const zKeep = (100 - zDiscard - zHold).toFixed(2);
    const pos = Math.min(96, Math.max(4, (r.score - SCORE_MIN) / span * 100));
    const cols = `grid-template-columns:${zDiscard}% ${zHold}% ${zKeep}%`;
    const V = VERDICTS[r.verdict];
    const anim = J.animate ? ' animate' : '';
    J.animate = false;

    return `
      <section class="judge result">
        <div class="result-card">
          <div class="result-photo">${thumb({ photo: J.photo, category: J.category }, 'thumb thumb-xl')}</div>
          <div class="result-main">
            <p class="mono small muted">判定結果</p>
            <h1 class="result-name" tabindex="-1">${esc(J.name)}</h1>
            <p class="result-desc">${esc(V.desc)}</p>
          </div>
          <div class="result-stamp"><span class="stamp stamp-${r.verdict}${anim}" style="--r:-12deg" role="img" aria-label="判定：${V.label}">${V.label}</span></div>
        </div>

        <div class="scale">
          <div class="scale-head"><h2>判定スコア</h2><span class="mono small muted">${SCORE_MIN}〜${signed(SCORE_MAX)}</span></div>
          <div class="scale-track" style="${cols}">
            <span class="zone zone-discard"></span><span class="zone zone-hold"></span><span class="zone zone-keep"></span>
            <span class="scale-pin" style="left:${pos}%"><b class="mono">${signed(r.score)}</b></span>
          </div>
          <div class="scale-labels" style="${cols}"><span>手放す</span><span>保留</span><span>残す</span></div>
        </div>

        <div class="reasons">
          <h2>判定の理由</h2>
          <ul>
            ${r.reasons.map(x => `<li class="${x.score > 0 ? 'plus' : 'minus'}"><span class="mono">${signed(x.score)}</span>${esc(x.text)}</li>`).join('')}
          </ul>
          ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
        </div>

        <div class="decide">
          <div>
            <h2>どうしますか？</h2>
            <p class="small muted">判定は目安です。最後はあなたが決めてください。</p>
          </div>
          <div class="decide-options" role="radiogroup" aria-label="この物をどうするか">
            ${['keep', 'hold', 'discard'].map(s => `
              <button class="decide-btn d-${s} ${J.decision === s ? 'is-selected' : ''}" type="button" role="radio" aria-checked="${J.decision === s}" data-action="decide" data-s="${s}">${DECIDE_LABEL[s]}</button>`).join('')}
          </div>
          ${J.decision === 'hold' ? `
            <div class="sub-choice">
              <span class="label">いつ再判定しますか？</span>
              <div class="chips">${HOLD_DAYS.map(d => `<button class="chip-btn ${J.holdDays === d ? 'is-selected' : ''}" type="button" aria-pressed="${J.holdDays === d}" data-action="hold-days" data-d="${d}">${d}日後</button>`).join('')}</div>
              <p class="small muted">${addDays(J.holdDays).replace(/-/g, '.')} に「再判定の時期」としてホームに表示します。</p>
            </div>` : ''}
          ${J.decision === 'discard' ? `
            <div class="sub-choice">
              <span class="label">手放し方</span>
              <div class="chips">${METHODS.map(m => `<button class="chip-btn ${J.method === m ? 'is-selected' : ''}" type="button" aria-pressed="${J.method === m}" data-action="method" data-m="${m}">${m}</button>`).join('')}</div>
            </div>` : ''}
          <div class="actions">
            <button class="btn btn-ghost" type="button" data-action="restart-q">質問をやり直す</button>
            <button class="btn btn-primary btn-lg" type="button" data-action="save">記録する</button>
          </div>
        </div>
      </section>`;
  }

  async function saveJudge() {
    const r = judgeItem(J.answers);
    const now = new Date().toISOString();
    let item;
    if (J.editingId) {
      const old = items.find(i => i.id === J.editingId);
      item = { ...old };
      item.history = [...(old.history || []), { date: old.updatedAt, verdict: old.verdict, score: old.score, status: old.status }];
    } else {
      item = { id: uid(), no: nextNo(), createdAt: now, history: [], sample: false };
    }
    Object.assign(item, {
      name: J.name.trim(),
      category: J.category,
      photo: J.photo,
      memo: J.memo.trim(),
      answers: { ...J.answers },
      score: r.score,
      verdict: r.verdict,
      status: J.decision,
      method: J.decision === 'discard' ? J.method : null,
      remindAt: J.decision === 'hold' ? addDays(J.holdDays) : null,
      updatedAt: now,
    });
    await Store.put(item);
    upsert(item);
    J = null;
    toast(`${tagNo(item.no)}「${item.name}」を記録しました`);
    go('records');
  }

  function resizeImage(file, max = 720) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
      img.src = url;
    });
  }

  /* =========================================================
   * 記録
   * ========================================================= */
  function viewRecords() {
    const c = counts();
    const tabs = [['all', 'すべて', c.total], ['keep', '残す', c.keep], ['hold', '保留', c.hold], ['discard', '手放した', c.discard]];
    return `
      <section class="records">
        <div class="page-head"><h1 tabindex="-1">記録</h1><span class="mono muted">${items.length}件</span></div>
        ${sampleBanner()}
        <div class="filters">
          <div class="seg-control" role="group" aria-label="状態で絞り込む">
            ${tabs.map(([k, l, n]) => `<button type="button" data-action="filter-status" data-s="${k}" class="${recFilter.status === k ? 'is-active' : ''}" aria-pressed="${recFilter.status === k}">${l}<span class="mono">${n}</span></button>`).join('')}
          </div>
          <div class="filter-row">
            <label class="visually-hidden" for="r-cat">カテゴリで絞り込む</label>
            <select id="r-cat">
              <option value="all">すべてのカテゴリ</option>
              ${CATEGORIES.map(cat => `<option value="${cat.id}" ${recFilter.category === cat.id ? 'selected' : ''}>${esc(cat.label)}</option>`).join('')}
            </select>
            <label class="visually-hidden" for="r-q">名前・メモで探す</label>
            <input id="r-q" type="search" placeholder="名前・メモで探す" value="${esc(recFilter.q)}" autocomplete="off">
          </div>
        </div>
        <div id="recList"></div>
      </section>`;
  }

  function renderRecList() {
    const box = $('#recList');
    if (!box) return;
    const q = recFilter.q.trim().toLowerCase();
    const list = items
      .filter(it => recFilter.status === 'all' || it.status === recFilter.status)
      .filter(it => recFilter.category === 'all' || it.category === recFilter.category)
      .filter(it => !q || (it.name + ' ' + (it.memo || '')).toLowerCase().includes(q))
      .sort((a, b) => (isDue(b) - isDue(a)) || b.updatedAt.localeCompare(a.updatedAt));
    box.innerHTML = list.length
      ? `<div class="card-grid">${list.map(card).join('')}</div>`
      : `<p class="empty">${items.length ? '条件に合う記録がありません。絞り込みを変えてみてください。' : 'まだ記録がありません。'}</p>`;
  }

  /* ---------- 詳細モーダル ---------- */
  function openDetail(id, confirmDelete = false) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const answers = QUESTIONS.map(q => {
      const i = it.answers ? it.answers[q.id] : null;
      return i == null || !q.options[i] ? '' : `<li><span>${esc(q.q)}</span><b>${esc(q.options[i].label)}</b></li>`;
    }).join('');
    const history = (it.history || []).slice().reverse();

    modal.innerHTML = `
      <div class="modal-backdrop" data-action="close-modal"></div>
      <div class="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="m-title">
        <button class="modal-close" type="button" data-action="close-modal" aria-label="閉じる">×</button>
        <div class="detail-top">
          ${thumb(it, 'thumb thumb-lg')}
          <div class="detail-head">
            <span class="tag-no">${tagNo(it.no)}${it.sample ? '<span class="sample-mark">サンプル</span>' : ''}</span>
            <h2 id="m-title">${esc(it.name)}</h2>
            <p class="small muted">${esc(catOf(it.category).label)}・${fmtDate(it.updatedAt)} 記録</p>
            <div class="card-foot">${statusPill(it)}${holdNote(it)}</div>
          </div>
        </div>
        ${it.memo ? `<p class="detail-memo">${esc(it.memo)}</p>` : ''}
        <p class="detail-verdict">アプリの判定：<b class="v-${it.verdict}">${VERDICTS[it.verdict].label}</b><span class="mono">（スコア ${signed(it.score)}）</span></p>
        ${answers ? `<details class="detail-answers"><summary>回答の内訳を見る</summary><ul class="answer-list">${answers}</ul></details>` : ''}
        ${history.length ? `
          <div class="history">
            <h3>これまでの判定</h3>
            <ol>${history.map(h => `<li><span class="mono">${fmtDate(h.date)}</span>判定 ${VERDICTS[h.verdict].label}（${signed(h.score)}）→ ${STATUS_LABEL[h.status]}</li>`).join('')}</ol>
          </div>` : ''}
        <div class="detail-actions">
          ${confirmDelete ? `
            <p class="confirm-text">「${esc(it.name)}」の記録を削除します。元に戻せません。</p>
            <button class="btn btn-ghost" type="button" data-action="open" data-id="${esc(id)}">キャンセル</button>
            <button class="btn btn-danger" type="button" data-action="delete-yes" data-id="${esc(id)}">削除する</button>` : `
            <button class="btn btn-ghost btn-danger-text" type="button" data-action="delete-ask" data-id="${esc(id)}">削除</button>
            ${it.status === 'hold' ? `<button class="btn btn-outline" type="button" data-action="extend" data-id="${esc(id)}">期限を30日延ばす</button>` : ''}
            <button class="btn btn-primary" type="button" data-action="rejudge" data-id="${esc(id)}">もう一度判定する</button>`}
        </div>
      </div>`;
    modal.hidden = false;
    document.body.classList.add('no-scroll');
    const focusTarget = confirmDelete ? $('[data-action="delete-yes"]', modal) : $('.modal-close', modal);
    focusTarget && focusTarget.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modal.innerHTML = '';
    document.body.classList.remove('no-scroll');
  }

  /* =========================================================
   * 設定
   * ========================================================= */
  const canDownload = (() => { try { return window.self === window.top; } catch (e) { return false; } })();

  function viewSettings() {
    const hasSample = items.some(it => it.sample);
    return `
      <section class="settings">
        <div class="page-head"><h1 tabindex="-1">設定とデータ</h1></div>

        <div class="panel">
          <h2>データの保存場所</h2>
          <p>記録と写真は、このブラウザの中（IndexedDB）だけに保存します。サーバーには送信しません。ほかの端末で使うときや、ブラウザのデータを消す前は、バックアップを取ってください。</p>
          ${Store.persistent ? '' : '<p class="note note-danger">このブラウザでは保存ができないため、ページを閉じると記録が消えます。バックアップを取ってください。</p>'}
        </div>

        <div class="panel">
          <h2>バックアップ</h2>
          <p>すべての記録をJSON形式で書き出します。写真も含みます。</p>
          <div class="actions actions-start">
            <button class="btn btn-outline" type="button" data-action="export-copy">クリップボードにコピー</button>
            ${canDownload ? '<button class="btn btn-outline" type="button" data-action="export-file">ファイルに保存</button>' : ''}
          </div>
          <div id="exportBox"></div>
          <h3>復元</h3>
          <p>書き出したJSONファイルを読み込みます。同じ記録は上書きします。</p>
          <div class="actions actions-start">
            <label class="btn btn-outline" for="importFile">JSONファイルを選ぶ</label>
            <input id="importFile" type="file" accept="application/json,.json" class="visually-hidden">
          </div>
        </div>

        <div class="panel">
          <h2>記録の削除</h2>
          <div class="actions actions-start">
            ${hasSample ? '<button class="btn btn-outline" type="button" data-action="clear-sample">サンプルデータを消す</button>' : ''}
            <button class="btn btn-danger-outline" type="button" data-action="clear-all-ask">すべての記録を削除</button>
          </div>
          <div id="clearConfirm"></div>
        </div>

        <div class="panel">
          <h2>判定のしくみ</h2>
          <p>8つの質問の答えごとに点数があり、合計点で判定します。合計は${SCORE_MIN}〜${signed(SCORE_MAX)}点です。</p>
          <ul class="rule-list">
            <li><span class="pill pill-keep">残す</span>${signed(SCORE_KEEP)}点以上</li>
            <li><span class="pill pill-hold">保留</span>${SCORE_DISCARD + 1}〜${signed(SCORE_KEEP - 1)}点</li>
            <li><span class="pill pill-discard">手放す</span>${SCORE_DISCARD}点以下</li>
          </ul>
          <p class="small muted">「強い思い出がある」と答えた物は「手放す」にせず保留にします。「壊れている・サイズが合わない」物は「残す」にせず保留にします。</p>
          <details class="detail-answers">
            <summary>質問と配点の一覧</summary>
            <ol class="score-table">
              ${QUESTIONS.map(q => `<li><b>${esc(q.q)}</b><ul>${q.options.map(o => `<li><span>${esc(o.label)}</span><span class="mono">${signed(o.score)}</span></li>`).join('')}</ul></li>`).join('')}
            </ol>
          </details>
        </div>
      </section>`;
  }

  function buildExport() {
    return JSON.stringify({ app: 'irunai', version: 1, exportedAt: new Date().toISOString(), items }, null, 2);
  }

  function sanitizeItem(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
    if (!['keep', 'hold', 'discard'].includes(raw.status)) return null;
    const verdict = ['keep', 'hold', 'discard'].includes(raw.verdict) ? raw.verdict : raw.status;
    return {
      id: raw.id.slice(0, 40),
      no: Number(raw.no) || 0,
      name: raw.name.slice(0, 60),
      category: CATEGORIES.some(c => c.id === raw.category) ? raw.category : 'daily',
      photo: isSafePhoto(raw.photo) ? raw.photo : null,
      memo: typeof raw.memo === 'string' ? raw.memo.slice(0, 200) : '',
      answers: raw.answers && typeof raw.answers === 'object' ? raw.answers : {},
      score: Number(raw.score) || 0,
      verdict,
      status: raw.status,
      method: METHODS.includes(raw.method) ? raw.method : null,
      remindAt: typeof raw.remindAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.remindAt) ? raw.remindAt : null,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
      history: Array.isArray(raw.history) ? raw.history.filter(h => h && VERDICTS[h.verdict] && STATUS_LABEL[h.status]) : [],
      sample: !!raw.sample,
    };
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(list)) throw new Error('形式が違います');
      const clean = list.map(sanitizeItem).filter(Boolean);
      for (const it of clean) { await Store.put(it); upsert(it); }
      toast(`${clean.length}件の記録を読み込みました`);
      render();
    } catch (e) {
      toast('読み込めませんでした。このアプリで書き出したJSONファイルを選んでください。');
    }
  }

  /* =========================================================
   * サンプルデータ
   * ========================================================= */
  function makeSamples() {
    // 回答は QUESTIONS の順に選択肢の番号を並べたもの
    const defs = [
      { name: '毎朝使うマグカップ', category: 'kitchen', a: [0, 1, 1, 0, 0, 0, 1, 0], status: 'keep', ago: 9 },
      { name: '読み終えた文庫本 12冊', category: 'books', a: [3, 0, 0, 2, 1, 4, 2, 0], status: 'discard', method: '売る', ago: 8 },
      { name: '予備の充電ケーブル 5本', category: 'gadget', a: [4, 0, 2, 2, 1, 1, 2, 0], status: 'discard', method: '捨てる', ago: 7 },
      { name: '祖母からの手紙', category: 'memory', a: [4, 0, 0, 0, 0, 0, 0, 2], status: 'keep', ago: 6 },
      { name: 'ホットサンドメーカー', category: 'kitchen', a: [2, 0, 0, 1, 1, 1, 2, 0], status: 'hold', remind: -2, memo: 'キャンプで使うかも', ago: 32 },
      { name: '去年買ったワンピース', category: 'clothes', a: [2, 0, 1, 1, 0, 1, 1, 0], status: 'hold', remind: 12, memo: '結婚式で1回着ただけ', ago: 4 },
      { name: '冬物のウールコート', category: 'clothes', a: [1, 0, 0, 0, 0, 0, 1, 0], status: 'keep', ago: 3 },
      { name: '作りかけのプラモデル', category: 'hobby', a: [3, 0, 0, 1, 0, 1, 1, 0], status: 'hold', remind: 45, ago: 1 },
    ];
    return defs.map((d, idx) => {
      const answers = {};
      QUESTIONS.forEach((q, i) => { answers[q.id] = d.a[i]; });
      const r = judgeItem(answers);
      const t = new Date(Date.now() - d.ago * 86400000).toISOString();
      return {
        id: 'sample-' + (idx + 1), no: idx + 1, name: d.name, category: d.category, photo: null,
        memo: d.memo || '', answers, score: r.score, verdict: r.verdict, status: d.status,
        method: d.method || null, remindAt: d.status === 'hold' ? addDays(d.remind) : null,
        createdAt: t, updatedAt: t, history: [], sample: true,
      };
    });
  }

  /* =========================================================
   * 描画・ルーティング
   * ========================================================= */
  function route() {
    const v = location.hash.slice(1);
    return VIEWS.includes(v) ? v : 'home';
  }

  function go(view) {
    if (route() === view) { render(); window.scrollTo(0, 0); } else location.hash = '#' + view;
  }

  function render(focusSelector) {
    const v = route();
    $$('.tabs a').forEach(a => {
      if (a.dataset.tab === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const due = items.filter(isDue).length;
    const badge = $('#dueBadge');
    badge.hidden = !due;
    badge.textContent = due;
    badge.setAttribute('aria-label', `再判定の時期の物が${due}件`);

    const html = { home: viewHome, judge: viewJudge, records: viewRecords, settings: viewSettings }[v]();
    app.innerHTML = html;
    app.dataset.view = v;
    if (v === 'records') renderRecList();
    if (focusSelector) { const el = $(focusSelector, app); el && el.focus({ preventScroll: true }); }
  }

  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function choose(i) {
    const q = QUESTIONS[J.step - 1];
    if (!q.options[i]) return;
    J.answers[q.id] = i;
    $$('.option', app).forEach((b, bi) => { b.classList.toggle('is-selected', bi === i); b.setAttribute('aria-pressed', bi === i); });
    setTimeout(() => {
      J.step += 1;
      if (J.step > QUESTIONS.length) { J.decision = null; J.animate = true; }
      render(J.step > QUESTIONS.length ? '.result-name' : '.q-text');
      window.scrollTo(0, 0);
    }, 180);
  }

  /* ---------- クリック操作 ---------- */
  const ACTIONS = {
    new: () => { newJudge(); go('judge'); },
    back: () => { J.step -= 1; render(J.step === 0 ? 'h1' : '.q-text'); },
    answer: t => choose(Number(t.dataset.i)),
    'photo-remove': () => { J.photo = null; render(); },
    decide: t => { J.decision = t.dataset.s; render(); $(`[data-action="decide"][data-s="${t.dataset.s}"]`, app)?.focus({ preventScroll: true }); },
    'hold-days': t => { J.holdDays = Number(t.dataset.d); render(); },
    method: t => { J.method = t.dataset.m; render(); },
    'restart-q': () => { J.step = 1; J.decision = null; render('.q-text'); window.scrollTo(0, 0); },
    save: () => saveJudge(),
    open: t => openDetail(t.dataset.id),
    'close-modal': () => closeModal(),
    rejudge: t => { const it = items.find(x => x.id === t.dataset.id); closeModal(); newJudge(it); go('judge'); },
    extend: async t => {
      const it = items.find(x => x.id === t.dataset.id);
      it.remindAt = addDays(30);
      await Store.put(it);
      toast(`再判定の期限を ${it.remindAt.replace(/-/g, '.')} に延ばしました`);
      render();
      openDetail(it.id);
    },
    'delete-ask': t => openDetail(t.dataset.id, true),
    'delete-yes': async t => {
      const id = t.dataset.id;
      const it = items.find(x => x.id === id);
      await Store.remove(id);
      items = items.filter(x => x.id !== id);
      closeModal();
      toast(`「${it ? it.name : ''}」の記録を削除しました`);
      render();
    },
    'filter-status': t => { recFilter.status = t.dataset.s; render(); $(`[data-action="filter-status"][data-s="${t.dataset.s}"]`, app)?.focus({ preventScroll: true }); },
    'clear-sample': async () => {
      const ids = items.filter(it => it.sample).map(it => it.id);
      for (const id of ids) await Store.remove(id);
      items = items.filter(it => !it.sample);
      toast('サンプルデータを消しました');
      render();
    },
    'clear-all-ask': () => {
      $('#clearConfirm').innerHTML = `
        <div class="confirm-box">
          <p class="confirm-text">すべての記録（${items.length}件）と写真を削除します。元に戻せません。</p>
          <div class="actions actions-start">
            <button class="btn btn-ghost" type="button" data-action="clear-all-cancel">キャンセル</button>
            <button class="btn btn-danger" type="button" data-action="clear-all-yes">すべて削除する</button>
          </div>
        </div>`;
      $('[data-action="clear-all-yes"]').focus();
    },
    'clear-all-cancel': () => { $('#clearConfirm').innerHTML = ''; },
    'clear-all-yes': async () => { await Store.clear(); items = []; toast('すべての記録を削除しました'); render(); },
    'export-copy': async () => {
      exportText = buildExport();
      try {
        await navigator.clipboard.writeText(exportText);
        toast(`${items.length}件の記録をコピーしました`);
      } catch (e) {
        $('#exportBox').innerHTML = `
          <p class="small muted">自動でコピーできませんでした。下の内容をすべて選択してコピーしてください。</p>
          <textarea class="export-area" readonly rows="6" aria-label="書き出したJSON">${esc(exportText)}</textarea>`;
        $('.export-area').select();
      }
    },
    'export-file': () => {
      const blob = new Blob([buildExport()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `irunai-backup-${toDateStr(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const fn = ACTIONS[t.dataset.action];
    if (fn) { e.preventDefault(); fn(t, e); }
  });

  /* ---------- 入力・送信 ---------- */
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.bind && J) J[t.dataset.bind] = t.value;
    if (t.id === 'r-q') { recFilter.q = t.value; renderRecList(); }
    if (t.id === 'f-name' && t.value.trim()) $('#nameErr').hidden = true;
  });

  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.name === 'cat' && J) {
      J.category = t.value;
      const ph = $('.photo-field .ph span', app);
      if (ph) ph.textContent = catOf(t.value).mark;
    }
    if (t.id === 'r-cat') { recFilter.category = t.value; renderRecList(); }
    if (t.id === 'f-photo' && t.files[0]) {
      try {
        J.photo = await resizeImage(t.files[0]);
        render();
      } catch (err) {
        toast('写真を読み込めませんでした。別の画像を選んでください。');
      }
    }
    if (t.id === 'importFile' && t.files[0]) importFile(t.files[0]);
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'itemForm') return;
    e.preventDefault();
    if (!J.name.trim()) {
      $('#nameErr').hidden = false;
      $('#f-name').focus();
      return;
    }
    J.step = 1;
    render('.q-text');
    window.scrollTo(0, 0);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) { closeModal(); return; }
    if (route() !== 'judge' || !J || J.step < 1 || J.step > QUESTIONS.length || !modal.hidden) return;
    if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) { e.preventDefault(); choose(n - 1); }
  });

  window.addEventListener('hashchange', () => {
    closeModal();
    render(route() === 'judge' ? (J && J.step > 0 ? '.q-text' : 'h1') : 'h1');
    window.scrollTo(0, 0);
  });

  /* ---------- 起動 ---------- */
  async function init() {
    items = await Store.all();
    if (!items.length && !Prefs.get('seeded')) {
      items = makeSamples();
      for (const it of items) await Store.put(it);
      Prefs.set('seeded', '1');
    }
    render();
  }

  init();
})();
