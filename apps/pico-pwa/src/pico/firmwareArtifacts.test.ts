// Läuft mit:  node --test --experimental-strip-types
//
// Konsistenz-Guard fuer die ausgelieferten Firmware-Artefakte (bug-140):
// Eine committete BOOTSEL-`.uf2` darf NICHT hinter der Quelle (FW_VERSION)
// zurueckfallen — sonst flasht ein BOOTSEL-Flash einen veralteten, ggf.
// OTA-losen Stand (genau das ist mit 0.2.0 passiert). Dieser Test schlaegt
// fehl, sobald FW_VERSION erhoeht wird, ohne `dist/bridge_s2.pico2w.uf2`
// (und die mitgelieferte OTA-Manifest-Version) nachzuziehen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const repoRoot = new URL('../../../../', import.meta.url)

function fwVersion(): string {
  const ino = readFileSync(new URL('firmware/bridge/bridge_s2/bridge_s2.ino', repoRoot), 'utf8')
  const m = ino.match(/FW_VERSION\s*=\s*"([0-9]+\.[0-9]+\.[0-9]+)"/)
  assert.ok(m, 'FW_VERSION in bridge_s2.ino nicht gefunden')
  return m![1]
}

test('OTA-Manifest-Version == FW_VERSION der Quelle', () => {
  const version = fwVersion()
  const manifest = JSON.parse(
    readFileSync(new URL('apps/pico-pwa/src/assets/firmware/bridge_s2.manifest.json', repoRoot), 'utf8'),
  ) as { version: string }
  assert.equal(manifest.version, version, 'mitgelieferte OTA-Binary muss zur Quelle passen')
})

test('committete BOOTSEL-.uf2 enthaelt die aktuelle FW_VERSION (kein veralteter Stand)', () => {
  const version = fwVersion()
  const uf2 = readFileSync(new URL('firmware/bridge/dist/bridge_s2.pico2w.uf2', repoRoot))
  assert.ok(
    uf2.includes(Buffer.from(version, 'utf8')),
    `dist/bridge_s2.pico2w.uf2 enthaelt nicht die aktuelle FW_VERSION ${version} — `
      + `.uf2 nach FW_VERSION-Bump neu bauen und mitcommitten (siehe firmware/bridge/README.md).`,
  )
})
