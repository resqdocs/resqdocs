// check-pzn-live.mjs - BEWUSSTER Live-Test gegen die oeffentliche PZN-Datenquelle.
//
// NICHT Teil der Unit-Tests: die normale CI bleibt offline/deterministisch
// (Unit-Tests nutzen Fake-URLs). Dieser Test braucht Internet und ruft die echte
// oeffentliche Datenbank ab, um zu pruefen, dass Tester sie verwenden koennen.
//
// Ausfuehren:  npm run test:pzn-live   (oder: node --experimental-strip-types scripts/check-pzn-live.mjs)
//
// Quelle = die in der App hinterlegte Konstante (Single Source of Truth), damit
// hier keine zweite URL gepflegt werden muss und private Domains auffallen.
import { PZN_MANIFEST_URL } from '../src/medications/useMedicationLookup.ts'

const ok = (b, msg) => { if (!b) { console.error(`FEHLER: ${msg}`); process.exitCode = 1; return false } console.log(`ok    ${msg}`); return true }

const u = new URL(PZN_MANIFEST_URL)
// 8. Keine privaten URLs / internen Domains: positiv geprueft - nur die
// oeffentliche Projektdomain ueber HTTPS ist zulaessig (schliesst interne
// Hosts und Klartext automatisch aus).
ok(u.protocol === 'https:', `HTTPS-URL (${u.protocol})`)
ok(u.hostname === 'resqdocs.app', `oeffentliche Projektdomain (${u.hostname})`)
ok(!u.port && !u.username, 'kein Port/keine Zugangsdaten in der URL')

const get = async (url) => {
  const res = await fetch(url, { redirect: 'follow' })
  return { status: res.status, text: await res.text() }
}

try {
  // 1.+2. Manifest erreichbar, Status erfolgreich.
  const m = await get(PZN_MANIFEST_URL)
  ok(m.status >= 200 && m.status < 300, `Manifest erreichbar (HTTP ${m.status})`)
  const manifest = JSON.parse(m.text)

  // 3. Daten-Datei benannt. 7. Struktur passt zur App-Erwartung.
  ok(typeof manifest.file === 'string' && manifest.file.length > 0, `Manifest nennt Daten-Datei (${manifest.file})`)
  ok(typeof manifest.version === 'number', `Manifest hat numerische version (${manifest.version})`)
  // 4. sha256 vorhanden (die App validiert ihn noch NICHT - siehe Folge-Hardening).
  const hasSha = typeof manifest.sha256 === 'string' && manifest.sha256.length === 64
  ok(hasSha, `Manifest enthaelt sha256 (${hasSha ? 'ja' : 'nein'})`)

  // 5. Referenzierte Daten-Datei erreichbar (relativ zum Manifest - wie die App).
  const dataUrl = PZN_MANIFEST_URL.replace(/[^/]*$/, '') + manifest.file
  const d = await get(dataUrl)
  ok(d.status >= 200 && d.status < 300, `Daten-Datei erreichbar (HTTP ${d.status})`)
  const data = JSON.parse(d.text)

  // 6. Verwertbare Eintraege. 7. Struktur (entries als PZN->Name).
  const entries = data.entries && typeof data.entries === 'object' ? data.entries : null
  ok(entries !== null, 'Daten-Datei hat ein entries-Objekt')
  const count = entries ? Object.keys(entries).length : 0
  ok(count > 0, `Daten-Datei enthaelt Eintraege (${count})`)

  console.log('\n--- Zusammenfassung ---')
  console.log(`Manifest erreichbar:   ja (${PZN_MANIFEST_URL})`)
  console.log(`Daten-Datei erreichbar: ja (${manifest.file})`)
  console.log(`Eintraege erkannt:      ${count}`)
  console.log(`Letzter Stand:          ${manifest.updated ?? '(nicht im Manifest)'}`)
  console.log(`SHA256 im Manifest:     ${hasSha ? 'vorhanden' : 'fehlt'} (App-seitige Validierung: noch nicht aktiv)`)
} catch (e) {
  console.error(`FEHLER: Live-Abruf fehlgeschlagen: ${e.message}`)
  process.exitCode = 1
}

if (process.exitCode) console.error('\nLive-PZN-Test: FEHLGESCHLAGEN')
else console.log('\nLive-PZN-Test: OK')
