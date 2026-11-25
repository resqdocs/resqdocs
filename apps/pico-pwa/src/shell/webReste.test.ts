// Wächter: Reste aus der Web-Welt, an denen man eine Webseite erkennt, bleiben draußen: Sprache und Titel der
// Seite, ziehbare Bilder und Links, die Link-Vorschau der WebView, Datei-Felder im Browser-Stil, Kästchen als
// Ein/Aus-Schalter in den Einstellungen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const app = new URL('../..', import.meta.url).pathname
const read = (f: string): string => readFileSync(join(app, f), 'utf8')
function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n: string) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? vueFiles(p) : n.endsWith('.vue') ? [p] : []
  })
}
const templates = vueFiles(join(app, 'src')).map((file) => {
  const text = readFileSync(file, 'utf8')
  return { file: file.slice(app.length), template: text.slice(text.indexOf('<template>')) }
})

test('Seite: Deutsch (Aussprache der Vorlesefunktionen, Silbentrennung) und der Name der App als Titel', () => {
  const html = read('index.html')
  assert.match(html, /<html lang="de">/)
  assert.match(html, /<title>ResQDocs<\/title>/)
  assert.doesNotMatch(html, /pico-pwa-base|lang="en"/)
})

test('Bilder und Links sind nicht ziehbar (langer Druck hebt sie auf iOS sonst als Zieh-Objekt an)', () => {
  const bad: string[] = []
  let count = 0
  for (const { file, template } of templates) {
    for (const tag of template.match(/<(img|a)(\s[^>]*)?>/g) ?? []) {
      count++
      if (!/\sdraggable="false"/.test(tag)) bad.push(`${file}: ${tag.slice(0, 60)}`)
    }
  }
  assert.ok(count >= 15, `geprüfte Bilder und Links: ${count}`)
  assert.deepEqual(bad, [])
})

test('iOS: Link-Vorschau der WebView ist auch auf nativer Seite aus', () => {
  assert.match(read('capacitor.config.ts').replace(/\/\/.*$/gm, ''), /ios: \{[^}]*allowsLinkPreview: false,/)
  // Die Seite schaltet das Callout weiterhin selbst ab.
  assert.match(read('src/style.css'), /-webkit-touch-callout: none;/)
})

test('kein Datei-Feld im Browser-Stil: ein Knopf öffnet die Dateiauswahl, wie bei den Vorlagen', () => {
  for (const { file, template } of templates) {
    assert.doesNotMatch(template, /class="[^"]*\bfile-input\b/, file)
    for (const input of template.match(/<input[^>]*type="file"[^>]*>/g) ?? []) {
      assert.match(input, /class="(sr-only|hidden)"/, `${file}: das Feld des Browsers ist nicht zu sehen`)
    }
  }
  // Bausteine: Der Import-Knopf öffnet die Dateiauswahl direkt, wie „Aus Datei importieren…“ bei den Vorlagen.
  // Ein Feld zum Einfügen des Datei-Inhalts gibt es dort nicht mehr (Entscheidung des Maintainers).
  for (const f of ['src/components/library/SnippetLibrarySection.vue', 'src/components/library/BlockLibrarySection.vue']) {
    const t = read(f)
    assert.match(t, /<button class="btn btn-ghost btn-sm ml-auto min-h-11 min-w-11 px-1\.5" type="button" aria-label="[^"]* aus Datei importieren" title="Aus Datei importieren" data-import-file @click="pickImportFile">/, f)
    assert.match(t, /function pickImportFile\(\): void \{\n  ioMsg\.value = null\n  importFile\.value\?\.click\(\)\n\}/, `${f}: die Auswahl öffnet im selben Tipp`)
    assert.match(t, /<input ref="importFile" type="file" accept="application\/json,\.json" class="sr-only" tabindex="-1" aria-hidden="true" @change="onImportFile" \/>/, f)
    assert.doesNotMatch(t, /<textarea[^>]*importText|importOpen|>Laden</, `${f}: kein Einfüge-Feld mehr`)
    assert.match(t, /<p v-if="ioMsg" class="text-xs"/, `${f}: das Ergebnis steht unter der Überschrift`)
  }
  // Gleiche Beschriftung wie beim Import einer Vorlage.
  assert.match(read('src/components/rebuild/TemplateIO.vue'), /data-import-file @click="fileInput\?\.click\(\)">Datei auswählen…</)
})

test('keine Entwicklerwörter in der Oberfläche: benannt wird, was es ist', () => {
  const sichtbar = (f: string): string => read(f).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '')
  const device = sichtbar('src/components/settings/DeviceSection.vue')
  assert.match(device, /<span class="label-text mb-1">Adresse der Bridge<\/span>/)
  assert.match(device, /aria-label="Adresse der Bridge"/)
  assert.doesNotMatch(device, /Base-URL/)
  const scanner = read('src/components/settings/ScannerSection.vue')
  assert.match(scanner, /<h3 class="font-medium">Scanner für den Medikationsplan<\/h3>/)
  // Am Gerät gibt es keine Auswahl: Der Satz über eine Voreinstellung „WebView Standard“ stand trotzdem dort.
  assert.doesNotMatch(scanner, /Strategie für den Medikationsplan-Scan|Vergleichstests/)
  const vorDerAuswahl = scanner.slice(scanner.indexOf('<template>'), scanner.indexOf('<select'))
  assert.doesNotMatch(vorDerAuswahl, /WebView/, 'vor der Auswahl (nur im Browser) steht kein „WebView“')
  for (const f of ['src/components/library/SnippetLibrarySection.vue', 'src/components/library/BlockLibrarySection.vue', 'src/components/rebuild/TemplateIO.vue', 'src/components/rebuild/LibraryBar.vue']) {
    assert.doesNotMatch(sichtbar(f), /JSON/, `${f}: „JSON“ steht nicht in der Oberfläche`)
  }
  const io = read('src/components/rebuild/TemplateIO.vue')
  assert.match(io, />Exportieren — als Datei<\/span>/)
  assert.match(io, />Importieren — aus Datei<\/span>/)
  assert.match(io, /\{\{ copied \? 'Kopiert' : 'Als Text kopieren' \}\}/)
  for (const f of ['src/components/library/SnippetLibrarySection.vue', 'src/components/library/BlockLibrarySection.vue']) {
    assert.match(read(f), /'Kopiert' : 'Als Text kopieren'/, f)
  }
  assert.match(read('src/components/rebuild/LibraryBar.vue'), /<b>Exportieren<\/b> = Datei\./)
})

test('Einstellungen: Ein/Aus ist ein Schalter mit mindestens 44 px Trefferfläche, die Beschriftung bleibt', () => {
  const settings = templates.filter((t) => t.file.startsWith('src/components/settings/'))
  for (const { file, template } of settings) {
    assert.doesNotMatch(template, /class="[^"]*\bcheckbox\b/, `${file}: kein Kästchen als Schalter`)
  }
  const wanted: Record<string, string> = {
    'src/components/settings/AppSettingsSection.vue': 'Auf neue App-Versionen hinweisen',
    'src/components/settings/ScannerSection.vue': 'Technische Angaben im Scanner anzeigen (Kamera, Auflösung, Zoom, Versuche)',
    'src/components/settings/PznSection.vue': 'Im Hintergrund auf neue Versionen prüfen',
  }
  for (const [file, label] of Object.entries(wanted)) {
    const t = read(file)
    const row = t.match(/<label class="([^"]*)">\s*<input\s+type="checkbox"\s+class="toggle toggle-primary shrink-0"[\s\S]*?<\/label>/)
    assert.ok(row, `${file}: Schalter in einer Zeile`)
    assert.match(row[1], /\bmin-h-11\b/, `${file}: Trefferfläche`)
    assert.match(row[1], /\bcursor-pointer\b/, file)
    assert.ok(row[0].includes(label), `${file}: Beschriftung „${label}“`)
  }
})
