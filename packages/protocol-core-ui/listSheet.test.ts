// Medikationsplan und Kontakte: im Einsatz eine Ergebnis-Zeile wie bei den Rechnern, die Liste in einem Fenster.
// Hält die Entscheidungen fest (Quellen: docs/sources.md, „Listen-Funktionen: Ergebnis-Zeile und Fenster“).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (f: string): string => readFileSync(join(HERE, 'components/functions', f), 'utf8')
const LISTEN = ['MedplanFunction.vue', 'AerzteFunction.vue']

test('Fenster: Vollbild am Handy, „Fertig“ oben, Eingaben gelten sofort', () => {
  const s = read('ListSheet.vue')
  const tpl = s.slice(s.indexOf('<template>'))
  assert.match(tpl, /<Teleport to="body">\s*(<!--[\s\S]*?-->\s*)?<div class="modal modal-open modal-top z-\[35\] max-sm:bg-transparent sm:modal-middle"[^>]*role="dialog" aria-modal="true" :aria-label="title" data-list-sheet/)
  assert.match(tpl, /h-\[var\(--lt-h,100dvh\)\] max-h-none w-full max-w-none translate-none[^"]*rounded-none p-0/, 'am Handy die ganze Fläche')
  // Rückfragen, Vorschläge und der Scan öffnen als weitere Fenster darüber: kein natives <dialog> in der obersten Ebene.
  assert.doesNotMatch(tpl, /<dialog/)
  // Die Zurück-Taste von Android löst „Fertig“ aus (backLayer), Esc schließt ebenfalls.
  assert.match(tpl, /data-list-sheet-done data-back-close @click="emit\('close'\)">Fertig</)
  assert.match(tpl, /@keydown\.esc\.stop="emit\('close'\)"/)
  assert.doesNotMatch(tpl, />Abbrechen</, 'kein Abbrechen: es gibt nichts zu verwerfen')
  assert.match(tpl, />Wird automatisch gespeichert</)
  // Am Handy gibt es keinen Rand zum Danebentippen; im mittigen Dialog schließt der Rand wie „Fertig“.
  assert.match(tpl, /class="modal-backdrop max-sm:hidden"/)
})

for (const f of LISTEN) {
  test(`${f}: Ergebnis-Zeile zeigt die Einträge wie im Protokolltext, ein Tipp öffnet das Fenster`, () => {
    const s = read(f)
    assert.match(s, /const ergebnis = computed\(\(\) => FUNCTION_REGISTRY\[props\.node\.functionKind\]\?\.renderBody\(caseValues\.get\(props\.node\.id\), props\.node\.config\) \?\? ''\)/)
    const zeile = s.slice(s.indexOf('data-list-open') - 600, s.indexOf('<ListSheet '))
    assert.match(zeile, /ref="opener"[\s\S]*aria-haspopup="dialog"\s+data-list-open\s+@click="openSheet"/)
    assert.match(zeile, /min-h-11 w-full/, 'Trefferfläche mindestens 44 px')
    assert.match(zeile, /<span v-if="ergebnis \|\| standardText" class="min-w-0 flex-1 whitespace-pre-line break-words text-sm">\{\{ ergebnis \|\| standardText \}\}<\/span>/, 'mehrere Einträge untereinander, nicht abgeschnitten')
    assert.match(zeile, />Noch nichts erfasst — antippen zum Eingeben</)
  })

  test(`${f}: die Liste steht nur im Fenster, die Karte hat kein eigenes „Fertig“`, () => {
    const s = read(f)
    const tpl = s.slice(s.indexOf('<template>'))
    const fenster = tpl.slice(tpl.indexOf('<ListSheet '), tpl.indexOf('</ListSheet>'))
    assert.ok(fenster.length > 500)
    assert.match(fenster, /v-for="\(r, i\) in rows"/)
    assert.match(fenster, /@click="addRow"/)
    assert.match(fenster, /@click="requestRemoveAll">Alle zurücksetzen</)
    assert.doesNotMatch(fenster, />Fertig</, 'ein „Fertig“, und zwar das des Fensters')
    assert.equal(tpl.split('v-for="(r, i) in rows"').length, 2, 'die Liste gibt es genau einmal')
    // Kein Schließen beim Verlassen des Fokus: Der Tipp auf „＋“ verschob sonst den Knopf unter dem Finger.
    assert.doesNotMatch(tpl, /@focusout|@pointerdown|@mousedown/)
  })

  test(`${f}: „Fertig“ räumt leere Zeilen auf und gibt den Fokus an die Zeile zurück`, () => {
    const s = read(f)
    const fn = s.slice(s.indexOf('function closeSheet(): void {'), s.indexOf('function addRow(): void {'))
    assert.match(fn, /caseValues\.setRows\(props\.node\.id, rows\.value\.filter\((arzt|medikament)RowHasData\)\)/, 'nur wirklich leere Zeilen fallen weg')
    assert.match(fn, /sheetOpen\.value = false/)
    assert.match(fn, /nextTick\(\(\) => opener\.value\?\.focus\(\{ preventScroll: true \}\)\)/)
  })

  test(`${f}: Löschen fragt weiter nach (Rückfrage liegt über dem Fenster)`, () => {
    const s = read(f)
    assert.match(s, /<ConfirmDialog\s+v-if="pendingRemove !== null"/)
    assert.match(s, /@click="requestRemove\(i\)">✕</)
  })
}

test('Medikationsplan: Fenster, die über der Liste liegen, hängen erst beim Öffnen am body', () => {
  // Ein immer eingehängter Teleport stünde im Dokument VOR dem Listen-Fenster und läge darunter.
  const tpl = read('MedplanFunction.vue')
  assert.doesNotMatch(tpl, /<Teleport to="body">/)
  assert.match(tpl, /<Teleport v-if="scanPickerOpen" to="body">/)
  assert.match(tpl, /<Teleport v-if="pkgScanOpen && medplanScan" to="body">/)
  assert.match(tpl, /<Teleport v-if="pendingStaerke" to="body">/)
})

test('Scan-Auswahl im Medikationsplan: Packung und Plan mit der Kamera, kein externer Scanner', () => {
  const s = read('MedplanFunction.vue')
  // „Mehrere Packungen“ ist ein Schalter im Kamerabild, kein eigener Einstieg in der Auswahl.
  assert.deepEqual([...s.matchAll(/@click="pickScan\('(\w+)'\)"/g)].map((m) => m[1]), ['package', 'plan'])
  assert.match(s, /<span>Packung scannen<\/span>\s*<span class="text-xs text-base-content\/75">Eine oder mehrere Packungen nacheinander<\/span>/)
  assert.doesNotMatch(s, /Externer Scanner|Bluetooth|bmpMode/)
  const sheet = readFileSync(join(HERE, '../../apps/pico-pwa/src/components/rebuild/MedplanReviewSheet.vue'), 'utf8')
  assert.doesNotMatch(sheet, /scannerMode|externer Scanner|Externer Scanner/)
  assert.match(sheet, /scanOpen\.value = true \/\/ die Kamera öffnet gleich/)
  // „Text einfügen“ bleibt als zweiter Weg.
  assert.match(sheet, /@click="openManual">Text einfügen</)
})

test('Ebenen: das Listen-Fenster liegt unter allem, was aus der Liste heraus öffnet', () => {
  // Gerätefund: Mit dem z-999 von daisyUI .modal lag das Prüf-Fenster nach dem Plan-Scan (z-40) unsichtbar hinter
  // der Liste; zu sehen war weiter „Noch keine Medikamente erfasst.“. Reihenfolge der Ebenen: App-Hülle (bis z-30)
  // < Listen-Fenster (z-35) < Prüf-Fenster (z-40) < Kamera (z-50) < Rückfragen und Scan-Auswahl (.modal, z-999).
  const sheet = read('ListSheet.vue')
  assert.match(sheet, /<div class="modal modal-open modal-top z-\[35\] /)
  const app = (f: string): string => readFileSync(join(HERE, '../../apps/pico-pwa/src/components', f), 'utf8')
  for (const f of ['rebuild/MedplanReviewSheet.vue', 'rebuild/AerzteReviewSheet.vue']) {
    const t = app(f)
    assert.match(t, /<div class="overlay-backdrop fixed inset-0 z-40 /, `${f}: Prüf-Fenster über der Liste`)
    assert.doesNotMatch(t, /class="modal modal-open/, `${f}: kein daisyUI-Modal (läge über der Kamera)`)
  }
  assert.match(app('CodeScanOverlay.vue'), /class="fixed inset-0 z-50 [^"]*" data-scan-overlay/)
})

test('Prüf-Fenster nach dem Scan: am Handy Vollbild wie das Listen-Fenster, der Hinweis steht über der Knopfzeile', () => {
  for (const f of ['MedplanReviewSheet.vue', 'AerzteReviewSheet.vue']) {
    const t = readFileSync(join(HERE, '../../apps/pico-pwa/src/components/rebuild', f), 'utf8')
    const flaeche = t.match(/<div class="overlay-surface ([^"]*)" data-review-sheet>/)
    assert.ok(flaeche, f)
    // Kein halbhohes Blatt über dem Vollbild-Fenster (zwei Fenster übereinander); breit bleibt es ein Dialog.
    assert.match(flaeche[1], /\bh-dvh\b/, f)
    assert.match(flaeche[1], /sm:h-auto sm:max-h-\[85vh\] sm:max-w-lg sm:rounded-2xl/, f)
    assert.doesNotMatch(flaeche[1], /(^| )max-h-\[85vh\]|rounded-t-2xl/, f)
    assert.match(flaeche[1], /pt-\[calc\(1rem\+env\(safe-area-inset-top\)\)\]/, `${f}: Abstand zur Statusleiste`)
    // Die Knopfzeile klebt unten; stand der Hinweis danach, lag sie über seiner ersten Zeile.
    assert.ok(t.indexOf('Nur auf dem Gerät, nichts wird gespeichert oder gesendet.') < t.indexOf('class="kb-actions '), `${f}: Hinweis vor der Knopfzeile`)
  }
})

test('nach dem Plan-Scan schließt das Listen-Fenster mit, nach einer einzelnen Packung bleibt es offen', () => {
  const med = read('MedplanFunction.vue')
  const plan = med.slice(med.indexOf('function onBmpApply('), med.indexOf('// Scan-Art-Auswahl'))
  assert.match(plan, /bmpOpen\.value = false\n[\s\S]*\n  closeSheet\(\)\n\}/, 'ein ganzer Plan: ein Tipp auf „übernehmen“ führt zurück in den Einsatz')
  const packung = med.slice(med.indexOf('async function onPackagesDecoded('), med.indexOf('const suggestions = ref'))
  assert.ok(packung.length > 200)
  assert.doesNotMatch(packung, /closeSheet|sheetOpen/, 'nach einer Packung folgt meist die nächste: Fenster bleibt')
  const arzt = read('AerzteFunction.vue')
  const scan = arzt.slice(arzt.indexOf('function onScanApply('), arzt.indexOf('</script>'))
  assert.match(scan, /bmpOpen\.value = false\n  closeSheet\(\)/)
})

test('Packungen: jede PZN höchstens einmal, die Kamera kennt die vorhandenen PZN, Rückmeldung unter der Liste', () => {
  const med = read('MedplanFunction.vue')
  const fn = med.slice(med.indexOf('async function onPackagesDecoded('), med.indexOf('const suggestions = ref'))
  assert.match(fn, /const plan = planPackageScan\(results\.map\(\(p\) => scan\.pznFromPackage\(p\)\), rows\.value\.map\(\(r\) => r\.pzn\)\)/)
  assert.match(fn, /for \(const pzn of plan\.add\) neu\.push\(await scan\.rowForPzn\(pzn\)\)/, 'nur neue PZN werden zu Zeilen')
  assert.match(fn, /pkgScanMsg\.value = packageScanMessage\(plan\)/)
  assert.match(fn, /function onPackageDecoded\(p: unknown\): Promise<void> \{\n  return onPackagesDecoded\(\[p\]\)\n\}/, 'der Einzel-Scan läuft über dieselbe Regel')
  assert.match(med, /:known="knownPzn" @decoded="onPackageDecoded" @decoded-many="onPackagesDecoded"/)
  assert.match(med, /const knownPzn = computed\(\(\) => rows\.value\.map\(\(r\) => pznKey\(r\.pzn\)\)/)
  const overlay = readFileSync(join(HERE, '../../apps/pico-pwa/src/components/rebuild/PackageScanOverlay.vue'), 'utf8')
  // Schalter im Kamerabild, Texte vom Maintainer freigegeben („Fertig“, „Schon in der Liste“).
  for (const teil of ["toggleLabel: 'Mehrere Packungen'", "doneLabel: 'Fertig'", "countOne: '1 Packung erfasst'", "countMany: '{n} Packungen erfasst'", "duplicateLabel: 'Schon in der Liste'", 'known: props.known ?? []', 'on: packageMultiOn.value']) assert.ok(overlay.includes(teil), teil)
  assert.match(overlay, /@multi-on="rememberMultiOn"/, 'die Stellung des Schalters wird gemerkt')
  assert.match(overlay, /function rememberMultiOn\(on: boolean\): void \{\n  packageMultiOn\.value = on\n\}/)
})
