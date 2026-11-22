// Empfaenger-Seite des Vorlagen-Transfers. Selbst-enthaltene HTML-Seite (Vanilla-JS + WebCrypto,
// KEIN Framework/Build), die der Dienst unter GET / ausliefert. Universell fuer JEDEN Empfaenger:
// Online-Editor, eigenes Zweitgeraet, fremdes Geraet, Android <-> iOS — laeuft in iOS-Safari,
// Android-Chrome/WKWebView und Desktop-Browsern (alle haben crypto.subtle unter https).
//
// ZERO-KNOWLEDGE-INVARIANTE: Der Schluessel steht ausschliesslich im URL-Fragment (#<id>.<key>) und
// wird nur CLIENTSEITIG gelesen. Der einzige Server-Request ist GET /v1/blob/<id> (nur die opake id,
// kein Schluessel) -> der Schluessel erreicht den Server nie und kann in keinem Log stehen.
//
// KLICK-ZUM-ABRUFEN statt Auto-Fetch: Der Burn-Blob wird erst beim bewussten Klick abgerufen (und
// damit ggf. verbrannt). Link-Vorschau-Bots laden nur / (HTML) ohne JS auszufuehren und rufen das
// Blob NIE ab -> sie verbrennen nichts.

// Entschluessel-Kern als String — wird SOWOHL in die Seite inlined ALS AUCH im Test via eval gegen
// echtes encryptTransfer geprueft. So ist exakt der ausgelieferte Krypto-Code getestet. Nutzt nur
// Globals, die in Browser UND Node existieren (crypto.subtle, atob, TextDecoder, Uint8Array). Enthaelt
// KEIN Backtick und KEIN Dollar-geschweift, damit es in die umschliessenden Template-Literale passt.
export const RECEIVER_CORE = `(function () {
  var MAGIC = [0x52, 0x51, 0x44, 0x31];
  function fromB64url(s) {
    var b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    var pad = s.length % 4;
    if (pad === 2) b64 += '==';
    else if (pad === 3) b64 += '=';
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Editor je Kanal aus dem Link (?e=...). Feste Liste: ein Link kann nie auf eine fremde Adresse lenken.
  var EDITORS = {
    '': { url: 'https://editor.resqdocs.app', label: 'Im Online-Editor öffnen' },
    dev: { url: 'https://editor.dev.resqdocs.app', label: 'Im Test-Editor öffnen' }
  };
  function editorFor(search) {
    var m = /[?&]e=([a-z0-9-]{1,16})(?:&|$)/.exec(search || '');
    var key = m ? m[1] : '';
    return Object.prototype.hasOwnProperty.call(EDITORS, key) ? EDITORS[key] : EDITORS[''];
  }
  function parseFragment(h) {
    if (h.charAt(0) === '#') h = h.slice(1);
    var dot = h.indexOf('.');
    if (dot <= 0 || dot === h.length - 1) return null;
    var id = h.slice(0, dot);
    var key = h.slice(dot + 1);
    if (!/^[A-Za-z0-9]+$/.test(id)) return null;
    return { id: id, key: key };
  }
  async function decrypt(bytes, keyB64) {
    if (bytes.length <= 16) throw new Error('zu kurz');
    for (var i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new Error('kein RQD1');
    var iv = bytes.subarray(4, 16);
    var ct = bytes.subarray(16);
    var key = await crypto.subtle.importKey('raw', fromB64url(keyB64), { name: 'AES-GCM' }, false, ['decrypt']);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return new TextDecoder().decode(pt);
  }
  return { fromB64url: fromB64url, parseFragment: parseFragment, decrypt: decrypt, editorFor: editorFor };
})`

// Signet der Webseite (resqdocs.app/signet.svg) als data:-Bild: die CSP erlaubt nur img-src 'self' data:.
const SIGNET = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iRWJlbmVfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAyOTE0LjQ4IDMzMTAuNTkiPgogIDwhLS0gR2VuZXJhdG9yOiBBZG9iZSBJbGx1c3RyYXRvciAzMC41LjEsIFNWRyBFeHBvcnQgUGx1Zy1JbiAuIFNWRyBWZXJzaW9uOiAyLjEuNCBCdWlsZCAzKSAgLS0+CiAgPGRlZnM+CiAgICA8c3R5bGU+CiAgICAgIC5zdDAgewogICAgICAgIGZpbGw6ICNmMDUzNDk7CiAgICAgIH0KCiAgICAgIC5zdDEgewogICAgICAgIGZpbGw6ICNmZWZlZmU7CiAgICAgIH0KCiAgICAgIC5zdDIgewogICAgICAgIGZpbGw6ICMxYjJjNTY7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik0yNTc2LjksMjUxNi44NWwyNzkuNTYsMS40OGM0My44Ni4yMyw2Mi45Myw1MS44Nyw1Ni45NSw4Ni44Ny03LjM2LDQzLjAyLTQxLjcsNTkuOTgtODguMTEsNTkuN2wtMjUzLjE3LTEuNS0zNzEuNzgtMy4wN2MtMzEuNjctLjI2LTQ3Ljk3LTM0Ljg5LTc1LjAxLTU1LjMybC0xNjIuOTIsMzc2Ljk1Yy0xNS4wOSwzNC45Mi00NC43Niw0OC40OC04MS44Nyw0Mi43Ni0yNy43My00LjI4LTQ4LjU5LTI4Ljg2LTU1LjM0LTYzLjcxbC0xMzMuNDgtNjg4LjkyLTEzNy42NiwzMzQuNWMtMTIuMTksMjkuNjItMzQuNSw1Ny4xLTcyLjg1LDU3LjA0bC0xMDgyLjg0LTEuNzFjLTQwLjM3LS4wNi01Ny42MS00MS4wNi01OS4xNi03MS40LTEuMjItMjQuMDMsMTcuMjMtNzIuMjgsNTQuMzMtNzIuMzRsMTA0Mi43NC0xLjY1LDIxNi40Ny01NDEuM2MxMi4wNy0zMC4xOSwzNi4yNy00MC44NSw2NC42Mi0zOS42MiwyMS41LjkzLDU2LjEzLDkuNjIsNjIuMiw0MC4xNGwxNDMuNjgsNzIyLjY3LDEyMC45My0yNjYuOGMxNS41NC0zNC4yOCw2NC42Ni00OC4wMyw5NS4wOC0yNy4zMSw0My44NiwyOS44OCw3My4xLDcyLjksMTA4LjYyLDExMi4xbDMyOS4wNC40MloiLz4KICA8cGF0aCBjbGFzcz0ic3QyIiBkPSJNMTk2MS4xOSw3MzIuMzljLTQxLjU5LTEuNzktNjYuNzctMjcuODYtNzUuNDktNjQuNzdsMS40Ny02MzUuNTgsNjYwLjg1LDY5OC4yMS01ODYuODMsMi4xNFoiLz4KICA8Zz4KICAgIDxwYXRoIGNsYXNzPSJzdDIiIGQ9Ik0yNTc2LjksMjUxNi44NWwtNS41NiwxNi4yMy0zMzAuMTMtMi45LTY2LjgyLTczLjYyYy0zMy4wMy0zNy4xNC03My44Mi02OS40Ni0xMTMuMTQtMjIuNjVsLTEyMS40OCwyNjcuMTVjLTExLjg0LDYuNzMtMjIuOTQsMy4xNi0zMy41Ni00Ljk2bC0xNDMuNTgtNzIxLjE0Yy0yMy4yNC0zMi4wMy03MS40OS0zMi45OS05My40MywzLjA1bC0yMTQuMjEsNTM1LjQ1LTE1LjY2LDE2Ljk1LTEwNDQuNjcsMy45NWMtNTMuNywxNC4xMy01My4zMiwxMDAuMTYsNC43OCwxMTEuNGwxMDk0Ljk5LjE5LDIzLjQzLTEyLjg3YzU3LjY3LTExNy45NiwxMTAuMDctMjM4LjkzLDE1Ny4xOS0zNjIuOTEsMTEuOC03LjA2LDIyLjk1LTMuNTUsMzMuNjksNC4zN2wxMzQuMjgsNjkxLjMzYzE4LjAyLDUyLjIsNjkuODQsNjAuNDQsMTAwLjg1LDE3LjA3bDE2Mi43OC0zNzUuNTdjMTkuNDItMjAuODgsNDMuOTEtMTEuNDcsNzMuNDksMjguMjRsMTYuNDEsOC4yNywzNjYuMDMsMy4yMyw5LjU2LDE2LjMyLS4zOSw0ODQuNDFjLS40Niw3NS43Mi02OC42NSwxNjIuNDItMTUzLjA3LDE2Mi40NGwtMjI1NS45NS4zNGMtODQuNDcuMDEtMTYxLjk5LTc5LjE2LTE2Mi4wMS0xNjUuMzdMMCwxNjguMTZDLS4wMiw4OC42OSw2NC4zNSwzLjQ0LDE0Ni4yMSwzLjI3TDE3MjcuMTcsMGMyMS43NS0uMDUsNTMuNDIsOC4yNCw1My41MSwzMi42MWwyLjExLDYyMy4yM2MuMzEsOTEuOTQsNzMuNDUsMTc5LjY5LDE2Ny40OCwxODAuMjFsNTc0LjIyLDMuMTdjMzEuNzQuMTgsNDkuMjcsMTkuMSw0OS4yNyw1MS42NGwzLjE0LDE2MjUuOThaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QxIiBkPSJNMjE4NC4zNywxMjIzLjA0bC0xNzY4Ljk1LS44MmMtNTAuMTMtLjAyLTc3LjMzLTQ2LjEzLTc4LjcyLTg2LjQ0LTEuMjEtMzQuODQsMjIuMy05MC44Miw3MS42NS05MC44M2wxNzcyLjkzLS4wOWM0NC42MSwwLDY4LjU2LDU0LjM4LDY5LjM4LDgzLjE0LDEuMjMsNDMuMi0xOC4xMyw3Ni40LTY2LjI5LDk1LjAzWiIvPgogICAgPHBhdGggY2xhc3M9InN0MSIgZD0iTTIxNzYuMjgsMTcxNS45OGwtMTc1Mi42Ny4xYy00Ny44OCwwLTgwLjYyLTM5LjU2LTg1Ljg5LTc5LjAzLTUuOTYtNDQuNjEsMTkuNzUtODYuMTEsNjkuNzItOTkuOThsMTc3NC41OCwxLjUxYzQ2LjE2LjA0LDY5LjE1LDU0LjIyLDY5LjI4LDg0LjY5LjE4LDQ0LjA4LTIzLjIsODAuOC03NS4wMSw5Mi43MloiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xNDE0Ljk1LDcyNy43NWwtMTAwNi45My0yLjAzYy00NS44NS0uMDktNzAuMzYtNTAuMjYtNzEuMy04NC44Ni0uOTktMzYuNTgsMjIuMjYtOTEsNjkuNzYtOTEuMDNsMTAwNS4yOS0uNjJjNDUuMjQtLjAzLDcxLjgzLDUwLjY5LDcyLjgsODQuMDQsMS4yNyw0My41My0yMC4xOSw3OS02OS42NCw5NC41MVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0xMjQ1LjM5LDIyMDkuNjNsLTgyMi4yLjEyYy00OS40NywwLTgzLjQ0LTQwLjM0LTg2LjktODMuOC0yLjkzLTM2LjgxLDIzLjM0LTk0Ljk3LDcxLjgtOTUuMDZsODQwLjg3LTEuNmM1MS4xMy0uMSw4NS40LDQ2LjcxLDg1LjI5LDkwLjMtLjExLDQ0LjQ4LTMzLjM0LDkwLjA0LTg4Ljg3LDkwLjA1WiIvPgogIDwvZz4KPC9zdmc+'

/** Open-Graph-Angaben für Link-Vorschauen in Messengern. Bewusst allgemein: Der Server kennt weder Titel noch
 *  Art des Inhalts (und soll sie nie in eine Vorschau schreiben, die Messenger auf ihren Servern speichern). */
function ogMeta(base: string, title: string, description: string): string {
  const b = base.replace(/"/g, '')
  return `<meta property="og:type" content="website" />
<meta property="og:site_name" content="ResQDocs" />
<meta property="og:locale" content="de_DE" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${b}/og-transfer.png" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="ResQDocs: Vorlage empfangen, Ende-zu-Ende verschlüsselt" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="description" content="${description}" />`
}

export const OG_TITLE = 'Vorlage für ResQDocs empfangen'
export const OG_DESCRIPTION = 'Jemand teilt eine Vorlage mit dir. Tippen, um sie in der ResQDocs-App oder im Browser zu öffnen.'

// Gestaltung wie resqdocs.app (site.css): Navy-Kopf mit Signet und „# … ===“-Zeile, weiße Karten, Navy-Fuß.
// Systemschrift wie auf der Webseite; keine externen Requests.
const STYLE = `<style>
  :root { color-scheme: light dark; --navy:#1b2c56; --navy-2:#24386a; --on-navy:#dfe5f3; --on-navy-muted:#b9c4de; --coral-light:#ff8d80;
    --bg:#f7f8fb; --card:#fff; --ink:#1b2c56; --fg:#3f4a63; --muted:#566382; --line:#e2e7f2; --red:#c73a28; --ok:#1f7a45;
    --pri-bg:#1b2c56; --pri-fg:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1527; --card:#17203a; --ink:#e7ecf7; --fg:#c3cbe0; --muted:#98a3bf; --line:#2b375a; --red:#ff8d80; --ok:#4cc58a; --pri-bg:#fff; --pri-fg:#1b2c56; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; -webkit-text-size-adjust:100%; min-height:100vh; display:flex; flex-direction:column; }
  .wrap { width:100%; max-width:36rem; margin:0 auto; padding-left:max(1rem,env(safe-area-inset-left)); padding-right:max(1rem,env(safe-area-inset-right)); }
  .top { background:var(--navy); color:#fff; padding-top:env(safe-area-inset-top); }
  .top .wrap { display:flex; flex-direction:column; gap:.75rem; padding-block:1.1rem 1.9rem; }
  .brand { display:inline-flex; align-items:center; gap:.55rem; min-height:2.75rem; font-size:1.2rem; font-weight:800; letter-spacing:-.01em; color:#fff; text-decoration:none; width:fit-content; }
  .brand img { width:26px; height:30px; }
  .q { color:var(--coral-light); }
  .mark { display:flex; margin:0; overflow:hidden; white-space:nowrap; font:.85rem ui-monospace,"SF Mono",Menlo,Consolas,monospace; color:var(--coral-light); }
  .mark > span { white-space:pre; }
  .mark .fill { overflow:hidden; }
  h1 { margin:0; font-size:clamp(1.7rem,6vw,2.4rem); line-height:1.08; font-weight:800; letter-spacing:-.025em; color:#fff; text-wrap:balance; }
  .lead { margin:0; color:var(--on-navy); }
  main { flex:1; }
  main .wrap { display:flex; flex-direction:column; gap:.9rem; padding-block:1.25rem 2rem; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:1rem; padding:1.1rem; display:flex; flex-direction:column; gap:.7rem; }
  .card p { margin:0; }
  .meta { display:flex; flex-wrap:wrap; gap:.4rem; }
  .chip { font-size:.78rem; font-weight:700; border:1px solid var(--line); border-radius:999px; padding:.15rem .6rem; color:var(--muted); }
  .chip.burn { color:var(--red); }
  .k { font:.8rem ui-monospace,"SF Mono",Menlo,Consolas,monospace; color:var(--red); }
  .title { font-size:1.3rem; font-weight:800; color:var(--ink); line-height:1.2; word-break:break-word; }
  button, .btn { font:inherit; font-weight:700; display:flex; align-items:center; justify-content:center; width:100%; min-height:2.875rem; padding:.6rem 1rem; border-radius:.75rem; border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; text-decoration:none; }
  button.primary { background:var(--pri-bg); border-color:var(--pri-bg); color:var(--pri-fg); }
  button:disabled { opacity:.55; cursor:default; }
  button:focus-visible, a:focus-visible { outline:3px solid var(--red); outline-offset:3px; }
  .sm { font-size:.85rem; color:var(--muted); }
  ol { margin:0; padding-left:1.2rem; font-size:.9rem; }
  textarea { width:100%; height:9rem; resize:vertical; font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; border:1px solid var(--line); border-radius:.75rem; padding:.6rem; background:var(--bg); color:var(--fg); }
  .err { color:var(--red); font-weight:700; }
  .ok { color:var(--ok); }
  .hide { display:none !important; }
  a { color:var(--ink); }
  .foot { background:var(--navy); color:var(--on-navy-muted); font-size:.85rem; padding-bottom:env(safe-area-inset-bottom); }
  .foot .wrap { display:flex; flex-wrap:wrap; gap:.25rem 1.25rem; align-items:center; padding-block:.9rem; }
  .foot .wrap > span { flex:1 1 100%; }
  @media (min-width:36rem) { .foot .wrap > span { flex-basis:12rem; } }
  .foot a { color:#fff; display:inline-flex; align-items:center; min-height:2.75rem; }
</style>`

function head(base: string, pageTitle: string): string {
  return `<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<meta name="referrer" content="no-referrer" />
<meta name="color-scheme" content="light dark" />
<meta name="theme-color" content="#1b2c56" />
<title>${pageTitle}</title>
${ogMeta(base, OG_TITLE, OG_DESCRIPTION)}
${STYLE}`
}

function top(heading: string, lead: string, ids = false): string {
  return `<header class="top"><div class="wrap">
  <a class="brand" href="https://resqdocs.app/" rel="noopener"><img src="${SIGNET}" alt="" /><span>Res<span class="q">Q</span>Docs</span></a>
  <p class="mark" aria-hidden="true"><span># </span><span>Transfer</span><span class="fill"> ================================================================================</span></p>
  <h1${ids ? ' id="htitle"' : ''}>${heading}</h1>
  <p class="lead"${ids ? ' id="hlead"' : ''}>${lead}</p>
</div></header>`
}

const FOOT = `<footer class="foot"><div class="wrap">
  <span>ResQDocs · Open Source · verschlüsselter Transfer</span>
  <a href="https://resqdocs.app/impressum/" rel="noopener">Impressum</a>
  <a href="https://resqdocs.app/datenschutz/" rel="noopener">Datenschutz</a>
</div></footer>`

/** Die vollständige Empfangsseite. Theme-bewusst (hell/dunkel), mobil zuerst, keine externen Requests
 *  (CSP unten blockt alles außer same-origin GET). Der empfangene Inhalt wird IMMER via textContent gesetzt
 *  (nie innerHTML) -> ein manipulierter Titel kann kein Script einschleusen. */
export function receiverHtml(base: string): string {
  return `<!doctype html>
<html lang="de">
${head(base, 'ResQDocs — Vorlage empfangen')}
<!-- Strenge CSP: keine externen Requests möglich (nur same-origin fetch), Inline-JS/CSS erlaubt. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'" />
</head>
<body>
${top('Vorlage empfangen', 'Verschlüsselt geteilt. Der Schlüssel steckt nur in diesem Link und wurde nie an unseren Server gesendet.', true)}
<main><div class="wrap">

  <div id="nolink" class="hide"><div class="card">
    <p>Ein gültiger Link enthält den Schlüssel im Teil <b>nach dem #</b>. Öffne den vollständigen Link, den du erhalten hast, oder gib den Code in der ResQDocs-App unter „Empfangen“ ein.</p>
  </div></div>

  <div id="ready" class="hide">
      <div class="meta hide" style="margin-bottom:.9rem" id="metaRow"><span class="chip burn hide" id="burnChip">1× lesen</span><span class="chip hide" id="ttlChip"></span></div>
    <div class="card" id="appRow" style="margin-bottom:.9rem">
      <button id="appBtn" class="primary">In der ResQDocs-App öffnen</button>
      <p class="sm">Die App fragt vor dem Übernehmen nach. Dafür muss die aktuelle ResQDocs-App auf diesem Gerät installiert sein.</p>
    </div>
    <div class="card">
      <p class="sm" id="fetchLead"><b>Keine App auf diesem Gerät?</b></p>
      <button id="fetchBtn">Im Browser abrufen</button>
      <p class="sm">Bei „1× lesen“ wird der Inhalt nach diesem Abruf auf dem Server gelöscht.</p>
    </div>
    <p class="sm" style="margin:.9rem 0 0">Noch kein ResQDocs? <a href="https://resqdocs.app/" rel="noopener">App laden</a></p>
  </div>

  <div id="loading" class="hide"><div class="card"><p>Wird abgerufen und entschlüsselt …</p></div></div>

  <div id="error" class="hide"><div class="card">
    <p class="err" id="errMsg"></p>
    <p class="sm">Bitte die Person, die den Link geschickt hat, um einen neuen. Bei Codes auf Groß- und Kleinschreibung achten.</p>
  </div></div>

  <div id="result" class="hide">
    <div class="card">
      <span class="k" id="kind"></span>
      <div class="title" id="rtitle"></div>
      <button id="dlBtn" class="primary">Als Datei herunterladen</button>
      <button id="editorBtn">Im Online-Editor öffnen</button>
      <button id="copyBtn">Kopieren</button>
      <p class="sm">Beim Öffnen im Editor wird der Inhalt in die Zwischenablage kopiert, damit du ihn dort unter „Import“ einfügen kannst.</p>
    </div>
    <div class="card" style="margin-top:.9rem">
      <p class="sm"><b>So übernimmst du sie in der App</b></p>
      <p class="sm" id="howto"></p>
      <textarea id="raw" readonly aria-label="Empfangener Inhalt"></textarea>
    </div>
  </div>

  <p class="sm">Der Inhalt wird ausschließlich in deinem Browser entschlüsselt. <b>Der Link ist das Geheimnis</b>: teile ihn nur mit vertrauten Personen.</p>
</div></main>
${FOOT}

<script>
var RQD = ${RECEIVER_CORE}();
function $(id){ return document.getElementById(id); }
var EDITOR = RQD.editorFor(location.search);
var EDITOR_URL = EDITOR.url;
$('editorBtn').textContent = EDITOR.label;
var HEAD = {
  nolink:  ['Vorlagen-Transfer', 'Verschlüsselte Übergabe von Vorlagen, Abschnitten und Textbausteinen zwischen Geräten.'],
  ready:   ['Eine Vorlage wartet auf dich', 'Verschlüsselt geteilt. Der Schlüssel steckt nur in diesem Link und wurde nie an unseren Server gesendet.'],
  loading: ['Wird geöffnet …', 'Der Inhalt wird abgerufen und in deinem Browser entschlüsselt.'],
  error:   ['Das hat nicht geklappt', 'Der Link konnte nicht geöffnet werden.'],
  gone:    ['Dieser Link ist nicht mehr gültig', 'Abgelaufen, schon übernommen oder unvollständig.'],
  result:  ['Vorlage empfangen', 'Entschlüsselt, nur in deinem Browser.']
};
function setHead(key){ $('htitle').textContent = HEAD[key][0]; $('hlead').textContent = HEAD[key][1]; }
function show(id, headKey){ ['nolink','ready','loading','error','result'].forEach(function(s){ $(s).className = (s===id)?'':'hide'; }); setHead(headKey || id); }
function fail(msg, gone){ $('errMsg').textContent = msg; show('error', gone ? 'gone' : 'error'); }

var KIND = {
  'resqdocs-protocol': { label: 'Vorlage', slug: 'vorlage', section: 'Vorlagen' },
  'resqdocs-block':    { label: 'Baustein', slug: 'baustein', section: 'Bausteine' },
  'resqdocs-snippet':  { label: 'Textbaustein', slug: 'textbaustein', section: 'Textbausteine' }
};
var lastText = '';
var lastSlug = 'vorlage';

function present(text){
  lastText = text;
  var kind = null, title = '';
  try {
    var obj = JSON.parse(text);
    kind = KIND[obj && obj.schema] || null;
    var t = (obj && obj.tree && obj.tree.title) || (obj && obj.snippet && obj.snippet.title);
    title = typeof t === 'string' ? t : ''; // Nicht-String-Titel nicht als „[object Object]" anzeigen
  } catch (e) { /* kein JSON -> generisch anzeigen */ }
  var k = kind || { label: 'Inhalt', slug: 'vorlage', section: 'Vorlagen' };
  lastSlug = k.slug;
  $('kind').textContent = '# ' + k.label;
  $('rtitle').textContent = title || '(ohne Titel)';
  $('raw').value = text;
  $('howto').textContent = 'ResQDocs-App öffnen → Bereich „' + k.section + '" → Import → die heruntergeladene Datei wählen. Oder im Online-Editor auf „Import" und den Inhalt einfügen.';
  show('result');
  $('htitle').textContent = k.label + ' empfangen';
}

var inFlight = false;
async function run(){
  if (inFlight) return; // Re-Entry-Guard: kein Doppel-Abruf (bei „1× lesen" wuerde der zweite den Burn treffen)
  var parsed = RQD.parseFragment(location.hash || '');
  if (!parsed) { fail('Kein gültiger Transfer-Link.'); return; }
  inFlight = true;
  $('fetchBtn').disabled = true;
  show('loading');
  var ctrl = new AbortController();
  var timer = setTimeout(function(){ ctrl.abort(); }, 15000); // haengendes Netz -> nicht ewig „Wird abgerufen …"
  try {
    var res;
    try { res = await fetch('/v1/blob/' + parsed.id, { signal: ctrl.signal }); }
    catch (e) { fail('Der Transfer-Dienst ist nicht erreichbar (oder hat zu lange gebraucht).'); return; }
    if (res.status === 404) { fail('Der Transfer ist abgelaufen oder wurde bereits geöffnet.', true); return; }
    if (res.status === 409) { fail('Der Link wird gerade auf einem anderen Gerät geöffnet. In ein paar Minuten noch einmal versuchen.'); return; }
    if (!res.ok) { fail('Der Transfer konnte nicht geladen werden.'); return; }
    var bytes;
    try { bytes = new Uint8Array(await res.arrayBuffer()); }
    catch (e) { fail('Der Transfer konnte nicht geladen werden.'); return; }
    var text;
    try { text = await RQD.decrypt(bytes, parsed.key); }
    catch (e) { fail('Der Link ist unvollständig oder beschädigt (Entschlüsselung fehlgeschlagen).'); return; }
    present(text);
  } finally {
    clearTimeout(timer);
    inFlight = false;
    $('fetchBtn').disabled = false;
  }
}

// Angaben zum Link (1× lesen, Ablauf) ohne den Inhalt abzurufen: verbraucht nichts. Abgelaufen -> gleich sagen.
function ttlText(sec){
  if (sec < 3600) return 'läuft in ' + Math.max(1, Math.round(sec / 60)) + ' min ab';
  if (sec < 172800) return 'läuft in ' + Math.round(sec / 3600) + ' h ab';
  return 'läuft in ' + Math.round(sec / 86400) + ' Tagen ab';
}
async function loadInfo(id){
  try {
    var res = await fetch('/v1/blob/' + id + '/info');
    if (res.status === 404) { fail('Der Transfer ist abgelaufen oder wurde bereits geöffnet.', true); return; }
    if (!res.ok) return;
    var info = await res.json();
    if (info.burn) $('burnChip').className = 'chip burn';
    if (typeof info.expiresIn === 'number') { $('ttlChip').textContent = ttlText(info.expiresIn); $('ttlChip').className = 'chip'; }
    $('metaRow').className = 'meta'; // Abstand steht im style-Attribut
  } catch (e) { /* ohne Angaben weiter */ }
}

$('fetchBtn').addEventListener('click', function(){ void run(); });
// Uebergabe an die App ueber ihr eigenes Schema: ein Tipp auf einen Link DERSELBEN Seite loest keine
// Universal-/App-Link-Zuordnung aus. Das Fragment geht unveraendert mit; abgerufen wird hier nichts
// (die App ruft erst nach Bestaetigung ab -> „1x lesen" bleibt unverbraucht).
var APP_SCHEME_URL = 'resqdocs://receive';
var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
$('appBtn').addEventListener('click', function(){
  var parsed = RQD.parseFragment(location.hash || '');
  if (parsed) location.href = APP_SCHEME_URL + '#' + parsed.id + '.' + parsed.key;
});
$('dlBtn').addEventListener('click', function(){
  var blob = new Blob([lastText], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'resqdocs-' + lastSlug + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
});
$('copyBtn').addEventListener('click', async function(){
  try { await navigator.clipboard.writeText(lastText); $('copyBtn').textContent = 'Kopiert'; setTimeout(function(){ $('copyBtn').textContent='Kopieren'; }, 2000); }
  catch (e) { $('raw').focus(); $('raw').select(); }
});
$('editorBtn').addEventListener('click', function(){
  // window.open SYNCHRON zuerst (vor jedem await) — sonst verwirft iOS-Safari das Popup, weil das
  // User-Aktivierungs-Token an der ersten await-Grenze verbraucht ist. Clipboard danach (best effort).
  window.open(EDITOR_URL, '_blank', 'noopener');
  try { navigator.clipboard.writeText(lastText).catch(function(){}); } catch (e) { /* Nutzer kann manuell kopieren */ }
});

// Beim Laden NICHT automatisch abrufen (Burn-Schutz): nur den passenden Zustand zeigen.
var start = RQD.parseFragment(location.hash || '');
if (start) {
  if (isMobile) { $('fetchBtn').className = ''; }
  else {
    // Ohne App auf dem Gerät: Abruf im Browser ist der Hauptweg; die App-Karte zeigt nur die Angaben.
    $('appRow').className = 'hide';
    $('fetchBtn').className = 'primary'; $('fetchLead').className = 'hide';
  }
  show('ready');
  void loadInfo(start.id);
} else show('nolink');
</script>
</body>
</html>`
}

/** Seite für abgelaufene oder unbekannte Kurzlinks (resq.li/<code>). Ohne Skript; dieselbe Gestaltung. */
export function goneHtml(base: string): string {
  return `<!doctype html>
<html lang="de">
${head(base, 'ResQDocs — Link abgelaufen')}
</head>
<body>
${top('Dieser Link ist nicht mehr gültig', 'Abgelaufen, schon übernommen oder falsch abgetippt.')}
<main><div class="wrap">
  <div class="card">
    <p>Bitte die Person, die ihn geschickt hat, um einen neuen Link. Bei Codes auf Groß- und Kleinschreibung achten.</p>
    <a class="btn" href="https://resqdocs.app/" rel="noopener">Zu resqdocs.app</a>
  </div>
</div></main>
${FOOT}
</body>
</html>`
}
