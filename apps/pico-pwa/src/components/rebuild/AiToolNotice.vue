<script setup lang="ts">
/**
 * Empfehlung im Vorlagen-Editor (#261): Die erste eigene Vorlage entsteht am besten mit dem
 * KI-Tool (ai.resqdocs.app) — der eigene KI-Assistent fragt alles ab und liefert fertiges
 * Import-JSON; von Hand im Baum bauen bleibt möglich, ist aber der mühsamere Weg.
 *
 * Einmalig wegklickbar (Preferences-Flag, Muster useUsageNotice — nur ein Flag, keine Daten).
 * Externer Link = bewusste Nutzeraktion (Netzwerk-Policy-konform, wie InfoHelpSection).
 *
 * Der Link oeffnet den NATIVEN System-Browser (Maintainer-Vorgabe): Capacitor-Default fuer externe
 * _blank-URLs — iOS UIApplication.shared.open (WebViewDelegationHandler), Android ACTION_VIEW-Intent
 * (Bridge.launchIntent); wir haben keine allowNavigation-Ausnahmen. NICHT auf @capacitor/browser
 * umstellen: das oeffnet trotz des Namens IN-APP (SFSafariViewController/Custom Tabs).
 */
import { onMounted, ref, computed } from 'vue'
import { preferencesAdapter } from '@/storage/preferencesAdapter'
import { useAppVersion } from '@/composables/useAppVersion'

const KEY = 'editor.aiToolNoticeDismissed'
const visible = ref(false)
// ?v=<echte App-Version> mitgeben -> die KI-Seite stempelt sie in den Prompt (Versions-Check ohne Rueckfrage).
const { version } = useAppVersion()
const aiUrl = computed(() => `https://ai.resqdocs.app?v=${encodeURIComponent(version.value)}`)

onMounted(async () => {
  try {
    visible.value = (await preferencesAdapter.get(KEY)) !== 'true'
  } catch {
    visible.value = true
  }
})
async function dismiss(): Promise<void> {
  visible.value = false
  try {
    await preferencesAdapter.set(KEY, 'true')
  } catch {
    /* nicht persistierbar -> Hinweis erscheint beim naechsten Start erneut (unkritisch) */
  }
}
</script>

<template>
  <div v-if="visible" class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
    <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="h-6 w-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
      </svg>
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <p class="text-sm">
        <strong>Erste Vorlage?</strong> Wir empfehlen dringend das KI-Tool: Dein eigener KI-Assistent (ChatGPT, Claude, Gemini) fragt alles
        Schritt für Schritt ab und liefert die fertige Vorlage zum Import — schneller als der Aufbau von Hand.
      </p>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a :href="aiUrl" target="_blank" rel="noopener" class="btn btn-primary btn-sm min-h-11">KI-Tool öffnen</a>
        <span class="text-xs text-base-content/50">Import danach: ⋮ → „Daten" → „Importieren"</span>
      </div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm btn-circle min-h-11 min-w-11" aria-label="Hinweis ausblenden" @click="dismiss">✕</button>
  </div>
</template>
