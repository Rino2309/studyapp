/* Persistenza locale (localStorage) e condivisione tramite link/file. */
(function (root) {
  'use strict';
  const KEY = 'studyapp.decks.v1';
  const DAYS = [0, 1, 3, 7, 21];
  const MAX_BOX = DAYS.length - 1;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(decks) {
    try { localStorage.setItem(KEY, JSON.stringify(decks)); return true; } catch (e) { return false; }
  }
  function get(id) { return load().find(d => d.id === id); }
  function put(deck) {
    const decks = load();
    const i = decks.findIndex(d => d.id === deck.id);
    if (i >= 0) decks[i] = deck; else decks.unshift(deck);
    return save(decks);
  }
  function remove(id) { save(load().filter(d => d.id !== id)); }

  /* ---- ripetizione dilazionata (Leitner) ---- */
  function grade(deck, cardId, correct) {
    const p = deck.progress[cardId] || { box: 0, due: 0, seen: 0, ok: 0 };
    p.seen++;
    if (correct) { p.ok++; p.box = Math.min(p.box + 1, MAX_BOX); } else p.box = 0;
    p.due = Date.now() + DAYS[p.box] * 86400000;
    deck.progress[cardId] = p;
  }
  function stats(deck) {
    const now = Date.now();
    let due = 0, mastered = 0, fresh = 0;
    for (const c of deck.cards) {
      const p = deck.progress[c.id];
      if (!p) { fresh++; due++; continue; }
      if (p.due <= now) due++;
      if (p.box >= 3) mastered++;
    }
    return { total: deck.cards.length, due, mastered, fresh };
  }

  /* ---- condivisione ---- */
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(str + '='.repeat((4 - str.length % 4) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }
  async function pipe(bytes, stream) {
    const w = stream.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }
  function payload(deck) {
    return JSON.stringify({ v: 1, name: deck.name, lang: deck.lang, cards: deck.cards });
  }
  async function toShareHash(deck) {
    const zipped = await pipe(new TextEncoder().encode(payload(deck)), new CompressionStream('deflate-raw'));
    return '#s=' + b64u(zipped);
  }
  async function fromShareHash(hash) {
    const raw = await pipe(unb64u(hash.replace(/^#s=/, '')), new DecompressionStream('deflate-raw'));
    return validate(JSON.parse(new TextDecoder().decode(raw)));
  }
  function validate(obj) {
    if (!obj || !Array.isArray(obj.cards) || !obj.cards.length) throw new Error('Mazzo non valido');
    const ok = ['def', 'cloze', 'tf'];
    const cards = obj.cards.filter(c => c && ok.includes(c.type)).map(c => ({ ...c, id: c.id || root.Gen.uid() }));
    if (!cards.length) throw new Error('Il mazzo non contiene domande valide');
    return { name: String(obj.name || 'Mazzo importato').slice(0, 120), lang: obj.lang === 'en' ? 'en' : 'it', cards };
  }
  function newDeck(name, lang, cards) {
    return { id: root.Gen.uid(), name, lang, created: Date.now(), cards, progress: {} };
  }

  root.Store = { load, save, get, put, remove, grade, stats, toShareHash, fromShareHash, validate, newDeck, payload };
})(window);
