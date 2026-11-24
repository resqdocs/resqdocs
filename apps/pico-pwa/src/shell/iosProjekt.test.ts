// Wächter: Das Xcode-Projekt (project.pbxproj) wird im Container von Hand gepflegt und lässt sich dort nicht bauen.
// Geprüft wird deshalb, was sich ohne Xcode prüfen lässt: Jede Kennung ist definiert und wird verwendet, jede Datei
// des Projekts liegt vor, jede Swift-Datei wird gebaut, und das Startbild heißt überall gleich (Info.plist, Datei,
// Projekt, Build-Phase).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const app = new URL('../..', import.meta.url).pathname
const ios = join(app, 'ios/App')
const pbx = readFileSync(join(ios, 'App.xcodeproj/project.pbxproj'), 'utf8')
const plist = readFileSync(join(ios, 'App/Info.plist'), 'utf8')

/** Alle Objekte des Projekts: Kennung → { isa, Text des Objekts }. */
function objects(): Map<string, { isa: string; body: string }> {
  const out = new Map<string, { isa: string; body: string }>()
  const start = /^\t\t([0-9A-F]{24})(?: \/\*[^\n]*?\*\/)? = \{/gm
  for (const m of pbx.matchAll(start)) {
    const from = m.index + m[0].length
    // Einzeilige Objekte enden in derselben Zeile, mehrzeilige mit „\t\t};“.
    const lineEnd = pbx.indexOf('\n', from)
    const line = pbx.slice(from, lineEnd)
    const body = line.trimEnd().endsWith('};') ? line : pbx.slice(from, pbx.indexOf('\n\t\t};', from))
    assert.ok(!out.has(m[1]), `Kennung doppelt definiert: ${m[1]}`)
    out.set(m[1], { isa: body.match(/isa = (\w+);/)?.[1] ?? '', body })
  }
  return out
}
const objs = objects()
const section = (isa: string): [string, { isa: string; body: string }][] => [...objs].filter(([, o]) => o.isa === isa)
const phase = (isa: string): string => section(isa)[0]?.[1].body ?? ''

test('Projektdatei: jede verwendete Kennung ist definiert, jede definierte wird verwendet', () => {
  assert.ok(objs.size > 40, `Objekte gefunden: ${objs.size}`)
  const used = new Map<string, number>()
  for (const m of pbx.matchAll(/\b[0-9A-F]{24}\b/g)) used.set(m[0], (used.get(m[0]) ?? 0) + 1)
  const undefinedIds = [...used.keys()].filter((id) => !objs.has(id))
  assert.deepEqual(undefinedIds, [], 'Verweis auf ein Objekt, das es nicht gibt')
  const orphans = [...objs.keys()].filter((id) => (used.get(id) ?? 0) < 2)
  assert.deepEqual(orphans, [], 'Objekt ist definiert, aber nirgends eingehängt')
  for (const [id, o] of objs) assert.ok(o.isa, `${id}: ohne isa`)
  // Klammern ausgeglichen (grobe Probe auf eine beschädigte Datei).
  assert.equal(pbx.split('{').length, pbx.split('}').length)
  assert.equal(pbx.split('(').length, pbx.split(')').length)
})

test('Projektdatei: jede Build-Datei zeigt auf eine Datei des Projekts und hängt in genau einer Build-Phase', () => {
  const phases = ['PBXSourcesBuildPhase', 'PBXResourcesBuildPhase', 'PBXFrameworksBuildPhase'].map(phase).join('\n')
  for (const [id, o] of section('PBXBuildFile')) {
    const ref = o.body.match(/fileRef = ([0-9A-F]{24})/)?.[1] ?? ''
    assert.ok(['PBXFileReference', 'PBXVariantGroup'].includes(objs.get(ref)?.isa ?? ''), `${id}: fileRef ${ref}`)
    assert.equal(phases.split(id).length - 1, 1, `${id}: genau einmal in einer Build-Phase`)
  }
  // Jede Datei bzw. Variantengruppe steht in genau einer Gruppe.
  const groups = [...section('PBXGroup'), ...section('PBXVariantGroup')].map(([, o]) => o.body).join('\n')
  for (const [id] of [...section('PBXFileReference'), ...section('PBXVariantGroup')]) {
    assert.equal(groups.split(id).length - 1, 1, `${id}: genau einmal in einer Gruppe`)
  }
})

test('Projektdatei: jede eigene Datei liegt vor, und jede Swift-Datei der App wird gebaut', () => {
  const generated = /^(capacitor\.config\.json|config\.xml|public|App\.app|Pods_App\.framework|Pods\/)/
  const missing: string[] = []
  for (const [, o] of section('PBXFileReference')) {
    const path = o.body.match(/path = "?([^";]+)"?;/)?.[1] ?? ''
    if (!path || generated.test(path)) continue
    const places = [join(ios, path), join(ios, 'App', path), join(ios, 'App/Scanner', path)]
    if (!places.some((p) => existsSync(p))) missing.push(path)
  }
  assert.deepEqual(missing, [])
  const sources = phase('PBXSourcesBuildPhase')
  const swift = [...readdirSync(join(ios, 'App')), ...readdirSync(join(ios, 'App/Scanner'))].filter((f: string) => f.endsWith('.swift'))
  assert.ok(swift.length >= 8)
  for (const f of swift) assert.ok(sources.includes(`/* ${f} in Sources */`), `${f} fehlt in der Build-Phase Sources`)
})

test('Startbild heißt überall gleich: Info.plist = Datei = Projekt = Build-Phase; der alte Name ist weg', () => {
  const name = plist.match(/<key>UILaunchStoryboardName<\/key>\s*<string>([^<]+)<\/string>/)?.[1]
  // Neuer Name: iOS speichert das Startbild je Name zwischen und zeigte nach der Änderung sonst weiter das alte.
  assert.equal(name, 'Startbild')
  assert.ok(existsSync(join(ios, `App/Base.lproj/${name}.storyboard`)), 'Datei des Startbilds')
  assert.ok(existsSync(join(ios, `App/de.lproj/${name}.strings`)), 'deutsche Variante heißt wie das Startbild')
  const group = section('PBXVariantGroup').find(([, o]) => o.body.includes(`name = ${name}.storyboard;`))
  assert.ok(group, 'Variantengruppe des Startbilds')
  const children = [...group[1].body.matchAll(/([0-9A-F]{24})/g)].map((m) => objs.get(m[1])?.body ?? '')
  assert.ok(children.some((b) => b.includes(`path = Base.lproj/${name}.storyboard;`)), 'Verweis auf die Datei')
  assert.ok(children.some((b) => b.includes(`path = de.lproj/${name}.strings;`)), 'Verweis auf die deutsche Variante')
  const build = section('PBXBuildFile').find(([, o]) => o.body.includes(`fileRef = ${group[0]}`))
  assert.ok(build, 'Build-Datei des Startbilds')
  assert.ok(phase('PBXResourcesBuildPhase').includes(build[0]), 'in der Build-Phase Resources')
  for (const [what, text] of [['Projekt', pbx], ['Info.plist', plist]] as const) assert.doesNotMatch(text, /LaunchScreen/, `${what}: alter Name`)
  assert.ok(!existsSync(join(ios, 'App/Base.lproj/LaunchScreen.storyboard')) && !existsSync(join(ios, 'App/de.lproj/LaunchScreen.strings')))
  // Die App startet weiter aus Main.storyboard (Szene und Hauptdatei).
  assert.match(plist, /<key>UIMainStoryboardFile<\/key>\s*<string>Main<\/string>/)
})
