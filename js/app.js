/* Interfaccia e logica di studio. */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const T = { // testi per lingua del mazzo
    it: { defQ: 'Quale termine corrisponde a questa descrizione?', defCard: t => `Che cosa si intende per «${t}»?`, tf: 'Vero o falso?', t: 'Vero', f: 'Falso' },
    en: { defQ: 'Which term matches this description?', defCard: t => `What is meant by “${t}”?`, tf: 'True or false?', t: 'True', f: 'False' }
  };
  let keyHandler = null;
  let sess = null;

  /* ---------- helpers ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clozeHtml = t => esc(t).replace('_____', '<span class="blank"></span>');
  const clozeFull = c => esc(c.text).replace('_____', `<span class="answer">${esc(c.answer)}</span>`);
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function html(strings, ...vals) { return strings.reduce((a, s, i) => a + s + (vals[i] ?? ''), ''); }
  function mount(h) { $app.innerHTML = h; window.scrollTo(0, 0); }
  const L = deck => T[deck.lang] || T.it;
  function modal(inner) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="card modal stack" role="dialog" aria-modal="true">${inner}</div>`;
    bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
    document.body.appendChild(bg);
    return bg;
  }

  /* ---------- router ---------- */
  async function route() {
    keyHandler = null; sess = null;
    const h = location.hash;
    if (h.startsWith('#s=')) return openShared(h);
    const m = h.match(/^#\/(\w+)\/([\w-]+)/);
    const deck = m && Store.get(m[2]);
    if (m && !deck) { toast('Mazzo non trovato'); location.hash = '#/'; return; }
    if (!m) return viewHome();
    if (m[1] === 'deck') return viewDeck(deck);
    if (m[1] === 'study') return viewStudy(deck);
    if (m[1] === 'quiz') return viewQuizSetup(deck);
    location.hash = '#/';
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', e => {
    if (keyHandler && !e.ctrlKey && !e.metaKey && !e.altKey) keyHandler(e);
  });

  /* ---------- HOME ---------- */
  function viewHome() {
    const decks = Store.load();
    mount(html`
      <h1>Trasforma i tuoi PDF in test</h1>
      <p class="lead">Carica uno o più PDF: l'app crea da sola flashcard e quiz a scelta multipla. Con l'<b>AI attiva</b> le domande sono vere domande di comprensione con 4 risposte; senza, usa regole semplici (completamenti, definizioni, vero/falso).</p>
      <div class="drop" id="drop">
        <div class="icon">📄</div>
        <p><b>Trascina qui i PDF</b> oppure</p>
        <button class="primary big" id="pick">Scegli file</button>
        <input type="file" id="file" accept=".pdf,.txt,.md,application/pdf,text/plain" multiple hidden>
        <p class="muted">Supporta PDF con testo selezionabile (non scansioni), .txt e .md</p>
      </div>
      <div class="row between" style="margin-top:12px">
        <div class="row">
          <label for="max" style="margin:0">Domande da generare</label>
          <select id="max" style="width:auto"><option>20</option><option selected>40</option><option>80</option><option>150</option></select>
        </div>
        <div class="row">
          <button id="aiset">${AI.active() ? '✨ AI attiva' : '✨ Attiva AI'}</button>
          <button id="paste">✍️ Incolla testo</button>
          <button id="impjson">⬆️ Importa mazzo (.json)</button>
          <input type="file" id="jsonfile" accept=".json,application/json" hidden>
        </div>
      </div>
      <h2>I tuoi mazzi</h2>
      <div class="decks">${decks.length ? decks.map(deckCard).join('') : '<p class="muted">Nessun mazzo ancora. Importa il tuo primo PDF!</p>'}</div>
    `);
    const drop = document.getElementById('drop'), file = document.getElementById('file');
    const maxSel = () => +document.getElementById('max').value;
    document.getElementById('pick').onclick = () => file.click();
    file.onchange = () => file.files.length && importFiles([...file.files], maxSel());
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => e.dataTransfer.files.length && importFiles([...e.dataTransfer.files], maxSel()));
    document.getElementById('paste').onclick = () => {
      const m = modal(`<h2 style="margin:0">Incolla il testo</h2>
        <div><label for="pn">Nome mazzo</label><input type="text" id="pn" value="Appunti"></div>
        <textarea id="pt" placeholder="Incolla qui appunti o testo…" style="min-height:200px"></textarea>
        <div class="row"><button class="primary" id="go">Genera</button><button id="cancel" class="ghost">Annulla</button></div>`);
      m.querySelector('#cancel').onclick = () => m.remove();
      m.querySelector('#go').onclick = () => {
        const text = m.querySelector('#pt').value;
        const name = m.querySelector('#pn').value.trim() || 'Appunti';
        m.remove(); buildDeck(name, text, maxSel());
      };
    };
    document.getElementById('aiset').onclick = () => aiSettings(viewHome);
    const jf = document.getElementById('jsonfile');
    document.getElementById('impjson').onclick = () => jf.click();
    jf.onchange = async () => {
      try {
        const d = Store.validate(JSON.parse(await jf.files[0].text()));
        const deck = Store.newDeck(d.name, d.lang, d.cards);
        Store.put(deck); toast('Mazzo importato'); location.hash = '#/deck/' + deck.id;
      } catch (e) { toast('File non valido'); }
    };
  }
  function deckCard(d) {
    const s = Store.stats(d);
    return `<a class="card deck" href="#/deck/${d.id}">
      <div><h3>${esc(d.name)}</h3><span class="muted">${s.total} domande · ${s.mastered} imparate</span></div>
      <span class="pill">${s.due} da ripassare</span></a>`;
  }

  /* ---------- import ---------- */
  async function importFiles(files, max) {
    mount(`<div class="card" style="text-align:center"><div class="spinner"></div><p id="st">Leggo i file…</p></div>`);
    const st = document.getElementById('st');
    try {
      let text = '';
      for (const f of files) {
        text += ' ' + await Importer.extractFile(f, (p, n) => { st.textContent = `${f.name}: pagina ${p}/${n}`; });
      }
      const base = files[0].name.replace(/\.[^.]+$/, '');
      await buildDeck(files.length > 1 ? `${base} (+${files.length - 1})` : base, text, max);
    } catch (e) {
      console.error(e);
      toast('Errore: ' + (e.message || e));
      viewHome();
    }
  }
  async function buildDeck(name, text, max) {
    if (text.replace(/\s/g, '').length < 200) {
      toast('Testo insufficiente: il PDF potrebbe essere una scansione senza testo.');
      return viewHome();
    }
    mount(`<div class="card" style="text-align:center"><div class="spinner"></div><p id="st2">Creo le domande…</p></div>`);
    await new Promise(r => setTimeout(r, 30));
    const lang = Gen.detectLang(text);
    let cards = [];
    if (AI.active()) {
      const st = document.getElementById('st2');
      st.textContent = 'L\'AI sta leggendo il testo e scrivendo le domande…';
      try {
        const r = await AI.generate(text, max, lang, (d, n) => { st.textContent = `L'AI sta scrivendo le domande… ${d}/${n}`; });
        cards = r.cards;
        if (r.failed) toast(`${r.failed} parti non elaborate, il mazzo potrebbe avere meno domande`);
      } catch (e) {
        console.error(e);
        toast('AI non disponibile (' + (e.message || e) + '). Uso le regole semplici.');
      }
    }
    if (cards.length < 3) cards = Gen.generate(text, { max }).cards;
    if (cards.length < 3) {
      toast('Non sono riuscito a ricavare abbastanza domande da questo testo.');
      return viewHome();
    }
    const deck = Store.newDeck(name, lang, cards);
    if (!Store.put(deck)) toast('Spazio di archiviazione pieno: esporta il mazzo come file.');
    location.hash = '#/deck/' + deck.id;
  }

  function aiSettings(done) {
    const c = AI.getCfg();
    const m = modal(`<h2 style="margin:0">✨ Domande con AI</h2>
      <p class="muted">Per creare vere domande a scelta multipla l'app usa Claude. Serve una tua <b>API key</b> di Anthropic
      (si crea su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>; l'uso si paga a consumo, di solito pochi centesimi per PDF).
      La chiave resta solo su questo dispositivo e il testo viene inviato direttamente ad Anthropic, mai a noi.
      Chi riceve i tuoi mazzi <b>non</b> ha bisogno di nessuna chiave.</p>
      <div><label for="k">API key</label><input type="password" id="k" autocomplete="off" placeholder="sk-ant-…" value="${esc(c.key)}"></div>
      <div><label for="md">Modello</label><select id="md">${AI.MODELS.map(x => `<option value="${x.id}"${x.id === c.model ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></div>
      <label class="check"><input type="checkbox" id="on"${c.on ? ' checked' : ''}> Usa l'AI quando importo un PDF</label>
      <div id="msg" class="muted"></div>
      <div class="row"><button class="primary" id="save">Salva e verifica</button>
      <button id="rm" class="danger">Rimuovi chiave</button><button id="x" class="ghost">Chiudi</button></div>`);
    const msg = m.querySelector('#msg');
    m.querySelector('#x').onclick = () => { m.remove(); done && done(); };
    m.querySelector('#rm').onclick = () => { AI.setCfg({ ...AI.getCfg(), key: '' }); m.remove(); toast('Chiave rimossa'); done && done(); };
    m.querySelector('#save').onclick = async () => {
      const key = m.querySelector('#k').value.trim(), model = m.querySelector('#md').value, on = m.querySelector('#on').checked;
      if (!key) { msg.textContent = 'Inserisci la chiave.'; return; }
      msg.textContent = 'Verifico la chiave…';
      try { await AI.test(key, model); }
      catch (e) { msg.textContent = '❌ ' + (e.message || 'Chiave non valida'); return; }
      AI.setCfg({ key, model, on }); m.remove(); toast('AI attivata ✨'); done && done();
    };
  }

  /* ---------- DECK ---------- */
  function viewDeck(deck) {
    const s = Store.stats(deck);
    const pct = s.total ? Math.round(s.mastered / s.total * 100) : 0;
    const kind = { def: 'Definizione', cloze: 'Completa', tf: 'Vero/Falso', mcq: 'Scelta multipla' };
    mount(html`
      <p><a href="#/">← Tutti i mazzi</a></p>
      <div class="row between"><h1 style="margin:0">${esc(deck.name)}</h1>
        <button class="ghost" id="rename">✏️ Rinomina</button></div>
      <div class="card stack" style="margin-top:12px">
        <div class="stats"><div><b>${s.total}</b><span class="muted">domande</span></div>
          <div><b>${s.due}</b><span class="muted">da ripassare</span></div>
          <div><b>${pct}%</b><span class="muted">imparato</span></div></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="row">
          <a class="btn primary big" href="#/study/${deck.id}">🃏 Flashcard</a>
          <a class="btn primary big" href="#/quiz/${deck.id}">📝 Quiz</a>
        </div>
      </div>
      <h2>Condividi</h2>
      <div class="card row">
        <button id="share">🔗 Crea link</button>
        <button id="export">⬇️ Scarica .json</button>
        <button id="reset">↺ Azzera progressi</button>
        <button id="del" class="danger">🗑 Elimina</button>
      </div>
      <h2>Domande (${s.total})</h2>
      <div class="card list">${deck.cards.map(c => `<div class="item"><div><span class="kind">${kind[c.type]}</span><br>${cardPreview(c)}</div>
        <button class="ghost" data-del="${c.id}" aria-label="Elimina domanda">✕</button></div>`).join('')}</div>
    `);
    document.getElementById('rename').onclick = () => {
      const n = prompt('Nome del mazzo', deck.name);
      if (n && n.trim()) { deck.name = n.trim().slice(0, 120); Store.put(deck); viewDeck(deck); }
    };
    document.getElementById('share').onclick = () => shareDeck(deck);
    document.getElementById('export').onclick = () => {
      const blob = new Blob([Store.payload(deck)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = deck.name.replace(/[^\w\-]+/g, '_') + '.studyapp.json';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.getElementById('reset').onclick = () => { if (confirm('Azzerare i progressi?')) { deck.progress = {}; Store.put(deck); viewDeck(deck); } };
    document.getElementById('del').onclick = () => { if (confirm('Eliminare questo mazzo?')) { Store.remove(deck.id); location.hash = '#/'; } };
    $app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      if (deck.cards.length <= 1) return toast('Il mazzo deve avere almeno una domanda');
      deck.cards = deck.cards.filter(c => c.id !== b.dataset.del);
      delete deck.progress[b.dataset.del];
      Store.put(deck); viewDeck(deck);
    });
  }
  function cardPreview(c) {
    if (c.type === 'mcq') return `<b>${esc(c.q)}</b><br>→ ${esc(c.answer)}`;
    if (c.type === 'def') return `<b>${esc(c.term)}</b>: ${esc(c.desc)}`;
    if (c.type === 'cloze') return clozeFull(c);
    return `${esc(c.statement)} <b>(${c.truth ? 'Vero' : 'Falso'})</b>`;
  }

  async function shareDeck(deck) {
    let url;
    try { url = location.origin + location.pathname + await Store.toShareHash(deck); }
    catch (e) { return toast('Il tuo browser non supporta la compressione: usa "Scarica .json"'); }
    const long = url.length > 8000;
    const m = modal(`<h2 style="margin:0">Condividi «${esc(deck.name)}»</h2>
      <p class="muted">Chi apre il link potrà aggiungere questo mazzo alla propria app (senza i tuoi progressi). ${long ? '<b>Il link è molto lungo: alcune app di messaggistica potrebbero tagliarlo, in tal caso invia il file .json.</b>' : ''}</p>
      <input type="text" id="u" readonly value="${esc(url)}">
      <div class="row"><button class="primary" id="copy">Copia link</button>
      ${navigator.share ? '<button id="nat">Condividi…</button>' : ''}<button class="ghost" id="close">Chiudi</button></div>`);
    const inp = m.querySelector('#u');
    inp.onfocus = () => inp.select();
    m.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(url); toast('Link copiato'); } catch (e) { inp.select(); document.execCommand('copy'); toast('Link copiato'); }
    };
    const nat = m.querySelector('#nat');
    if (nat) nat.onclick = () => navigator.share({ title: deck.name, url }).catch(() => { });
    m.querySelector('#close').onclick = () => m.remove();
  }
  async function openShared(hash) {
    mount('<div class="card" style="text-align:center"><div class="spinner"></div><p>Apro il mazzo condiviso…</p></div>');
    try {
      const d = await Store.fromShareHash(hash);
      history.replaceState(null, '', location.pathname + '#/');
      viewHome();
      const m = modal(`<h2 style="margin:0">📬 Mazzo condiviso</h2>
        <p><b>${esc(d.name)}</b><br><span class="muted">${d.cards.length} domande</span></p>
        <div class="row"><button class="primary" id="add">Aggiungi ai miei mazzi</button><button class="ghost" id="no">Annulla</button></div>`);
      m.querySelector('#no').onclick = () => m.remove();
      m.querySelector('#add').onclick = () => {
        const deck = Store.newDeck(d.name, d.lang, d.cards);
        Store.put(deck); m.remove(); location.hash = '#/deck/' + deck.id;
      };
    } catch (e) {
      console.error(e);
      history.replaceState(null, '', location.pathname + '#/');
      toast('Link non valido o danneggiato'); viewHome();
    }
  }

  /* ---------- FLASHCARD ---------- */
  function dueQueue(deck, n) {
    const now = Date.now();
    const due = deck.cards.filter(c => !deck.progress[c.id] || deck.progress[c.id].due <= now);
    const pool = due.length ? due : deck.cards;
    return Gen.shuffle(pool).sort((a, b) => ((deck.progress[a.id] || {}).box || 0) - ((deck.progress[b.id] || {}).box || 0)).slice(0, n);
  }
  function cardFaces(c, deck) {
    const t = L(deck);
    if (c.type === 'mcq') return [`<div class="label">Domanda</div>${esc(c.q)}`,
      `<div class="label">Risposta</div><span class="answer">${esc(c.answer)}</span>${c.context ? '<small>' + esc(c.context) + '</small>' : ''}`];
    if (c.type === 'def') return [`<div class="label">Definizione</div>${esc(t.defCard(c.term))}`,
      `<div class="label">Risposta</div><span class="answer">${esc(c.desc)}</span>`];
    if (c.type === 'cloze') return [`<div class="label">Completa</div>${clozeHtml(c.text)}`,
      `<div class="label">Risposta</div><span class="answer">${esc(c.answer)}</span><small>${esc(c.context)}</small>`];
    return [`<div class="label">${t.tf}</div>${esc(c.statement)}`,
      `<div class="label">Risposta</div><span class="answer">${c.truth ? t.t : t.f}</span><small>${esc(c.context)}</small>`];
  }
  function viewStudy(deck, queue) {
    sess = { queue: queue || dueQueue(deck, 20), i: 0, wrong: [], ok: 0 };
    drawCard(deck);
  }
  function drawCard(deck) {
    const S = sess;
    if (S.i >= S.queue.length) return endStudy(deck);
    const c = S.queue[S.i];
    const [front, back] = cardFaces(c, deck);
    mount(html`
      <p><a href="#/deck/${deck.id}">← ${esc(deck.name)}</a></p>
      <div class="progress-line"><span class="muted">${S.i + 1}/${S.queue.length}</span><div class="bar"><i style="width:${S.i / S.queue.length * 100}%"></i></div></div>
      <div class="flip" id="flip" tabindex="0" role="button" aria-label="Gira la carta"><div class="flip-inner">
        <div class="face front">${front}<small>Tocca per girare (spazio)</small></div>
        <div class="face back">${back}</div></div></div>
      <div class="row" id="grade" style="justify-content:center;margin-top:16px;visibility:hidden">
        <button class="big danger" id="no">✕ Non la so</button><button class="big primary" id="yes">✓ La so</button></div>
    `);
    const flip = document.getElementById('flip'), grade = document.getElementById('grade');
    const doFlip = () => { flip.classList.toggle('flipped'); grade.style.visibility = flip.classList.contains('flipped') ? 'visible' : 'hidden'; };
    const answer = ok => {
      if (!flip.classList.contains('flipped')) return doFlip();
      Store.grade(deck, c.id, ok); Store.put(deck);
      if (ok) S.ok++; else S.wrong.push(c);
      S.i++; drawCard(deck);
    };
    flip.onclick = doFlip;
    document.getElementById('yes').onclick = () => answer(true);
    document.getElementById('no').onclick = () => answer(false);
    keyHandler = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doFlip(); }
      else if (e.key === 'ArrowRight') answer(true);
      else if (e.key === 'ArrowLeft') answer(false);
    };
  }
  function endStudy(deck) {
    const S = sess;
    mount(html`
      <div class="card stack" style="text-align:center">
        <div class="score">🎉 ${S.ok}/${S.queue.length}</div>
        <p class="muted">Carte che sapevi. I progressi sono salvati: le carte difficili torneranno prima.</p>
        <div class="row" style="justify-content:center">
          ${S.wrong.length ? '<button class="primary" id="again">Ripassa gli errori (' + S.wrong.length + ')</button>' : ''}
          <button id="more">Altre carte</button><a class="btn" href="#/deck/${deck.id}">Torna al mazzo</a></div>
      </div>`);
    const again = document.getElementById('again');
    if (again) again.onclick = () => viewStudy(deck, Gen.shuffle(S.wrong));
    document.getElementById('more').onclick = () => viewStudy(deck);
  }

  /* ---------- QUIZ ---------- */
  function viewQuizSetup(deck) {
    const n = deck.cards.length;
    mount(html`
      <p><a href="#/deck/${deck.id}">← ${esc(deck.name)}</a></p>
      <h1>Quiz</h1>
      <div class="card stack">
        <div><label for="qn">Numero di domande</label>
          <select id="qn">${[10, 20, 40].filter(x => x < n).map(x => `<option>${x}</option>`).join('')}<option value="${n}" selected>Tutte (${n})</option></select></div>
        <div><label for="qm">Tipo di risposte</label>
          <select id="qm"><option value="mc">Scelta multipla</option><option value="mixed" selected>Mista (anche risposte scritte)</option><option value="typed">Solo risposte scritte</option></select></div>
        <button class="primary big" id="go">Inizia</button>
      </div>`);
    document.getElementById('go').onclick = () =>
      startQuiz(deck, +document.getElementById('qn').value, document.getElementById('qm').value);
  }
  function buildQuestion(c, deck, mode) {
    const t = L(deck);
    const wantTyped = mode === 'typed' || (mode === 'mixed' && Math.random() < 0.35);
    if (c.type === 'mcq') return { card: c, kind: 'mc', prompt: esc(c.q), options: Gen.shuffle(c.options), correct: c.answer };
    if (c.type === 'tf') return { card: c, kind: 'tf', prompt: `<div class="muted">${t.tf}</div>${esc(c.statement)}`, correct: c.truth };
    if (c.type === 'def') {
      if (c.distractors && c.distractors.length >= 3 && !wantTyped)
        return { card: c, kind: 'mc', prompt: `<div class="muted">${t.defQ}</div>${esc(c.desc)}`, options: Gen.shuffle([c.term, ...c.distractors.slice(0, 3)]), correct: c.term };
      return { card: c, kind: 'typed', prompt: `<div class="muted">${t.defQ}</div>${esc(c.desc)}`, correct: c.term };
    }
    if (c.distractors && c.distractors.length >= 3 && !wantTyped)
      return { card: c, kind: 'mc', prompt: clozeHtml(c.text), options: Gen.shuffle([c.answer, ...c.distractors.slice(0, 3)]), correct: c.answer };
    return { card: c, kind: 'typed', prompt: clozeHtml(c.text), correct: c.answer };
  }
  function startQuiz(deck, n, mode, cards) {
    const picked = cards || dueQueue(deck, 10000).concat(Gen.shuffle(deck.cards)).filter((c, i, a) => a.indexOf(c) === i).slice(0, n);
    sess = { deck, mode, qs: Gen.shuffle(picked).map(c => buildQuestion(c, deck, mode)), i: 0, wrong: [], ok: 0 };
    drawQuestion(deck);
  }
  function drawQuestion(deck) {
    const S = sess;
    if (S.i >= S.qs.length) return endQuiz(deck);
    keyHandler = null;
    const q = S.qs[S.i], t = L(deck);
    let body;
    if (q.kind === 'mc') body = `<div class="opts">${q.options.map((o, i) => `<button class="opt" data-i="${i}"><b>${i + 1}.</b> ${esc(o)}</button>`).join('')}</div>`;
    else if (q.kind === 'tf') body = `<div class="opts" style="grid-template-columns:1fr 1fr"><button class="opt" data-v="1">${t.t}</button><button class="opt" data-v="0">${t.f}</button></div>`;
    else body = `<form id="tf" class="row" style="margin-top:14px;flex-wrap:nowrap"><input type="text" id="ans" autocomplete="off" autocapitalize="off" placeholder="Scrivi la risposta" aria-label="Risposta"><button class="primary" type="submit">Verifica</button></form>`;
    mount(html`
      <p><a href="#/deck/${deck.id}">← Esci dal quiz</a></p>
      <div class="progress-line"><span class="muted">${S.i + 1}/${S.qs.length}</span><div class="bar"><i style="width:${S.i / S.qs.length * 100}%"></i></div></div>
      <div class="card"><div class="q">${q.prompt}</div>${body}<div id="fb"></div></div>`);
    let done = false;
    const finish = (ok, chosen) => {
      if (done) return; done = true;
      Store.grade(deck, q.card.id, ok); Store.put(deck);
      if (ok) S.ok++; else S.wrong.push(q.card);
      const corr = q.kind === 'tf' ? (q.correct ? t.t : t.f) : q.correct;
      const ctx = q.card.context ? `<br><span class="muted">${esc(q.card.context)}</span>` : '';
      document.getElementById('fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'bad'}">${ok ? '✅ Corretto!' : '❌ Sbagliato. Risposta: <b>' + esc(corr) + '</b>'}${ctx}</div>
        <div class="row" style="margin-top:12px"><button class="primary" id="next">${S.i + 1 < S.qs.length ? 'Avanti →' : 'Risultato'}</button></div>`;
      const next = () => { S.i++; drawQuestion(deck); };
      document.getElementById('next').onclick = next;
      keyHandler = e => { if (e.key === 'Enter') { e.preventDefault(); next(); } };
      return chosen;
    };
    if (q.kind === 'mc') {
      const btns = [...$app.querySelectorAll('.opt')];
      const pick = i => {
        if (done) return;
        btns.forEach((b, j) => { b.disabled = true; if (q.options[j] === q.correct) b.classList.add('ok'); });
        if (q.options[i] !== q.correct) btns[i].classList.add('bad');
        finish(q.options[i] === q.correct);
      };
      btns.forEach((b, i) => b.onclick = () => pick(i));
      keyHandler = e => { const i = +e.key - 1; if (i >= 0 && i < btns.length) pick(i); };
    } else if (q.kind === 'tf') {
      const btns = [...$app.querySelectorAll('.opt')];
      const pick = v => {
        if (done) return;
        const ok = (v === 1) === q.correct;
        btns.forEach(b => { b.disabled = true; if ((b.dataset.v === '1') === q.correct) b.classList.add('ok'); });
        if (!ok) btns.find(b => (b.dataset.v === '1') === !q.correct).classList.add('bad');
        finish(ok);
      };
      btns.forEach(b => b.onclick = () => pick(+b.dataset.v));
      keyHandler = e => { if (e.key.toLowerCase() === 'v') pick(1); else if (e.key.toLowerCase() === 'f') pick(0); };
    } else {
      const inp = document.getElementById('ans');
      inp.focus();
      document.getElementById('tf').onsubmit = e => {
        e.preventDefault();
        if (done) return;
        inp.disabled = true;
        finish(Gen.checkTyped(inp.value, q.correct));
      };
    }
  }
  function endQuiz(deck) {
    const S = sess, pct = Math.round(S.ok / S.qs.length * 100);
    mount(html`
      <div class="card stack">
        <div class="score">${pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'} ${pct}%</div>
        <p class="muted" style="text-align:center">${S.ok} risposte corrette su ${S.qs.length}</p>
        <div class="row" style="justify-content:center">
          ${S.wrong.length ? '<button class="primary" id="retry">Rifai gli errori (' + S.wrong.length + ')</button>' : ''}
          <a class="btn" href="#/quiz/${deck.id}">Nuovo quiz</a><a class="btn" href="#/deck/${deck.id}">Torna al mazzo</a></div>
      </div>
      ${S.wrong.length ? '<h2>Da ripassare</h2>' + S.wrong.map(c => `<div class="review">${cardPreview(c)}</div>`).join('') : ''}`);
    const r = document.getElementById('retry');
    if (r) r.onclick = () => startQuiz(deck, S.wrong.length, S.mode, S.wrong);
  }

  /* ---------- avvio ---------- */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
  route();
})();
