<script setup lang="ts">
/**
 * Vorschau der Renderer-Ausgabe (Klartext) aus dem aktuellen Einsatz-Zustand.
 * Reine Anzeige; kann Patientendaten enthalten → wird nicht persistiert/gecacht.
 */
defineProps<{ text: string }>()
</script>

<template>
  <pre class="whitespace-pre-wrap break-words rounded bg-base-200 p-3 text-sm">{{ text }}</pre>
</template>
