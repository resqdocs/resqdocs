// useBackup.ts — Singleton-Composable, das das lokale Backup zusammenführt: Auto-/Manuell-Trigger,
// Rotation, Verlauf, Restore (additiv/ersetzen) mit Pflicht-Sicherheits-Snapshot und Live-UI-Reload.
// NUR nativ aktiv (Web: no-op, Backup ist ein Geräte-Feature).
import { ref, watch } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import type { PluginListenerHandle } from '@capacitor/core'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import { useProtocolPersistence } from '@resqdocs/protocol-core-ui/protocolPersistence'
import { resolveProtocolRepository } from '@resqdocs/protocol-core-ui/repositoryProvider'
import { useBausteine } from '../composables/useBausteine.ts'
import { useAppVersion } from '../composables/useAppVersion.ts'
import { runBackup, sha256Hex, type BackupResult } from './backupService.ts'
import { createCapacitorBackupStore } from './backupFs.ts'
import { createAppBackupDataSource, createAppRestoreTargets } from './backupDataSource.ts'
import { createDriveCloudStore } from './driveCloudStore.ts'
import { createICloudCloudStore } from './icloudCloudStore.ts'
import { planCloudSync, cloudHistory, type CloudMeta, type CloudBackupStore } from './cloudBackup.ts'
import { buildBackup, parseBackup, restoreBackup, type BackupEnvelope, type RestoreCounts } from './backup.ts'
import { shareBinary, readBinaryFile } from '../utils/fileTransfer.ts'
import { gzipString, decodeMaybeGzip } from '../utils/gzip.ts'
import type { SnapshotMeta, SnapshotOrigin } from './backupRotation.ts'
import {
  loadBackupSettings,
  saveBackupSettings,
  rotationFor,
  rateIntervalMs,
  autoEnabled,
  DEFAULT_BACKUP_SETTINGS,
  type BackupSettings,
} from './backupSettings.ts'

type Status = 'idle' | 'saving' | 'saved' | 'error'

// Modul-Singleton-State.
const settings = ref<BackupSettings>({ ...DEFAULT_BACKUP_SETTINGS })
const history = ref<SnapshotMeta[]>([])
const status = ref<Status>('idle')
const lastMessage = ref<string>('')
// Fortschritt für lange Vorgänge (großes PZN-Packen/Schreiben). null = kein Balken. Bewusst nur bei großen
// Operationen sichtbar (kein Flackern bei kleinen Backups). total>0 = determinate, sonst indeterminate.
const progress = ref<{ label: string; done: number; total: number } | null>(null)
let lastProgAt = 0
function reportProgress(label: string, done: number, total: number): void {
  // Reiner End-Call bei kleinem Backup (done==total, noch kein Balken aktiv) -> ignorieren (kein Flackern).
  if (done >= total && progress.value == null) return
  const t = Date.now()
  if (done < total && t - lastProgAt < 80) return // ~80ms drosseln gegen Re-Render-Sturm
  lastProgAt = t
  progress.value = { label, done, total }
}
let started = false
let dirty = false
let appListener: PluginListenerHandle | null = null
let netTimer: ReturnType<typeof setInterval> | null = null
let inflight: Promise<BackupResult> | null = null // Single-Flight: nie zwei Läufe parallel (Dateiname-Race)
let cloudInflight: Promise<void> | null = null // Single-Flight für Cloud (kein doppelter Upload / Listen-Race)
const store = createCapacitorBackupStore()

// --- Optionaler Cloud-Sync: Android = Google Drive appDataFolder; iOS = iCloud-Ubiquity-Container ---
// Beide Stores erfüllen strukturell CloudBackupStore + signIn/signOut -> useBackup bleibt plattformneutral.
type CloudStore = CloudBackupStore & { signIn(): Promise<boolean>; signOut(): Promise<void> }
const cloudPlatform = Capacitor.getPlatform()
const cloudStore: CloudStore = cloudPlatform === 'ios' ? createICloudCloudStore() : createDriveCloudStore()
// 'icloud' (iOS, iCloud-Konto ohne Login/Profil) | 'google' (Android, Google-Konto) | null (Web).
const cloudKind: 'icloud' | 'google' | null =
  cloudPlatform === 'ios' ? 'icloud' : cloudPlatform === 'android' ? 'google' : null
const cloudSupported = cloudPlatform === 'android' || cloudPlatform === 'ios'
const cloudEnabled = ref(false)
// „Cloud hinkt hinterher": ein lokaler Stand wurde geschrieben, aber noch nicht bestätigt in der Cloud. Bleibt
// gesetzt (persistiert), bis ein Upload den AKTUELLEN Hash in der Cloud bestätigt -> zuverlässiges Nachholen.
const cloudDirty = ref(false)
const cloudFiles = ref<(CloudMeta & { id: string; name: string })[]>([])
// Persistierte Sicht auf „was liegt in der Cloud" (Content-Hashes) + letzter Cloud-Sync-Zeitpunkt, damit die
// Anzeige nach App-Neustart ehrlich bleibt OHNE Cloud-Netz beim Start.
const cloudHashes = ref<Set<string>>(new Set())
const lastCloudSync = ref<number | null>(null)
const CLOUD_KEY = 'resqdocs.backup.cloudEnabled'
const DEVICE_KEY = 'resqdocs.backup.deviceId'
const HASHES_KEY = 'resqdocs.backup.cloudHashes'
const LAST_SYNC_KEY = 'resqdocs.backup.lastCloudSync'
const DIRTY_KEY = 'resqdocs.backup.cloudDirty'

/** Stabile, gerätespezifische hex-id (für append-only/gerätescoped Cloud-Namen). */
async function deviceId(): Promise<string> {
  const { value } = await Preferences.get({ key: DEVICE_KEY })
  if (value) return value
  const id = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')
  await Preferences.set({ key: DEVICE_KEY, value: id })
  return id
}

const native = (): boolean => Capacitor.isNativePlatform()

async function refreshHistory(): Promise<void> {
  history.value = await store.listIndex()
}

async function setCloudDirty(v: boolean): Promise<void> {
  cloudDirty.value = v
  await Preferences.set({ key: DIRTY_KEY, value: v ? '1' : '0' })
}

/** Einen Snapshot erstellen (manuell/auto/pre-restore). Dedup verhindert redundante Writes. */
async function snapshotNow(origin: SnapshotOrigin = 'manual'): Promise<BackupResult> {
  if (!native()) {
    lastMessage.value = 'Sicherung nur auf dem Gerät verfügbar.'
    return { written: false, reason: 'empty' }
  }
  // Single-Flight: läuft schon ein Snapshot, dessen Ergebnis zurückgeben statt einen zweiten (mit
  // konkurrierendem Dateinamen) zu starten. Ein bereits laufender Lauf sichert denselben Ist-Zustand.
  if (inflight) return inflight
  const run = (async (): Promise<BackupResult> => {
    status.value = 'saving'
    try {
      const av = useAppVersion()
      const src = createAppBackupDataSource({ version: av.version.value, build: av.build.value ?? undefined })
      const res = await runBackup(src, store, {
        now: Date.now(),
        origin,
        cfg: rotationFor(settings.value),
        force: origin === 'pre-restore',
        onProgress: (d, t) => reportProgress('Sicherung wird gepackt …', d, t),
      })
      if (res.written) {
        dirty = false
        await refreshHistory()
        // Neuer lokaler Stand -> Cloud hinkt hinterher, bis cloudSyncNow den aktuellen Hash bestätigt.
        if (cloudEnabled.value && cloudSupported) await setCloudDirty(true)
        status.value = 'saved'
        lastMessage.value = 'Gesichert.'
      } else {
        status.value = 'idle'
        lastMessage.value =
          res.reason === 'unchanged'
            ? 'Unverändert – keine neue Sicherung nötig.'
            : res.reason === 'degraded'
              ? 'Bibliothek nicht lesbar – nicht gesichert.'
              : 'Nichts zu sichern.'
      }
      setTimeout(() => {
        if (status.value === 'saved') status.value = 'idle'
      }, 1500)
      return res
    } catch (err) {
      console.error('Backup fehlgeschlagen:', err instanceof Error ? err.message : err)
      status.value = 'error'
      lastMessage.value = 'Sicherung fehlgeschlagen.'
      return { written: false, reason: 'error' } // 'error' != 'empty': Schreibfehler ist NICHT „nichts zu sichern"
    }
  })()
  inflight = run
  try {
    return await run
  } finally {
    inflight = null
    progress.value = null
  }
}

/** Auto-Snapshot, wenn fällig: bei Änderung ODER wenn das Rate-Intervall seit dem letzten Backup verstrichen ist. */
async function autoSnapshotIfDue(): Promise<void> {
  if (!native() || !autoEnabled(settings.value)) return
  const iv = rateIntervalMs(settings.value)
  const last = history.value[0]?.createdAt ?? 0
  const due = dirty || (iv != null && Date.now() - last >= iv)
  if (due) {
    const res = await snapshotNow('auto')
    // Wenn Cloud aktiv ist, den frischen Auto-Stand auch hochladen (best-effort; cloudSyncNow ist idempotent
    // per Content-Hash und single-flight). Nicht awaiten, damit der Backgrounding-Pfad nicht daran hängt.
    if (res.written && cloudEnabled.value) void cloudSyncNow()
  }
}

function onHidden(): void {
  if (document.visibilityState === 'hidden') void autoSnapshotIfDue()
}
function onPagehide(): void {
  void autoSnapshotIfDue()
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Gemeinsamer Restore-/Import-Kern: Pflicht-Sicherheits-Snapshot -> anwenden -> Live-UI-Reload. Verlauf bleibt. */
async function applyEnvelope(envelope: BackupEnvelope, mode: 'merge' | 'replace', verb: string): Promise<RestoreCounts | null> {
  // Pflicht-Sicherheits-Snapshot ZUERST. Sein Ergebnis MUSS geprüft werden: schlägt er fehl (degradierte
  // DB / IO-Fehler), darf KEIN destruktiver Restore laufen — sonst wäre der Ist-Zustand ohne Rückweg weg.
  const pre = await snapshotNow('pre-restore')
  if (!pre.written && (pre.reason === 'degraded' || pre.reason === 'error')) {
    status.value = 'error'
    lastMessage.value =
      pre.reason === 'degraded'
        ? 'Kein Sicherungspunkt möglich (Bibliothek nicht lesbar) — abgebrochen.'
        : 'Sicherungspunkt fehlgeschlagen — zum Schutz abgebrochen.'
    return null
  }
  // Ausstehenden Auto-Save wegschreiben -> nur EIN Schreiber auf die Tabellen (kein 800ms-Watch mittendrin).
  await useProtocolPersistence().flushNow()
  const counts = await restoreBackup(envelope, createAppRestoreTargets(), {
    mode,
    onProgress: (d, t) => reportProgress('PZN wird geschrieben …', d, t),
  })
  // Live-UI neu laden, damit der Stand sofort sichtbar ist.
  useProtocolTree().setProtocols(await (await resolveProtocolRepository()).loadAll())
  await useBlockLibrary().reload()
  await useBausteine().reload()
  // Den NEUEN Ist-Zustand nach dem Restore als Snapshot festhalten (sonst bliebe history[0] der Pre-Restore-Stand
  // und der Cloud-Status vergliche den ALTEN Stand) und — wenn Cloud aktiv — direkt hochladen. Ohne das bliebe
  // nach „aus Cloud wiederhergestellt" der Status dauerhaft „lokaler Stand noch nicht in der Cloud". snapshotNow
  // dedupt per Content-Hash (schreibt nur, wenn der Stand wirklich neu ist).
  await snapshotNow('auto')
  if (cloudEnabled.value) await cloudSyncNow()
  await refreshHistory()
  status.value = 'saved'
  lastMessage.value = `${verb}: +${counts.protocols} Vorlagen · +${counts.blocks} Bausteine · +${counts.snippets} Mustertexte · +${counts.pzn} PZN`
  setTimeout(() => {
    if (status.value === 'saved') status.value = 'idle'
  }, 2500)
  return counts
}

/** Snapshot aus dem Verlauf wiederherstellen. */
async function restore(name: string, mode: 'merge' | 'replace'): Promise<RestoreCounts | null> {
  if (!native()) return null
  status.value = 'saving'
  try {
    const json = await store.readSnapshot(name)
    if (!json) {
      status.value = 'error'
      lastMessage.value = 'Sicherung nicht lesbar.'
      return null
    }
    const parsed = parseBackup(json)
    if (!parsed.ok) {
      status.value = 'error'
      lastMessage.value = parsed.error
      return null
    }
    return await applyEnvelope(parsed.envelope, mode, 'Wiederhergestellt')
  } catch (err) {
    console.error('Wiederherstellung fehlgeschlagen:', err instanceof Error ? err.message : err)
    status.value = 'error'
    lastMessage.value = 'Wiederherstellung fehlgeschlagen.'
    progress.value = null
    return null
  }
}

/** Eine vom Nutzer gewählte, außerhalb der App abgelegte Backup-Datei importieren (anderes/neues Gerät).
 *  Akzeptiert .json.gz und rohes .json (decodeMaybeGzip). Wie restore() mit Pflicht-Sicherheits-Snapshot. */
async function importFromFile(file: File, mode: 'merge' | 'replace'): Promise<RestoreCounts | null> {
  if (!native()) return null
  status.value = 'saving'
  try {
    const text = await decodeMaybeGzip(await readBinaryFile(file))
    if (!text) {
      status.value = 'error'
      lastMessage.value = 'Datei nicht lesbar oder kein gültiges Backup.'
      return null
    }
    const parsed = parseBackup(text)
    if (!parsed.ok) {
      status.value = 'error'
      lastMessage.value = parsed.error
      return null
    }
    return await applyEnvelope(parsed.envelope, mode, 'Importiert')
  } catch (err) {
    console.error('Import fehlgeschlagen:', err instanceof Error ? err.message : err)
    status.value = 'error'
    lastMessage.value = 'Import fehlgeschlagen.'
    progress.value = null
    return null
  }
}

/** Aktuellen Live-Stand als teilbare .json.gz-Datei exportieren (verlaufsunabhängig, ein Klick). */
async function exportCurrent(): Promise<boolean> {
  if (!native()) return false
  const av = useAppVersion()
  const src = createAppBackupDataSource({ version: av.version.value, build: av.build.value ?? undefined })
  if (src.degradedReason() != null) {
    lastMessage.value = 'Bibliothek nicht lesbar — Export abgebrochen.'
    return false
  }
  const [protocols, blocks, snippets, pzn] = await Promise.all([src.loadProtocols(), src.loadBlocks(), src.loadSnippets(), src.loadPzn()])
  const env = buildBackup({ protocols, blocks, snippets, pzn, app: src.appInfo(), createdAt: new Date().toISOString() })
  await shareBinary(`resqdocs-vorlagen-${stamp()}.json.gz`, await gzipString(JSON.stringify(env)), 'application/gzip')
  return true
}

/** Einen Snapshot aus dem Verlauf teilen (Share-Sheet -> Nutzer wählt Ziel, z. B. iCloud Drive). */
async function exportSnapshot(name: string): Promise<boolean> {
  if (!native()) return false
  const json = await store.readSnapshot(name)
  if (!json) {
    lastMessage.value = 'Sicherung nicht lesbar.'
    return false
  }
  await shareBinary(`resqdocs-vorlagen-${stamp()}.json.gz`, await gzipString(json), 'application/gzip')
  return true
}

/** Cloud-Sync: eigenen Stand hochladen (gerätescoped, Dedup, eigene Rotation) + Cloud-Liste holen. */
async function cloudSyncNow(): Promise<void> {
  if (!native() || !cloudSupported || !cloudEnabled.value) return
  if (cloudInflight) return cloudInflight
  const run = (async (): Promise<void> => {
  status.value = 'saving'
  let currentHash12: string | null = null // 12-Zeichen-Fragment des aktuellen Stands (Cloud-Namen kodieren 12)
  try {
    const av = useAppVersion()
    const src = createAppBackupDataSource({ version: av.version.value, build: av.build.value ?? undefined })
    if (src.degradedReason() == null) {
      const [protocols, blocks, snippets, pzn] = await Promise.all([src.loadProtocols(), src.loadBlocks(), src.loadSnippets(), src.loadPzn()])
      const env = buildBackup({ protocols, blocks, snippets, pzn, app: src.appInfo(), createdAt: new Date().toISOString() })
      const total = env.counts.protocols + env.counts.blocks + env.counts.snippets + env.counts.pzn
      const hash = await sha256Hex(`${JSON.stringify(env.sections)}|${JSON.stringify(env.pzn)}`)
      currentHash12 = hash.slice(0, 12)
      const id = await deviceId()
      const files = await cloudStore.list()
      const plan = planCloudSync(files, id, { createdAt: Date.now(), total, hash }, rotationFor(settings.value))
      if (plan.upload) {
        await cloudStore.put(plan.name, JSON.stringify(env))
        for (const pid of plan.pruneIds) await cloudStore.remove(pid)
      }
    }
    cloudFiles.value = cloudHistory(await cloudStore.list())
    cloudHashes.value = new Set(cloudFiles.value.map((c) => c.hash))
    lastCloudSync.value = Date.now()
    await Preferences.set({ key: HASHES_KEY, value: JSON.stringify([...cloudHashes.value]) })
    await Preferences.set({ key: LAST_SYNC_KEY, value: String(lastCloudSync.value) })
    // Cloud gilt erst als „aktuell", wenn der eben berechnete Stand wirklich in der Cloud-Liste steht.
    // (Bei degradierter Bibliothek bleibt currentHash12 null -> dirty unangetastet, nichts fälschlich als synchron markiert.)
    if (currentHash12 != null) await setCloudDirty(!cloudHashes.value.has(currentHash12))
    status.value = 'saved'
    lastMessage.value = 'Cloud synchronisiert.'
    setTimeout(() => {
      if (status.value === 'saved') status.value = 'idle'
    }, 1500)
  } catch (err) {
    console.error('Cloud-Sync fehlgeschlagen:', err instanceof Error ? err.message : err)
    status.value = 'error'
    lastMessage.value = 'Cloud-Sync fehlgeschlagen.'
  }
  })()
  cloudInflight = run
  try {
    await run
  } finally {
    cloudInflight = null
  }
}

/** Ein „Sichern": immer lokal — und wenn Cloud aktiv ist, direkt auch in die Cloud. Reihenfolge lokal->Cloud
 *  garantiert denselben Inhalt/Hash, der neue Stand ist damit sofort „auch in Cloud". */
async function backupNow(): Promise<void> {
  await snapshotNow('manual')
  if (cloudEnabled.value) await cloudSyncNow()
}

/** Cloud aktivieren: interaktiver Login, dann erster Sync. Fehler werden SICHTBAR gemeldet (Diagnose am Gerät). */
async function enableCloud(): Promise<boolean> {
  if (!native()) return false
  if (!cloudSupported) {
    lastMessage.value = 'Cloud-Sicherung ist auf diesem Gerät nicht verfügbar.'
    return false
  }
  try {
    const ok = await cloudStore.signIn()
    if (ok) {
      cloudEnabled.value = true
      await Preferences.set({ key: CLOUD_KEY, value: '1' })
      await cloudSyncNow()
      return true
    }
    lastMessage.value =
      cloudKind === 'icloud'
        ? 'iCloud nicht verfügbar — in den iOS-Einstellungen bei iCloud angemeldet und iCloud Drive aktiv?'
        : 'Cloud-Anmeldung nicht möglich — kein Google-Konto am Gerät / kein Google Play?'
    return false
  } catch (err) {
    // z. B. DEVELOPER_ERROR (SHA-1/Package), fehlendes Google Play, kein Konto, abgebrochen.
    console.error('Cloud-Anmeldung fehlgeschlagen:', err instanceof Error ? err.message : err)
    lastMessage.value = `Cloud-Anmeldung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
    return false
  }
}

async function disableCloud(): Promise<void> {
  await cloudStore.signOut()
  cloudEnabled.value = false
  cloudFiles.value = []
  cloudHashes.value = new Set()
  lastCloudSync.value = null
  await setCloudDirty(false)
  await Preferences.set({ key: CLOUD_KEY, value: '0' })
  await Preferences.remove({ key: HASHES_KEY })
  await Preferences.remove({ key: LAST_SYNC_KEY })
}

/** Aus einem Cloud-Stand wiederherstellen (wie restore(): Pflicht-Sicherheits-Snapshot + Live-Reload). */
async function restoreFromCloud(id: string, mode: 'merge' | 'replace'): Promise<RestoreCounts | null> {
  if (!native()) return null
  status.value = 'saving'
  try {
    const json = await cloudStore.get(id)
    if (!json) {
      status.value = 'error'
      lastMessage.value = 'Cloud-Sicherung nicht lesbar.'
      return null
    }
    const parsed = parseBackup(json)
    if (!parsed.ok) {
      status.value = 'error'
      lastMessage.value = parsed.error
      return null
    }
    return await applyEnvelope(parsed.envelope, mode, 'Aus Cloud wiederhergestellt')
  } catch (err) {
    console.error('Cloud-Wiederherstellung fehlgeschlagen:', err instanceof Error ? err.message : err)
    status.value = 'error'
    lastMessage.value = 'Cloud-Wiederherstellung fehlgeschlagen.'
    progress.value = null
    return null
  }
}

/** Einen einzelnen Cloud-Stand löschen (nur den in der Cloud; der lokale Verlauf bleibt). */
async function deleteFromCloud(id: string): Promise<void> {
  if (!native() || !cloudSupported) return
  status.value = 'saving'
  try {
    await cloudStore.remove(id)
    cloudFiles.value = cloudHistory(await cloudStore.list())
    cloudHashes.value = new Set(cloudFiles.value.map((c) => c.hash))
    await Preferences.set({ key: HASHES_KEY, value: JSON.stringify([...cloudHashes.value]) })
    status.value = 'saved'
    lastMessage.value = 'Cloud-Sicherung gelöscht.'
    setTimeout(() => {
      if (status.value === 'saved') status.value = 'idle'
    }, 1500)
  } catch (err) {
    console.error('Cloud-Löschen fehlgeschlagen:', err instanceof Error ? err.message : err)
    status.value = 'error'
    lastMessage.value = 'Cloud-Löschen fehlgeschlagen.'
  }
}

async function deleteAll(): Promise<void> {
  if (!native()) return
  await store.clearAll()
  await refreshHistory()
  lastMessage.value = 'Alle Sicherungen gelöscht.'
}

async function updateSettings(next: BackupSettings): Promise<void> {
  settings.value = next
  await saveBackupSettings(next)
}

export function useBackup() {
  async function init(): Promise<void> {
    if (started) return
    started = true
    settings.value = await loadBackupSettings()
    if (!native()) return
    await refreshHistory()
    // Cloud-Zustand NUR aus dem persistierten Flag spiegeln (Toggle zeigt frühere Zustimmung an). BEWUSST
    // KEIN Cloud-Netz/-Login beim App-Start — sonst würde allein das Flag einen Drittanbieter-Login/-Abruf
    // ohne aktuelle Nutzeraktion auslösen. Der Cloud-Verlauf lädt erst beim expliziten „Jetzt synchronisieren".
    const cloudFlag = await Preferences.get({ key: CLOUD_KEY })
    cloudEnabled.value = cloudFlag.value === '1'
    // Persistierte Cloud-Sicht laden (nur Preferences, kein Netz) -> Anzeige bleibt nach Neustart ehrlich.
    const lastSync = await Preferences.get({ key: LAST_SYNC_KEY })
    lastCloudSync.value = lastSync.value ? Number(lastSync.value) || null : null
    const hashes = await Preferences.get({ key: HASHES_KEY })
    if (hashes.value) {
      try {
        cloudHashes.value = new Set(JSON.parse(hashes.value) as string[])
      } catch {
        /* ignorieren */
      }
    }
    const dirtyFlag = await Preferences.get({ key: DIRTY_KEY })
    cloudDirty.value = dirtyFlag.value === '1'
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPagehide)
    appListener = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        void autoSnapshotIfDue()
      } else if (cloudEnabled.value && cloudDirty.value) {
        // Rückkehr in den Vordergrund: verpassten Hintergrund-Upload STILL nachholen (kein Login-Dialog).
        void cloudSyncNow()
      }
    })
    // Änderungs-Erkennung (dirty) über die drei reaktiven Datensätze; PZN (nicht reaktiv) fängt das Rate-Netz.
    watch(useProtocolTree().protocols, () => (dirty = true), { deep: true })
    watch(useBlockLibrary().blocks, () => (dirty = true), { deep: true })
    watch(useBausteine().snippets, () => (dirty = true), { deep: true })
    // Rate-Sicherheitsnetz, solange die App offen ist (bei geschlossener App übernimmt später der native Scheduler).
    netTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void autoSnapshotIfDue()
      if (cloudEnabled.value && cloudDirty.value) void cloudSyncNow() // ausstehenden Cloud-Upload nachholen
    }, 15 * 60 * 1000)
    // Beim Start einen aus einer früheren Sitzung ausstehenden Cloud-Upload STILL nachholen (nur wenn Cloud aktiv
    // UND wirklich etwas aussteht). accessToken(false) -> kein Login-Dialog aus dem Hintergrund.
    if (cloudEnabled.value && cloudDirty.value && cloudSupported) void cloudSyncNow()
  }

  function dispose(): void {
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPagehide)
    void appListener?.remove()
    appListener = null
    if (netTimer != null) clearInterval(netTimer)
    netTimer = null
    started = false
  }

  return {
    init,
    dispose,
    settings,
    history,
    status,
    lastMessage,
    progress,
    snapshotNow,
    backupNow,
    restore,
    importFromFile,
    exportCurrent,
    exportSnapshot,
    deleteAll,
    updateSettings,
    // Cloud
    cloudSupported,
    cloudKind,
    cloudEnabled,
    cloudDirty,
    cloudFiles,
    cloudHashes,
    lastCloudSync,
    enableCloud,
    disableCloud,
    cloudSyncNow,
    restoreFromCloud,
    deleteFromCloud,
  }
}
