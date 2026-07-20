<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useBackup } from '@/backup/useBackup'
import { rotationFor } from '@/backup/backupSettings'
import type { BackupRate, RetentionPreset } from '@/backup/backupSettings'

/**
 * Sicherung & Wiederherstellung — lokaler, zyklischer Backup-Verlauf des Vorlagen-Materials.
 * Nur Vorlagen/Bausteine/Mustertexte/PZN, KEINE Patientendaten. Rein lokal auf dem Gerät.
 */
const backup = useBackup()
const busy = ref(false)
const confirmDeleteAll = ref(false)
const openSnapshot = ref<string | null>(null) // Name des aufgeklappten Snapshots
const confirmReplace = ref<string | null>(null) // Name des Snapshots, für den „Exakt herstellen" bestätigt wird
const shareConfirm = ref<{ kind: 'current' } | { kind: 'snapshot'; name: string } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => void backup.init())

const richestTotal = computed(() => backup.history.value.reduce((m, s) => Math.max(m, s.total), 0))

// Übersetzt die gewählte Aufbewahrung in eine für den Nutzer greifbare Konsequenz: wie viele Stände maximal
// aufgehoben werden und wie weit zurück man springen kann.
const retention = computed(() => {
  const c = rotationFor(backup.settings.value)
  const cap = c.recent + c.dailyDays + c.weeklyWeeks
  const months = Math.max(1, Math.round((c.dailyDays + c.weeklyWeeks * 7) / 30))
  return { cap, months }
})

function relTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.round(diff / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  return `vor ${d} Tag${d === 1 ? '' : 'en'}`
}
function absTime(ms: number): string {
  return new Date(ms).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}
function originLabel(o?: string): string {
  return o === 'manual' ? 'Manuell' : o === 'pre-restore' ? 'Vor Wiederherstellung' : 'Automatisch'
}

const lastAt = computed(() => backup.history.value[0]?.createdAt ?? null)

async function saveNow(): Promise<void> {
  busy.value = true
  try {
    await backup.backupNow() // lokal + (wenn Cloud aktiv) Cloud
  } finally {
    busy.value = false
  }
}

// Lokal<->Cloud-Abgleich NUR über den Content-Hash (beweisbar identischer Inhalt), nie über Name/Zeit.
function inCloud(hash: string): boolean {
  return backup.cloudHashes.value.has(hash.slice(0, 12))
}
const cloudCount = computed(() => backup.cloudHashes.value.size)
const bothCount = computed(() => backup.history.value.filter((s) => inCloud(s.hash)).length)
const cloudStatus = computed<{ kind: 'off' | 'ok' | 'pending' | 'unknown'; text: string }>(() => {
  if (!backup.cloudEnabled.value) return { kind: 'off', text: 'Cloud aus' }
  const newest = backup.history.value[0]
  if (backup.cloudHashes.value.size === 0 && backup.lastCloudSync.value == null)
    return { kind: 'unknown', text: 'unbekannt — jetzt synchronisieren' }
  if (newest && inCloud(newest.hash)) return { kind: 'ok', text: 'aktuell — lokaler Stand ist in der Cloud' }
  return { kind: 'pending', text: 'lokaler Stand noch nicht in der Cloud' }
})

async function setRate(rate: BackupRate): Promise<void> {
  await backup.updateSettings({ ...backup.settings.value, rate })
}
async function setPreset(preset: RetentionPreset): Promise<void> {
  await backup.updateSettings({ ...backup.settings.value, preset })
}
async function setCustom(field: 'recent' | 'dailyDays' | 'weeklyWeeks', value: number): Promise<void> {
  const custom = { ...backup.settings.value.custom, [field]: Math.max(0, Math.round(value)) }
  await backup.updateSettings({ ...backup.settings.value, preset: 'eigene', custom })
}

async function doRestore(name: string, mode: 'merge' | 'replace'): Promise<void> {
  busy.value = true
  try {
    await backup.restore(name, mode)
    openSnapshot.value = null
    confirmReplace.value = null
  } finally {
    busy.value = false
  }
}

async function doDeleteAll(): Promise<void> {
  busy.value = true
  try {
    await backup.deleteAll()
  } finally {
    busy.value = false
    confirmDeleteAll.value = false
  }
}

function askShareCurrent(): void {
  shareConfirm.value = { kind: 'current' }
}
function askShareSnapshot(name: string): void {
  shareConfirm.value = { kind: 'snapshot', name }
}
async function doShare(): Promise<void> {
  const req = shareConfirm.value
  if (!req) return
  busy.value = true
  try {
    if (req.kind === 'current') await backup.exportCurrent()
    else await backup.exportSnapshot(req.name)
  } finally {
    busy.value = false
    shareConfirm.value = null
  }
}
function pickImport(): void {
  fileInput.value?.click()
}
async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // erlaubt, dieselbe Datei erneut zu wählen
  if (!file) return
  busy.value = true
  try {
    await backup.importFromFile(file, 'merge')
  } finally {
    busy.value = false
  }
}

const cloudBusy = ref(false)
const cloudConsent = ref(false) // Einwilligungs-Dialog vor dem ERSTEN Aktivieren
const cloudToggle = ref<HTMLInputElement | null>(null)
const confirmCloudReplace = ref<string | null>(null) // Cloud-Stand-id, für den „Exakt herstellen" bestätigt wird
const confirmCloudDelete = ref<string | null>(null) // Cloud-Stand-id, für den Löschen bestätigt wird

// Die DOM-Checkbox autoritativ auf den echten Zustand zurücksetzen (nach Abbruch/fehlgeschlagenem Login), sonst
// bliebe der Toggle optisch AN, obwohl Cloud AUS ist (:checked patcht bei unverändertem Wert nicht zurück).
function syncToggle(): void {
  if (cloudToggle.value) cloudToggle.value.checked = backup.cloudEnabled.value
}

// Das Häkchen ist bewusstes Opt-in: Einschalten zeigt zuerst die Einwilligung, erst deren Bestätigung meldet an.
function onCloudToggle(checked: boolean): void {
  if (checked) cloudConsent.value = true
  else void setCloud(false).then(syncToggle)
}
function cancelCloudConsent(): void {
  cloudConsent.value = false
  syncToggle() // Toggle zurück auf AUS (es fand kein Login statt)
}
async function confirmCloudOn(): Promise<void> {
  cloudConsent.value = false
  await setCloud(true)
  syncToggle() // bei fehlgeschlagenem Login zurück auf AUS
}
async function setCloud(on: boolean): Promise<void> {
  cloudBusy.value = true
  try {
    if (on) await backup.enableCloud()
    else await backup.disableCloud()
  } finally {
    cloudBusy.value = false
  }
}
async function cloudSync(): Promise<void> {
  cloudBusy.value = true
  try {
    await backup.cloudSyncNow()
  } finally {
    cloudBusy.value = false
  }
}
async function cloudRestore(id: string): Promise<void> {
  cloudBusy.value = true
  try {
    await backup.restoreFromCloud(id, 'merge')
  } finally {
    cloudBusy.value = false
  }
}
async function cloudRestoreReplace(id: string): Promise<void> {
  cloudBusy.value = true
  try {
    await backup.restoreFromCloud(id, 'replace')
    confirmCloudReplace.value = null
  } finally {
    cloudBusy.value = false
  }
}
async function cloudDelete(id: string): Promise<void> {
  cloudBusy.value = true
  try {
    await backup.deleteFromCloud(id)
    confirmCloudDelete.value = null
  } finally {
    cloudBusy.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h3 class="font-medium">Sicherung &amp; Wiederherstellung</h3>

    <!-- Datenschutz-Banner: dauerhaft, ehrlich, ohne Hedging -->
    <div class="rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-base-content/80">
      <strong>Lokal auf diesem Gerät.</strong> Sichert nur <strong>Vorlagen, Bausteine, Mustertexte und die
      PZN-Bibliothek</strong> — <strong>keine Patientendaten</strong>, keinen laufenden Einsatz. Wenn du eine
      Sicherung <strong>teilst oder in eine Cloud legst, verlässt sie dein Gerät — das entscheidest und
      verantwortest du selbst.</strong>
    </div>

    <!-- Status-Header + Jetzt sichern -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-col">
          <span class="text-sm font-medium">
            {{ backup.history.value.length }}
            {{ backup.history.value.length === 1 ? 'Sicherung' : 'Sicherungen' }}
          </span>
          <span class="text-xs text-base-content/60">
            {{ lastAt ? `zuletzt ${relTime(lastAt)}` : 'noch keine Sicherung' }}
          </span>
        </div>
        <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="busy" @click="saveNow">
          {{ busy ? 'Sichert …' : 'Jetzt sichern' }}
        </button>
      </div>
      <p v-if="backup.lastMessage.value" role="status" aria-live="polite" class="mt-1 text-xs text-base-content/60">
        {{ backup.lastMessage.value }}
      </p>

      <!-- Fortschritt bei langen Vorgängen (große PZN-Bibliothek): Packen/Schreiben. Nur bei großen Ops sichtbar. -->
      <div v-if="backup.progress.value" class="mt-2">
        <p class="mb-1 text-xs text-base-content/70">
          {{ backup.progress.value.label }}
          <span v-if="backup.progress.value.total > 0" class="tabular-nums">
            · {{ Math.round((100 * backup.progress.value.done) / backup.progress.value.total) }} %
          </span>
        </p>
        <progress
          class="progress progress-primary w-full"
          :value="backup.progress.value.total > 0 ? backup.progress.value.done : undefined"
          :max="backup.progress.value.total > 0 ? backup.progress.value.total : undefined"
        ></progress>
      </div>

      <div class="mt-2 flex flex-wrap gap-2">
        <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="askShareCurrent">
          Aktuellen Stand exportieren
        </button>
        <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="pickImport">
          Sicherung importieren
        </button>
        <input ref="fileInput" type="file" accept=".json,.gz,application/json,application/gzip" class="hidden" @change="onImportFile" />
      </div>
    </div>

    <!-- Just-in-time-Bestätigung vor dem Teilen (das Share-Sheet kennt das Ziel vorher nicht). -->
    <div v-if="shareConfirm" class="rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
      <p><strong>Sicherung teilen?</strong> Diese Datei enthält <strong>nur Vorlagen und Textbausteine — keine
        Patientendaten.</strong> Legst du sie in iCloud, Drive, Mail o. Ä., verlässt sie dein Gerät und liegt
        außerhalb der App. <strong>Das wählst und verantwortest du selbst</strong> (kein Zurückholen möglich).</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="busy" @click="doShare">
          {{ busy ? 'Teilt …' : 'Teilen' }}
        </button>
        <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="shareConfirm = null">Abbrechen</button>
      </div>
    </div>

    <!-- Frequenz -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <p class="text-sm font-medium">Automatisch sichern</p>
      <p class="mt-1 text-xs text-base-content/60">Zusätzlich zum Speichern beim Verlassen der App.</p>
      <div class="join mt-2">
        <button
          v-for="opt in [
            { v: 'daily', l: 'Täglich' },
            { v: 'weekly', l: 'Wöchentlich' },
            { v: 'manual', l: 'Nur manuell' },
          ]"
          :key="opt.v"
          class="btn join-item btn-sm min-h-11"
          :class="backup.settings.value.rate === opt.v ? 'btn-primary' : 'btn-outline'"
          type="button"
          @click="setRate(opt.v as BackupRate)"
        >
          {{ opt.l }}
        </button>
      </div>
    </div>

    <!-- Aufbewahrung -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <label class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-medium">Aufbewahrung</span>
        <select
          class="select select-bordered select-sm min-h-11"
          :value="backup.settings.value.preset"
          aria-label="Wie viele Sicherungen aufbewahrt werden"
          @change="setPreset(($event.target as HTMLSelectElement).value as RetentionPreset)"
        >
          <option value="sparsam">Sparsam</option>
          <option value="standard">Standard (empfohlen)</option>
          <option value="ausfuehrlich">Ausführlich</option>
          <option value="eigene">Eigene</option>
        </select>
      </label>
      <p class="mt-1 text-xs text-base-content/60">
        Hebt bis zu <strong>{{ retention.cap }} Sicherungen</strong> auf und reicht rund
        <strong>{{ retention.months }} {{ retention.months === 1 ? 'Monat' : 'Monate' }}</strong> zurück.
        Ältere werden nach und nach ausgedünnt (nie alles auf einmal) — die neuesten bleiben dicht, dann je eine
        pro Tag bzw. Woche, damit du weit zurückspringen kannst, ohne den Speicher zu fluten.
        <br />
        <span class="text-base-content/50">Sparsam = weniger Stände/kürzer · Ausführlich = mehr Stände/länger.</span>
        Deine <strong>größte</strong> Sicherung (Etikett »bleibt erhalten«) wird <strong>nie</strong> automatisch
        gelöscht — als Schutz, falls versehentlich alles leer wird.
      </p>
      <div v-if="backup.settings.value.preset === 'eigene'" class="mt-2 grid grid-cols-3 gap-2">
        <label class="text-xs">Neueste
          <input type="number" min="1" class="input input-bordered input-sm w-full" :value="backup.settings.value.custom.recent"
            @change="setCustom('recent', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="text-xs">Tage
          <input type="number" min="0" class="input input-bordered input-sm w-full" :value="backup.settings.value.custom.dailyDays"
            @change="setCustom('dailyDays', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="text-xs">Wochen
          <input type="number" min="0" class="input input-bordered input-sm w-full" :value="backup.settings.value.custom.weeklyWeeks"
            @change="setCustom('weeklyWeeks', Number(($event.target as HTMLInputElement).value))" />
        </label>
      </div>
    </div>

    <!-- Verlauf -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <p class="text-sm font-medium">Verlauf</p>
      <p v-if="backup.history.value.length === 0" class="mt-1 text-xs text-base-content/60">Noch keine Sicherungen.</p>
      <ul v-else class="mt-2 flex flex-col gap-2">
        <li v-for="s in backup.history.value" :key="s.name" class="rounded-md bg-base-100 p-2">
          <button
            type="button"
            class="flex w-full flex-col gap-1 text-left"
            @click="openSnapshot = openSnapshot === s.name ? null : s.name"
          >
            <span class="text-sm">{{ absTime(s.createdAt) }}</span>
            <span class="text-xs text-base-content/60">
              <template v-if="s.counts">{{ s.counts.protocols }} Vorlagen · {{ s.counts.blocks }} Bausteine ·
                {{ s.counts.snippets }} Mustertexte · {{ s.counts.pzn }} PZN</template>
              <template v-else>{{ s.total }} Einträge</template>
              · {{ relTime(s.createdAt) }}
            </span>
            <span class="mt-0.5 flex flex-wrap items-center gap-1">
              <span
                v-if="s.total === richestTotal && richestTotal > 0"
                class="badge badge-success badge-sm whitespace-nowrap"
                title="Größte Sicherung — wird nie automatisch gelöscht"
              >bleibt erhalten</span>
              <span
                v-if="backup.cloudEnabled.value"
                class="badge badge-sm whitespace-nowrap"
                :class="inCloud(s.hash) ? 'badge-success' : 'badge-ghost'"
              >{{ inCloud(s.hash) ? 'auch in Cloud' : 'nur lokal' }}</span>
              <span class="badge badge-ghost badge-sm whitespace-nowrap">{{ originLabel(s.origin) }}</span>
            </span>
          </button>

          <div v-if="openSnapshot === s.name" class="mt-2 flex flex-col gap-2 border-t border-base-300 pt-2">
            <p class="text-xs text-base-content/70">
              Wiederherstellen ändert nur deine Live-Bibliothek. <strong>Neuere Sicherungen bleiben erhalten</strong> —
              vorher wird automatisch dein aktueller Stand gesichert, du kannst jederzeit zurückspringen.
            </p>
            <div v-if="confirmReplace !== s.name" class="flex flex-wrap gap-2">
              <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="doRestore(s.name, 'merge')">
                Zusammenführen (nichts löschen)
              </button>
              <button class="btn btn-outline btn-warning btn-sm min-h-11" type="button" :disabled="busy" @click="confirmReplace = s.name">
                Exakt herstellen …
              </button>
              <button class="btn btn-ghost btn-sm min-h-11" type="button" :disabled="busy" @click="askShareSnapshot(s.name)">
                Exportieren
              </button>
            </div>
            <div v-else class="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
              <p>„Exakt herstellen" <strong>ersetzt deine aktuelle Bibliothek</strong> durch diesen Stand
                (später Hinzugefügtes verschwindet). Dein jetziger Stand wurde gerade gesichert — du kannst
                zurückspringen. Fortfahren?</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button class="btn btn-warning btn-sm min-h-11" type="button" :disabled="busy" @click="doRestore(s.name, 'replace')">
                  {{ busy ? 'Stellt her …' : 'Ersetzen' }}
                </button>
                <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="confirmReplace = null">Abbrechen</button>
              </div>
            </div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Cloud: eigenes Konto, eigene Geräte -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <p class="text-sm font-medium">In deinem Konto sichern (Cloud)</p>
      <p class="mt-1 text-xs text-base-content/60">
        Synchronisiert deine Sicherungen über deine <strong>eigenen Geräte</strong> — <strong>iPhone/iPad über
        iCloud</strong>, Android über dein Google-Konto (jeweils ein versteckter, app-eigener Ordner). Nur
        <strong>Vorlagen &amp; Textbausteine, keine Patientendaten</strong> — es liegt in deinem Konto, das
        entscheidest und verantwortest du selbst.
      </p>

      <template v-if="backup.cloudSupported">
      <!-- Status: lokal vs. Cloud (aus dem Content-Hash-Abgleich berechnet, kein gespeichertes „synced"-Flag). -->
      <div class="mt-2 text-xs text-base-content/70">
        {{ backup.history.value.length }} lokal · {{ cloudCount }} in Cloud · {{ bothCount }} in beidem
      </div>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <span
          class="badge badge-sm"
          :class="{
            'badge-ghost': cloudStatus.kind === 'off',
            'badge-success': cloudStatus.kind === 'ok',
            'badge-warning': cloudStatus.kind === 'pending' || cloudStatus.kind === 'unknown',
          }"
        >
          {{ cloudBusy ? 'Synchronisiert …' : cloudStatus.text }}
        </span>
        <span v-if="backup.lastCloudSync.value" class="text-xs text-base-content/50">zuletzt {{ relTime(backup.lastCloudSync.value) }}</span>
      </div>

      <label class="mt-2 flex items-center gap-3">
        <input
          ref="cloudToggle"
          type="checkbox"
          class="toggle toggle-primary"
          :checked="backup.cloudEnabled.value"
          :disabled="cloudBusy"
          aria-label="Cloud-Sicherung aktivieren"
          @change="onCloudToggle(($event.target as HTMLInputElement).checked)"
        />
        <span class="text-sm">Cloud-Sicherung aktivieren {{ cloudBusy ? '…' : '' }}</span>
      </label>

      <!-- Status/Ursache direkt am Toggle (nicht nur in der oberen „Jetzt sichern"-Karte), damit ein
           fehlgeschlagenes Aktivieren hier sichtbar begründet wird statt stumm zurückzuspringen. -->
      <p v-if="backup.lastMessage.value" role="status" aria-live="polite" class="mt-2 text-xs text-base-content/70">
        {{ backup.lastMessage.value }}
      </p>

      <!-- Einwilligung vor der ERSTEN Aktivierung (Login + Daten in dein Konto). -->
      <div v-if="cloudConsent" class="mt-2 rounded-lg border border-info/40 bg-info/10 p-3 text-sm">
        <p><strong>Cloud-Sicherung aktivieren?</strong> Deine Sicherungen werden über dein <strong>eigenes Konto</strong>
          zwischen deinen Geräten synchronisiert. Enthalten sind <strong>nur Vorlagen und Textbausteine — keine
          Patientendaten.</strong> Das entscheidest und verantwortest du selbst.</p>
        <p v-if="backup.cloudKind === 'google'" class="mt-2 text-base-content/70">
          Beim Anmelden fragt Google dein <strong>Basis-Profil</strong> (Name, E-Mail, Bild) ab — das verlangt
          Google beim Login, <strong>ResQDocs speichert und nutzt davon nichts</strong>. Der einzige Zugriff ist ein
          <strong>versteckter, app-eigener Ordner</strong> in deinem Drive; deine sonstigen Dateien bleiben unsichtbar.
        </p>
        <p v-else-if="backup.cloudKind === 'icloud'" class="mt-2 text-base-content/70">
          Auf iPhone/iPad läuft das über <strong>iCloud</strong> — es nutzt dein bereits angemeldetes iCloud-Konto,
          <strong>ohne extra Login und ohne Profil-Freigabe</strong>. Gespeichert wird in einem <strong>versteckten,
          app-eigenen Ordner</strong>, der in der Dateien-App nicht auftaucht.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="confirmCloudOn">Aktivieren</button>
          <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="cancelCloudConsent">Abbrechen</button>
        </div>
      </div>

      <div v-if="backup.cloudEnabled.value" class="mt-2">
        <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="cloudSync">
          Jetzt synchronisieren
        </button>
      </div>
      <ul v-if="backup.cloudEnabled.value && backup.cloudFiles.value.length" class="mt-2 flex flex-col gap-2">
        <li v-for="c in backup.cloudFiles.value" :key="c.id" class="rounded-md bg-base-100 p-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="flex flex-col">
              <span class="text-sm">{{ absTime(c.createdAt) }}</span>
              <span class="text-xs text-base-content/60">{{ c.total }} Einträge · Gerät {{ c.deviceId }}</span>
            </span>
            <span class="flex flex-wrap gap-1">
              <button class="btn btn-outline btn-xs min-h-11" type="button" :disabled="cloudBusy" @click="cloudRestore(c.id)">Hinzufügen</button>
              <button class="btn btn-outline btn-warning btn-xs min-h-11" type="button" :disabled="cloudBusy" @click="confirmCloudReplace = c.id; confirmCloudDelete = null">Exakt herstellen</button>
              <button class="btn btn-ghost btn-xs min-h-11" type="button" :disabled="cloudBusy" @click="confirmCloudDelete = c.id; confirmCloudReplace = null" aria-label="Cloud-Sicherung löschen">✕</button>
            </span>
          </div>
          <div v-if="confirmCloudReplace === c.id" class="mt-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
            <p>„Exakt herstellen" <strong>ersetzt deine aktuelle Bibliothek</strong> durch diesen Cloud-Stand
              (später Hinzugefügtes verschwindet). Dein jetziger Stand wird vorher gesichert. Fortfahren?</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button class="btn btn-warning btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="cloudRestoreReplace(c.id)">
                {{ cloudBusy ? 'Stellt her …' : 'Ersetzen' }}
              </button>
              <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="confirmCloudReplace = null">Abbrechen</button>
            </div>
          </div>
          <div v-if="confirmCloudDelete === c.id" class="mt-2 rounded-lg border border-error/50 bg-error/10 p-3 text-sm">
            <p>Diese <strong>Cloud-Sicherung löschen</strong>? Nur der Cloud-Stand wird entfernt; dein lokaler
              Verlauf bleibt. Lässt sich nicht rückgängig machen.</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button class="btn btn-error btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="cloudDelete(c.id)">
                {{ cloudBusy ? 'Löscht …' : 'Löschen' }}
              </button>
              <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="cloudBusy" @click="confirmCloudDelete = null">Abbrechen</button>
            </div>
          </div>
        </li>
      </ul>
      <p v-else-if="backup.cloudEnabled.value" class="mt-2 text-xs text-base-content/60">Noch keine Cloud-Sicherungen.</p>
      </template>
      <p v-else class="mt-2 text-xs text-base-content/60">
        Cloud-Sicherung ist nur in der App (iPhone/iPad oder Android) verfügbar. Der lokale Verlauf sowie
        Exportieren/Importieren funktionieren überall.
      </p>
    </div>

    <!-- Alle löschen -->
    <div class="rounded-lg border border-error/30 p-3">
      <p class="text-sm font-medium">Alle Sicherungen löschen</p>
      <p class="mt-1 text-xs text-base-content/60">Entfernt den gesamten lokalen Backup-Verlauf. Die Live-Bibliothek bleibt unberührt.</p>
      <button v-if="!confirmDeleteAll" class="btn btn-outline btn-error btn-sm mt-2 min-h-11" type="button" :disabled="busy" @click="confirmDeleteAll = true">
        Alle löschen
      </button>
      <div v-else class="mt-2 rounded-lg border border-error/50 bg-error/10 p-3 text-sm">
        <p>Wirklich <strong>alle Sicherungen</strong> löschen? Das lässt sich nicht rückgängig machen.</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button class="btn btn-error btn-sm min-h-11" type="button" :disabled="busy" @click="doDeleteAll">
            {{ busy ? 'Löscht …' : 'Alle löschen' }}
          </button>
          <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="confirmDeleteAll = false">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>
</template>
