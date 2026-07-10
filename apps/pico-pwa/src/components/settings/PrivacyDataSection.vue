<script setup lang="ts">
import { ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useBausteine } from '@/composables/useBausteine'
import { useTemporaryCaseDraft } from '@/composables/useTemporaryCaseDraft'
import { useReworkCaseDraft } from '@/rebuild/useReworkCaseDraft'
import {
  CASE_DRAFT_TTL_MIN_HOURS,
  CASE_DRAFT_TTL_MAX_HOURS,
} from '@/composables/temporaryCaseDraft'

/**
 * Datenschutz & lokale Daten (#14-A). Lösch-Aktionen laufen ausschließlich über
 * die gekapselte Storage-Schicht (useStorage) — KEINE direkte SQLite-/Preferences-
 * Nutzung. Bestätigung vor jeder Löschung. Der temporäre Einsatzentwurf (#173) wird
 * über sein gekapseltes Repository (useTemporaryCaseDraft) verworfen.
 */
const storage = useStorage()
const bausteine = useBausteine()
const draft = useTemporaryCaseDraft()
const reworkDraft = useReworkCaseDraft() // Rework-Einsatzentwurf (eigener Key) - muss mit-geloescht werden

const TTL_OPTIONS = Array.from(
  { length: CASE_DRAFT_TTL_MAX_HOURS - CASE_DRAFT_TTL_MIN_HOURS + 1 },
  (_, i) => CASE_DRAFT_TTL_MIN_HOURS + i,
)

function onTtlChange(e: Event): void {
  const h = Number((e.target as HTMLSelectElement).value)
  void storage.saveSettings({ caseDraftTtlHours: h })
}

type Pending = 'library' | 'settings' | 'all' | 'draft' | null
const pending = ref<Pending>(null)
const busy = ref(false)
const status = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)

async function run(action: Pending): Promise<void> {
  busy.value = true
  status.value = null
  try {
    if (action === 'library' || action === 'all') {
      await storage.resetLibrary()
      await bausteine.reload()
    }
    if (action === 'settings' || action === 'all') {
      await storage.resetSettings()
    }
    // Temporären Einsatzentwurf verwerfen (#173): bei „nur Entwurf" und „Alles". BEIDE Drafts -
    // der alte dev-Key UND der Rework-Key (rework.case.draft) - sonst bleiben Patientendaten liegen.
    if (action === 'draft' || action === 'all') {
      await draft.discard()
      draft.clearNotice()
      await reworkDraft.remove()
    }
    status.value = { kind: 'ok', msg: 'Erledigt.' }
  } catch (e) {
    status.value = { kind: 'err', msg: `Fehlgeschlagen: ${(e as Error).message}` }
  } finally {
    busy.value = false
    pending.value = null
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
      <h3 class="font-medium">Datenschutz & lokale Daten</h3>

      <ul class="list-disc pl-5 text-xs text-base-content/70">
        <li>Patientendaten werden <strong>nicht dauerhaft gespeichert</strong>.</li>
        <li>Der Einsatz-Zustand (<span class="font-mono">caseState</span>) ist <strong>flüchtig</strong> —
          „Sitzung zurücksetzen" liegt im <strong>Einsatz</strong>-Tab.</li>
        <li>Die lokale Bibliothek enthält <strong>nur neutrale Vorlagen</strong> (Protokolle, Bausteine, Snippets).</li>
      </ul>

      <!-- Temporärer Einsatzentwurf (#173): TTL-Auswahl + verwerfen -->
      <div class="rounded-lg bg-base-200/60 p-3">
        <label class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-medium">Temporären Einsatzentwurf löschen nach</span>
          <select
            class="select select-bordered select-sm min-h-11"
            :value="storage.settings.caseDraftTtlHours"
            aria-label="Ablaufzeit des temporären Einsatzentwurfs in Stunden"
            @change="onTtlChange"
          >
            <option v-for="h in TTL_OPTIONS" :key="h" :value="h">{{ h }} {{ h === 1 ? 'Stunde' : 'Stunden' }}</option>
          </select>
        </label>
        <p class="mt-1 text-xs text-base-content/60">
          Laufende Entwürfe werden nur lokal gespeichert und nach Inaktivität automatisch gelöscht.
        </p>
        <button class="btn btn-outline btn-xs mt-2 min-h-11" type="button" :disabled="busy" @click="pending = 'draft'">
          Temporären Entwurf verwerfen
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="pending = 'library'">Library löschen</button>
        <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="pending = 'settings'">App-Einstellungen zurücksetzen</button>
        <button class="btn btn-outline btn-error btn-sm min-h-11" type="button" :disabled="busy" @click="pending = 'all'">Alles lokal zurücksetzen</button>
      </div>

      <div v-if="pending" role="alert" class="alert alert-warning flex-col items-start gap-2 text-sm">
        <span v-if="pending === 'library'">„Library löschen" entfernt <strong>Protokolle, Bausteine und Snippets</strong> — App-Einstellungen bleiben.</span>
        <span v-else-if="pending === 'settings'">„App-Einstellungen zurücksetzen" setzt nur die App-Einstellungen auf Standard (inkl. Entwurf-Ablauf auf 3 Stunden) — die Bibliothek und ein laufender Entwurf bleiben.</span>
        <span v-else-if="pending === 'draft'">„Temporären Entwurf verwerfen" löscht <strong>nur den laufenden temporären Einsatzentwurf</strong> — Einstellungen und Bibliothek bleiben.</span>
        <span v-else>„Alles lokal zurücksetzen" löscht die <strong>gesamte Bibliothek</strong>, setzt die <strong>App-Einstellungen</strong> zurück und verwirft den <strong>temporären Einsatzentwurf</strong>. (Der flüchtige Einsatz-Zustand im Einsatz-Tab ist davon nicht betroffen.)</span>
        <div class="flex gap-2">
          <button class="btn btn-error btn-xs min-h-11" type="button" :disabled="busy" @click="run(pending)">Bestätigen</button>
          <button class="btn btn-ghost btn-xs min-h-11" type="button" :disabled="busy" @click="pending = null">Abbrechen</button>
        </div>
      </div>

      <p v-if="status" class="text-sm" :class="status.kind === 'ok' ? 'text-success' : 'text-error'">{{ status.msg }}</p>
  </div>
</template>
