<script setup lang="ts">
import { useStorage } from '@/storage/useStorage'
import { useUsageNotice } from '@/composables/useUsageNotice'

/** Info & Hilfe (#14-A). Kurze, neutrale Hinweise — keine Rechtsberatung, keine Garantien.
 * Plus: Erklär-Hinweise zurücksetzen (#72) und „Hinweis zur Nutzung" erneut anzeigen. */
const { settings, saveSettings } = useStorage()
const usageNotice = useUsageNotice()
function resetHints(): void {
  settings.dismissedHints = []
  void saveSettings()
}
</script>

<template>
  <div class="flex flex-col gap-2">
      <h3 class="font-medium">Info & Hilfe</h3>
      <p class="text-sm">
        <strong>ResQDocs</strong> hilft, Einsatz-Dokumentation aus eigenen Vorlagen zusammenzustellen und
        an ein Zielgerät zu übertragen.
      </p>
      <!-- Anleitung lebt bewusst auf der Landing-Page (#139); Öffnen ist nutzerinitiiert
           (externer Browser) und damit konform zur No-Network-Policy der App. -->
      <p class="text-sm">
        <a href="https://resqdocs.app/anleitung" target="_blank" rel="noopener" class="link link-primary">
          Anleitung öffnen (resqdocs.app)
        </a>
        - Quickstart und ausführliche Kapitel zu allen Funktionen.
      </p>
      <ul class="list-disc pl-5 text-sm text-base-content/80">
        <li><strong>Hilfsmittel, kein Ersatz</strong> für fachliche Dokumentation.</li>
        <li>Protokolle und Muster sind <strong>unverbindliche Vorlagen</strong>, keine fachliche Vorgabe.</li>
        <li>Für Vorgehen, Bewertung und Dokumentation bleibst <strong>du verantwortlich</strong>.</li>
        <li>Keine Rechtsberatung, keine medizinische Garantie, keine Zusicherung vollständiger DSGVO-Konformität.</li>
      </ul>
      <p class="text-sm text-base-content/70">
        ResQDocs ist ein <strong>Open-Source-Projekt</strong> — Mitwirken (Issues, Beiträge) ist willkommen.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-sm min-h-11" type="button" @click="usageNotice.show()">Hinweis zur Nutzung</button>
        <button class="btn btn-sm min-h-11" type="button" @click="resetHints">Alle Hinweise erneut anzeigen</button>
        <span v-if="!settings.dismissedHints.length" class="text-xs text-base-content/50">keine ausgeblendet</span>
      </div>
  </div>
</template>
