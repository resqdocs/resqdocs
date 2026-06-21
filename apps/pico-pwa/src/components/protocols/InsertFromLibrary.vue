<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useBausteine } from '@/composables/useBausteine'
import { useCreatorSession } from '@/composables/useCreatorSession'
import type { LibraryBlock, LibrarySnippet } from '@/storage/types'

/**
 * „Aus Textbausteinen einfügen" (#13-F4). Fügt gespeicherte neutrale Bausteine/
 * Snippets als KOPIE ins ausgewählte Protokoll ein (kein Live-Link, kein
 * Auto-Save). Liest den Textbausteine-Vorrat über useBausteine, fügt über
 * useCreatorSession ein — keine SQLite-Direktnutzung. Keine Patientendaten.
 */
const { blocks, snippets, reload } = useBausteine()
const { selected, selectedBlockId, insertLibraryBlock, insertLibrarySnippet } = useCreatorSession()

const status = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)
const target = ref<string>('')

const protocolBlocks = computed(() => selected.value?.blocks ?? [])
// Nichts gespeichert → optionales Werkzeug statt großer leerer Karte.
const isEmpty = computed(() => !blocks.value.length && !snippets.value.length)

onMounted(reload)

function onInsertBlock(b: LibraryBlock): void {
  const r = insertLibraryBlock(b)
  status.value = r.ok
    ? { kind: 'ok', msg: `Baustein „${b.title}" eingefügt.` }
    : { kind: 'err', msg: `Einfügen abgelehnt: ${r.errors.join('; ')}` }
}

function onInsertSnippet(s: LibrarySnippet): void {
  const blockId = target.value || selectedBlockId.value || protocolBlocks.value[0]?.id || ''
  const r = insertLibrarySnippet(s, blockId)
  status.value = r.ok
    ? { kind: 'ok', msg: `Snippet „${s.title}" eingefügt.` }
    : { kind: 'err', msg: `Einfügen abgelehnt: ${r.errors.join('; ')}` }
}
</script>

<template>
  <!-- Leerer Vorrat: dezenter, einklappbarer Hinweis statt großer Karte (optionales Werkzeug) -->
  <details v-if="isEmpty" class="rounded-lg border border-base-300 bg-base-100 px-3 py-2 text-sm">
    <summary class="cursor-pointer select-none text-base-content/70">Aus Textbausteinen einfügen</summary>
    <p class="mt-1 text-xs text-base-content/60">
      Lege im Tab „Textbausteine" wiederverwendbare Blöcke oder Snippets an, um sie hier per Klick in deine
      Vorlage einzufügen.
    </p>
  </details>

  <section v-else class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <h3 class="font-semibold">Aus Textbausteinen einfügen</h3>
      <p class="text-xs text-base-content/60">
        Bausteine/Snippets werden als Kopie eingefügt (kein Live-Link). Nur neutrale Vorlagen — keine
        Patientendaten.
      </p>

      <!-- Bausteine → neuer Block -->
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Bausteine (als neuer Block)</span>
        <ul class="flex flex-col gap-1">
          <li v-for="b in blocks" :key="b.id" class="flex items-center gap-2 rounded border border-base-300 px-2 py-1">
            <span class="flex-1 truncate text-sm">{{ b.title }}</span>
            <button class="btn btn-xs" type="button" @click="onInsertBlock(b)">Einfügen</button>
          </li>
          <li v-if="!blocks.length" class="px-1 text-sm text-base-content/60">Noch keine Blöcke im Tab „Textbausteine".</li>
        </ul>
      </div>

      <!-- Snippets → text-Punkt in Zielblock -->
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium">Snippets (als Text-Punkt)</span>
        <p v-if="!protocolBlocks.length" class="text-xs text-warning">
          Lege zuerst einen Block im Protokoll an, um Snippets einzufügen.
        </p>
        <template v-else>
          <label class="form-control">
            <span class="label-text text-xs">Zielblock</span>
            <select v-model="target" class="select select-bordered select-xs w-full max-w-xs" aria-label="Zielblock">
              <option value="">(aktiver/erster Block)</option>
              <option v-for="blk in protocolBlocks" :key="blk.id" :value="blk.id">{{ blk.title || blk.id }}</option>
            </select>
          </label>
          <ul class="flex flex-col gap-1">
            <li v-for="s in snippets" :key="s.id" class="flex items-center gap-2 rounded border border-base-300 px-2 py-1">
              <span class="flex-1 truncate text-sm">{{ s.title }}</span>
              <button class="btn btn-xs" type="button" @click="onInsertSnippet(s)">Einfügen</button>
            </li>
            <li v-if="!snippets.length" class="px-1 text-sm text-base-content/60">Noch keine Snippets im Tab „Textbausteine".</li>
          </ul>
        </template>
      </div>

      <p v-if="status" class="text-sm" :class="status.kind === 'ok' ? 'text-success' : 'text-error'">
        {{ status.msg }}
      </p>
    </div>
  </section>
</template>
