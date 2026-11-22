<script setup lang="ts">
/**
 * Haken „Kurzlink“ beim Teilen per Link. Gesetzt erscheint ein kurzer Hinweis, was das bedeutet (bewusst sichtbar
 * statt hinter ⓘ: Maintainer 2026-11-21, wer den Haken setzt, wird informiert). Der QR-Code bleibt der lange Link;
 * mit Kurzlink kennt der Dienst dessen Schlüssel aber ebenfalls, bis der Inhalt weg ist.
 */
defineProps<{ busy?: boolean; error?: string }>()
const short = defineModel<boolean>({ required: true })
</script>

<template>
  <div class="flex flex-col gap-1" data-short-link>
    <label class="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input v-model="short" type="checkbox" class="checkbox checkbox-sm" data-short-link-toggle />
      <span>Kurzlink zum Weitergeben</span>
      <span v-if="busy" class="loading loading-spinner loading-xs" aria-label="Kurzlink wird angelegt" />
    </label>
    <p v-if="short" class="text-xs text-base-content/80" data-short-link-hint>
      Einfacher zu tippen und vorzulesen. Dafür kann der Transfer-Dienst diesen Inhalt lesen, bis er abgelaufen oder übernommen ist, auch wenn er über den QR-Code geöffnet wird. Ohne Haken kann er das nicht. Zum Weitergeben genügt der Code: Die Gegenseite gibt ihn in ResQDocs unter „Empfangen“ ein. „Kopieren“ kopiert den ganzen Link.
    </p>
    <p v-if="error" class="text-xs text-error" role="alert">{{ error }}</p>
  </div>
</template>
