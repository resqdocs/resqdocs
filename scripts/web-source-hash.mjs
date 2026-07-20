// scripts/web-source-hash.mjs
// Deterministischer Content-Hash (sha256) über ALLE Web-Build-Inputs der App (apps/pico-pwa) — die
// Wahrheit für die Frage „wurde dist/ frisch aus DIESEM Quellstand gebaut?". GEMEINSAM genutzt von:
//   - dem Vite-Build-Info-Plugin (stempelt srcHash in dist/build-info.json) und
//   - dem Release-Guard apps/pico-pwa/scripts/check-bundle-fresh.mjs (rechnet den Hash neu + vergleicht).
// EIN Modul -> beide Seiten benutzen exakt dieselbe Datei-Allowlist + Normalisierung -> KEIN Hash-Drift
// (der Kernvorteil gegenüber zwei getrennten Implementierungen). Bewusst OHNE Zeitstempel/nicht-
// deterministische Inputs. Reines Node/Crypto, keine Netz-/Host-/Secret-Zugriffe (public-repo-konform).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join, relative, sep } from 'node:path'

// Diese Datei liegt in scripts/ -> eine Ebene hoch ist die Repo-Wurzel.
const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url))

// Build-bestimmende Verzeichnisse (rekursiv), relativ zur Repo-Wurzel. Deckt die Vite-Aliase ab:
// @ = apps/pico-pwa/src, @resqdocs/protocol-core = packages/shared,
// @resqdocs/protocol-core-ui = packages/protocol-core-ui, @protocols = protocols — PLUS public/, das Vite
// unverändert nach dist/ kopiert (Logos/Icons/Favicon sind echte Bundle-Inputs).
const DIRS = ['apps/pico-pwa/src', 'apps/pico-pwa/public', 'packages/shared', 'packages/protocol-core-ui', 'protocols']

// Build-bestimmende Einzeldateien. package-lock.json mit drin: Dependency-Drift ohne package.json-Edit
// (npm-Auflösung im Semver-Range) würde das Bundle ändern -> muss den Hash bewegen.
const FILES = [
  'apps/pico-pwa/index.html',
  'apps/pico-pwa/package.json',
  'apps/pico-pwa/package-lock.json',
  'apps/pico-pwa/vite.config.ts',
  'apps/pico-pwa/tsconfig.json',
  'apps/pico-pwa/tsconfig.app.json',
  'apps/pico-pwa/tsconfig.node.json',
]

// Beim rekursiven Gehen übersprungene Verzeichnisse (nicht bundle-relevant / nicht deterministisch).
// Punkt-Verzeichnisse werden GENERISCH übersprungen (.git und interne Tooling-Ordner) — bewusst OHNE
// Namensnennung, damit dieses generische Build-Tooling-Skript keine internen Ordnernamen preisgibt.
const EXCLUDE_DIRS = new Set(['node_modules', 'dist'])
const isDotDir = (name) => name.startsWith('.')

// Nicht bundle-relevante Dateien: Tests (fließen nicht ins Bundle) + generierte Marker.
function isExcludedFile(rel) {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel) || rel.endsWith('/build-info.json') || rel.endsWith('.DS_Store')
}

function walk(absDir, acc) {
  let entries
  try {
    entries = readdirSync(absDir, { withFileTypes: true })
  } catch {
    return // Verzeichnis fehlt -> überspringen (die Allowlist darf Nicht-Vorhandenes enthalten)
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (isDotDir(e.name) || EXCLUDE_DIRS.has(e.name)) continue
      walk(join(absDir, e.name), acc)
    } else if (e.isFile()) {
      acc.push(join(absDir, e.name))
    }
  }
}

/** sha256-Hex über die sortierte Allowlist (jeweils Pfad + Inhalt). Stabil über Aufrufe/Plattformen. */
export function hashWebSources(repoRoot = DEFAULT_ROOT) {
  const abs = []
  for (const d of DIRS) walk(join(repoRoot, d), abs)
  for (const f of FILES) {
    const p = join(repoRoot, f)
    try {
      if (statSync(p).isFile()) abs.push(p)
    } catch {
      /* fehlt -> überspringen */
    }
  }
  const rels = abs
    .map((p) => relative(repoRoot, p).split(sep).join('/')) // Pfadtrenner normalisieren (Win/Unix)
    .filter((rel) => !isExcludedFile(rel))
    .sort()
  const h = createHash('sha256')
  for (const rel of rels) {
    h.update(rel, 'utf8')
    h.update('\0')
    h.update(readFileSync(join(repoRoot, rel.split('/').join(sep))))
    h.update('\0')
  }
  return h.digest('hex')
}
