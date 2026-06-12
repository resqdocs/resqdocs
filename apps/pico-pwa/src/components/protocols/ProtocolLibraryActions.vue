<script setup lang="ts">
import { ref } from 'vue'
import { useCreatorSession } from '@/composables/useCreatorSession'

/**
 * Lokale Bibliothek (#13-F2): bewusstes Laden/Speichern neutraler Vorlagen.
 * SQLite auf nativen Plattformen, In-Memory im Web-Dev — die Komponente kennt
 * das Backend NICHT (nur useCreatorSession/useStorage). KEIN Auto-Save, keine
 * Patientendaten, kein caseState.
 */
const { selected, libraryMode, loadFromLibrary, saveToLibrary } = useCreatorSession()

const status = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)
const busy = ref(false)

const memoryNote = () => (libraryMode.value === 'sqlite' ? '' : ' (nur In-Memory — nach App-Neustart weg)')

async function onLoad(): Promise<void> {
  busy.value = true
  status.value = null
  try {
    await loadFromLibrary()
    status.value = { kind: 'ok', msg: `Aus Bibliothek geladen.${memoryNote()}` }
  } catch (e) {
    status.value = { kind: 'err', msg: `Laden fehlgeschlagen: ${(e as Error).message}` }
  } finally {
    busy.value = false
  }
}

async function onSave(): Promise<void> {
  busy.value = true
  status.value = null
  const r = await saveToLibrary()
  status.value = r.ok
    ? { kind: 'ok', msg: `In Bibliothek gespeichert.${memoryNote()}` }
    : { kind: 'err', msg: `Speichern abgelehnt: ${r.errors.join('; ')}` }
  busy.value = false
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold">Lokale Bibliothek</h3>
        <span class="badge badge-sm" :class="libraryMode === 'sqlite' ? 'badge-success' : 'badge-ghost'">
          {{ libraryMode === 'sqlite' ? 'persistent (SQLite)' : 'nur In-Memory' }}
        </span>
      </div>
      <p class="text-xs text-base-content/60">
        <strong>Hier sicherst du deine Protokolle dauerhaft.</strong> Nur was in der Bibliothek liegt,
        bleibt nach dem Schließen der App und nach Updates erhalten. Die Bibliothek speichert nur
        neutrale Vorlagen — keine Patientendaten.
        <span v-if="libraryMode !== 'sqlite'">(Im Web-Dev nicht dauerhaft — native App nutzt SQLite.)</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm" type="button" :disabled="busy" @click="onLoad">Aus Bibliothek laden</button>
        <button class="btn btn-primary btn-sm" type="button" :disabled="busy || !selected" @click="onSave">
          In Bibliothek speichern
        </button>
      </div>
      <p v-if="status" class="text-sm" :class="status.kind === 'ok' ? 'text-success' : 'text-error'">
        {{ status.msg }}
      </p>
    </div>
  </section>
</template>
