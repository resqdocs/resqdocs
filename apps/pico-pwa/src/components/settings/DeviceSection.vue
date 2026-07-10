<script setup lang="ts">
import { computed, ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings'
import { usePicoDevice } from '@/pico/usePicoDevice'
import { useFirmwareUpdate } from '@/pico/useFirmwareUpdate'
import { isValidSsidId } from '@/pico/picoClient'

/**
 * Gerät / Pico (#14-B, /config: #17, OTA: #130). Bindet die gekapselte
 * Pico-Schicht (usePicoDevice/useFirmwareUpdate) an: Verbindung prüfen,
 * Status abrufen, Firmware aktualisieren, manueller Testtext über /type,
 * SSID-ID ändern über /config. KEINE HTTP-Logik hier (nur über die
 * Composables). Kein Auto-Connect, kein Auto-Send. Testtext lebt nur im
 * RAM (nicht persistiert).
 */
const { reachable, status, testText, os, busy, error, baseUrl, setBaseUrl, checkHealth, fetchStatus, sendTest, setSsidId } =
  usePicoDevice()
const fw = useFirmwareUpdate()

const sendMsg = ref<string | null>(null)
const draftUrl = ref<string>(baseUrl.value)
const ssidDraft = ref('')
const ssidMsg = ref<string | null>(null)
const fwMsg = ref<string | null>(null)

const fwState = computed(() => fw.updateFor(status.value))
const fwPhaseText = computed(() => {
  switch (fw.phase.value) {
    case 'uploading': return `Übertrage Firmware ... ${Math.round(fw.progress.value * 100)} %`
    case 'verifying': return 'Bridge verifiziert Signatur ...'
    case 'rebooting': return 'Bridge startet neu - bitte warten ...'
    default: return null
  }
})

async function onFirmwareUpdate(): Promise<void> {
  fwMsg.value = null
  const r = await fw.start()
  if (r.ok) {
    fwMsg.value = `Update erfolgreich - Bridge läuft jetzt mit ${fw.manifest?.version}.`
    await fetchStatus() // Versionsanzeige aktualisieren
  } else {
    fwMsg.value = `Update fehlgeschlagen: ${r.error ?? ''} Die Bridge behält bei Verifikationsfehlern die alte Firmware.`
  }
}

function commitUrl(): void {
  if (draftUrl.value.trim()) setBaseUrl(draftUrl.value.trim())
}
async function onSend(): Promise<void> {
  sendMsg.value = null
  const r = await sendTest()
  sendMsg.value = r.ok ? `Gesendet (${r.typed ?? 0} Zeichen getippt).` : `Senden fehlgeschlagen: ${r.error ?? ''}`
}
// „WLAN-Einstellungen öffnen" NUR auf Android: dort springt der System-Intent
// direkt zur WLAN-Seite. iOS lässt das offiziell nicht zu (privates App-prefs-
// Schema = App-Store-Risiko) — dort steht WLAN + Passwort daneben nur als Text,
// kein (irreführender/toter) Button. optionIOS bleibt nur zur Typ-Erfüllung.
const platform = Capacitor.getPlatform()
async function openWifiSettings(): Promise<void> {
  try {
    await NativeSettings.open({ optionAndroid: AndroidSettings.Wifi, optionIOS: IOSSettings.App })
  } catch {
    /* nur nativ verfügbar; Web/Fehler still ignorieren */
  }
}

async function onSetSsid(): Promise<void> {
  ssidMsg.value = null
  const id = ssidDraft.value.trim()
  const r = await setSsidId(id)
  if (r.ok) {
    ssidMsg.value = r.restartRequired
      ? `Gespeichert. Die Bridge startet ihr WLAN neu - bitte mit "ResQDocs-${id}" neu verbinden.`
      : 'Gespeichert.'
    ssidDraft.value = ''
  } else {
    ssidMsg.value = `Ändern fehlgeschlagen: ${r.error ?? ''}`
  }
}
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex items-center justify-between">
        <h3 class="font-medium">Gerät / Pico</h3>
        <span
          class="badge badge-sm"
          :class="reachable === true ? 'badge-success' : reachable === false ? 'badge-error' : 'badge-ghost'"
        >
          {{ reachable === true ? 'erreichbar' : reachable === false ? 'nicht erreichbar' : 'unbekannt' }}
        </span>
      </div>

      <!-- WLAN-Zugang zur Bridge: SSID-Schema + bewusst öffentliches Passwort sichtbar,
           damit ein neuer Nutzer sein Handy ohne Suche verbinden kann. select-text hebt
           die app-weite user-select:none-Sperre für diese Werte auf (kopierbar). -->
      <div class="rounded-lg bg-base-200 p-3 text-sm">
        <p class="mb-1 font-medium">Handy mit dem Bridge-WLAN verbinden</p>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt class="text-base-content/60">WLAN</dt>
          <dd><code class="select-text font-mono">ResQDocs-&lt;ID&gt;</code></dd>
          <dt class="text-base-content/60">Passwort</dt>
          <dd><code class="select-text font-mono">resqdocs2026</code></dd>
          <dt class="text-base-content/60">Adresse</dt>
          <dd><code class="select-text font-mono">http://10.10.10.1</code></dd>
        </dl>
        <button
          v-if="platform === 'android'"
          class="btn btn-outline btn-sm mt-2 min-h-11"
          type="button"
          @click="openWifiSettings"
        >WLAN-Einstellungen öffnen</button>
        <p class="mt-1 text-xs text-base-content/60">
          Das Passwort ist für alle Bridges gleich und bewusst öffentlich — die Bridge tippt nur
          Text und speichert nichts.
        </p>
      </div>

      <label class="form-control">
        <span class="label-text mb-1">Base-URL der Bridge</span>
        <input
          v-model="draftUrl"
          class="input input-bordered input-sm w-full max-w-xs min-h-11"
          placeholder="http://10.10.10.1"
          aria-label="Base-URL der Pico-Bridge"
          @change="commitUrl"
        />
      </label>

      <div class="flex flex-wrap gap-2">
        <button class="btn btn-sm min-h-11" type="button" :disabled="busy" @click="checkHealth">Verbindung prüfen</button>
        <button class="btn btn-sm min-h-11" type="button" :disabled="busy" @click="fetchStatus">Status abrufen</button>
      </div>

      <div v-if="status" class="rounded bg-base-200 p-2 text-sm">
        <div><span class="text-base-content/60">Name:</span> {{ status.name }}</div>
        <div><span class="text-base-content/60">Firmware:</span> {{ status.fwVersion }}</div>
        <div><span class="text-base-content/60">API:</span> {{ status.apiVersion }}</div>
        <div><span class="text-base-content/60">Bereit:</span> {{ status.ready ? 'ja' : 'nein' }}</div>
        <div><span class="text-base-content/60">Default-OS:</span> {{ status.defaultOs }}</div>
      </div>
      <p v-if="error" class="text-sm text-error">{{ error }}</p>

      <div class="divider my-0" />

      <!-- Firmware aktualisieren (OTA, #130) -->
      <div>
        <div class="mb-1 flex items-center justify-between">
          <span class="label-text">Firmware aktualisieren</span>
          <span v-if="fw.manifest" class="text-xs text-base-content/60">mitgeliefert: {{ fw.manifest.version }}</span>
        </div>

        <p v-if="fwState === 'no-bundle'" class="text-sm text-base-content/60">
          Diese App-Version enthält keine Bridge-Firmware.
        </p>
        <p v-else-if="fwState === 'no-status'" class="text-sm text-base-content/60">
          Erst "Status abrufen", um die Firmware-Version der Bridge zu prüfen.
        </p>
        <p v-else-if="fwState === 'unsupported'" class="text-sm text-warning">
          Diese Bridge-Firmware ({{ status?.fwVersion }}) kann noch kein Funk-Update. Einmalig manuell
          flashen: Pico mit gedrückter BOOTSEL-Taste per USB anschließen und die
          <code>.uf2</code> aufspielen (Anleitung: firmware/bridge/README).
        </p>
        <p v-else-if="fwState === 'up-to-date'" class="text-sm text-success">
          Bridge ist aktuell ({{ status?.fwVersion }}).
        </p>

        <template v-if="fwState === 'available'">
          <p class="text-sm">
            Update verfügbar: Bridge hat {{ status?.fwVersion }}, App bringt {{ fw.manifest?.version }} mit.
          </p>
          <p class="text-xs text-warning">
            Während des Updates USB- und Stromverbindung der Bridge nicht trennen.
          </p>
          <button
            class="btn btn-primary btn-sm mt-1 min-h-11"
            type="button"
            :disabled="busy || fw.running.value"
            @click="onFirmwareUpdate"
          >
            Auf {{ fw.manifest?.version }} aktualisieren
          </button>
        </template>

        <template v-if="fw.running.value">
          <progress class="progress progress-primary mt-2 w-full" :value="fw.progress.value" max="1" />
          <p class="text-sm text-base-content/70">{{ fwPhaseText }}</p>
        </template>
        <p v-if="fwMsg" class="text-sm" :class="fw.phase.value === 'error' ? 'text-error' : 'text-base-content/70'">
          {{ fwMsg }}
        </p>
      </div>

      <div class="divider my-0" />

      <!-- Manueller Testtext über /type -->
      <label class="form-control">
        <span class="label-text mb-1">Testtext (manuell, keine Patientendaten)</span>
        <textarea
          v-model="testText"
          rows="2"
          class="textarea textarea-bordered textarea-sm w-full"
          placeholder="z. B. Test 123 äöü"
          aria-label="Testtext"
        />
      </label>
      <div class="flex items-center gap-2">
        <select v-model="os" class="select select-bordered select-sm w-32 min-h-11" aria-label="Ziel-OS">
          <option value="win_de">Windows DE (z. B. NIDA)</option>
          <option value="mac_de">macOS</option>
          <option value="ios">iPad (ios)</option>
        </select>
        <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="busy || !testText" @click="onSend">
          Testtext senden
        </button>
      </div>
      <p v-if="sendMsg" class="text-sm text-base-content/70">{{ sendMsg }}</p>

      <div class="divider my-0" />

      <!-- SSID-ID ändern über /config (#17) -->
      <label class="form-control">
        <span class="label-text mb-1">Geräte-ID (WLAN heißt "ResQDocs-&lt;ID&gt;")</span>
        <input
          v-model="ssidDraft"
          class="input input-bordered input-sm w-full max-w-xs min-h-11"
          placeholder="z. B. RTW-1"
          maxlength="23"
          aria-label="Neue Geräte-ID"
        />
      </label>
      <div class="flex items-center gap-2">
        <button
          class="btn btn-sm min-h-11"
          type="button"
          :disabled="busy || !isValidSsidId(ssidDraft.trim())"
          @click="onSetSsid"
        >
          Geräte-ID ändern
        </button>
        <span v-if="ssidDraft.trim() && !isValidSsidId(ssidDraft.trim())" class="text-xs text-warning">
          Erlaubt: A-Z a-z 0-9 _ - (max. 23 Zeichen)
        </span>
      </div>
      <p v-if="ssidMsg" class="text-sm text-base-content/70">{{ ssidMsg }}</p>

      <p class="text-xs text-base-content/60">
        Lokale HTTP-Verbindung zur Bridge. <strong>Keine Patientendaten</strong> im Testtext verwenden —
        <code>POST /type</code> überträgt den Text nur <strong>transient</strong> (Body, kein Logging/Cache).
        Im Web-Browser kann es CORS-/Mixed-Content-Probleme geben; die native App nutzt CapacitorHttp.
        Nach dem Ändern der Geräte-ID startet die Bridge ihr WLAN neu; alternativ geht die Änderung
        auch seriell (<code>id NEUEID</code>).
      </p>
    </div>
  </section>
</template>
