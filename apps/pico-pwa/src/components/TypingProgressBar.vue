<script setup lang="ts">
import { computed } from 'vue'
import { useTypingProgress } from '@/pico/useTypingProgress'
import { formatRemaining } from '@/pico/typingProgress'

/**
 * Fortschritt des Tippens auf der Bridge: fest ueber der Tab-Leiste, auf allen Tabs. Zeigt, wie weit die
 * Bridge ist und wie lange es etwa noch dauert; dazu Stoppen, Weitertippen und Abbrechen, solange die
 * Bridge erreichbar ist. Schliessen blendet nur die Anzeige aus - getippt wird weiter.
 * KEINE HTTP-Logik hier (nur das Composable), kein Text des Protokolls.
 */
const typing = useTypingProgress()
const s = computed(() => typing.snapshot.value)

const title = computed(() => {
  switch (s.value?.phase) {
    case 'paused': return 'Tippen angehalten'
    case 'done': return s.value.source === 'live' ? 'Fertig getippt' : 'Sollte jetzt fertig getippt sein'
    case 'cancelled': return 'Tippen abgebrochen'
    default: return 'Protokoll wird getippt'
  }
})

const detail = computed(() => {
  const v = s.value
  if (!v) return ''
  const count = `${v.done} von ${v.total} Zeichen`
  if (v.phase === 'typing') return `${count} · ${formatRemaining(v.remainingMs)}`
  if (v.phase === 'cancelled') return `${count} wurden getippt.`
  if (v.phase === 'done') return `${v.total} Zeichen`
  return count
})

/** Hinweis, wenn nur geschaetzt wird (nie vor der ersten Antwort der Bridge). */
const hint = computed(() => {
  const v = s.value
  if (!v || v.pending || v.source === 'live' || v.phase === 'done' || v.phase === 'cancelled') return ''
  if (v.legacyFirmware) return 'Geschätzt: Diese Bridge meldet den Fortschritt erst nach einem Firmware-Update.'
  if (v.phase === 'paused') return 'Keine Verbindung zur Bridge. Zum Weitertippen wieder mit ihrem WLAN verbinden; nach 5 Minuten verwirft sie den angehaltenen Text.'
  return 'Geschätzt: keine Verbindung zur Bridge. Sie tippt trotzdem zu Ende.'
})

const percent = computed(() => Math.round((s.value?.fraction ?? 0) * 100))
const barClass = computed(() => {
  switch (s.value?.phase) {
    case 'done': return 'progress-success'
    case 'cancelled': return 'progress-error'
    case 'paused': return 'progress-warning'
    default: return 'progress-primary'
  }
})
</script>

<template>
  <!-- Ueber der Tab-Leiste (dock, 4rem + Safe-Area). z-20: ueber Seiteninhalt und Leiste, unter den Dialogen. -->
  <div
    v-if="typing.visible.value && s"
    class="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2"
    role="status"
    aria-live="polite"
  >
    <div class="mx-auto w-full max-w-xl rounded-box border border-base-300 bg-base-100 p-3 shadow-lg">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ title }}</p>
          <p class="text-xs text-base-content/70">{{ detail }}</p>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11 shrink-0"
          aria-label="Anzeige schließen — die Bridge tippt weiter"
          title="Anzeige schließen — die Bridge tippt weiter"
          @click="typing.dismiss()"
        >✕</button>
      </div>

      <progress class="progress mt-1 w-full" :class="barClass" :value="percent" max="100" :aria-label="`${percent} Prozent getippt`" />

      <p v-if="hint" class="mt-1 text-xs text-base-content/60">{{ hint }}</p>

      <div v-if="s.canControl" class="mt-2 flex gap-2">
        <button
          v-if="s.phase === 'typing'"
          type="button"
          class="btn btn-sm min-h-11 flex-1"
          :disabled="typing.controlling.value"
          @click="typing.control('pause')"
        >Stoppen</button>
        <button
          v-else
          type="button"
          class="btn btn-primary btn-sm min-h-11 flex-1"
          :disabled="typing.controlling.value"
          @click="typing.control('resume')"
        >Weitertippen</button>
        <button
          type="button"
          class="btn btn-outline btn-error btn-sm min-h-11 flex-1"
          :disabled="typing.controlling.value"
          @click="typing.control('cancel')"
        >Abbrechen</button>
      </div>
    </div>
  </div>
</template>
