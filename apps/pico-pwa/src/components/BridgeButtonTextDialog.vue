<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { ButtonRequiredError, TYPE_CHUNK_LIMIT } from '@/pico/picoClient'
import { countChars } from '@/pico/typingProgress'
import { checkStoredText, guardMessage, normalizeStoredText } from '@/pico/storedTextGuard'
import { useButtonTextStatus } from '@/pico/useButtonTextStatus'
import { buttonTextRequest, takeButtonTextRequest } from '@/pico/buttonTextEntry'

/**
 * Text fuer den Knopf an der Bridge: ein schlichtes Textfeld. Der Text liegt auf der Bridge und wird
 * dort auf Knopfdruck getippt - ohne Handy. Geholt, gespeichert und entfernt wird er nur, waehrend
 * der Knopf an der Bridge gedrueckt ist (Nachweis, dass man sie in der Hand hat).
 *
 * Einmal in der App eingehaengt; geoeffnet ueber buttonTextEntry (Kopfleiste, Bridge-Seite, Einsatz).
 * Kommt der Text aus dem Einsatz, steht er schon im Feld und ersetzt beim Speichern den Text der Bridge.
 *
 * Datenschutz: Der Text lebt hier nur im Arbeitsspeicher (nicht in den App-Daten, nicht im Entwurf).
 * Er ist fuer Geruest-Texte gedacht, nie fuer Patientendaten. Aus dem Einsatz muss das vor dem
 * Speichern ausdruecklich bestaetigt werden, weil dort sonst Patientendaten stehen.
 */
const storage = useStorage()
const { client, support, checking, info, summary, failReason, refresh, presumeOfflineIfDisconnected } = useButtonTextStatus()

const dialog = ref<HTMLDialogElement | null>(null)
const text = ref('')
/** Der Text der Bridge ist geladen (oder es liegt keiner dort) - erst dann darf gespeichert werden. */
const loaded = ref(false)
/** Der Text im Feld stammt aus dem Einsatz. */
const fromCase = ref(false)
const noPatientData = ref(false)
const busy = ref(false)
const msg = ref<{ kind: 'ok' | 'err' | 'hint'; text: string } | null>(null)

const BUTTON_HINT = 'Knopf an der Bridge gedrückt halten und erneut tippen.'
const chars = computed(() => countChars(text.value))
const tooLong = computed(() => chars.value > TYPE_CHUNK_LIMIT)
// Dieselbe Pruefung wie auf der Bridge, schon beim Schreiben: der Knopf tippt nur Text, keine Befehle.
const guard = computed(() => checkStoredText(normalizeStoredText(text.value)))
const guardText = computed(() => guardMessage(guard.value))
/** Das Textfeld ist zu sehen - nur dann braucht das Blatt die volle Hoehe. */
const editing = computed(() => support.value === 'ok' && loaded.value)
const canSave = computed(
  () => !busy.value && !!text.value.trim() && !tooLong.value && guard.value.ok && (!fromCase.value || noPatientData.value),
)

/** Nach einer Abfrage: liegt nichts auf der Bridge, gibt es nichts zu holen - gleich schreiben. */
function settle(): void {
  if (support.value === 'ok' && (fromCase.value || !info.value?.present)) loaded.value = true
}
async function recheck(): Promise<void> {
  await refresh()
  settle()
}

watch(buttonTextRequest, (wanted) => {
  if (!wanted) return
  const request = takeButtonTextRequest()
  msg.value = null
  loaded.value = false
  noPatientData.value = false
  fromCase.value = request?.prefill !== undefined
  text.value = normalizeStoredText(request?.prefill ?? '')
  presumeOfflineIfDisconnected()
  dialog.value?.showModal()
  void recheck()
})

function close(): void {
  text.value = '' // nicht im Arbeitsspeicher liegen lassen
  loaded.value = false
  fromCase.value = false
  noPatientData.value = false
}

/** Fuehrt eine Aktion aus, die den gedrueckten Knopf braucht, und uebersetzt die Antwort in eine Meldung. */
async function withButton(action: () => Promise<void>, okText: string): Promise<void> {
  busy.value = true
  msg.value = null
  try {
    await action()
    msg.value = { kind: 'ok', text: okText }
  } catch (e) {
    msg.value = e instanceof ButtonRequiredError ? { kind: 'hint', text: BUTTON_HINT } : { kind: 'err', text: (e as Error).message }
  } finally {
    busy.value = false
  }
}

const load = (): Promise<void> =>
  withButton(async () => {
    text.value = await client.storedText()
    loaded.value = true
  }, 'Text von der Bridge geladen.')

const save = (): Promise<void> =>
  withButton(async () => {
    await client.storeText({
      text: normalizeStoredText(text.value),
      os: storage.settings.defaultOs ?? 'win_de',
      delayMs: storage.settings.typingDelayMs,
      savedAt: Math.floor(Date.now() / 1000),
    })
    await refresh()
  }, 'Auf der Bridge gespeichert. Ein kurzer Druck auf den Knopf tippt den Text.')

const remove = (): Promise<void> =>
  withButton(async () => {
    await client.clearStored()
    text.value = ''
    loaded.value = true
    await refresh()
  }, 'Text von der Bridge entfernt.')
</script>

<template>
  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" aria-label="Text für den Knopf an der Bridge" @close="close">
    <!-- Volle Hoehe nur mit Textfeld; sonst so hoch wie der Inhalt (kein leeres Blatt). Unten mindestens der
         uebliche Rand, auf dem iPhone der Bereich ueber dem Home-Balken. -->
    <div
      class="modal-box relative flex max-h-none flex-col gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      :class="editing ? 'h-[85vh]' : ''"
    >
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-circle absolute right-2 top-2 min-h-11 min-w-11"
        aria-label="Schließen"
        @click="dialog?.close()"
      >✕</button>
      <h3 class="pr-10 text-base font-semibold">Text für den Knopf an der Bridge</h3>

      <!-- Erste Abfrage laeuft noch. -->
      <p v-if="support === 'unknown'" class="flex min-h-11 items-center gap-2 text-sm">
        <span class="loading loading-spinner loading-sm"></span> Bridge wird geprüft …
      </p>

      <!-- Nicht verbunden oder aeltere Firmware: sagen, was los ist und was zu tun ist. -->
      <div v-else-if="support !== 'ok'" class="flex flex-col gap-3">
        <div class="flex items-start gap-3 rounded-lg bg-base-200 p-3">
          <span class="grid size-8 shrink-0 place-items-center rounded-full text-white" :class="support === 'old' ? 'bg-warning' : 'bg-error'" aria-hidden="true">
            <svg v-if="support === 'old'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5">
              <path d="M12 4v10M7.5 9.5 12 14l4.5-4.5M5 19h14" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
              <path stroke-linecap="round" d="M4 4 20 20" />
            </svg>
          </span>
          <div class="flex flex-col gap-1" role="status">
            <p class="text-sm font-medium">{{ summary }}</p>
            <p v-if="support === 'old'" class="text-sm text-base-content/75">Das Update findest du unter Einstellungen bei der Bridge.</p>
            <p v-else class="text-sm text-base-content/75">Verbinde dein Handy mit dem WLAN der Bridge und tippe dann auf „Erneut prüfen“.</p>
            <p v-if="support === 'offline' && failReason" class="text-xs text-base-content/75">Technischer Grund: {{ failReason }}</p>
          </div>
        </div>
        <p v-if="fromCase" class="text-xs text-base-content/75">Der Text aus dem Einsatz bleibt hier erhalten, bis du das Fenster schließt.</p>
        <div class="flex flex-wrap gap-2">
          <button v-if="support !== 'old'" class="btn btn-primary btn-sm min-h-11" type="button" :disabled="checking" @click="recheck">
            <span v-if="checking" class="loading loading-spinner loading-sm"></span>
            Erneut prüfen
          </button>
          <button class="btn btn-ghost btn-sm min-h-11" type="button" @click="dialog?.close()">Schließen</button>
        </div>
      </div>

      <template v-else>
        <p class="text-xs text-base-content/75">
          <strong>Keine Patientendaten, keine Befehle.</strong> Der Text bleibt auf der Bridge gespeichert, bis du ihn
          änderst oder entfernst. Laden, Speichern und Entfernen gehen nur, während du den Knopf an der Bridge gedrückt hältst.
        </p>

        <!-- Liegt schon ein Text auf der Bridge, wird er erst geholt (mit gedruecktem Knopf). -->
        <div v-if="!loaded" class="flex flex-col items-start gap-3">
          <p class="text-sm">Halte den Knopf an der Bridge gedrückt und tippe dann auf „Von der Bridge laden“.</p>
        </div>
        <template v-else>
          <p v-if="fromCase" class="text-sm">
            Aus dem Einsatz übernommen.
            <template v-if="info?.present">Beim Speichern ersetzt er den Text, der auf der Bridge liegt ({{ info.chars }} Zeichen).</template>
          </p>
          <textarea
            v-model="text"
            class="textarea textarea-bordered w-full flex-1 text-base"
            aria-label="Text, den die Bridge auf Knopfdruck tippt"
            placeholder="Text, den die Bridge auf Knopfdruck tippt …"
          ></textarea>
          <p class="text-xs" :class="tooLong ? 'text-error' : 'text-base-content/75'">
            {{ chars }} von höchstens {{ TYPE_CHUNK_LIMIT }} Zeichen. Getippt wird mit deiner Tastatur-Einstellung und
            Tippgeschwindigkeit von jetzt.
          </p>
          <p v-if="guardText" class="text-sm text-error" role="alert">{{ guardText }}</p>
          <!-- Aus dem Einsatz: ausdrueckliche Bestaetigung, denn dort stehen sonst Patientendaten. -->
          <label v-if="fromCase" class="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
            <span>Der Text enthält keine Patientendaten</span>
            <input v-model="noPatientData" type="checkbox" class="toggle toggle-primary" />
          </label>
        </template>

        <p
          v-if="msg"
          class="text-sm"
          :class="msg.kind === 'ok' ? 'text-success' : msg.kind === 'err' ? 'text-error' : 'text-warning'"
          role="status"
          aria-live="polite"
        >{{ msg.text }}</p>

        <div class="flex flex-wrap gap-2">
          <button v-if="!loaded" class="btn btn-primary btn-sm min-h-11" type="button" :disabled="busy" @click="load">
            <span v-if="busy" class="loading loading-spinner loading-sm"></span>
            Von der Bridge laden
          </button>
          <button v-if="loaded" class="btn btn-primary btn-sm min-h-11" type="button" :disabled="!canSave" @click="save">
            Auf der Bridge speichern
          </button>
          <button v-if="loaded && info?.present && !fromCase" class="btn btn-outline btn-error btn-sm min-h-11" type="button" :disabled="busy" @click="remove">
            Von der Bridge entfernen
          </button>
          <button class="btn btn-ghost btn-sm ml-auto min-h-11" type="button" @click="dialog?.close()">Schließen</button>
        </div>
      </template>
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">Schließen</button></form>
  </dialog>
</template>
