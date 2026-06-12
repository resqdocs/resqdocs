// firmwareAsset.ts — EINZIGE Stelle, die die gebuendelte Bridge-Firmware kennt
// (#130). Die signierten Artefakte legt scripts/ota/sign.mjs unter
// src/assets/firmware/ ab; sie werden mit der App ausgeliefert (Netzwerk-
// Policy: kein Internet-Download). import.meta.glob statt statischem Import,
// damit der Build auch OHNE Artefakte durchlaeuft (dann: keine gebuendelte
// Firmware -> UI zeigt das an).
import type { OtaManifest } from './picoTypes'

const manifests = import.meta.glob('../assets/firmware/bridge_s2.manifest.json', {
  eager: true,
  import: 'default',
})
const binaries = import.meta.glob('../assets/firmware/bridge_s2.bin', {
  eager: true,
  query: '?url',
  import: 'default',
})

function firstValue(globbed: Record<string, unknown>): unknown {
  for (const key in globbed) return globbed[key]
  return undefined
}

/** Manifest der gebuendelten Firmware; null wenn keine Artefakte gebaut sind. */
export function bundledManifest(): OtaManifest | null {
  const m = firstValue(manifests) as Partial<OtaManifest> | undefined
  if (!m) return null
  if (
    !/^\d+\.\d+\.\d+$/.test(m.version ?? '') ||
    !Number.isInteger(m.size) || (m.size as number) <= 0 ||
    !/^[0-9a-f]{64}$/.test(m.sha256 ?? '') ||
    typeof m.sigB64 !== 'string' || !m.sigB64
  ) {
    return null // defektes Manifest behandeln wie "keine Firmware gebuendelt"
  }
  return m as OtaManifest
}

/** Gebuendeltes Firmware-Binary laden (same-origin Asset im WebView, iOS+Android). */
export async function loadBundledFirmware(): Promise<ArrayBuffer> {
  const url = firstValue(binaries) as string | undefined
  if (!url) throw new Error('Keine Firmware gebuendelt (scripts/ota/sign.mjs ausfuehren)')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Firmware-Asset nicht ladbar (HTTP ${res.status})`)
  return res.arrayBuffer()
}
