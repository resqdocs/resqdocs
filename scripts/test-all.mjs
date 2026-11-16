#!/usr/bin/env node
// Alle Tests des Repos mit knapper Ausgabe: eine Zeile je Bereich, Einzelheiten nur bei Fehlern.
//
//   node scripts/test-all.mjs                 alle Bereiche
//   node scripts/test-all.mjs editor          nur Bereiche, deren Name „editor" enthält (mehrere Filter möglich)
//   node scripts/test-all.mjs --typen         zusätzlich Typprüfung und Build von Editor und App
//   node scripts/test-all.mjs --liste         Bereiche anzeigen, nichts ausführen
//   node scripts/test-all.mjs --alles-zeigen  bei Fehlern die ganze Ausgabe statt des Ausschnitts
//
// Ende-Code 0, wenn alles grün ist, sonst 1.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SUITES = [
  { name: 'kern', cwd: 'apps/pico-pwa', cmd: 'npm run -s test:shared', about: 'geteilte Logik (Renderer, Regeln, Import)' },
  { name: 'app', cwd: 'apps/pico-pwa', cmd: 'npm run -s test:app', about: 'App-Logik' },
  { name: 'kern-ui', cwd: 'packages/protocol-core-ui', cmd: 'npm run -s test', about: 'geteilte Editor-Bausteine' },
  { name: 'editor-logik', cwd: 'apps/protocol-editor', cmd: 'npm run -s test:unit', about: 'Editor: Logik und Speicher' },
  { name: 'editor-bedienung', cwd: 'apps/protocol-editor', cmd: 'npm run -s test:ui', about: 'Editor: Funktionstests über die Oberfläche' },
  { name: 'transfer', cwd: 'apps/transfer', cmd: 'npm run -s test', about: 'Transfer-Dienst' },
  { name: 'ki-doku', cwd: '.', cmd: 'npm run -s test:ai-docs', about: 'Beispiele der KI-Doku' },
  { name: 'web-seo', cwd: '.', cmd: 'node --test scripts/web-seo.test.mjs', about: 'Editor, KI-Seite und Webseite: Suchmaschinen-Angaben, Icons, Vorschaubild', needs: 'scripts/web-seo.test.mjs' },
  { name: 'firmware-schutz', cwd: '.', cmd: 'bash firmware/test/storedguard/run.sh', about: 'Schutz des Knopf-Texts (Firmware)' },
  { name: 'editor-typen', cwd: 'apps/protocol-editor', cmd: 'npm run -s build', about: 'Editor: Typprüfung und Build', extra: true },
  { name: 'webseite-build', cwd: 'apps/landing-page', cmd: 'npm run -s build', about: 'Webseite: Typprüfung und Build', extra: true },
  { name: 'app-typen', cwd: 'apps/pico-pwa', cmd: 'npm run -s build', about: 'App: Typprüfung und Build', extra: true },
]

const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const filters = args.filter((a) => !a.startsWith('--'))
// Bereiche, deren Testdatei in diesem Stand fehlt, entfallen still.
const available = SUITES.filter((s) => !s.needs || existsSync(path.join(ROOT, s.needs)))
const selected = available.filter((s) => (filters.length ? filters.some((f) => s.name.includes(f)) : flags.has('--typen') || !s.extra))

if (flags.has('--liste')) {
  for (const s of SUITES) console.log(`${s.name.padEnd(18)} ${s.about}${s.extra ? '  (nur mit --typen oder Filter)' : ''}`)
  process.exit(0)
}
if (!selected.length) {
  console.error(`Kein Bereich passt zu: ${filters.join(', ')}. Bereiche: ${SUITES.map((s) => s.name).join(', ')}`)
  process.exit(1)
}

function run(suite) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(suite.cmd, { cwd: path.join(ROOT, suite.cwd), shell: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' } })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => {
      // Häufigste Ursache eines Fehlschlags in einem frischen Checkout: die Abhängigkeiten fehlen.
      if (code !== 0 && suite.cmd.startsWith('npm') && !existsSync(path.join(ROOT, suite.cwd, 'node_modules'))) {
        out = `In ${suite.cwd} fehlt node_modules. Dort zuerst „npm ci" ausführen.\n` + out
      }
      resolve({ suite, code: code ?? 1, out, ms: Date.now() - started })
    })
  })
}

/** Bereiche mit begrenzter Parallelität ausführen: zu viele gleichzeitig bremsen sich gegenseitig aus. */
async function runLanes(suites, lanes) {
  const results = new Array(suites.length)
  let next = 0
  const worker = async () => {
    while (next < suites.length) {
      const i = next++
      results[i] = await run(suites[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, suites.length) }, worker))
  return results
}

/** Erst die Tests in zwei Spuren, danach Typprüfung und Builds einzeln: die brauchen viel Speicher und
 *  haben neben den Funktionstests schon Test-Prozesse verdrängt. */
async function runAll(suites) {
  const tests = suites.filter((s) => !s.extra)
  const heavy = suites.filter((s) => s.extra)
  const lanes = Math.max(1, Math.min(2, availableParallelism() - 1))
  return [...(await runLanes(tests, lanes)), ...(await runLanes(heavy, 1))]
}

/** Anzahl der Tests aus der Ausgabe lesen (node:test und vitest); null, wenn der Bereich keine Zahl nennt. */
function counts(out) {
  let tests = 0
  let failed = 0
  let found = false
  for (const m of out.matchAll(/^(?:ℹ|#) tests (\d+)$/gm)) {
    tests += Number(m[1])
    found = true
  }
  for (const m of out.matchAll(/^(?:ℹ|#) fail (\d+)$/gm)) failed += Number(m[1])
  const v = out.match(/^\s*Tests\s+(?:(\d+) failed \| )?(?:\d+ passed )?(?:\| \d+ skipped )?\((\d+)\)/m)
  if (v) {
    tests += Number(v[2])
    failed += Number(v[1] ?? 0)
    found = true
  }
  return found ? { tests, failed } : null
}

/** Der Teil der Ausgabe, der den Fehler zeigt. */
function excerpt(out, limit = 60) {
  const lines = out.split('\n')
  const marks = [lines.findIndex((l) => l.startsWith('✖ failing tests')), lines.findIndex((l) => /^\s*FAIL\s/.test(l) || l.includes('Failed Tests')), lines.findIndex((l) => /error TS\d+|^not ok /.test(l))]
  const start = marks.find((i) => i >= 0)
  const part = (start === undefined ? lines.slice(-40) : lines.slice(start)).filter((l) => l.trim() && !/^\s+(❯|at) .*node_modules|^npm (notice|warn)/.test(l))
  return part.length > limit ? [...part.slice(0, limit), `… ${part.length - limit} weitere Zeilen (mit --alles-zeigen vollständig)`] : part
}

const started = Date.now()
const results = await runAll(selected)
let total = 0
let bad = 0
for (const r of results) {
  const c = counts(r.out)
  const ok = r.code === 0
  if (c) total += c.tests
  if (!ok) bad++
  const detail = !ok && c && c.failed ? `${c.failed} von ${c.tests} fehlgeschlagen` : c ? `${c.tests} Tests` : ok ? 'in Ordnung' : 'fehlgeschlagen'
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${r.suite.name.padEnd(18)} ${detail.padEnd(28)} ${(r.ms / 1000).toFixed(1)} s`)
  if (!ok) for (const line of flags.has('--alles-zeigen') ? r.out.split('\n') : excerpt(r.out)) console.log(`     ${line}`)
}
console.log(`${bad ? 'FEHLER' : 'GRÜN'}: ${results.length} Bereiche, ${bad} fehlgeschlagen, ${total} Tests, ${((Date.now() - started) / 1000).toFixed(1)} s`)
process.exit(bad ? 1 : 0)
