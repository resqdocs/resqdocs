<script setup lang="ts">
/**
 * BMP-Plan-Scan fuer die Funktion „Ärzte": zieht den AUSSTELLENDEN ARZT aus dem Plan (primaer). Nutzt
 * denselben erprobten Parser wie der Medikamentenplan (useMedplanScan) - ein Parse liefert Arzt UND
 * Medikamente. Existiert auch ein Medikamentenplan im Protokoll, koennen die Medikamente optional
 * mit angelegt werden (Cross-Uebernahme; Wahl: nur Arzt / auch Medikamente).
 *
 * DSGVO: Roh-Scan + Entwurf nur im RAM (useMedplanScan.reset()); erst „Übernehmen" macht Werte daraus.
 */
import { ref, computed, onMounted } from 'vue'
import type { ArztRow, MedikamenteRow } from '@resqdocs/protocol-core/model'
import { useMedplanScan } from '@/medplan/useMedplanScan'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { useProtocolTree } from '@/rebuild/useProtocolTree'
import { collectFunctionNodes } from '@resqdocs/protocol-core/creator'
import { staerkeOhneDuplikat } from '@resqdocs/protocol-core/functions/registry'
import MedplanScanOverlay from '@/components/MedplanScanOverlay.vue'

const emit = defineEmits<{ apply: [doctor: ArztRow, meds?: MedikamenteRow[]]; close: [] }>()

const lookup = useMedicationLookup()
void lookup.ensureLoaded()
const { error, structuredRows, aussteller, ausstellerRolle, ingest, updateRowName, setRowStaerke, reset } = useMedplanScan((pzn) => lookup.resolve(pzn))
const pznLibrary = usePznLibrary()
void pznLibrary.ensureReady()

const { einsatzRoot } = useProtocolTree()
const hasMedplan = computed(() => collectFunctionNodes(einsatzRoot.value, 'medikamentenplan').length > 0)
const medCount = computed(() => structuredRows.value.filter((r) => r.name.trim()).length)
const alsoAddMeds = ref(false)

const scanOpen = ref(false)
const manualOpen = ref(false)
const manualText = ref('')

/** „PZN <nr>"-Platzhalter aus der EIGENEN Bibliothek nachziehen (gleiche Logik wie MedplanReviewSheet). */
async function resolveFromLibrary(): Promise<void> {
  const snapshot = structuredRows.value.map((r, i) => ({ i, pzn: r.pzn, name: (r.name ?? '').trim() }))
  for (const { i, pzn, name } of snapshot) {
    if (!pzn || !/^PZN \d/.test(name)) continue
    const e = await pznLibrary.entry(pzn)
    const resolved = e ? e.wirkstoff || e.label : ''
    if (resolved && structuredRows.value[i]?.pzn === pzn) {
      updateRowName(i, resolved)
      // Wirkstärke aus der EIGENEN Bibliothek mitziehen (#262) — nur leere Zeilen-Stärke füllen,
      // und nie doppelt dokumentieren, wenn der aufgelöste Name sie schon trägt.
      const st = staerkeOhneDuplikat(resolved, e?.staerke)
      if (st && !structuredRows.value[i]?.staerke) setRowStaerke(i, st)
    }
  }
}
async function onDecoded(raw: string): Promise<void> {
  scanOpen.value = false
  ingest(raw)
  await resolveFromLibrary()
}
async function onManualAdd(): Promise<void> {
  if (ingest(manualText.value.trim())) {
    manualText.value = ''
    manualOpen.value = false
    await resolveFromLibrary()
  }
}

function applyAndClose(): void {
  if (!aussteller.value) return
  const doctor: ArztRow = {
    name: aussteller.value.name,
    rolle: ausstellerRolle.value || undefined,
    ort: aussteller.value.ort,
    telefon: aussteller.value.telefon,
    arztnummer: aussteller.value.nummer?.wert,
  }
  const meds = alsoAddMeds.value && hasMedplan.value ? structuredRows.value.filter((r) => r.name.trim()) : undefined
  emit('apply', doctor, meds)
  reset()
  emit('close')
}
function discardAndClose(): void {
  reset()
  emit('close')
}

onMounted(() => {
  scanOpen.value = true // „Plan scannen" = Scan-Absicht -> Kamera gleich oeffnen
})
</script>

<template>
  <!-- BMP-Kamera als Vollbild (teleported; z-50 > Sheet z-40) -->
  <Teleport to="body">
    <MedplanScanOverlay v-if="scanOpen" @decoded="onDecoded" @cancel="scanOpen = false" />
  </Teleport>

  <!-- Review-Sheet (Bottom-Sheet, teleported; bewusst KEIN daisyUI .modal wegen z-999 ueber der Kamera) -->
  <Teleport to="body">
    <div class="overlay-backdrop fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true">
      <div class="overlay-surface flex max-h-[85vh] w-full flex-col gap-3 rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div class="flex items-center justify-between gap-2">
          <span class="text-base font-semibold">Arzt aus Medikationsplan</span>
          <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11" aria-label="Schließen" @click="discardAndClose">✕</button>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-primary min-h-11 gap-1" @click="scanOpen = true">{{ aussteller ? 'Erneut scannen' : 'Code scannen' }}</button>
          <button type="button" class="btn btn-sm btn-ghost min-h-11" @click="manualOpen = !manualOpen">Text einfügen</button>
        </div>

        <div v-if="manualOpen" class="flex flex-col gap-2">
          <textarea v-model="manualText" rows="3" class="textarea textarea-bordered textarea-sm w-full font-mono" placeholder="BMP-Code-Inhalt (XML, beginnt mit <MP …>) einfügen" aria-label="BMP-Code-Inhalt" />
          <button type="button" class="btn btn-sm self-start min-h-11" :disabled="!manualText.trim()" @click="onManualAdd">Übernehmen</button>
        </div>

        <p v-if="error" class="text-sm text-error" role="alert">{{ error }}</p>

        <!-- Ausstellender Arzt (primaer) + optionale Rolle -->
        <div v-if="aussteller" class="flex flex-col gap-1 rounded-lg bg-base-200 p-2">
          <span class="text-xs text-base-content/60">Ausstellende Praxis aus dem Plan:</span>
          <span class="text-sm font-medium">{{ aussteller.name }}<template v-if="aussteller.ort">, {{ aussteller.ort }}</template><template v-if="aussteller.nummer">, {{ aussteller.nummer.typ }} {{ aussteller.nummer.wert }}</template><template v-if="aussteller.telefon">, Tel. {{ aussteller.telefon }}</template></span>
          <div class="flex flex-wrap items-center gap-3 text-sm" role="radiogroup" aria-label="Rolle des Arztes">
            <label class="flex items-center gap-1"><input v-model="ausstellerRolle" type="radio" value="" class="radio radio-xs" /> ohne Rolle</label>
            <label class="flex items-center gap-1"><input v-model="ausstellerRolle" type="radio" value="Hausarzt" class="radio radio-xs" /> Hausarzt</label>
            <label class="flex items-center gap-1"><input v-model="ausstellerRolle" type="radio" value="Facharzt" class="radio radio-xs" /> Facharzt</label>
          </div>

          <!-- Cross-Uebernahme: Medikamente auch anlegen? Nur wenn ein Medikamentenplan existiert. -->
          <label v-if="hasMedplan && medCount" class="mt-1 flex items-center gap-2 border-t border-base-300 pt-2 text-sm">
            <input v-model="alsoAddMeds" type="checkbox" class="checkbox checkbox-sm" />
            Auch {{ medCount }} Medikament{{ medCount === 1 ? '' : 'e' }} in den Medikamentenplan übernehmen
          </label>
        </div>
        <p v-else-if="!scanOpen" class="text-sm italic text-base-content/50">Noch nichts gescannt — „Code scannen" oder „Text einfügen".</p>

        <!-- Aktionen -->
        <div class="mt-auto flex justify-between gap-2 pt-2">
          <button type="button" class="btn btn-ghost btn-sm min-h-11" @click="discardAndClose">Verwerfen</button>
          <button type="button" class="btn btn-primary btn-sm min-h-11" :disabled="!aussteller" @click="applyAndClose">Arzt übernehmen</button>
        </div>

        <p class="text-xs text-base-content/50">Nur auf dem Gerät, nichts wird gespeichert oder gesendet. Keine Patientendaten aus dem Code.</p>
      </div>
    </div>
  </Teleport>
</template>
