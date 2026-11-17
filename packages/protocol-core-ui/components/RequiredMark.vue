<script setup lang="ts">
/** Pflichtfeld-Markierung: ein „*" an gleicher Stelle bei ALLEN Feld-Arten (Freitext/Select/Funktion),
 *  damit die Pflicht-Semantik einheitlich + wiedererkennbar ist. Nicht rein farbcodiert (WCAG 1.4.1):
 *  der Stern traegt die Bedeutung, die Farbe eskaliert nur den Offen-Zustand.
 *  - erfuellt/ruhig: dezent gedimmt (kein neuer Farbakzent neben ✓success/✎primary/−base)
 *  - offen: text-warning (Amber = „noch offen", KEIN Fehler; daher kein roter Rahmen/kein Gate).
 *  Screenreader erhalten „Pflichtfeld" bzw. „Pflichtfeld – noch offen" ueber sr-only. */
defineProps<{ open: boolean }>()
</script>

<template>
  <span class="font-bold leading-none" :class="open ? 'text-warning' : 'text-base-content/40'" title="Pflichtfeld" aria-hidden="true">*</span>
  <span class="sr-only">Pflichtfeld{{ open ? ' – noch offen' : '' }}</span>
</template>
