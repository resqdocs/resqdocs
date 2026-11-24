// Ohne verbundene Bridge zeigt der Einsatz unten keinen gesperrten Hauptknopf „An Zielgerät senden“, sondern
// „Mit ResQDocs-Bridge verbinden“; ein Tipp öffnet ein schlankes Fenster: drei Schritte als Symbole (einstecken,
// WLAN, fertig) und der Hauptknopf „Mit Bridge-WLAN verbinden“, mit dem das Handy dem WLAN der Bridge direkt
// beitritt. WLAN-Name und Passwort stehen unter „Von Hand verbinden“, von dort „Weitere Einstellungen“ →
// Einstellungen → Bridge. Der Protokolltext soll die App nur über die Bridge verlassen, deshalb gibt es an
// dieser Stelle bewusst keinen Ersatz wie Kopieren.
// Struktur-Test (kein DOM-Setup für .vue-Dateien in der App).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bridgeConnectRequest, bridgePageRequest, openBridgeConnect, openBridgePage } from '../../composables/useBridgePage.ts'

const read = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const einsatz = read('./EinsatzView.vue')

test('ohne Bridge: Knopf „Mit ResQDocs-Bridge verbinden“ statt gesperrtem Senden', () => {
  const at = einsatz.indexOf('data-connect-bridge')
  assert.ok(at > 0, 'Knopf ist markiert')
  const tag = einsatz.slice(einsatz.lastIndexOf('<button', at), einsatz.indexOf('</button>', at))
  assert.match(tag, /v-if="reachable === false && !sending && !typing\.busy\.value"/, 'nur wenn sicher nicht verbunden')
  assert.match(tag, /@click="openBridgeConnect"/, 'öffnet die kurze Anleitung')
  assert.match(tag, /Mit ResQDocs-Bridge verbinden/)
  assert.doesNotMatch(tag, /:disabled/, 'der Weg zur Bridge ist nie gesperrt')
  assert.doesNotMatch(einsatz, /Bridge nicht verbunden — Senden gesperrt/, "kein toter Hinweis mehr")
})

test('kein Kopieren als Ersatz-Hauptaktion im Einsatz', () => {
  const unten = einsatz.slice(einsatz.indexOf('Untere Aktionen'))
  assert.doesNotMatch(unten, /Protokolltext kopieren/)
})

test('„Weitere Einstellungen“ führt in die Einstellungen und dort auf die Bridge-Seite', () => {
  const before = bridgePageRequest.value
  openBridgePage()
  assert.equal(bridgePageRequest.value, before + 1)
  const app = read('../../App.vue')
  assert.match(app, /watch\(bridgePageRequest, \(\) => \{[\s\S]*?selectTab\('einstellungen'\)/)
  const settings = read('../settings/SettingsTab.vue')
  assert.match(settings, /watch\(bridgePageRequest, \(\) => \{[^}]*page\.value = 'device'/)
})

const connect = read('../BridgeConnectDialog.vue')

test('Fenster: drei Schritte als Symbole, schließt sich bei Verbindung von selbst', () => {
  const before = bridgeConnectRequest.value
  openBridgeConnect()
  assert.equal(bridgeConnectRequest.value, before + 1)
  assert.match(connect, /watch\(bridgeConnectRequest/)
  const steps = connect.slice(connect.indexOf('data-bridge-steps'), connect.indexOf('</ol>'))
  assert.equal((steps.match(/<li\b/g) ?? []).length, 3, 'drei Schritte')
  assert.equal((steps.match(/<svg\b/g) ?? []).length, 3, 'jeder Schritt hat ein Symbol')
  for (const step of ['Bridge einstecken', 'WLAN verbinden', 'Fertig']) assert.ok(steps.includes(step), step)
  // Je Schritt höchstens eine kurze Zeile, kein Fließtext darunter.
  for (const p of steps.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) ?? []) assert.ok(p.replace(/<[^>]+>|\{\{[^}]*\}\}/g, '').trim().length <= 20, p)
  assert.match(steps, /M8\.75 16\.75h6\.5v5\.5h-6\.5z/, 'Stick-Icon der Kopfleiste')
  assert.ok(read('../../App.vue').includes('M8.75 16.75h6.5v5.5h-6.5z'), 'dasselbe Icon wie in der Kopfleiste')
  // Sobald die Bridge erreichbar ist: kurz „Verbunden“ zeigen, dann schließt das Fenster.
  assert.match(connect, /watch\(reachable, \(ok\) => \{\s*if \(ok === true && dialog\.value\?\.open\) closeSoon\(\)/)
  assert.match(connect, /function closeSoon\(\): void \{[\s\S]*?phase\.value = 'connected'[\s\S]*?setTimeout\(\(\) => dialog\.value\?\.close\(\), \d{3}\)/)
  assert.match(connect, /@click="moreSettings"[^>]*>Weitere Einstellungen</)
  assert.match(read('../../App.vue'), /<BridgeConnectDialog \/>/)
})

test('Hauptknopf „Mit Bridge-WLAN verbinden“ löst den Beitritt aus, der Zustand ist sichtbar', () => {
  const at = connect.indexOf('data-bridge-join')
  const btn = connect.slice(connect.lastIndexOf('<button', at), connect.indexOf('</button>', at))
  assert.match(btn, /@click="join"/)
  assert.match(btn, /Mit Bridge-WLAN verbinden/)
  assert.match(btn, /btn-primary/)
  assert.match(btn, /min-h-12/, 'Trefferfläche')
  assert.match(connect, /const result = await joinBridgeWifi\(\)/)
  for (const state of ['Wird verbunden …', 'Verbunden', 'Nicht verbunden.']) assert.ok(connect.includes(state), state)
  assert.match(connect, /role="status" aria-live="polite" data-bridge-state/, 'Zustand auch für Vorleser')
  // Kann das Gerät nicht direkt beitreten, gibt es den Knopf nicht und „Von Hand verbinden“ ist offen.
  assert.match(btn, /v-if="canJoin"/)
  assert.match(connect, /const canJoin = computed\(\(\) => supported\.value !== false\)/)
  assert.match(connect, /manualOpen\.value = !canJoin\.value/)
  assert.match(connect, /result\.status === 'unsupported'\) \{\s*manualOpen\.value = true/)
})

test('WLAN-Name und Passwort bleiben erreichbar: „Von Hand verbinden“ zum Aufklappen', () => {
  const manual = connect.slice(connect.indexOf('<details'), connect.indexOf('</details>'))
  assert.match(manual, /<summary[^>]*min-h-11[^>]*>\s*Von Hand verbinden/)
  assert.match(manual, /ResQDocs-…/)
  assert.match(manual, /<dd><BridgePasswordCopy \/><\/dd>/, 'Passwort: antippen kopiert, bleibt markierbar')
  assert.match(manual, /data-open-wifi/)
  assert.match(manual, /data-bridge-recheck[^>]*@click="recheck"[^>]*>[\s\S]*?Verbindung prüfen/)
})

test('Fenster bleibt schlank und im Stil der App', () => {
  const template = connect.slice(connect.indexOf('<template>'))
  const text = template.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\{\{[^}]*\}\}/g, ' ').replace(/\s+/g, ' ').trim()
  assert.ok(text.length < 330, `sichtbarer Text: ${text.length} Zeichen`)
  assert.doesNotMatch(template, /[✕✓✔→←▸▾ⓘ]|\p{Extended_Pictographic}/u, 'Symbole als SVG, keine Zeichen-Icons')
  const stacks = [...template.matchAll(/class="([^"]*)"/g)].map((m) => m[1]).filter((c) => /(^|\s)flex-col(\s|$)/.test(c) && /(^|\s)gap-(\d|\[)/.test(c))
  assert.deepEqual(stacks, [], 'vertikale Stapel mit space-y-* (WebKit-Abstandsfehler)')
  assert.doesNotMatch(connect, /<style/, 'Farben aus dem Thema, keine eigenen Stile')
  assert.doesNotMatch(connect, /#[0-9a-f]{3,8}\b/i, 'keine festen Farben (dunkles Thema)')
  assert.doesNotMatch(connect, /clipboard|Share\.share|navigator\.share/i, 'kein Kopieren oder Teilen von Inhalten im Fenster selbst')
  for (const m of template.matchAll(/<button\b[^>]*?\sclass="([^"]*)"/g)) assert.match(m[1], /min-h-1[12]/, `Trefferfläche: ${m[1]}`)
  assert.match(template, /aria-label="Mit ResQDocs-Bridge verbinden"/)
  assert.match(template, /aria-label="Schließen"/)
  assert.match(connect, /\(canJoin\.value \? joinButton\.value : recheckButton\.value\)\?\.focus\(/, 'Fokus beim Öffnen auf der Hauptaktion')
})

test('Einstellungen → Bridge: derselbe Beitritts-Knopf, dazu „Bridge-WLAN trennen“', () => {
  const device = read('../settings/DeviceSection.vue')
  const at = device.indexOf('data-bridge-join')
  const btn = device.slice(device.lastIndexOf('<button', at), device.indexOf('</button>', at))
  assert.match(btn, /@click="onJoinWifi"/)
  assert.match(btn, /Mit Bridge-WLAN verbinden/)
  assert.match(btn, /min-h-11/)
  assert.match(device, /const r = await joinBridgeWifi\(\)/)
  assert.match(device, /data-bridge-leave\s+@click="onLeaveWifi"\s*>Bridge-WLAN trennen</)
  // Auf Android läuft der Netzverkehr der App über das Bridge-WLAN, solange sie es hält: Hinweis und Ausweg.
  assert.match(device, /wifiHeld\.value && \(platform === 'android' \|\| bridgeReachable\.value === true\)/)
  // Der Hinweis steht auf beiden Plattformen, sobald die Verbindung zur Bridge steht, und schon im Fenster davor.
  assert.match(device, /const showNoInternet = computed\(\(\) => showLeave\.value \|\| bridgeReachable\.value === true\)/)
  assert.match(device, /v-if="showNoInternet"[^>]*>\s*Solange die App mit dem Bridge-WLAN verbunden ist, hat sie kein Internet\./)
  const note = connect.match(/<p[^>]*data-bridge-no-internet[^>]*>([^<]*)</)
  assert.ok(note, 'Hinweis im Fenster')
  assert.equal(note[1], 'Solange verbunden, hat die App kein Internet.')
  assert.doesNotMatch(note[0], /v-if|platform/, 'nicht nach Plattform unterschieden')
})

test('WLAN-Einstellungen öffnen nur auf Android (iOS erlaubt den Sprung nicht)', () => {
  const btn = connect.slice(connect.lastIndexOf('<button', connect.indexOf('data-open-wifi')), connect.indexOf('</button>', connect.indexOf('data-open-wifi')))
  assert.match(btn, /v-if="platform === 'android'"/)
  assert.doesNotMatch(connect, /App-Prefs|app-prefs/i, 'kein privates Einstellungen-Schema')
})

test('Passwort antippen kopiert nur das öffentliche WLAN-Passwort, nie etwas anderes', () => {
  const pw = read('../BridgePasswordCopy.vue')
  // Genau ein Schreibzugriff auf die Zwischenablage, und zwar mit der festen Konstante.
  assert.deepEqual(pw.match(/clipboard\.writeText\(([^)]*)\)/g), ['clipboard.writeText(BRIDGE_WIFI_PASSWORD)'])
  assert.doesNotMatch(pw, /defineProps|defineModel|useSlots|<slot/, 'nimmt keinen Text von außen an')
  assert.doesNotMatch(pw, /Share\.share|navigator\.share|readText/, 'kein Teilen, kein Lesen der Zwischenablage')
  const btn = pw.slice(pw.indexOf('<template>')).match(/<button[^>]*>/)?.[0] ?? ''
  assert.match(btn, /aria-label="Passwort kopieren"/)
  assert.match(btn, /class="[^"]*\bmin-h-11\b/, 'Trefferfläche')
  assert.match(pw, /<code class="select-text font-mono">\{\{ BRIDGE_WIFI_PASSWORD \}\}<\/code>/, 'bleibt markierbar')
  assert.match(pw, /role="status" aria-live="polite"/, 'Rückmeldung „Kopiert“ wird vorgelesen')
  // Beide Stellen, an denen das Passwort steht, nutzen dasselbe Bauteil.
  assert.match(read('../settings/DeviceSection.vue'), /<dd><BridgePasswordCopy \/><\/dd>/)
})
