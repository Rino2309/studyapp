/* Generatore di domande: trasforma testo grezzo in flashcard e quiz.
   Tutto avviene nel browser, senza server né API esterne. */
(function (root) {
  'use strict';

  const STOP_IT = `il lo la i gli le un uno una di a da in con su per tra fra e ed o ma però anche che chi cui non più
    del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle
    sul sullo sulla sui sugli sulle col coi è sono era erano essere stato stata stati state ha hanno aveva avere fatto fare
    si se come quando dove quale quali quello quella quelli quelle questo questa questi queste esso essa essi esse ciò
    molto molti molte molta poco poche tutto tutti tutte tutta ogni altro altri altre altra stesso stessa stessi stesse
    può possono deve devono viene vengono dopo prima durante mentre sia sono così quindi perché poiché infatti inoltre
    ad ai quanto quanti sempre ancora già solo sopra sotto verso senza dentro fuori oltre circa dunque ovvero cioè`;
  const STOP_EN = `the a an of to in on at by for with from and or but not no as is are was were be been being it its this that
    these those which who whom whose what when where why how than then there their they them he she his her we our you your
    i my me can could may might will would shall should do does did have has had into over under between through during
    before after about against also such each other some any all more most many much very only own same so if because while
    both few further once here out off up down again just now`;
  const STOP = new Set((STOP_IT + ' ' + STOP_EN).split(/\s+/).filter(Boolean));
  const IT_HINT = new Set(['il', 'della', 'che', 'di', 'le', 'dei', 'nel', 'sono', 'una', 'per', 'con', 'gli', 'delle', 'alla', 'come']);
  const EN_HINT = new Set(['the', 'of', 'and', 'is', 'are', 'that', 'with', 'for', 'which', 'this', 'from', 'by', 'was', 'be']);

  const WORD_RE = /[\p{L}][\p{L}'’-]*/gu;
  const NUM_RE = /(?<![\p{L}\d.,])\d{1,4}(?:[.,]\d+)?(?![\p{L}\d])/gu;

  /* ---------- utilità ---------- */
  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function isCapitalized(w) { return /^\p{Lu}/u.test(w); }
  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\d\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectLang(text) {
    let it = 0, en = 0;
    for (const m of text.toLowerCase().matchAll(WORD_RE)) {
      if (IT_HINT.has(m[0])) it++;
      if (EN_HINT.has(m[0])) en++;
    }
    return en > it * 1.2 ? 'en' : 'it';
  }

  /* ---------- frasi ---------- */
  function splitSentences(text) {
    text = text.replace(/\s+/g, ' ').trim();
    const parts = text.split(/(?<=[.!?])\s+(?=[\p{Lu}\d«"“(])/u);
    const out = [];
    for (let s of parts) {
      s = s.trim();
      if (s.length < 40 || s.length > 300) continue;
      const words = s.match(WORD_RE) || [];
      if (words.length < 7) continue;
      const letters = (s.match(/\p{L}/gu) || []).length;
      if (letters / s.length < 0.7) continue;
      if (/https?:\/\/|www\./i.test(s)) continue;
      out.push(s);
    }
    return out;
  }

  /* ---------- statistiche del documento ---------- */
  function buildStats(sentences) {
    const freq = new Map();
    const surface = new Map(); // forma minuscola -> forme originali più frequenti
    for (const s of sentences) {
      for (const m of s.matchAll(WORD_RE)) {
        const w = m[0];
        const lw = w.toLowerCase();
        if (lw.length < 4 || STOP.has(lw)) continue;
        freq.set(lw, (freq.get(lw) || 0) + 1);
        if (!surface.has(lw)) surface.set(lw, new Map());
        surface.get(lw).set(w, (surface.get(lw).get(w) || 0) + 1);
      }
    }
    return { freq, surface };
  }

  function tokens(sentence) {
    const out = [];
    for (const m of sentence.matchAll(WORD_RE)) out.push({ w: m[0], i: m.index, lw: m[0].toLowerCase() });
    return out;
  }

  function pickKeyword(sentence, stats) {
    const toks = tokens(sentence);
    let best = null, bestScore = 0;
    toks.forEach((t, idx) => {
      if (idx < 2 || t.lw.length < 5 || STOP.has(t.lw)) return;
      const f = stats.freq.get(t.lw) || 1;
      let score = (1 + Math.log(f)) * Math.min(t.lw.length, 12) / 12;
      if (isCapitalized(t.w)) score += 0.5;
      if (t.lw.includes('-')) score += 0.2;
      score *= 0.8 + Math.random() * 0.4;
      if (score > bestScore) { bestScore = score; best = t; }
    });
    return best && { kind: 'word', text: best.w, index: best.i };
  }

  function pickNumber(sentence) {
    const nums = [...sentence.matchAll(NUM_RE)].filter(m => m.index > 10);
    if (!nums.length) return null;
    const m = rnd(nums);
    return { kind: 'num', text: m[0], index: m.index };
  }

  /* ---------- distrattori ---------- */
  function wordDistractors(answer, sentence, stats, n = 3) {
    const lw = answer.toLowerCase();
    const inSentence = new Set(tokens(sentence).map(t => t.lw));
    const stem = lw.slice(0, 5);
    const cands = [];
    for (const [w, f] of stats.freq) {
      if (w.length < 5 || inSentence.has(w) || w.startsWith(stem) || w === lw) continue;
      if (Math.abs(w.length - lw.length) > Math.max(4, lw.length * 0.5)) continue;
      cands.push([w, f]);
    }
    if (cands.length < n) return [];
    // preferisci parole frequenti (più plausibili) ma con un po' di casualità
    cands.sort((a, b) => b[1] - a[1]);
    const pool = cands.slice(0, 40).map(c => c[0]);
    const chosen = shuffle(pool).slice(0, n);
    return chosen.map(w => {
      const forms = stats.surface.get(w);
      let form = w;
      if (forms) form = [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (isCapitalized(answer)) form = cap(form);
      else form = form.toLowerCase();
      return form;
    });
  }

  function numDistractors(answer, n = 3) {
    const comma = answer.includes(',');
    const val = parseFloat(answer.replace(',', '.'));
    if (!isFinite(val)) return [];
    const isYear = Number.isInteger(val) && val >= 1000 && val <= 2100 && !/[.,]/.test(answer);
    const set = new Set([answer]);
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 60) {
      let v;
      if (isYear) v = val + rnd([-1, 1]) * (1 + Math.floor(Math.random() * 60));
      else if (Number.isInteger(val)) {
        const step = Math.max(1, Math.round(Math.abs(val) * 0.1));
        v = val + rnd([-1, 1]) * step * (1 + Math.floor(Math.random() * 4));
      } else v = +(val * (0.5 + Math.random() * 1.5)).toFixed(2);
      if (v < 0 || (isYear && (v < 100 || v > 2100))) continue;
      let s = String(v);
      if (comma) s = s.replace('.', ',');
      if (set.has(s)) continue;
      set.add(s); out.push(s);
    }
    return out.length === n ? out : [];
  }

  /* ---------- definizioni ---------- */
  const DEF_VERBS = [
    'è', 'sono', 'era', 'erano', 'si definisce', 'si definiscono', 'si chiama', 'si chiamano', 'consiste in', 'consistono in',
    'indica', 'indicano', 'rappresenta', 'rappresentano', 'significa', 'viene definito', 'viene definita', 'vengono definiti',
    'vengono definite', 'is', 'are', 'was', 'were', 'refers to', 'is defined as', 'are defined as', 'means', 'consists of'
  ];
  const DEF_RE = new RegExp('^(.{3,70}?)\\s+(' + DEF_VERBS.map(v => v.replace(/ /g, '\\s+')).join('|') + ')\\s+(.{25,})$', 'iu');
  const BAD_TERM = /^(questo|questa|questi|queste|esso|essa|essi|esse|ciò|quello|quella|egli|ella|loro|lui|lei|it|this|that|these|those|he|she|they|there|here|who|which|what|ne|ci|si|ma|e|o|se|come|quando|mentre|dove|poiché|perché|quindi|infatti|inoltre|anche|se|while|when|if|because|since|and|but|or|however|therefore)\b/iu;

  function parseDefinition(sentence) {
    const m = sentence.match(DEF_RE);
    if (!m) return null;
    let term = m[1].trim().replace(/^(?:(?:il|lo|la|i|gli|le|un|uno|una|the|a|an)\s+|l['’]\s*)/iu, '');
    if (BAD_TERM.test(m[1].trim()) || BAD_TERM.test(term)) return null;
    const nWords = (term.match(WORD_RE) || []).length;
    if (nWords < 1 || nWords > 5) return null;
    if (/[,;:()]/.test(term)) return null;
    if (/\d/.test(term)) return null;
    if (term.length < 3) return null;
    const desc = m[3].trim().replace(/[.!?]+$/, '');
    if ((desc.match(WORD_RE) || []).length < 5) return null;
    return { term, verb: m[2], desc };
  }

  /* ---------- generazione ---------- */
  function generate(text, opts = {}) {
    const max = opts.max || 40;
    const sentences = splitSentences(text);
    const lang = detectLang(text);
    const stats = buildStats(sentences);
    const used = new Set();
    const cards = [];

    // 1) definizioni
    const defs = [];
    for (const s of shuffle(sentences)) {
      const d = parseDefinition(s);
      if (d) defs.push({ ...d, sentence: s });
    }
    const seenTerms = new Set();
    const defCards = [];
    for (const d of defs) {
      const key = norm(d.term);
      if (seenTerms.has(key)) continue;
      seenTerms.add(key);
      defCards.push(d);
    }
    const defLimit = Math.min(defCards.length, Math.ceil(max * 0.4));
    const chosenDefs = defCards.slice(0, defLimit);
    for (const d of chosenDefs) {
      const others = chosenDefs.filter(o => o !== d).map(o => o.term);
      cards.push({
        id: uid(), type: 'def', term: d.term, desc: cap(d.desc),
        context: d.sentence,
        distractors: shuffle(others).slice(0, 3)
      });
      used.add(d.sentence);
    }

    // 2) cloze e vero/falso sulle altre frasi
    const rest = shuffle(sentences.filter(s => !used.has(s)));
    for (const s of rest) {
      if (cards.length >= max) break;
      const useNum = Math.random() < 0.5;
      const ans = (useNum && pickNumber(s)) || pickKeyword(s, stats) || pickNumber(s);
      if (!ans) continue;
      const distractors = ans.kind === 'num' ? numDistractors(ans.text) : wordDistractors(ans.text, s, stats);
      // le falsificazioni vanno bene solo per numeri e nomi propri: sostituire parole comuni spezza la grammatica
      const safeToFalsify = ans.kind === 'num' || isCapitalized(ans.text);
      const wantTF = safeToFalsify && distractors.length >= 1 && Math.random() < 0.35;
      if (wantTF) {
        const truth = Math.random() < 0.5;
        const statement = truth ? s
          : s.slice(0, ans.index) + distractors[0] + s.slice(ans.index + ans.text.length);
        cards.push({ id: uid(), type: 'tf', statement, truth, context: s, answer: ans.text });
      } else {
        const text = s.slice(0, ans.index) + '_____' + s.slice(ans.index + ans.text.length);
        cards.push({
          id: uid(), type: 'cloze', text, answer: ans.text, kind: ans.kind,
          context: s, distractors
        });
      }
    }
    return { cards: shuffle(cards), lang, sentences: sentences.length };
  }

  /* ---------- verifica risposte scritte ---------- */
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function checkTyped(input, answer) {
    const a = norm(input), b = norm(answer);
    if (!a) return false;
    if (a === b) return true;
    const tol = b.length >= 9 ? 2 : b.length >= 5 ? 1 : 0;
    return lev(a, b) <= tol;
  }

  root.Gen = { generate, checkTyped, shuffle, uid, splitSentences, parseDefinition, detectLang, norm };
})(typeof window !== 'undefined' ? window : globalThis);
