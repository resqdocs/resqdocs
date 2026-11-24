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
  for (const f of ['src/components/library/SnippetLibrarySection.vue', 'src/components/library/BlockLibrarySection.vue']) {
    const t = read(f)
    assert.match(t, /<button class="btn btn-sm min-h-11" type="button" data-import-file @click="importFile\?\.click\(\)">Datei auswählen…<\/button>/, f)
    assert.match(t, /<input ref="importFile" type="file" accept="application\/json,\.json" class="sr-only" tabindex="-1" aria-hidden="true" @change="onImportFile" \/>/, f)
    // Einfügen bleibt als zweiter Weg (Entscheidung des Maintainers steht aus).
    assert.match(t, /JSON einfügen oder Datei wählen/, f)
    assert.match(t, /@click="doImport\(importText\)">Laden</, f)
  }
  // Gleiche Beschriftung wie beim Import einer Vorlage.
  assert.match(read('src/components/rebuild/TemplateIO.vue'), /data-import-file @click="fileInput\?\.click\(\)">Datei auswählen…</)
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
