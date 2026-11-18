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
 *  - `wrap` (Vorschau am Handy): Inhaltszeilen brechen am Rand um, damit man den Text ohne seitliches
 *    Schieben gegenlesen kann. Titelzeilen mit Füllzeichen behalten ihre Zeile und werden am Rand
 *    abgeschnitten - ihre Breite ist für das Zielsystem gedacht, nicht für die Vorschau. Kopiert wird
 *    immer der unveränderte Text.
 */
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ text: string; label?: string; wrap?: boolean }>(), { label: 'Protokolltext', wrap: false })

/** Titelzeile: endet auf eine Reihe gleicher Füllzeichen (kein Buchstabe, keine Ziffer). */
const BANNER = /([^\p{L}\p{N}\s])\1{5,}\s*$/u
const lines = computed(() => (props.text || '(leer)').split('\n').map((text) => ({ text, banner: BANNER.test(text) })))

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
      <h4 class="text-sm font-semibold text-base-content/75">{{ label }}</h4>
      <button type="button" class="btn btn-ghost btn-xs" :aria-label="label + ' kopieren'" @click="copy">
        {{ copyState === 'ok' ? 'Kopiert' : copyState === 'err' ? 'Fehler' : 'Kopieren' }}
      </button>
    </div>

    <!-- Scrollbarer 2D-Block: Ausrichtung bleibt (whitespace-pre), tastaturbedienbar + benannt,
         Update wird angekuendigt; rechter Fade signalisiert Scrollbarkeit. -->
    <!-- Umbrechende Vorschau: je Zeile ein Block; Folgezeilen sind eingerückt, damit Zeilenanfänge erkennbar bleiben. -->
    <div
      v-if="wrap"
      tabindex="0"
      role="group"
      :aria-label="label"
      aria-live="polite"
      aria-atomic="true"
      class="rounded border border-base-300 bg-base-200 p-3 font-mono text-sm leading-relaxed text-base-content focus:outline-none focus-visible:ring focus-visible:ring-primary/40"
      data-output-wrap
    >
      <div v-for="(line, i) in lines" :key="i" :class="line.banner ? 'overflow-hidden whitespace-pre' : 'whitespace-pre-wrap pl-[2ch] indent-[-2ch] [overflow-wrap:anywhere]'" :data-output-banner="line.banner || undefined"><template v-if="line.text">{{ line.text }}</template><br v-else /></div>
    </div>

    <div v-else class="relative">
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
