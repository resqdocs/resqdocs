<script setup lang="ts">
/**
 * Empfangen auf Bausteine-Ebene: nimmt einen verschlüsselten Transfer-Link (oder QR) entgegen und legt den
 * Inhalt AUTOMATISCH am richtigen Ort ab — Block → Block-Bibliothek, Snippet → Snippet-Bibliothek
 * (Protokolle wandern über routeImport in die Vorlagen). Reine UI über der bestehenden Logik: receiveTransfer
 * entschlüsselt lokal zu JSON, routeImport erkennt das Schema und routet. Symmetrisch zum Vorlagen-„Empfangen".
 */
import { ref } from 'vue'
import { receiveTransfer, TransferError } from '@resqdocs/protocol-core/transferClient'
import { routeImport } from '@/composables/useImportRouting'
import QrScanOverlay from '@/components/QrScanOverlay.vue'

const transferCfg = (import.meta.env.VITE_TRANSFER_URL as string | undefined)
  ? { baseUrl: import.meta.env.VITE_TRANSFER_URL as string }
  : undefined
const receiveText = ref('')
const busy = ref(false)
const qrOpen = ref(false)
const msg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)

async function receive(): Promise<void> {
  busy.value = true
  msg.value = null
  try {
    const json = await receiveTransfer(receiveText.value, transferCfg)
    const outcome = await routeImport(json) // erkennt Block/Snippet/Vorlage und legt es am richtigen Ort ab
    msg.value = { kind: outcome.ok ? 'ok' : 'err', text: outcome.message }
    if (outcome.ok) receiveText.value = ''
  } catch (e) {
    msg.value = { kind: 'err', text: e instanceof TransferError ? e.message : 'Empfangen fehlgeschlagen.' }
  } finally {
    busy.value = false
  }
}
function onQrDecoded(raw: string): void {
  qrOpen.value = false
  receiveText.value = raw
  void receive() // gescannter Link -> derselbe Empfangs-Pfad wie eingefügt
}
</script>

<template>
  <div class="card border border-base-300 bg-base-100">
    <div class="card-body gap-2 p-4">
      <h3 class="font-semibold">Empfangen — verschlüsselter Link + QR</h3>
      <p class="text-xs text-base-content/60">
        Block- oder Snippet-Link einfügen oder QR scannen — landet automatisch in der richtigen Bibliothek.
      </p>
      <div class="flex items-center gap-2">
        <input
          v-model="receiveText"
          class="input input-bordered input-sm w-full font-mono text-xs"
          placeholder="https://transfer.resqdocs.app/#…"
          aria-label="Transfer-Link einfügen"
        />
        <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="!receiveText.trim() || busy" @click="receive">
          {{ busy ? 'Lade …' : 'Empfangen' }}
        </button>
      </div>
      <div class="divider my-0 text-xs text-base-content/40">oder</div>
      <button class="btn btn-outline btn-sm min-h-11 w-full gap-2" type="button" :disabled="busy" @click="qrOpen = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5 shrink-0" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 8.25V6A2.25 2.25 0 0 1 6 3.75h2.25M15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25M20.25 15.75V18A2.25 2.25 0 0 1 18 20.25h-2.25M8.25 20.25H6A2.25 2.25 0 0 1 3.75 18v-2.25" />
          <path stroke-linecap="round" d="M7.5 12h9" />
        </svg>
        QR-Code scannen
      </button>
      <p v-if="msg" class="text-xs" :class="msg.kind === 'ok' ? 'text-success' : 'text-error'">{{ msg.text }}</p>
    </div>
    <QrScanOverlay v-if="qrOpen" @decoded="onQrDecoded" @cancel="qrOpen = false" />
  </div>
</template>
