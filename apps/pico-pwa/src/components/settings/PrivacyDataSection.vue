<script setup lang="ts">
import { ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useBausteine } from '@/composables/useBausteine'

/**
 * Datenschutz & lokale Daten (#14-A). Lösch-Aktionen laufen ausschließlich über
 * die gekapselte Storage-Schicht (useStorage) — KEINE direkte SQLite-/Preferences-
 * Nutzung. Bestätigung vor jeder Löschung. `caseState` ist flüchtig und wird hier
 * NICHT angefasst (Sitzung-Reset bleibt im Einsatz-Tab).
 */
const storage = useStorage()
const bausteine = useBausteine()

type Pending = 'library' | 'settings' | 'all' | null
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
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-medium">Datenschutz & lokale Daten</h3>

      <ul class="list-disc pl-5 text-xs text-base-content/70">
        <li>Patientendaten werden <strong>nicht dauerhaft gespeichert</strong>.</li>
        <li>Der Einsatz-Zustand (<span class="font-mono">caseState</span>) ist <strong>flüchtig</strong> —
          „Sitzung zurücksetzen" liegt im <strong>Einsatz</strong>-Tab.</li>
        <li>Die lokale Bibliothek enthält <strong>nur neutrale Vorlagen</strong> (Protokolle, Bausteine, Snippets).</li>
      </ul>

      <div class="flex flex-wrap gap-2">
        <button class="btn btn-outline btn-sm" type="button" :disabled="busy" @click="pending = 'library'">Library löschen</button>
        <button class="btn btn-outline btn-sm" type="button" :disabled="busy" @click="pending = 'settings'">App-Einstellungen zurücksetzen</button>
        <button class="btn btn-outline btn-error btn-sm" type="button" :disabled="busy" @click="pending = 'all'">Alles lokal zurücksetzen</button>
      </div>

      <div v-if="pending" role="alert" class="alert alert-warning flex-col items-start gap-2 text-sm">
        <span v-if="pending === 'library'">„Library löschen" entfernt <strong>Protokolle, Bausteine und Snippets</strong> — App-Einstellungen bleiben.</span>
        <span v-else-if="pending === 'settings'">„App-Einstellungen zurücksetzen" setzt nur die App-Einstellungen auf Standard — die Bibliothek bleibt.</span>
        <span v-else>„Alles lokal zurücksetzen" löscht die <strong>gesamte Bibliothek</strong> und setzt die <strong>App-Einstellungen</strong> zurück. (Der flüchtige Einsatz-Zustand ist davon nicht betroffen.)</span>
        <div class="flex gap-2">
          <button class="btn btn-error btn-xs" type="button" :disabled="busy" @click="run(pending)">Bestätigen</button>
          <button class="btn btn-ghost btn-xs" type="button" :disabled="busy" @click="pending = null">Abbrechen</button>
        </div>
      </div>

      <p v-if="status" class="text-sm" :class="status.kind === 'ok' ? 'text-success' : 'text-error'">{{ status.msg }}</p>
    </div>
  </section>
</template>
