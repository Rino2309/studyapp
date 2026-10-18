/* Estrazione del testo da PDF / TXT / MD, interamente nel browser. */
(function (root) {
  'use strict';

  function setupPdfJs() {
    if (!root.pdfjsLib) throw new Error('Libreria PDF non caricata');
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

  async function extractPdf(file, onProgress) {
    setupPdfJs();
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await root.pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const lines = [];
      let cur = '', lastY = null;
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const y = it.transform ? it.transform[5] : 0;
        if (lastY !== null && Math.abs(y - lastY) > 2.5 && cur) { lines.push(cur.trim()); cur = ''; }
        cur += it.str;
        if (it.hasEOL) { lines.push(cur.trim()); cur = ''; }
        lastY = y;
      }
      if (cur.trim()) lines.push(cur.trim());
      pages.push(lines.filter(Boolean));
      if (onProgress) onProgress(p, pdf.numPages);
    }
    return linesToText(pages);
  }

  /* Rimuove intestazioni/piè di pagina ripetuti e numeri di pagina, poi ricompone i paragrafi. */
  function linesToText(pages) {
    const counts = new Map();
    if (pages.length >= 4) {
      for (const lines of pages) {
        for (const l of new Set(lines)) counts.set(l, (counts.get(l) || 0) + 1);
      }
    }
    const repeated = l => pages.length >= 4 && (counts.get(l) || 0) > pages.length * 0.5;
    const out = [];
    for (const lines of pages) {
      for (let l of lines) {
        if (/^\d{1,4}$/.test(l) || /^(pag\.?|page)\s*\d+(\s*(\/|di|of)\s*\d+)?$/i.test(l)) continue;
        if (repeated(l)) continue;
        out.push(l);
      }
    }
    let text = '';
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      const endsSentence = /[.!?:;]["”»)]?$/.test(l);
      const looksHeading = l.length < 70 && !endsSentence && !/-$/.test(l) && !/^[a-zà-ý]/.test(out[i + 1] || '');
      if (/[A-Za-zÀ-ÿ]-$/.test(l)) text += l.slice(0, -1);          // sillabazione a fine riga
      else if (looksHeading) text += l + '. ';
      else text += l + ' ';
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  async function extractFile(file, onProgress) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdf(file, onProgress);
    if (/\.(txt|md|markdown)$/.test(name) || file.type.startsWith('text/')) return (await file.text()).replace(/\r/g, '');
    throw new Error('Formato non supportato: ' + file.name);
  }

  root.Importer = { extractFile, linesToText };
})(window);
