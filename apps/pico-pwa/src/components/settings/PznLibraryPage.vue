<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PackageScanOverlay from '@/components/PackageScanOverlay.vue'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { extractPznFromPackageCode, type PackageBarcodeFormat } from '@/medications/packageScan'
import { normalizePzn, type ImportMode, type PznEntry } from '@/medications/pznLibrary'
import { suggestStaerkeFromLabel } from '@/medications/staerkeSuggestion'
// Generische Loesch-Rueckfrage (#260-Muster); liegt bei den Rebuild-Komponenten, ist aber bewusst
// wiederverwendbar (Teleport-Modal, Abbrechen-Fokus, Doppel-Tap-Sperre).
import ConfirmDialog from '@/components/rebuild/ConfirmDialog.vue'
import { PZN_CATEGORIES } from '@/medications/pznCategories'
import { readBinaryFile } from '@/utils/fileTransfer'
import { decodeMaybeGzip } from '@/utils/gzip'
import { requestScreenWakeLock } from '@/utils/wakeLock'

/**
 * PZN-Bibliothek als eigene Einstellungs-Seite (#190/#194/#195). Backend-agnostisch über
 * das async usePznLibrary-Singleton (nativ SQLite, skaliert auf ~317k; Web Preferences).
 * Liste/Suche laufen SEITENWEISE aus dem Backend — nie die ganze Menge im DOM/Speicher.
 *
 * Pro Eintrag: Wirkstoff, Wirkstärke, Bezeichnung (frei), Kategorie (feste Admin-Auswahl),
 * Bemerkung (frei). „In der Bibliothek scannen" identifiziert eine bekannte PZN.
 *
 * Editieren (#264, quellenbasiert NN/g data-tables/mobile-tables, Apple HIG lists, Pencil&Paper,
 * PatternFly): kompakte zweizeilige Summary-Zeile, Antippen öffnet die Edit-Karte IN PLACE
 * (genau eine offen — dasselbe abgenommene Muster wie der Medikamentenplan im Einsatz); KEINE
 * Ghost-Inputs in Tabellenzellen, kein Modal (verdeckt Nachbar-Einträge als Referenz).
 * Nachpflege-Fluss: Filter „ohne Wirkstärke" (SQL-seitig, Zähler = Fortschritt) + „Speichern &
 * Weiter" (Auto-Advance in place) + Autofokus ins Stärke-Feld + Enter = weiter + Vorschlag-Chip.
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
// Nachpflege-Arbeitsvorrat (#264): nur Eintraege ohne Wirkstaerke; Zaehler = Fortschritt.
const missingOnly = ref(false)
const missingCount = ref(0)

async function fetchWindow(offset: number): Promise<PznEntry[]> {
  const q = query.value.trim()
  return q
    ? lib.search(q, { offset, limit: PAGE, missingStaerke: missingOnly.value })
    : lib.page({ offset, limit: PAGE, dir: sortDir.value, missingStaerke: missingOnly.value })
}

async function reload(): Promise<void> {
  loading.value = true
  try {
    const [first, n, missing] = await Promise.all([fetchWindow(0), lib.count(), lib.countMissingStaerke()])
    entries.value = first
    total.value = n
    missingCount.value = missing
    hasMore.value = first.length === PAGE
  } finally {
    loading.value = false
  }
}
async function loadMore(): Promise<void> {
  // Unter dem Nachpflege-Filter zaehlt als Offset nur, was NOCH in der SQL-Menge ist:
  // per Fertig/Chip gepflegte Eintraege bleiben lokal stehen, sind aber aus WHERE staerke=''
  // gefallen - die Rohlaenge wuerde noch fehlende Datensaetze ueberspringen (Verify #264).
  const offset = missingOnly.value
    ? entries.value.filter((x) => x.staerke.trim() === '').length
    : entries.value.length
  const next = await fetchWindow(offset)
  const known = new Set(entries.value.map((x) => x.pzn))
  entries.value = [...entries.value, ...next.filter((x) => !known.has(x.pzn))]
  hasMore.value = next.length === PAGE
}

onMounted(reload)
watch([query, sortDir, missingOnly], () => {
  editingPzn.value = null // Ansicht wechselt -> offene Karte schliessen (Index-Kontext weg)
  void reload()
})

function toggleSortPzn(): void {
  sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
}

// --- Erfassen / Bearbeiten ---
const pznInput = ref('')
const wirkstoffInput = ref('')
const staerkeInput = ref('')
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
  staerkeInput.value = ''
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
    staerke: staerkeInput.value,
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
  staerkeInput.value = e?.staerke ?? ''
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

// --- Edit-Karte in place (#264): genau EINE offen; Feedback nah am Feld (Baymard) ---
const editingPzn = ref<string | null>(null)
const savedField = ref<string | null>(null) // `${pzn}:${feld}` fuer das ✓-Feedback
let savedTimer: ReturnType<typeof setTimeout> | undefined
function markSaved(pzn: string, feld: string): void {
  savedField.value = `${pzn}:${feld}`
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (savedField.value = null), 1600)
}
onUnmounted(() => { if (savedTimer) clearTimeout(savedTimer) })

// Autofokus ins Staerke-Feld beim Auto-Advance (Muster setEditName aus MedplanFunction).
// NUR fuers Fokussieren - der WERT laeuft ueber staerkeDraft, nie ueber DOM-Reads: Vue ruft
// Funktions-Refs in Patch-Reihenfolge, beim Advance nullt der Unmount der ALTEN Karte die Ref
// NACH dem Mount der neuen (Verify #264: stiller ''-Commit ueber die stale Ref).
let focusStaerkeNext = false
function setStaerkeEl(el: unknown): void {
  if (el && focusStaerkeNext) {
    focusStaerkeNext = false
    ;(el as HTMLInputElement).focus()
  }
}
// Reaktiver Entwurf des Staerke-Felds der EINEN offenen Karte (v-model). Einziger Commit-Pfad
// ist commitStaerke -> kein blur/click-Doppel-Commit, kein DOM-Read.
const staerkeDraft = ref('')
function openEntry(pzn: string): void {
  editingPzn.value = pzn
  staerkeDraft.value = entries.value.find((e) => e.pzn === pzn)?.staerke ?? ''
  if (missingOnly.value) focusStaerkeNext = true // Nachpflege: direkt ins Zielfeld
}
function closeEntry(): void {
  const pzn = editingPzn.value
  if (pzn) void commitStaerke(pzn, staerkeDraft.value) // Fertig committet den Entwurf
  editingPzn.value = null
}
/** Staerke committen: Buchfuehrung OPTIMISTISCH vor dem DB-Write (idempotent - ein zweiter
 *  Aufruf sieht vorher===value und bucht nicht erneut; Verify #264: blur/click-Race). */
async function commitStaerke(pzn: string, value: string): Promise<void> {
  const vorher = entries.value.find((e) => e.pzn === pzn)?.staerke ?? ''
  if (vorher !== value) {
    patchLocal(pzn, { staerke: value })
    if (vorher === '' && value.trim() !== '') missingCount.value = Math.max(0, missingCount.value - 1)
    else if (vorher !== '' && value.trim() === '') missingCount.value += 1
    markSaved(pzn, 'staerke')
  }
  await lib.setStaerke(pzn, value)
}
/** Vorschlag-Chip: Ein-Tap-Uebernahme = Entwurf fuellen + sofort speichern (Autosave-Konsistenz). */
async function applyVorschlag(e: PznEntry, v: string): Promise<void> {
  staerkeDraft.value = v
  await commitStaerke(e.pzn, v)
}
/** "Speichern & Weiter" (#264): Entwurf committen, dann in place zum naechsten Eintrag —
 *  bei aktivem Filter faellt der gepflegte Eintrag aus dem Arbeitsvorrat (Index bleibt).
 *  advancing-Guard gegen Doppel-Tap (sonst schloesse der zweite Lauf die Folgekarte). */
let advancing = false
async function saveAndNext(e: PznEntry): Promise<void> {
  if (advancing) return
  advancing = true
  try {
    const v = staerkeDraft.value
    await commitStaerke(e.pzn, v)
    const idx = entries.value.findIndex((x) => x.pzn === e.pzn)
    if (idx === -1) return
    let nextIdx = idx + 1
    if (missingOnly.value && v.trim() !== '') {
      entries.value = entries.value.filter((x) => x.pzn !== e.pzn)
      nextIdx = idx // Nachruecker steht am selben Index
    }
    if (nextIdx >= entries.value.length && hasMore.value) await loadMore()
    const next = entries.value[nextIdx]
    if (next) {
      focusStaerkeNext = true
      staerkeDraft.value = next.staerke
      editingPzn.value = next.pzn
    } else {
      editingPzn.value = null
      status.value = missingOnly.value ? 'Alle geladenen Einträge haben eine Wirkstärke.' : null
    }
  } finally {
    advancing = false
  }
}
function onStaerkeEnter(e: PznEntry): void {
  if (missingOnly.value) void saveAndNext(e)
  else void commitStaerke(e.pzn, staerkeDraft.value) // Enter = Entwurf abschliessen
}
// Vorschlag nur fuer die offene Karte berechnen (eine RegExp statt 3x pro Render).
const offenerVorschlag = computed(() => {
  const e = entries.value.find((x) => x.pzn === editingPzn.value)
  return e && !e.staerke && staerkeDraft.value.trim() === '' ? suggestStaerkeFromLabel(e.label) : null
})

// Loeschen mit Rueckfrage (#260-Muster: kuratierte Eintraege sind Arbeit).
const pendingDelete = ref<PznEntry | null>(null)
async function confirmDelete(): Promise<void> {
  const e = pendingDelete.value
  pendingDelete.value = null
  if (!e) return
  try {
    await lib.remove(e.pzn) // erst die DB - Buchfuehrung nur im Erfolgsfall
  } catch (err) {
    error.value = `Löschen fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
    return
  }
  if (e.staerke === '') missingCount.value = Math.max(0, missingCount.value - 1)
  if (editingPzn.value === e.pzn) editingPzn.value = null
  entries.value = entries.value.filter((x) => x.pzn !== e.pzn)
  total.value = Math.max(0, total.value - 1)
}
async function onWirkstoffEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value
  await lib.setWirkstoff(pzn, v)
  patchLocal(pzn, { wirkstoff: v })
  markSaved(pzn, 'wirkstoff')
}
async function onLabelEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value
  await lib.setLabel(pzn, v)
  patchLocal(pzn, { label: v })
  markSaved(pzn, 'label')
}
async function onCategoryEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLSelectElement).value
  await lib.setCategory(pzn, v)
  patchLocal(pzn, { category: v })
  markSaved(pzn, 'category')
}
async function onNoteEdit(pzn: string, e: Event): Promise<void> {
  const v = (e.target as HTMLInputElement).value
  await lib.setNote(pzn, v)
  patchLocal(pzn, { note: v })
  markSaved(pzn, 'note')
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
  } catch (err) {
    // Mitten im Import (Speicher/Platte/DB) - sonst bliebe die Rejection stumm (Audit #262).
    error.value = `Import fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    await wake.release()
    importing.value = false
    importProgress.value = null
    if (fileInput.value) fileInput.value.value = ''
  }
}

const sortIndicator = computed(() => (sortDir.value === 'asc' ? ' ▲' : ' ▼'))

// Wirkstärke-Vorschlag aus dem Label (#262, nicht-destruktiv): nur Anzeige + bewusstes
// Übernehmen ins (leere) Stärke-Feld — das Label bleibt IMMER unangetastet, kein Bulk.
const staerkeVorschlag = computed(() =>
  staerkeInput.value.trim() === '' ? suggestStaerkeFromLabel(labelInput.value) : null,
)

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
        <!-- Erfassen/Bearbeiten: manuell oder per Packungs-Scan (Scan identifiziert bekannte PZN).
             Gleiches Feld-Muster wie die Edit-Karte der Liste (Label UEBER dem Feld, volle Breite) -
             daisyUI-5-Falle: form-control stapelt schmale Inputs nicht mehr (Cerebrum #149). -->
        <div class="flex flex-col gap-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">PZN</span>
            <input v-model="pznInput" inputmode="numeric" placeholder="z. B. 12345678"
                   class="input input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Wirkstoff</span>
            <input v-model="wirkstoffInput" placeholder="z. B. Ibuprofen"
                   class="input input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Wirkstärke</span>
            <input v-model="staerkeInput" placeholder="z. B. 400 mg"
                   class="input input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Bezeichnung (Handelsname)</span>
            <input v-model="labelInput" placeholder="z. B. Ibu 600"
                   class="input input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Kategorie</span>
            <select v-model="categoryInput" class="select select-sm w-full">
              <option value="">— keine —</option>
              <option v-for="c in PZN_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-base-content/60">Bemerkung (Funktion/Hinweis)</span>
            <input v-model="noteInput" placeholder="z. B. Reanimation"
                   class="input input-sm w-full" @keyup.enter="addEntry" />
          </label>
          <div class="flex flex-wrap gap-2 pt-1">
            <button class="btn btn-primary btn-sm min-h-11 grow" type="button" @click="addEntry">Speichern</button>
            <button class="btn btn-outline btn-sm min-h-11 grow" type="button" @click="scanning = true">Packung scannen</button>
          </div>
        </div>
        <p v-if="staerkeVorschlag" class="text-xs text-base-content/70">
          Wirkstärke-Vorschlag aus der Bezeichnung:
          <button type="button" class="btn btn-ghost btn-sm min-h-11 align-baseline" @click="staerkeInput = staerkeVorschlag">{{ staerkeVorschlag }} übernehmen</button>
        </p>
        <p class="text-xs text-base-content/60">Nur PZN, Wirkstoff, Wirkstärke, Bezeichnung, Kategorie und Bemerkung — keine Patientendaten.</p>

        <!-- Identify-Panel: was beim Scan in der Bibliothek gefunden wurde (Wirkstoff prominent) -->
        <div v-if="identified" class="rounded-lg bg-base-200/60 p-2 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-medium">{{ identified.wirkstoff || identified.label || `PZN ${identified.pzn}` }}</span>
            <span v-if="identified.staerke" class="badge badge-sm badge-ghost">{{ identified.staerke }}</span>
            <span v-if="identified.category" class="badge badge-sm badge-ghost">{{ identified.category }}</span>
          </div>
          <p v-if="identified.label && identified.wirkstoff" class="text-xs text-base-content/60">{{ identified.label }}</p>
          <p v-if="identified.note" class="text-xs text-base-content/70">{{ identified.note }}</p>
        </div>

        <p v-if="error" class="text-sm text-error">{{ error }}</p>
        <p v-if="status" class="text-sm text-success">{{ status }}</p>

        <!-- Suche (gedrosselt, SQL-seitig über PZN/Bezeichnung/Kategorie/Bemerkung) -->
        <label class="form-control border-t border-base-200 pt-3">
          <span class="label-text text-xs">Suchen (PZN, Wirkstoff, Bezeichnung, Kategorie, Bemerkung)</span>
          <input v-model="queryInput" type="search" placeholder="z. B. Ibu, Analgetikum oder 12345678"
                 class="input input-bordered input-sm w-full" aria-label="PZN-Bibliothek durchsuchen" />
        </label>
        <!-- Arbeitsvorrat-Filter (#264): kombinierbar mit Suche; Zaehler = Fortschritt der Nachpflege -->
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-xs min-h-11" :class="missingOnly ? 'btn-primary' : 'btn-outline'"
                  :aria-pressed="missingOnly" @click="missingOnly = !missingOnly">
            ohne Wirkstärke · {{ missingCount }}
          </button>
          <button type="button" class="btn btn-ghost btn-xs min-h-11" :disabled="!!query.trim()"
                  :aria-label="`Nach PZN sortieren (${sortDir === 'asc' ? 'absteigend' : 'aufsteigend'})`"
                  @click="toggleSortPzn">
            PZN{{ query.trim() ? '' : sortIndicator }}
          </button>
        </div>

        <ul v-if="entries.length" class="flex flex-col gap-1.5">
          <li v-for="e in entries" :key="e.pzn">
            <!-- READ: zweizeilige Summary (M3 Two-line-Item) - Antippen oeffnet die Edit-Karte -->
            <button v-if="editingPzn !== e.pzn" type="button"
                    class="flex min-h-12 w-full items-center gap-2 rounded-xl border border-base-300 bg-base-100 px-3 py-2 text-left shadow-sm active:bg-base-200"
                    :aria-label="`${e.label || e.wirkstoff || 'PZN ' + e.pzn} bearbeiten`" @click="openEntry(e.pzn)">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ e.label || e.wirkstoff || `PZN ${e.pzn}` }}</span>
                <span class="block truncate text-xs text-base-content/60">{{ [e.wirkstoff, e.staerke, e.pzn].filter(Boolean).join(' · ') }}</span>
              </span>
              <span v-if="e.category" class="badge badge-ghost badge-sm shrink-0">{{ e.category }}</span>
              <span class="shrink-0 text-base-content/40" aria-hidden="true">✎</span>
            </button>

            <!-- EDIT: Karte in place, alle Felder vollbreit; @change-Autosave + ✓-Feedback am Feld -->
            <div v-else class="flex flex-col gap-2 rounded-xl border border-primary/40 bg-base-200 p-3 ring-1 ring-primary/20">
              <div class="flex items-center justify-between gap-2">
                <span class="font-mono text-sm text-base-content/70">PZN {{ e.pzn }}</span>
                <span v-if="savedField && savedField.startsWith(e.pzn + ':')" class="text-xs text-success" role="status">✓ gespeichert</span>
              </div>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-base-content/60">Wirkstoff</span>
                <input :value="e.wirkstoff" placeholder="z. B. Ibuprofen" class="input input-sm w-full"
                       :aria-label="`Wirkstoff für PZN ${e.pzn}`" @change="onWirkstoffEdit(e.pzn, $event)" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-base-content/60">Wirkstärke</span>
                <input :ref="setStaerkeEl" v-model="staerkeDraft" placeholder="z. B. 400 mg" class="input input-sm w-full"
                       :enterkeyhint="missingOnly ? 'next' : 'done'"
                       :aria-label="`Wirkstärke für PZN ${e.pzn}`"
                       @blur="commitStaerke(e.pzn, staerkeDraft)"
                       @keydown.enter.prevent="onStaerkeEnter(e)" />
              </label>
              <button v-if="offenerVorschlag" type="button"
                      class="btn btn-ghost btn-sm min-h-11 self-start"
                      @click="applyVorschlag(e, offenerVorschlag)">
                „{{ offenerVorschlag }}" aus der Bezeichnung übernehmen
              </button>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-base-content/60">Bezeichnung (Handelsname)</span>
                <input :value="e.label" placeholder="z. B. Ibuflam 400 mg" class="input input-sm w-full"
                       :aria-label="`Bezeichnung für PZN ${e.pzn}`" @change="onLabelEdit(e.pzn, $event)" />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-base-content/60">Kategorie</span>
                <select :value="e.category" class="select select-sm w-full" :aria-label="`Kategorie für PZN ${e.pzn}`" @change="onCategoryEdit(e.pzn, $event)">
                  <option value="">— keine —</option>
                  <option v-for="c in PZN_CATEGORIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-xs text-base-content/60">Bemerkung (Funktion/Hinweis)</span>
                <input :value="e.note" placeholder="z. B. Reanimation" class="input input-sm w-full"
                       :aria-label="`Bemerkung für PZN ${e.pzn}`" @change="onNoteEdit(e.pzn, $event)" />
              </label>
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" class="btn btn-ghost btn-sm min-h-11 text-error" @click="pendingDelete = e">Löschen</button>
                <div class="grow"></div>
                <button type="button" class="btn btn-sm min-h-11" @click="closeEntry">Fertig</button>
                <button v-if="missingOnly" type="button" class="btn btn-primary btn-sm min-h-11" @click="saveAndNext(e)">Speichern &amp; Weiter</button>
              </div>
            </div>
          </li>
        </ul>
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
            <span class="text-xs text-base-content/50">Vorhandene Einträge, die nicht in der Datei sind, bleiben in beiden Fällen erhalten. „Überschreiben" ersetzt alle Felder eines Eintrags durch die Backup-Werte — auch die Wirkstärke, die in älteren Backups noch fehlt.</span>
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

      <!-- Loesch-Rueckfrage (#260-Muster): kuratierte Eintraege nie rueckfragefrei entfernen -->
      <ConfirmDialog
        v-if="pendingDelete"
        :title="`PZN ${pendingDelete.pzn} entfernen?`"
        :message="[pendingDelete.label || pendingDelete.wirkstoff, 'Das lässt sich nicht rückgängig machen.'].filter(Boolean).join(' — ')"
        confirm-label="Entfernen"
        @confirm="confirmDelete"
        @cancel="pendingDelete = null"
      />
    </section>
  </div>
</template>
