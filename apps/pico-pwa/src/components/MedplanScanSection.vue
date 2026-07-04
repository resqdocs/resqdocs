<script setup lang="ts">
import { computed, ref } from 'vue'
import { staerkeOhneDuplikat } from '@resqdocs/protocol-core/functions/registry'
import { useMedplanScan } from '@/medplan/useMedplanScan'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznLibrary } from '@/medications/usePznLibrary'
import MedplanScanOverlay from '@/components/MedplanScanOverlay.vue'
import { useStorage } from '@/storage/useStorage'
import { nativeDatamatrixScanAvailable, scanDatamatrixNative } from '@/medplan/nativeDatamatrixScan'
import type { MedikamenteRow } from '@resqdocs/protocol-core/renderer/render.mjs'

/**
 * Medikationsplan (BMP) scannen (#9, #36): Kamera-Scan (ZXing-Overlay, ueberall
 * verfuegbar wo getUserMedia geht - iOS/Android/Huawei/Browser) bzw.
 * Text-Einfuegen als Fallback → pruefbarer Entwurf (bearbeiten/entfernen) →
 * Uebernahme als Text ins Protokoll (Emit, KEIN direkter State-Zugriff).
 * Alles fluechtig; "Verwerfen" leert den Entwurf vollstaendig.
 */
const props = defineProps<{
  /** #146: strukturierte Uebernahme (medikamente-Element) statt Text-Anhaengen. */
  structured?: boolean
}>()
const emit = defineEmits<{ apply: [text: string]; applyRows: [rows: MedikamenteRow[]] }>()

const {
  error, rows, structuredRows, totalPages,
  aussteller, ausstellerRolle,
  missingPages, draftText, draftRows,
  ingest, updateRow, updateRowName, removeRow, reset,
} = useMedplanScan((pzn) => lookup.resolve(pzn))
const lookup = useMedicationLookup()
void lookup.ensureLoaded()

// PZN-Bibliothek (#184): bewusster Einzel-Transfer GENAU EINER PZN pro Zeile.
// Getrennter Store, keine Linkage/Gruppierung/Reihenfolge wird mitübertragen.
const pznLibrary = usePznLibrary()
void pznLibrary.ensureReady()
/** Pro Zeilen-Index ein kurzes Transfer-Feedback ('added' | 'exists'). */
const transferState = ref<Record<number, 'added' | 'exists'>>({})

/** Roh-PZN „im Hintergrund" der Zeile (bleibt nach Namens-Edit erhalten). */
function rowPzn(i: number): string | undefined {
  return structuredRows.value[i]?.pzn
}
/** Label-Vorschlag: der Medikamentenname, aber NICHT der „PZN <nr>"-Platzhalter. */
function rowLabel(i: number): string {
  const name = structuredRows.value[i]?.name?.trim() ?? ''
  return /^PZN \d/.test(name) ? '' : name
}
async function transferRow(i: number): Promise<void> {
  const pzn = rowPzn(i)
  if (!pzn) return
  const result = await pznLibrary.addOne(pzn, rowLabel(i)) // genau EINE PZN
  if (result !== 'invalid') transferState.value = { ...transferState.value, [i]: result }
}

// Scanner-Weiche (#170): 'native_zxingcpp' -> nativer Pfad (Foto + nativer Decoder; Android: zxing-cpp,
// iOS: Apple Vision); 'webview_standard'/'webview_optimized' und Web -> der getUserMedia-Overlay-Pfad.
// Erststart-Default ist 'webview_standard' (stabiler); der native Pfad (Android-zxing-cpp umgeht zwar
// den Adreno-WebView-GPU-Crash) bleibt als explizite Alternative waehlbar. 'auto' wurde entfernt.
const storage = useStorage()
const useNativeScan = computed(() => {
  if (!nativeDatamatrixScanAvailable()) return false
  const m = storage.settings.scannerMode
  return m === 'native_zxingcpp'
})
const webScanAvailable = computed(
  () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
)
const scanAvailable = computed(() => useNativeScan.value || webScanAvailable.value)
const scanOpen = ref(false)
const scanBusy = ref(false)
const scanNotice = ref('')
const manualOpen = ref(false)
const manualText = ref('')

/**
 * Nach dem BMP-Parse: Namen aus DEINER Bibliothek nachziehen. Das IFA-Wörterbuch ist
 * deaktiviert, also matcht der Ganzplan-Scan sonst NIE die Bibliothek. ownLabel/entry
 * normalisieren die (im Plan oft 6-/7-stellige) PZN auf 8 Stellen; Wirkstoff hat Vorrang
 * vor der Bezeichnung. Nur die „PZN <nr>"-Platzhalter werden ersetzt.
 */
async function resolveFromLibrary(): Promise<void> {
  for (let i = 0; i < structuredRows.value.length; i++) {
    const pzn = structuredRows.value[i]?.pzn
    const name = (structuredRows.value[i]?.name ?? '').trim()
    if (!pzn || !/^PZN \d/.test(name)) continue
    const e = await pznLibrary.entry(pzn)
    // Text-Pfad (Altsystem, kein eigenes Staerke-Feld): Staerke in den Namen einweben,
    // ausser der Name traegt sie schon (staerkeOhneDuplikat, #262).
    const base = e ? (e.wirkstoff || e.label) : ''
    const resolved = [base, e ? staerkeOhneDuplikat(base, e.staerke) : undefined].filter(Boolean).join(' ')
    if (resolved) updateRowName(i, resolved)
  }
}

async function onScanClick(): Promise<void> {
  scanNotice.value = ''
  if (!useNativeScan.value) {
    scanOpen.value = true
    return
  }
  scanBusy.value = true
  try {
    const res = await scanDatamatrixNative()
    if (res.status === 'found') { ingest(res.raw); await resolveFromLibrary() }
    else if (res.status === 'notFound') scanNotice.value = 'Kein Data-Matrix-Code erkannt. Plan flach, gut ausgeleuchtet und formatfüllend fotografieren.'
    else if (res.status === 'error') scanNotice.value = res.message
    // 'cancelled' -> stillschweigend
  } finally {
    scanBusy.value = false
  }
}

async function onDecoded(raw: string): Promise<void> {
  scanOpen.value = false
  ingest(raw)
  await resolveFromLibrary()
}
async function onManualAdd(): Promise<void> {
  if (ingest(manualText.value.trim())) { manualText.value = ''; await resolveFromLibrary() }
}
function onApply(): void {
  if (props.structured) {
    if (!draftRows.value.length) return
    emit('applyRows', draftRows.value)
    reset()
    return
  }
  if (!draftText.value) return
  emit('apply', draftText.value)
  reset()
}
</script>

<template>
  <div class="flex flex-col gap-2 rounded border border-base-300 p-2">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">Medikationsplan (BMP) scannen</span>
      <span v-if="totalPages > 0" class="badge badge-sm" :class="missingPages.length ? 'badge-warning' : 'badge-success'">
        {{ missingPages.length ? `Seite ${missingPages.join(', ')} fehlt` : `${totalPages} Seite(n) vollständig` }}
      </span>
    </div>

    <div class="flex flex-wrap gap-2">
      <button v-if="scanAvailable" class="btn btn-sm btn-primary" type="button" :disabled="scanBusy" @click="onScanClick">
        {{ scanBusy ? 'Scanne…' : 'Code scannen' }}
      </button>
      <button class="btn btn-sm btn-ghost" type="button" @click="manualOpen = !manualOpen">
        Text einfügen
      </button>
    </div>

    <MedplanScanOverlay v-if="scanOpen" @decoded="onDecoded" @cancel="scanOpen = false" />

    <div v-if="manualOpen" class="flex flex-col gap-2">
      <textarea
        v-model="manualText"
        rows="3"
        class="textarea textarea-bordered textarea-sm w-full font-mono"
        placeholder="BMP-Code-Inhalt (XML, beginnt mit <MP …>) hier einfügen"
        aria-label="BMP-Code-Inhalt"
      />
      <button class="btn btn-sm" type="button" :disabled="!manualText.trim()" @click="onManualAdd">Übernehmen</button>
    </div>

    <p v-if="scanNotice" class="text-sm text-warning">{{ scanNotice }}</p>
    <p v-if="error" class="text-sm text-error">{{ error }}</p>

    <!-- Aussteller (#144): Opt-in - Default ist "nicht dokumentieren" -->
    <div v-if="aussteller && rows.length" class="flex flex-col gap-1 rounded bg-base-200 p-2">
      <span class="text-xs text-base-content/60">Ausstellende Praxis aus dem Plan:</span>
      <span class="text-sm">{{ aussteller.name }}<template v-if="aussteller.ort">, {{ aussteller.ort }}</template><template v-if="aussteller.nummer">, {{ aussteller.nummer.typ }} {{ aussteller.nummer.wert }}</template><template v-if="aussteller.telefon">, Tel. {{ aussteller.telefon }}</template></span>
      <div class="flex flex-wrap items-center gap-3 text-sm" role="radiogroup" aria-label="Aussteller dokumentieren">
        <label class="flex items-center gap-1">
          <input v-model="ausstellerRolle" type="radio" value="" class="radio radio-xs" />
          nicht dokumentieren
        </label>
        <label class="flex items-center gap-1">
          <input v-model="ausstellerRolle" type="radio" value="Hausarzt" class="radio radio-xs" />
          als Hausarzt
        </label>
        <label class="flex items-center gap-1">
          <input v-model="ausstellerRolle" type="radio" value="Facharzt" class="radio radio-xs" />
          als Facharzt
        </label>
      </div>
    </div>

    <!-- Entwurf: prüfen, bearbeiten, entfernen; je Zeile Einzel-Transfer der PZN -->
    <ul v-if="rows.length" class="flex flex-col gap-1">
      <li v-for="(row, i) in rows" :key="i" class="flex flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <!-- Text-Pfad: ganze Zeile editierbar (wie bisher) -->
          <input
            v-if="!structured"
            :value="row"
            class="input input-bordered input-sm w-full"
            :aria-label="`Medikament ${i + 1}`"
            @input="updateRow(i, ($event.target as HTMLInputElement).value)"
          />
          <!-- Strukturierter Pfad (#146/#184): Name editierbar, PZN bleibt im Hintergrund -->
          <input
            v-else
            :value="structuredRows[i]?.name ?? ''"
            class="input input-bordered input-sm w-full"
            :aria-label="`Medikament ${i + 1} Name`"
            @input="updateRowName(i, ($event.target as HTMLInputElement).value)"
          />
          <!-- Einzel-Transfer GENAU DIESER EINEN PZN in die Bibliothek (#184) -->
          <button
            v-if="rowPzn(i)"
            class="btn btn-ghost btn-xs"
            type="button"
            :aria-label="`PZN ${rowPzn(i)} in die Bibliothek übernehmen`"
            :title="`PZN ${rowPzn(i)} in deine Bibliothek übernehmen`"
            @click="transferRow(i)"
          >→</button>
          <button class="btn btn-ghost btn-xs" type="button" :aria-label="`Medikament ${i + 1} entfernen`" @click="removeRow(i)">✕</button>
        </div>
        <span v-if="transferState[i]" class="pl-1 text-xs text-success">
          {{ transferState[i] === 'added' ? 'PZN in Bibliothek übernommen.' : 'PZN war bereits in der Bibliothek.' }}
        </span>
      </li>
    </ul>

    <div v-if="rows.length" class="flex gap-2">
      <button class="btn btn-sm btn-primary" type="button" :disabled="!draftText" @click="onApply">
        {{ structured ? 'Als Zeilen übernehmen' : 'Ins Feld übernehmen' }}
      </button>
      <button class="btn btn-sm btn-ghost" type="button" @click="reset">Verwerfen</button>
    </div>

    <p class="text-xs text-base-content/60">
      Verarbeitung nur auf dem Gerät, nichts wird gespeichert oder gesendet. Übernommen werden
      Medikament + Dosierung sowie - nur auf Wunsch - die ausstellende Praxis (Name, Ort, Arzt-/
      Praxisnummer, Telefon); <strong>keine Patientendaten</strong> aus dem Code. Einträge vor der
      Übernahme prüfen - ohne PZN-Datenbank erscheinen Medikamente als "PZN &lt;Nummer&gt;".
    </p>
  </div>
</template>
