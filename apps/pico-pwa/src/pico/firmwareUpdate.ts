// firmwareUpdate.ts — pure OTA-Orchestrierung (#130): Chunk-Upload, Commit,
// Reboot-Polling. KEIN Vue, KEIN Vite — vollstaendig gegen einen Fake-Client
// testbar (node --test). Die Vite-Asset-Seite lebt in firmwareAsset.ts, die
// Vue-Anbindung in useFirmwareUpdate.ts.
import type { OtaManifest, PicoClient } from './picoTypes'

export type UpdatePhase = 'uploading' | 'verifying' | 'rebooting' | 'done'

export interface UpdateCallbacks {
  /** Fortschritt des Uploads (gesendete/gesamte Bytes). */
  onProgress?: (sent: number, total: number) => void
  onPhase?: (phase: UpdatePhase) => void
}

export interface UpdateOptions extends UpdateCallbacks {
  /** Injektierbar fuer Tests; Default: echtes setTimeout. */
  sleep?: (ms: number) => Promise<void>
  pollIntervalMs?: number
  pollBudgetMs?: number
}

const POLL_INTERVAL_MS = 2000
const POLL_BUDGET_MS = 90000

/**
 * Numerischer Semver-Vergleich: >0 wenn a neuer als b, 0 bei gleich, <0 sonst.
 * Unparsbare Segmente zaehlen als 0 (defensiv gegen kaputte fwVersion).
 */
// compareVersions ist in den Kern gehoben (auch vom Online-Editor-Versions-Gating genutzt); hier
// re-exportiert, damit die bestehenden Firmware-Importe (./firmwareUpdate) unveraendert bleiben.
export { compareVersions } from '@resqdocs/protocol-core/version'

/** Uint8Array -> Base64, blockweise (kein Spread/apply ueber grosse Arrays). */
export function bytesToBase64(bytes: Uint8Array): string {
  const BLOCK = 32768
  let binary = ''
  for (let i = 0; i < bytes.length; i += BLOCK) {
    const block = bytes.subarray(i, i + BLOCK)
    let s = ''
    for (let k = 0; k < block.length; k++) s += String.fromCharCode(block[k])
    binary += s
  }
  return btoa(binary)
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Kompletter OTA-Durchlauf: begin -> chunk* (sequenziell) -> commit ->
 * Health-Polling bis die Bridge mit der NEUEN Version zurueck ist.
 * Wirft bei jedem Fehler; die Bridge verwirft serverseitig verifikations-
 * fehlgeschlagene Sessions selbst (alte Firmware bleibt aktiv).
 */
export async function runFirmwareUpdate(
  client: PicoClient,
  manifest: OtaManifest,
  firmware: ArrayBuffer,
  opts: UpdateOptions = {},
): Promise<void> {
  const sleep = opts.sleep ?? defaultSleep
  const pollInterval = opts.pollIntervalMs ?? POLL_INTERVAL_MS
  const pollBudget = opts.pollBudgetMs ?? POLL_BUDGET_MS

  const bytes = new Uint8Array(firmware)
  if (bytes.length !== manifest.size) {
    throw new Error(`Firmware-Datei (${bytes.length} B) passt nicht zum Manifest (${manifest.size} B)`)
  }

  opts.onPhase?.('uploading')
  const { chunkMax } = await client.otaBegin(manifest)
  opts.onProgress?.(0, bytes.length)

  for (let offset = 0; offset < bytes.length; offset += chunkMax) {
    const chunk = bytes.subarray(offset, offset + chunkMax)
    await client.otaChunk({ offset, dataB64: bytesToBase64(chunk) })
    opts.onProgress?.(Math.min(offset + chunk.length, bytes.length), bytes.length)
  }

  opts.onPhase?.('verifying')
  const { rebooting } = await client.otaCommit()
  if (!rebooting) throw new Error('Bridge hat das Update angenommen, aber keinen Neustart gemeldet')

  // Reboot abwarten: erst wieder erreichbar UND mit der neuen Version melden.
  opts.onPhase?.('rebooting')
  let waited = 0
  while (waited < pollBudget) {
    await sleep(pollInterval)
    waited += pollInterval
    if (!(await client.health())) continue
    let fwVersion: string
    try {
      fwVersion = (await client.status()).fwVersion
    } catch {
      continue // Status noch nicht parsbar (Bridge bootet) -> weiter pollen
    }
    if (fwVersion === manifest.version) {
      opts.onPhase?.('done')
      return
    }
    // Bridge ist da, meldet aber die ALTE Version -> Update nicht angewendet.
    throw new Error(`Bridge meldet nach dem Neustart ${fwVersion} statt ${manifest.version}`)
  }
  throw new Error('Bridge nach dem Update nicht wieder erreichbar (90 s) - Status manuell pruefen')
}
