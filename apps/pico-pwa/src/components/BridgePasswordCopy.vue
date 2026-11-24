<script setup lang="ts">
// WLAN-Passwort der Bridge: antippen kopiert es. Das Passwort ist für alle Bridges gleich und bewusst öffentlich,
// also kein Einsatzinhalt. Kopiert wird ausschließlich diese feste Zeichenfolge; die Komponente nimmt keinen Text
// von außen an. Schlägt das Kopieren fehl, bleibt das Passwort markierbar (select-text).
import { onBeforeUnmount, ref } from 'vue'
import { BRIDGE_WIFI_PASSWORD } from '@/pico/bridgeWifiJoin'

const state = ref<'idle' | 'ok' | 'err'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(BRIDGE_WIFI_PASSWORD)
    state.value = 'ok'
  } catch {
    state.value = 'err'
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => (state.value = 'idle'), 2000)
}
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <button
    type="button"
    class="btn btn-ghost btn-sm -my-2 min-h-11 gap-2 border-0 pl-0! pr-2! font-normal"
    aria-label="Passwort kopieren"
    data-bridge-password
    @click="copy"
  >
    <code class="select-text font-mono">{{ BRIDGE_WIFI_PASSWORD }}</code>
    <svg v-if="state === 'ok'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-success" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="size-4 text-base-content/75" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
    <span class="text-xs" :class="state === 'err' ? 'text-error' : 'text-success'" role="status" aria-live="polite">{{ state === 'ok' ? 'Kopiert' : state === 'err' ? 'Kopieren nicht möglich' : '' }}</span>
  </button>
</template>
