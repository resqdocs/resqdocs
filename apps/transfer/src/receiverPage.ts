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
  return { fromB64url: fromB64url, parseFragment: parseFragment, decrypt: decrypt };
})`

// Die vollstaendige Seite. Theme-bewusst (hell/dunkel), mobil-first, keine externen Requests
// (CSP unten blockt alles ausser same-origin GET). Der empfangene Inhalt wird IMMER via textContent
// gesetzt (nie innerHTML) -> ein manipulierter Titel kann kein Script einschleusen.
export const RECEIVER_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex, nofollow" />
<meta name="referrer" content="no-referrer" />
<meta name="color-scheme" content="light dark" />
<title>ResQDocs — Vorlage empfangen</title>
<style>
  :root { color-scheme: light dark; --bg:#f4f6f8; --card:#fff; --fg:#1c2530; --muted:#5b6774; --line:#dfe4ea; --brand:#c0392b; --ok:#1f8a4c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --card:#171f28; --fg:#e7edf3; --muted:#93a1af; --line:#2a343f; --brand:#e05a4b; --ok:#3fbf76; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:env(safe-area-inset-top) 16px 32px; -webkit-text-size-adjust:100%; }
  .wrap { max-width:560px; margin:32px auto 0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:20px; }
  h1 { font-size:1.15rem; margin:0 0 4px; }
  .sub { color:var(--muted); font-size:.9rem; margin:0 0 18px; }
  .kind { display:inline-block; font-size:.8rem; font-weight:600; color:var(--brand); border:1px solid var(--line); border-radius:999px; padding:2px 10px; margin-bottom:8px; }
  .title { font-size:1.25rem; font-weight:700; margin:2px 0 14px; word-break:break-word; }
  button { font:inherit; font-weight:600; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--fg); padding:11px 14px; cursor:pointer; min-height:44px; }
  button.primary { background:var(--brand); border-color:var(--brand); color:#fff; }
  button:disabled { opacity:.55; cursor:default; }
  .row { display:flex; flex-wrap:wrap; gap:8px; margin:4px 0 14px; }
  .row button { flex:1 1 auto; }
  textarea { width:100%; height:150px; resize:vertical; font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--bg); color:var(--fg); }
  ol { margin:8px 0 0; padding-left:20px; color:var(--muted); font-size:.9rem; }
  ol li { margin:4px 0; }
  .err { color:var(--brand); font-weight:600; }
  .foot { color:var(--muted); font-size:.8rem; margin-top:18px; line-height:1.45; }
  .hide { display:none; }
  .ok { color:var(--ok); }
</style>
<!-- Strenge CSP: keine externen Requests moeglich (nur same-origin fetch), Inline-JS/CSS erlaubt. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'" />
</head>
<body>
<div class="wrap"><div class="card">
  <h1>ResQDocs — Vorlage empfangen</h1>
  <p class="sub">Verschlüsselter Kurzzeit-Transfer. Der Schlüssel steht nur in diesem Link und wurde nie an unseren Server gesendet.</p>

  <div id="nolink" class="hide">
    <p>Dies ist der ResQDocs-Vorlagen-Transfer. Ein gültiger Link enthält den Schlüssel im Teil <b>nach dem #</b>. Öffne den vollständigen Link, den du erhalten hast.</p>
  </div>

  <div id="ready" class="hide">
    <p>Ein Transfer wartet auf dich.</p>
    <div class="row"><button id="fetchBtn" class="primary">Vorlage abrufen</button></div>
    <p class="foot">Hinweis: Bei der Einstellung „1× lesen" wird der Inhalt nach diesem Abruf auf dem Server gelöscht.</p>
  </div>

  <div id="loading" class="hide"><p>Wird abgerufen und entschlüsselt …</p></div>

  <div id="error" class="hide"><p class="err" id="errMsg"></p></div>

  <div id="result" class="hide">
    <span class="kind" id="kind"></span>
    <div class="title" id="rtitle"></div>
    <div class="row">
      <button id="dlBtn" class="primary">Als Datei herunterladen</button>
      <button id="copyBtn">Kopieren</button>
    </div>
    <p class="foot" id="howto"></p>
    <div class="row"><button id="editorBtn">Im Online-Editor öffnen</button></div>
    <p class="foot">Beim Öffnen wird der Inhalt in die Zwischenablage kopiert, damit du ihn im Editor unter „Import" einfügen kannst.</p>
    <textarea id="raw" readonly aria-label="Empfangener Inhalt"></textarea>
  </div>

  <p class="foot">Der Inhalt wurde ausschließlich in deinem Browser entschlüsselt. <b>Der Link ist das Geheimnis</b> — teile ihn nur mit vertrauten Personen.</p>
</div></div>

<script>
var RQD = ${RECEIVER_CORE}();
var EDITOR_URL = 'https://editor.resqdocs.app';
function $(id){ return document.getElementById(id); }
function show(id){ ['nolink','ready','loading','error','result'].forEach(function(s){ $(s).className = (s===id)?'':'hide'; }); }
function fail(msg){ $('errMsg').textContent = msg; show('error'); }

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
  $('kind').textContent = k.label + ' empfangen';
  $('rtitle').textContent = title || '(ohne Titel)';
  $('raw').value = text;
  $('howto').textContent = 'So übernimmst du die ' + k.label + ': ResQDocs-App öffnen → Bereich „' + k.section + '" → Import → die heruntergeladene Datei wählen. Oder im Online-Editor auf „Import" und den Inhalt einfügen.';
  show('result');
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
    if (res.status === 404) { fail('Der Transfer ist abgelaufen oder wurde bereits geöffnet.'); return; }
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
  }
}

$('fetchBtn').addEventListener('click', function(){ void run(); });
$('dlBtn').addEventListener('click', function(){
  var blob = new Blob([lastText], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'resqdocs-' + lastSlug + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
});
$('copyBtn').addEventListener('click', async function(){
  try { await navigator.clipboard.writeText(lastText); $('copyBtn').textContent = 'Kopiert'; $('copyBtn').className='ok'; setTimeout(function(){ $('copyBtn').textContent='Kopieren'; $('copyBtn').className=''; }, 2000); }
  catch (e) { $('raw').focus(); $('raw').select(); }
});
$('editorBtn').addEventListener('click', function(){
  // window.open SYNCHRON zuerst (vor jedem await) — sonst verwirft iOS-Safari das Popup, weil das
  // User-Aktivierungs-Token an der ersten await-Grenze verbraucht ist. Clipboard danach (best effort).
  window.open(EDITOR_URL, '_blank', 'noopener');
  // clipboard.writeText kann in unsicherem Kontext SYNCHRON werfen (nicht nur rejecten) -> try umschliesst,
  // damit nach dem bereits geoeffneten Popup keine unhandled Exception fliegt. Auf https ist es ohnehin da.
  try { navigator.clipboard.writeText(lastText).catch(function(){}); } catch (e) { /* Nutzer kann manuell kopieren */ }
});

// Beim Laden NICHT automatisch abrufen (Burn-Schutz): nur den passenden Zustand zeigen.
if (RQD.parseFragment(location.hash || '')) show('ready'); else show('nolink');
</script>
</body>
</html>`
