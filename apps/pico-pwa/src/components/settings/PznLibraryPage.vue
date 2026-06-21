<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PackageScanOverlay from '@/components/PackageScanOverlay.vue'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { extractPznFromPackageCode, type PackageBarcodeFormat } from '@/medications/packageScan'
import { normalizePzn, type ImportMode, type PznEntry } from '@/medications/pznLibrary'
import { PZN_CATEGORIES } from '@/medications/pznCategories'
import { readBinaryFile } from '@/utils/fileTransfer'
import { decodeMaybeGzip } from '@/utils/gzip'
import { requestScreenWakeLock } from '@/utils/wakeLock'

/**
 * PZN-Bibliothek als eigene Einstellungs-Seite (#190/#194/#195). Backend-agnostisch über
 * das async usePznLibrary-Singleton (nativ SQLite, skaliert auf ~317k; Web Preferences).
 * Liste/Suche laufen SEITENWEISE aus dem Backend — nie die ganze Menge im DOM/Speicher.
 *
 * Pro Eintrag: Bezeichnung (frei), Kategorie (feste Admin-Auswahl) und Bemerkung (frei).
 * „In der Bibliothek scannen" identifiziert eine bekannte PZN (zeigt Kategorie/Funktion).
 *
 * IFA/DSGVO: KEIN Netzzugriff, KEINE automatische PZN→Name-Auflösung; patientenentkoppelte
 * Menge; Backup nur lokal. Datenverantwortung: DISCLAIMER.md.
 */
const emit = defineEmits<{ back: [] }>()
const lib = usePznLibrary()

const PAGE = 100
const entries = ref<PznEntry[]>([])
const total = ref(0)
const hasMore = ref(false)
const loading = ref(false)

// Suche (gedrosselt) + Sortierung nach PZN. Lesen läuft SQL-seitig, daher kein
// In-Memory-Filter über die Gesamtmenge.
const queryInput = ref('')
const query = ref('')
const SEARCH_DEBOUNCE_MS = 160
let queryTimer: ReturnType<typeof setTimeout> | undefined
watch(queryInput, (v) => {
  if (queryTimer) clearTimeout(queryTimer)
  queryTimer = setTimeout(() => { query.value = v }, SEARCH_DEBOUNCE_MS)
})
onUnmounted(() => { if (queryTimer) clearTimeout(queryTimer) })

const sortDir = ref<'asc' | 'desc'>('asc')

async function fetchWindow(offset: number): Promise<PznEntry[]> {
  const q = query.value.trim()
  return q
    ? lib.search(q, { offset, limit: PAGE })
    : lib.page({ offset, limit: PAGE, dir: sortDir.value })
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [first, n] = await Promise.all([fetchWindow(0), lib.count()])
    entries.value = first
    total.value = n
    hasMore.value = first.length === PAGE
  } finally {
    loading.value = false
  }
}
async function loadMore(): Promise<void> {
  const next = await fetchWindow(entries.value.length)
  entries.value = [...entries.value, ...next]
  hasMore.value = next.length === PAGE
}

onMounted(reload)
watch([query, sortDir], reload)

function toggleSortPzn(): void {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
}

// --- Erfassen / Bearbeiten ---
const pznInput = ref('')
const wirkstoffInput = ref('')
const labelInput = ref('')
const categoryInput = ref('')
const noteInput = ref('')
const error = ref<string | null>(null)
const status = ref<string | null>(null)
const scanning = ref(false)
const identified = ref<PznEntry | null>(null)

function resetForm(): void {
  pznInput.value = ''
  wirkstoffInput.value = ''
  labelInput.value = ''
  categoryInput.value = ''
  noteInput.value = ''
  identified.value = null
}

async function addEntry(): Promise<void> {
  error.value = null
  status.value = null
  const norm = normalizePzn(pznInput.value)
  if (!norm) { error.value = 'Ungültige PZN (4–8 Ziffern erwartet).'; return }
  const res = await lib.upsert(norm, {
    wirkstoff: wirkstoffInput.value,
    label: labelInput.value,
    category: categoryInput.value,
    note: noteInput.value,
  })
  if (res === 'invalid') { error.value = 'Ungültige PZN.'; return }
  status.value = res === 'added' ? `PZN ${norm} gespeichert.` : `PZN ${norm} aktualisiert.`
  resetForm()
  await reload()
}

async function onScanDecoded(p: { text: string; format: PackageBarcodeFormat }): Promise<void> {
  scanning.value = false
  error.value = null
  const pzn = extractPznFromPackageCode(p.text, p.format)
  if (!pzn) { error.value = 'Keine PZN im Packungscode gefunden.'; return }
  // Identifizieren: bekannte PZN → Kategorie/Funktion anzeigen + Felder zum Bearbeiten vorbefüllen.
  const e = await lib.entry(pzn)
  identified.value = e
  pznInput.value = pzn
  wirkstoffInput.value = e?.wirkstoff ?? ''
  labelInput.value = e?.label ?? ''
  categoryInput.value = e?.category ?? ''
  noteInput.value = e?.note ?? ''
  status.value = e
    ? `PZN ${pzn} ist in deiner Bibliothek — prüfen/bearbeiten und „Speichern".`
    : `PZN ${pzn} erkannt — Bezeichnung/Kategorie vergeben und „Speichern".`
}

/** Lokalen Fenster-Eintrag nach einer Einzeländerung patchen (ohne Vollreload). */
function patchLocal(pzn: string, patch: Partial<PznEntry>): void {
  entries.value = entries.value.map((e) => (e.pzn === pzn ? { ...e, ...patch } : e))
}
async function onWirkstoffEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value
  await lib.setWirkstoff(pzn, v)
  patchLocal(pzn, { wirkstoff: v })
}
async function onLabelEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value
  await lib.setLabel(pzn, v)
  patchLocal(pzn, { label: v })
}
async function onCategoryEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLSelectElement).value
  await lib.setCategory(pzn, v)
  patchLocal(pzn, { category: v })
}
async function onNoteEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value
  await lib.setNote(pzn, v)
  patchLocal(pzn, { note: v })
}
async function onRemove(pzn: string): Promise<void> {
  await lib.remove(pzn)
  entries.value = entries.value.filter((e) => e.pzn !== pzn)
  total.value = Math.max(0, total.value - 1)
}

// --- Backup (lokal): gezipptes JSON (.json.gz), gestreamt (#197) ---
const exporting = ref(false)
const exportProgress = ref<{ done: number; total: number } | null>(null)
const exportPercent = computed(() =>
  exportProgress.value && exportProgress.value.total > 0
    ? Math.min(100, Math.round((exportProgress.value.done / exportProgress.value.total) * 100))
    : 0,
)
async function onExport(): Promise<void> {
  status.value = null; error.value = null
  exporting.value = true
  exportProgress.value = null
  const wake = await requestScreenWakeLock()
  let lastProgressAt = 0
  try {
    await lib.exportToFile('pzn-bibliothek.json.gz', (done, total) => {
      const now = Date.now()
      if (done >= total || now - lastProgressAt >= 80) {
        lastProgressAt = now
        exportProgress.value = { done, total }
      }
    })
    status.value = 'Bibliothek exportiert (.json.gz).'
  } catch (err) {
    error.value = `Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    await wake.release()
    exporting.value = false
    exportProgress.value = null
  }
}

// Import = Merge mit Nutzerwahl VOR der Dateiauswahl.
const importChoosing = ref(false)
const importMode = ref<ImportMode>('overwrite')
const importing = ref(false)
const importProgress = ref<{ done: number; total: number } | null>(null)
// Prozent für die animierte Balkenanzeige (#218): die CSS-Transition glättet die
// (gröberen) Chunk-Schritte rein visuell — keine Verarbeitungs-/Logikänderung.
const importPercent = computed(() =>
  importProgress.value && importProgress.value.total > 0
    ? Math.min(100, Math.round((importProgress.value.done / importProgress.value.total) * 100))
    : 0,
)
const fileInput = ref<HTMLInputElement | null>(null)
function chooseImport(mode: ImportMode): void {
  importMode.value = mode
  importChoosing.value = false
  fileInput.value?.click()
}
async function onImportFile(e: Event): Promise<void> {
  status.value = null; error.value = null
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  importing.value = true
  importProgress.value = null
  // Bildschirm während des (ggf. langen) Imports wachhalten; Hinweis greift zusätzlich.
  const wake = await requestScreenWakeLock()
  // Fortschritt gedrosselt anzeigen (#218): höchstens ~alle 80 ms aktualisieren, das Ende
  // (done>=total) immer durchlassen. Die FLÜSSIGE Bewegung macht die CSS-Transition des
  // Balkens — der Import-/Decode-Pfad bleibt unangetastet.
  let lastProgressAt = 0
  try {
    const bytes = await readBinaryFile(file)
    // Robust entpacken: roh/einfach-gzip/doppelt-gzip → JSON-Text; null = ungültige Datei
    // (korruptes gzip oder zu viele Schichten). Wird wie ok===false behandelt (ein Invalid-Pfad).
    const text = await decodeMaybeGzip(bytes)
    const ok = text !== null && await lib.importJson(text, importMode.value, (done, total) => {
      const now = Date.now()
      if (done >= total || now - lastProgressAt >= 80) {
        lastProgressAt = now
        importProgress.value = { done, total }
      }
    })
    if (ok) {
      status.value = `Bibliothek importiert (${importMode.value === 'overwrite' ? 'Duplikate überschrieben' : 'nur fehlende ergänzt'}).`
      await reload()
    } else {
      error.value = 'Import fehlgeschlagen (ungültige Datei).'
    }
  } finally {
    await wake.release()
    importing.value = false
    importProgress.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

const sortIndicator = computed(() => (sortDir.value === 'asc' ? ' ▲' : ' ▼'))

// Gesamte Bibliothek löschen — nur mit Tipp-Bestätigung „LÖSCHEN" (irreversibel).
const deleteOpen = ref(false)
const deleteConfirm = ref('')
const canDelete = computed(() => deleteConfirm.value.trim() === 'LÖSCHEN')
async function deleteAll(): Promise<void> {
  if (!canDelete.value) return
  await lib.clear()
  deleteOpen.value = false
  deleteConfirm.value = ''
  status.value = 'Gesamte Bibliothek gelöscht.'
  await reload()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-2">
      <button class="btn btn-ghost btn-sm" type="button" aria-label="Zurück zu den Einstellungen" @click="emit('back')">
        <span aria-hidden="true">←</span> Einstellungen
      </button>
    </div>

    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="text-base font-semibold">PZN-Bibliothek (persönlich)</h2>
      <span class="text-sm text-base-content/60">{{ total }} {{ total === 1 ? 'Eintrag' : 'Einträge' }}</span>
    </div>

    <section class="card bg-base-100 shadow">
      <div class="card-body gap-3 p-4">
        <!-- Erfassen/Bearbeiten: manuell oder per Packungs-Scan (Scan identifiziert bekannte PZN) -->
        <div class="flex flex-wrap items-end gap-2">
          <label class="form-control">
            <span class="label-text text-xs">PZN</span>
            <input v-model="pznInput" inputmode="numeric" placeholder="z. B. 12345678"
                   class="input input-bordered input-sm w-36" @keyup.enter="addEntry" />
          </label>
          <label class="form-control grow">
            <span class="label-text text-xs">Wirkstoff</span>
            <input v-model="wirkstoffInput" placeholder="z. B. Ibuprofen"
                   class="input input-bordered input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <label class="form-control grow">
            <span class="label-text text-xs">Bezeichnung (Handelsname)</span>
            <input v-model="labelInput" placeholder="z. B. Ibu 600"
                   class="input input-bordered input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <label class="form-control">
            <span class="label-text text-xs">Kategorie</span>
            <select v-model="categoryInput" class="select select-bordered select-sm">
              <option value="">— keine —</option>
              <option v-for="c in PZN_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="form-control grow">
            <span class="label-text text-xs">Bemerkung (Funktion/Hinweis)</span>
            <input v-model="noteInput" placeholder="z. B. Reanimation"
                   class="input input-bordered input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <button class="btn btn-primary btn-sm" type="button" @click="addEntry">Speichern</button>
          <button class="btn btn-outline btn-sm" type="button" @click="scanning = true">Packung scannen</button>
        </div>
        <p class="text-xs text-base-content/60">Nur PZN, Bezeichnung, Kategorie und Bemerkung — keine Patientendaten.</p>

        <!-- Identify-Panel: was beim Scan in der Bibliothek gefunden wurde (Wirkstoff prominent) -->
        <div v-if="identified" class="rounded-lg bg-base-200/60 p-2 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ identified.wirkstoff || identified.label || `PZN ${identified.pzn}` }}</span>
            <span v-if="identified.category" class="badge badge-sm badge-ghost">{{ identified.category }}</span>
          </div>
          <p v-if="identified.label && identified.wirkstoff" class="text-xs text-base-content/60">{{ identified.label }}</p>
          <p v-if="identified.note" class="text-xs text-base-content/70">{{ identified.note }}</p>
        </div>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <p v-if="status" class="text-sm text-success">{{ status }}</p>

        <!-- Suche (gedrosselt, SQL-seitig über PZN/Bezeichnung/Kategorie/Bemerkung) -->
        <label class="form-control border-t border-base-200 pt-3">
          <span class="label-text text-xs">Suchen (PZN, Bezeichnung, Kategorie, Bemerkung)</span>
          <input v-model="queryInput" type="search" placeholder="z. B. Ibu, Analgetikum oder 12345678"
                 class="input input-bordered input-sm w-full" aria-label="PZN-Bibliothek durchsuchen" />
        </label>

        <div v-if="entries.length" class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr>
                <th :aria-sort="sortDir === 'asc' ? 'ascending' : 'descending'">
                  <button type="button" class="inline-flex items-center font-medium hover:underline"
                          :disabled="!!query.trim()"
                          :aria-label="`Nach PZN sortieren (${sortDir === 'asc' ? 'absteigend' : 'aufsteigend'})`"
                          @click="toggleSortPzn">
                    PZN<span aria-hidden="true">{{ query.trim() ? '' : sortIndicator }}</span>
                  </button>
                </th>
                <th>Wirkstoff</th>
                <th>Bezeichnung</th>
                <th>Kategorie</th>
                <th>Bemerkung</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in entries" :key="e.pzn">
                <td class="font-mono">{{ e.pzn }}</td>
                <td>
                  <input :value="e.wirkstoff" placeholder="—" class="input input-ghost input-xs w-full"
                         :aria-label="`Wirkstoff für PZN ${e.pzn} bearbeiten`"
                         @change="onWirkstoffEdit(e.pzn, $event)" />
                </td>
                <td>
                  <input :value="e.label" placeholder="—" class="input input-ghost input-xs w-full"
                         :aria-label="`Bezeichnung für PZN ${e.pzn} bearbeiten`"
                         @change="onLabelEdit(e.pzn, $event)" />
                </td>
                <td>
                  <select :value="e.category" class="select select-ghost select-xs"
                          :aria-label="`Kategorie für PZN ${e.pzn}`" @change="onCategoryEdit(e.pzn, $event)">
                    <option value="">—</option>
                    <option v-for="c in PZN_CATEGORIES" :key="c" :value="c">{{ c }}</option>
                  </select>
                </td>
                <td>
                  <input :value="e.note" placeholder="—" class="input input-ghost input-xs w-full"
                         :aria-label="`Bemerkung für PZN ${e.pzn} bearbeiten`"
                         @change="onNoteEdit(e.pzn, $event)" />
                </td>
                <td class="text-right">
                  <button class="btn btn-ghost btn-xs text-error" type="button"
                          :aria-label="`PZN ${e.pzn} entfernen`" @click="onRemove(e.pzn)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="loading" class="text-xs text-base-content/50">Lädt…</p>
        <p v-else-if="query.trim()" class="text-xs text-base-content/50">Kein Treffer für „{{ query.trim() }}".</p>
        <p v-else class="text-xs text-base-content/50">Noch keine Einträge.</p>

        <div v-if="hasMore" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-base-content/60">{{ entries.length }} geladen.</span>
          <button class="btn btn-outline btn-xs" type="button" @click="loadMore">Weitere {{ PAGE }} laden</button>
        </div>

        <!-- Backup: lokal, gezipptes JSON (.json.gz) -->
        <div class="flex flex-col gap-2 border-t border-base-200 pt-3">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-base-content/60">Backup (nur lokal):</span>
            <button class="btn btn-outline btn-xs" type="button" :disabled="!total || exporting" @click="onExport">
              {{ exporting ? 'Exportiere…' : 'Exportieren' }}
            </button>
            <button class="btn btn-outline btn-xs" type="button" :disabled="importing" @click="importChoosing = !importChoosing">
              {{ importing ? 'Importiere…' : 'Importieren' }}
            </button>
          </div>
          <!-- Export-Fortschritt (#197): gestreamt, daher Anzeige bis 100 % -->
          <div v-if="exporting" role="status" class="flex flex-col gap-1 rounded-lg bg-base-200/60 p-2">
            <span class="text-xs font-medium text-warning">⚠ Bitte das Telefon anlassen und die App geöffnet halten, bis der Export fertig ist.</span>
            <div class="h-2 w-full overflow-hidden rounded-full bg-base-300" role="progressbar" :aria-valuenow="exportPercent" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear" :style="{ width: exportPercent + '%' }" />
            </div>
            <span class="text-xs text-base-content/70">
              {{ exportProgress ? `${exportProgress.done} von ${exportProgress.total} exportiert…` : 'Export wird vorbereitet…' }}
            </span>
          </div>
          <!-- Nutzerwahl VOR der Dateiauswahl: wie sollen Duplikate behandelt werden? -->
          <div v-if="importChoosing" role="group" aria-label="Import-Modus" class="flex flex-col gap-2 rounded-lg bg-base-200/60 p-2">
            <span class="text-xs text-base-content/70">Wie sollen <strong>bereits vorhandene</strong> Einträge behandelt werden?</span>
            <div class="flex flex-wrap gap-2">
              <button class="btn btn-xs btn-primary" type="button" @click="chooseImport('overwrite')">Duplikate überschreiben</button>
              <button class="btn btn-xs btn-outline" type="button" @click="chooseImport('skip')">Nur fehlende ergänzen</button>
              <button class="btn btn-xs btn-ghost" type="button" @click="importChoosing = false">Abbrechen</button>
            </div>
            <span class="text-xs text-base-content/50">Vorhandene Einträge, die nicht in der Datei sind, bleiben in beiden Fällen erhalten.</span>
          </div>
          <!-- Import-Fortschritt + Hinweis (großer Datensatz kann dauern) -->
          <div v-if="importing" role="status" class="flex flex-col gap-1 rounded-lg bg-base-200/60 p-2">
            <span class="text-xs font-medium text-warning">⚠ Bitte das Telefon anlassen und die App geöffnet halten, bis der Import fertig ist.</span>
            <!-- Eigene Balkendarstellung mit CSS-Transition (#218): glättet die Chunk-Schritte visuell. -->
            <div v-if="importProgress" class="h-2 w-full overflow-hidden rounded-full bg-base-300" role="progressbar" :aria-valuenow="importPercent" aria-valuemin="0" aria-valuemax="100">
              <div class="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear" :style="{ width: importPercent + '%' }" />
            </div>
            <progress v-else class="progress progress-primary w-full" />
            <span class="text-xs text-base-content/70">
              {{ importProgress ? `${importProgress.done} von ${importProgress.total} importiert…` : 'Datei wird gelesen…' }}
            </span>
          </div>
          <input ref="fileInput" type="file" accept=".json,.gz,application/json,application/gzip" class="hidden" @change="onImportFile" />
        </div>

        <!-- Gesamte Bibliothek löschen: irreversibel, nur mit Tipp-Bestätigung „LÖSCHEN" -->
        <div class="flex flex-col gap-2 border-t border-base-200 pt-3">
          <button v-if="!deleteOpen" class="btn btn-outline btn-error btn-xs self-start" type="button"
                  :disabled="!total" @click="deleteOpen = true">
            Gesamte Bibliothek löschen
          </button>
          <div v-else role="group" aria-label="Gesamte Bibliothek löschen" class="flex flex-col gap-2 rounded-lg border border-error/40 bg-error/5 p-2">
            <span class="text-xs text-base-content/80">
              Löscht <strong>alle {{ total }} Einträge</strong> unwiderruflich. Zum Bestätigen
              <strong>LÖSCHEN</strong> eintippen.
            </span>
            <div class="flex flex-wrap items-center gap-2">
              <input v-model="deleteConfirm" type="text" placeholder="LÖSCHEN"
                     class="input input-bordered input-xs w-40" aria-label="Zum Bestätigen LÖSCHEN eintippen"
                     @keyup.enter="deleteAll" />
              <button class="btn btn-error btn-xs" type="button" :disabled="!canDelete" @click="deleteAll">
                Endgültig löschen
              </button>
              <button class="btn btn-ghost btn-xs" type="button" @click="deleteOpen = false; deleteConfirm = ''">Abbrechen</button>
            </div>
          </div>
        </div>
      </div>

      <PackageScanOverlay v-if="scanning" @decoded="onScanDecoded" @cancel="scanning = false" />
    </section>
  </div>
</template>
