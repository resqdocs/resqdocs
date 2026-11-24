<script setup lang="ts">
/**
 * Hinweis am Protokolltext: Zeichen, die die Bridge nicht tippen kann, mit Anzahl und den Zeichen selbst.
 * Nur ein Hinweis, keine Sperre: Senden bleibt möglich. Erscheint nur, wenn es solche Zeichen gibt.
 * Kurz gehalten; die Erklärung steht hinter dem ⓘ. Geteilt von App und Online-Editor (ein Wortlaut).
 *
 * `text` ist der fertige Protokolltext (aus render(), also schon mit ersetzten Zeichen), `marker` das, was am
 * Zielgerät stattdessen ankommt (typingMarker).
 */
import { computed } from 'vue'
import { INFO } from '../terms.ts'
import { typingMarker, untypeableNotice } from '../untypeableNotice.ts'
import InfoTip from './InfoTip.vue'

const props = defineProps<{ text: string; marker?: string }>()
const notice = computed(() => untypeableNotice(props.text, props.marker ?? typingMarker()))
</script>

<template>
  <p v-if="notice" class="flex items-center gap-1 text-left text-sm text-warning" role="status" aria-live="polite" data-untypeable>
    <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{{ notice }}</span>
    <InfoTip :info="INFO.untypeable" />
  </p>
</template>
