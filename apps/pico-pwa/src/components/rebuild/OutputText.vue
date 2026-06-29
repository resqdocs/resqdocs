<script setup lang="ts">
/**
 * Read-only Anzeige der generierten Textausgabe. Geteilt von Editor-Vorschau und
 * Einsatz-Vorschau (EINE Darstellung, kein Duplikat). Rein darstellend: bekommt den fertigen
 * Text als Prop, das Rendern (render.ts) bleibt beim Aufrufer.
 *
 * Quellenbasiert (docs/rework/output-display.md):
 *  - <pre><samp> + Monospace: die Banner sind zeichengenau ausgerichtet (fillMode inclusive =
 *    konstante Breite) -> Ausrichtung ist load-bearing. white-space: pre (NICHT pre-wrap) +
 *    horizontaler Scroll; gedeckt durch WCAG 1.4.10 2D-Ausnahme (nur dieser Block).
 *  - Scroll-Region tastaturbedienbar + benannt (tabindex/role/aria-label, WCAG 2.1.1) + Fade-Cue.
 *  - aria-live=polite/atomic: Update wird angekuendigt.
 *  - read-only = volle Textfarbe (nicht ausgegraut, 4.5:1), text-sm (lesbar, ueberlebt 200% Zoom).
 *  - Kopier-Button: echter <button>, aria-label, Clipboard API mit try/catch + sichtbarem Feedback.
 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{ text: string; label?: string }>(), { label: 'Ausgabetext' })

const copyState = ref<'idle' | 'ok' | 'err'>('idle')

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text)
    copyState.value = 'ok'
  } catch {
    copyState.value = 'err'
  }
  window.setTimeout(() => (copyState.value = 'idle'), 2000)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <h4 class="text-sm font-semibold text-base-content/70">{{ label }}</h4>
      <button type="button" class="btn btn-ghost btn-xs" :aria-label="label + ' kopieren'" @click="copy">
        {{ copyState === 'ok' ? 'Kopiert' : copyState === 'err' ? 'Fehler' : 'Kopieren' }}
      </button>
    </div>

    <!-- Scrollbarer 2D-Block: Ausrichtung bleibt (whitespace-pre), tastaturbedienbar + benannt,
         Update wird angekuendigt; rechter Fade signalisiert Scrollbarkeit. -->
    <div class="relative">
      <pre
        tabindex="0"
        role="group"
        :aria-label="label"
        aria-live="polite"
        aria-atomic="true"
        class="overflow-x-auto whitespace-pre rounded border border-base-300 bg-base-200 p-3 text-sm leading-relaxed text-base-content focus:outline-none focus-visible:ring focus-visible:ring-primary/40"
      ><samp class="font-mono">{{ text || '(leer)' }}</samp></pre>
      <div
        class="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r bg-gradient-to-l from-base-200 to-transparent"
        aria-hidden="true"
      />
    </div>

    <p v-if="copyState === 'err'" class="text-xs text-error">Kopieren nicht möglich.</p>
  </div>
</template>
