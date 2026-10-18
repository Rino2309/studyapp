# 📚 StudyApp

Web app tipo Flashka: importi i tuoi **PDF** (o .txt/.md, o testo incollato) e l'app li trasforma in
**flashcard** e **quiz** per studiare. Nessun server, nessun account: tutto gira nel browser e i dati
restano sul dispositivo.

## Cosa fa

- **Importa PDF** (anche più file in un unico mazzo) con [pdf.js](https://mozilla.github.io/pdf.js/) incluso in `vendor/`.
- **Genera domande in automatico**, in italiano o inglese:
  - *Definizioni* («X è / si definisce / indica Y») → flashcard e quiz «quale termine corrisponde?»
  - *Completamenti* (cloze) con 4 opzioni oppure risposta scritta (tollera piccoli errori di battitura)
  - *Vero/Falso* con date e nomi propri alterati
- **Flashcard** con ripetizione dilazionata (Leitner: le carte sbagliate tornano prima).
- **Quiz** a scelta multipla, mista o solo scritta, con ripasso degli errori e scorciatoie da tastiera.
- **Condivisione**: link con il mazzo compresso nell'URL (`#s=…`) oppure file `.json` da scaricare/importare.
  Chi riceve il link aggiunge il mazzo alla propria app, senza i tuoi progressi.
- Funziona offline dopo la prima visita (service worker) e si adatta a mobile e tema scuro.

> Limite: i PDF devono contenere testo selezionabile. Le scansioni (immagini) richiederebbero un OCR, non incluso.

## Usarla in locale

Basta un server statico qualsiasi:

```bash
python3 -m http.server 8000   # poi apri http://localhost:8000
```

## Pubblicarla (link condivisibile)

Il workflow `.github/workflows/pages.yml` pubblica il sito su **GitHub Pages** a ogni push su `main`.
Attivalo una volta in *Settings → Pages → Build and deploy → Source: GitHub Actions*.
Il link sarà `https://<utente>.github.io/studyapp/`. Va bene anche Netlify, Cloudflare Pages o qualsiasi hosting statico.

## Struttura

```
index.html        pagina unica
css/style.css     stile (chiaro/scuro, responsive)
js/importer.js    estrazione testo da PDF/TXT
js/generator.js   generazione domande + verifica risposte
js/store.js       salvataggio locale, Leitner, link di condivisione
js/app.js         viste: home, mazzo, flashcard, quiz
sw.js             cache offline
```
