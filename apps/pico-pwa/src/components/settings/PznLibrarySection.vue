<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PackageScanOverlay from '@/components/PackageScanOverlay.vue'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { extractPznFromPackageCode, type PackageBarcodeFormat } from '@/medications/packageScan'
import { normalizePzn } from '@/medications/pznLibrary'
import { shareJson, readTextFile } from '@/utils/fileTransfer'

/**
 * PZN-Bibliothek (IFA/DSGVO-konform): nutzergepflegte, LOKALE, protokollentkoppelte
 * Sammlung roher PZN mit selbst vergebener Bezeichnung. KEIN Netzzugriff, KEINE
 * automatische PZN→Name-Auflösung, KEINE Kombinations-/Reihenfolge-/Zeit-Information
 * (Mengen-Semantik). Backup nur lokal (Export/Import), kein Cloud/Telemetrie.
 */
const lib = usePznLibrary()
onMounted(lib.ensureLoaded)

const pznInput = ref('')
const labelInput = ref('')
const error = ref<string | null>(null)
const status = ref<string | null>(null)
const scanning = ref(false)

function addEntry(): void {
  error.value = null
  status.value = null
  const norm = normalizePzn(pznInput.value)
  if (!norm) { error.value = 'Ungültige PZN (4–8 Ziffern erwartet).'; return }
  void lib.add(norm, labelInput.value)
  status.value = `PZN ${norm} gespeichert.`
  pznInput.value = ''
  labelInput.value = ''
}

function onScanDecoded(p: { text: string; format: PackageBarcodeFormat }): void {
  scanning.value = false
  const pzn = extractPznFromPackageCode(p.text, p.format)
  error.value = null
  if (!pzn) { error.value = 'Keine PZN im Packungscode gefunden.'; return }
  // Re-Scan-Vorbefüllung: vorhandene EIGENE Bezeichnung ins Feld, kein externer Lookup.
  pznInput.value = pzn
  labelInput.value = lib.ownLabel(pzn) ?? ''
  status.value = lib.ownLabel(pzn) !== null
    ? `PZN ${pzn} ist bereits in der Bibliothek — Bezeichnung prüfen und „Speichern".`
    : `PZN ${pzn} erkannt — Bezeichnung vergeben und „Speichern".`
}

function onLabelEdit(pzn: string, e: Event): void {
  void lib.setLabel(pzn, (e.target as HTMLInputElement).value)
}

async function onExport(): Promise<void> {
  status.value = null
  await shareJson('pzn-bibliothek.json', lib.exportJson())
  status.value = 'Bibliothek exportiert.'
}

const fileInput = ref<HTMLInputElement | null>(null)
async function onImportFile(e: Event): Promise<void> {
  status.value = null; error.value = null
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const ok = await lib.importJson(await readTextFile(file))
  if (fileInput.value) fileInput.value.value = ''
  if (ok) status.value = 'Bibliothek importiert (zusammengeführt).'
  else error.value = 'Import fehlgeschlagen (ungültige Datei).'
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">PZN-Bibliothek (persönlich)</h3>

      <!--
        Erklärtext (copy-only). VOLLE Rechtsbegründung bewusst NICHT in der UI:
         - IFA-Lizenzpflicht: Arzneimittel-Stammdaten (PZN→Produkt) pflegt die IFA GmbH; Nutzung nur
           über Anbieter-/Rohdatenvertrag → die App liefert KEINE fertige Liste mit.
           https://go.pharmazie.com/de/wann-brauchen-sie-eine-rohdatenlizenz-fuer-arzneimitteldaten/
           https://www.ifaffm.de/de/ifa-gmbh.html
         - EU-sui-generis-Datenbankrecht (RL 96/9/EG Art. 7): schützt die Entnahme wesentlicher Teile.
         - Art. 9 DSGVO: Erfassungspfad patientenfrei (nur PZN + Eigen-Bezeichnung, protokollentkoppelt).
         Schalter/Begründung der Deaktivierung des alten Wörterbuchs: medications/featureFlags.ts.
         Aufklärende Datenschutz-/Lizenz-Hinweise sind bewusst im Disclaimer gebündelt
         (DISCLAIMER.md → „PZN-Bibliothek: Datenverantwortung"), nicht im Screen dupliziert.
      -->

      <!-- Erfassen: manuell oder per Packungs-Scan -->
      <div class="flex flex-wrap items-end gap-2">
        <label class="form-control">
          <span class="label-text text-xs">PZN</span>
          <input v-model="pznInput" inputmode="numeric" placeholder="z. B. 12345678"
                 class="input input-bordered input-sm w-36" @keyup.enter="addEntry" />
        </label>
        <label class="form-control grow">
          <span class="label-text text-xs">Bezeichnung (optional, selbst vergeben)</span>
          <input v-model="labelInput" placeholder="z. B. Ibu 600"
                 class="input input-bordered input-sm w-full" @keyup.enter="addEntry" />
        </label>
        <button class="btn btn-primary btn-sm" type="button" @click="addEntry">Speichern</button>
        <button class="btn btn-outline btn-sm" type="button" @click="scanning = true">Packung scannen</button>
      </div>
      <p class="text-xs text-base-content/60">Nur PZN und eigene Bezeichnung — keine Patientendaten.</p>
      <p v-if="error" class="text-sm text-error">{{ error }}</p>
      <p v-if="status" class="text-sm text-success">{{ status }}</p>

      <!-- Liste (sortiert nach PZN; keine Reihenfolge-/Gruppeninfo) -->
      <div v-if="lib.list().length" class="overflow-x-auto">
        <table class="table table-sm">
          <thead><tr><th>PZN</th><th>Bezeichnung</th><th></th></tr></thead>
          <tbody>
            <tr v-for="e in lib.list()" :key="e.pzn">
              <td class="font-mono">{{ e.pzn }}</td>
              <td>
                <input :value="e.label" placeholder="—"
                       class="input input-ghost input-xs w-full"
                       @change="onLabelEdit(e.pzn, $event)" />
              </td>
              <td class="text-right">
                <button class="btn btn-ghost btn-xs text-error" type="button"
                        :aria-label="`PZN ${e.pzn} entfernen`" @click="lib.remove(e.pzn)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-xs text-base-content/50">Noch keine Einträge.</p>

      <!-- Backup: lokal, kein Cloud/Netz -->
      <div class="flex flex-wrap items-center gap-2 border-t border-base-200 pt-3">
        <span class="text-xs text-base-content/60">Backup (nur lokal):</span>
        <button class="btn btn-outline btn-xs" type="button" :disabled="!lib.list().length" @click="onExport">
          Exportieren
        </button>
        <button class="btn btn-outline btn-xs" type="button" @click="fileInput?.click()">Importieren</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="hidden" @change="onImportFile" />
      </div>
    </div>

    <PackageScanOverlay v-if="scanning" @decoded="onScanDecoded" @cancel="scanning = false" />
  </section>
</template>
