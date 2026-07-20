<script setup lang="ts">
/**
 * Einsatz - Neuaufbau, Slice 1: Anzeige des Container-Baums beim Ausfuellen + Text-Vorschau.
 * Liest den GETEILTEN Protokoll-Baum (useProtocolTree) - dieselbe Definition, die der Editor
 * schreibt. Modell: ein langer, einspaltiger Scroll mit Sektionen (docs/rework/einsatz-display.md).
 * Umschalter (small-screen-first): Ausfuellen <-> Vorschau (Ausgabetext); ab lg beides
 * nebeneinander, Vorschau klebt. Die Vorschau nutzt denselben reinen Renderer wie die Ausgabe.
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useProtocolPersistence } from '@resqdocs/protocol-core-ui/protocolPersistence'
import { resolveInitialProtocolId } from '@resqdocs/protocol-core/library'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useReworkCaseDraft } from '@/rebuild/useReworkCaseDraft'
import { CASE_DRAFT_DELETED_NOTICE, nextDraftDebounceWait, type ReworkCaseDraft } from '@resqdocs/protocol-core/caseDraft'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import { usePicoApi, type OsMode } from '@/composables/usePicoApi'
import { useBridgeConnection } from '@/pico/useBridgeConnection'
import { useStorage } from '@/storage/useStorage'
import { render } from '@resqdocs/protocol-core/render'
import { countOpenRequired } from '@resqdocs/protocol-core/required'
import EinsatzSection from './EinsatzSection.vue'
import EinsatzField from './EinsatzField.vue'
import MedplanFunction from './MedplanFunction.vue'
import AerzteFunction from './AerzteFunction.vue'
import ScoreFunction from './ScoreFunction.vue'
import OutputText from '@resqdocs/protocol-core-ui/components/OutputText.vue'

const { einsatzRoot: root, protocols, einsatzActiveId, selectEinsatz } = useProtocolTree()
const { libraryLoaded } = useProtocolPersistence()
const caseValues = useCaseValues()
const view = ref<'ausfuellen' | 'vorschau'>('ausfuellen')

// Temporaerer Einsatzentwurf: ueberlebt App-Schliessen/Crash/Akku-Tod (Preferences), TTL-Sliding-Idle.
const caseDraft = useReworkCaseDraft()
const draftResult = ref<{ draft: ReworkCaseDraft | null; expired: boolean } | null>(null)
const draftNotice = ref<string | null>(null)
let restoring = false // Resume (setAll) soll keinen Auto-Save ausloesen (TTL nicht verlaengern)
function showDraftNotice(text: string): void {
  draftNotice.value = text
  window.setTimeout(() => {
    if (draftNotice.value === text) draftNotice.value = null
  }, 6000)
}
// Auto-Save-Timing (600 ms Debounce + ~2 s-Deckel) liegt in caseDraft.ts (nextDraftDebounceWait). Der
// Deckel sorgt dafuer, dass bei durchgehender Eingabe spaetestens nach ~2 s einmal geschrieben wird —
// sonst bliebe waehrend eines langen Bursts nichts persistiert (der Timer startet bei jeder Aenderung
// neu). So schrumpft das Verlustfenster bei hartem Absturz vom ganzen Burst auf hoechstens ~2 s; der
// allerletzte in-flight-Stand vor sofortigem Akku-Tod ist prinzipbedingt nicht garantiert rettbar.
//
// Zentral, damit confirmReset/applySwitch den Trailing-Save VOR dem Loeschen abbrechen koennen (sonst
// schriebe er den gerade geloeschten Entwurf neu). draftPendingSince = Beginn des aktuellen Bursts (0 = nichts offen).
let draftTimer: ReturnType<typeof setTimeout> | null = null
let draftPendingSince = 0
function clearDraftTimer(): void {
  if (draftTimer) {
    clearTimeout(draftTimer)
    draftTimer = null
  }
  draftPendingSince = 0
}
function commitDraftNow(): void {
  draftTimer = null
  draftPendingSince = 0
  void caseDraft.save(einsatzActiveId.value, caseValues.values.value)
}
function scheduleDraftSave(): void {
  const now = Date.now()
  if (!draftPendingSince) draftPendingSince = now
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(commitDraftNow, nextDraftDebounceWait(draftPendingSince, now))
}
/** Ausstehenden Entwurf SOFORT wegschreiben statt auf den Debounce zu warten (App-Hintergrund/Unmount) —
 *  der einzige verlaessliche Pre-Kill-Moment auf iOS-WebKit. Nur wenn wirklich etwas offen ist. */
function flushDraft(): void {
  if (!draftTimer || restoring) return
  clearDraftTimer()
  void caseDraft.save(einsatzActiveId.value, caseValues.values.value)
}
function onAppHidden(): void {
  if (document.visibilityState === 'hidden') flushDraft()
}
let appStateListener: PluginListenerHandle | null = null
// Vorschau = reiner Renderer ueber Definition + Einsatz-Werte (Tri-State je Feld).
const text = computed(() => render(root.value, caseValues.values.value))

// Pflichtfeld-Vollstaendigkeit: informativ, NIE blockierend (Senden bleibt immer moeglich).
// Antippen springt zum ersten noch offenen Pflichtfeld (data-required-open, per resetKey re-evaluiert).
const openRequired = computed(() => countOpenRequired(root.value, caseValues.values.value))
function scrollToFirstOpen(): void {
  const el = document.querySelector('[data-required-open]')
  if (!el) return
  // Ziel kann in zugeklappten <details>-Sektionen liegen (0 Hoehe -> scrollIntoView liefe ins Leere).
  // Alle zugeklappten Eltern-Sektionen aufklappen (das @toggle synchronisiert den open-State der Sektion),
  // dann nach dem Layout-Tick scrollen.
  let d = el.closest('details:not([open])') as HTMLDetailsElement | null
  while (d) {
    d.open = true
    d = (d.parentElement?.closest('details:not([open])') as HTMLDetailsElement | null) ?? null
  }
  void nextTick(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}

// Abschluss = bewusstes, bestaetigtes Loeschen der erfassten Werte (DSGVO, Art.-9-Gesundheitsdaten).
// Loescht NUR die Werte (useCaseValues), nicht die Vorlage. resetKey erzwingt Re-Mount der Sektionen
// -> Falt-/Open-Zustand startet frisch (alles wieder auf Standard, eingeklappt).
const showConfirm = ref(false)
const resetKey = ref(0)
function confirmReset(): void {
  clearDraftTimer() // laufenden Trailing-Save abbrechen (sonst schriebe er den geloeschten Entwurf neu)
  caseValues.reset()
  void caseDraft.remove() // Abschluss = bewusstes Loeschen, auch des temporaeren Entwurfs
  // Abschluss startet den naechsten Einsatz -> zurueck auf die Standard-Vorlage (persoenlicher Standard,
  // sonst aktuelle Vorlage behalten). selectEinsatz direkt (kein applySwitch) -> lastSelectedProtocolId
  // bleibt unberuehrt und es wird kein Aufloese-Guard neu bewaffnet. „Ein Protokoll pro Einsatz" bleibt.
  const id = resolveInitialProtocolId(
    protocols.value.map((p) => p.id),
    storage.settings.defaultProtocolId,
    einsatzActiveId.value,
  )
  if (id && id !== einsatzActiveId.value) selectEinsatz(id)
  collapsed.value = true // Vorlagen-Auswahl wieder einklappen (wie beim manuellen Wechsel)
  resetKey.value += 1
  showConfirm.value = false
}

// An Gerät senden (Uebertragung) - Ziel-OS aus den Einstellungen (defaultOs), Bridge via usePicoApi.
// GETRENNT vom Abschluss: bei Fehler erneut triggerbar, loescht NICHTS.
const storage = useStorage()
const pico = usePicoApi()
// Geteilter Bridge-Status (Singleton, derselbe wie im Header). Senden nur bei reachable === true.
const { reachable, check, markReachable } = useBridgeConnection()
onMounted(() => {
  void check()
  // Der Ablauf wird von AUSSEN ausgeloest (App.vue prueft laufend), der sichtbare Zustand liegt aber
  // hier. Ohne diesen Handler bliebe der Tab nach dem Ablauf vollstaendig ausgefuellt (er wird nur
  // ausgeblendet, nie abgeraeumt) und der naechste Tastendruck schriebe den Entwurf mit frischer Frist
  // zurueck. clearDraftTimer ZUERST — sonst uebermalt ein Trailing-Save das gerade Geloeschte.
  caseDraft.setClearHandler(() => {
    clearDraftTimer()
    caseValues.reset()
    resetKey.value += 1 // Falt-/Open-Zustand frisch (wie beim Abschluss)
    showDraftNotice(CASE_DRAFT_DELETED_NOTICE)
  })
  // Temporaeren Einsatzentwurf laden (Repository prueft TTL -> abgelaufen wird sofort geloescht).
  caseDraft
    .load()
    .then((res) => {
      draftResult.value = res
      if (res.expired) showDraftNotice(CASE_DRAFT_DELETED_NOTICE)
    })
    .catch(() => {
      draftResult.value = { draft: null, expired: false }
    })

  // Pre-Kill-Flush: einen faelligen Entwurf beim App-Hintergrund SOFORT wegschreiben, statt auf den
  // Debounce zu warten (den WKWebView im Hintergrund evtl. gar nicht mehr feuert). appStateChange ist
  // der verlaessliche Native-Trigger (iOS), visibilitychange/pagehide die Web-/Android-Absicherung.
  // Kostet im Normalbetrieb NICHTS — feuert nur beim Wechsel in den Hintergrund.
  document.addEventListener('visibilitychange', onAppHidden)
  window.addEventListener('pagehide', flushDraft)
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) flushDraft()
  }).then((h) => {
    appStateListener = h
  })
})
const sending = ref(false)
const sendMsg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)
async function senden(): Promise<void> {
  sending.value = true
  sendMsg.value = null
  try {
    await pico.typeText(text.value, (storage.settings.defaultOs ?? 'win_de') as OsMode, storage.settings.typingDelayMs)
    markReachable(true) // erfolgreicher Kontakt -> Status frisch halten
    // Wiederholbar: KEIN „fertig"-Zustand. Erfolg verschwindet nach kurzer Zeit von selbst,
    // damit erneut-senden als normaler Weg sichtbar bleibt (nicht als abgeschlossen).
    sendMsg.value = { kind: 'ok', text: 'An Gerät übertragen — bei Bedarf erneut senden.' }
    window.setTimeout(() => {
      if (sendMsg.value?.kind === 'ok') sendMsg.value = null
    }, 5000)
  } catch {
    void check(true) // Bridge-Status auffrischen (ggf. weg -> Button sperrt)
    // Technischer Fehler bleibt sichtbar/persistent (nicht auto-ausblenden).
    sendMsg.value = { kind: 'err', text: 'Senden fehlgeschlagen — bitte erneut versuchen.' }
  } finally {
    sending.value = false
  }
}

// --- Slice 4: Vorlagen-Auswahl im Einsatz (ein Protokoll pro Einsatz) ---
const collapsed = ref(true) // eingeklappt-Default: aktive Vorlage immer sichtbar
const titleOf = (p?: { title?: string; id: string }): string => (p && ((p.title && p.title.trim()) || p.id)) || ''
const activeTitle = computed(() => titleOf(protocols.value.find((p) => p.id === einsatzActiveId.value)))
const isDefault = computed(() => storage.settings.defaultProtocolId === einsatzActiveId.value)

// Default-Vorauswahl: persoenlicher Standard -> zuletzt benutzt -> erste. Greift, sobald Settings UND
// Bibliothek geladen sind - und NUR bis der Nutzer bewusst wechselt (sonst wuerde es seine Wahl ueberschreiben).
let userSwitched = false
// Einmalige Aufloesung, sobald Settings + Bibliothek + Draft-Ladung bereit sind: ein gueltiger
// Entwurf wird FORTGESETZT (gewinnt vor der Default-Vorauswahl), sonst Default Standard->zuletzt->erste.
function maybeResolveOnReady(): void {
  // NICHT gegen den Seed aufloesen: erst wenn die persistierte Bibliothek geladen ist (libraryLoaded),
  // sonst trifft resolveInitialProtocolId die persoenliche Standard-Vorlage nicht und verriegelt userSwitched.
  if (userSwitched || !storage.settingsLoaded.value || !libraryLoaded.value || draftResult.value === null) return
  userSwitched = true
  const d = draftResult.value.draft
  if (d && d.protocolId && protocols.value.some((p) => p.id === d.protocolId)) {
    restoring = true // Resume loest keinen Auto-Save aus; nextTick gibt genau den Restore-Flush frei
    selectEinsatz(d.protocolId)
    caseValues.setAll(d.values)
    void nextTick(() => {
      restoring = false
    })
    resetKey.value += 1
    showDraftNotice('Einsatz fortgesetzt — Entwurf wiederhergestellt.')
    return
  }
  // Entwurf fuer eine geloeschte/unbekannte Vorlage -> verwaiste Patientendaten loeschen (DSGVO).
  if (d) void caseDraft.remove()
  const id = resolveInitialProtocolId(
    protocols.value.map((p) => p.id),
    storage.settings.defaultProtocolId,
    storage.settings.lastSelectedProtocolId,
  )
  if (id && id !== einsatzActiveId.value) selectEinsatz(id)
}
watch([() => storage.settingsLoaded.value, () => libraryLoaded.value, protocols, draftResult], maybeResolveOnReady, { immediate: true })

// Wechsel mit Verwerfen-Confirm (nur wenn schon Eingaben da). pendingId = transienter Dialog-Zustand.
// Konservativ: JEDE Interaktion (auch ein blosses ✓-Bestaetigen materialisiert einen Key) zaehlt als
// Eingabe -> beim Wechsel wird gefragt, damit die Review-/Bestaetigungs-Arbeit nicht ungewarnt verloren geht.
const hasInput = computed(() => Object.keys(caseValues.values.value).length > 0)
const pendingId = ref<string | null>(null)
const pendingTitle = computed(() => titleOf(protocols.value.find((p) => p.id === pendingId.value)))
function applySwitch(id: string): void {
  userSwitched = true
  clearDraftTimer() // Trailing-Save des alten Stands abbrechen
  caseValues.reset() // fluechtige Werte loeschen (DSGVO, ein Protokoll pro Einsatz)
  void caseDraft.remove() // alten Entwurf sofort loeschen (ein neuer entsteht beim Ausfuellen)
  selectEinsatz(id)
  resetKey.value += 1 // Re-Mount: Sektionen frisch
  collapsed.value = true
  void storage.saveSettings({ lastSelectedProtocolId: id }) // zuletzt benutzt merken
}
function choose(id: string): void {
  if (id === einsatzActiveId.value) {
    collapsed.value = true
    return
  }
  if (!hasInput.value) applySwitch(id)
  else pendingId.value = id // Dialog auf (Eingaben vorhanden)
}
function confirmSwitch(): void {
  if (pendingId.value) applySwitch(pendingId.value)
  pendingId.value = null
}
function cancelSwitch(): void {
  pendingId.value = null // Auswahl bleibt auf der aktiven Vorlage (Markierung folgt einsatzActiveId)
}
function toggleDefault(): void {
  void storage.saveSettings({ defaultProtocolId: isDefault.value ? null : einsatzActiveId.value })
}

// Auto-Save des temporaeren Entwurfs (debounced). Resume (setAll) loest KEIN Save aus; leerer Stand
// (Abschluss/Wechsel) loescht den Entwurf (in caseDraft.save).
watch(
  caseValues.values,
  () => {
    if (restoring) return // Resume-Save ueberspringen (TTL nicht verlaengern)
    scheduleDraftSave()
  },
  { deep: true },
)
onUnmounted(() => {
  flushDraft() // ausstehenden Save NICHT verwerfen (frueher: clearDraftTimer) — sonst geht die letzte Aenderung verloren
  document.removeEventListener('visibilitychange', onAppHidden)
  window.removeEventListener('pagehide', flushDraft)
  void appStateListener?.remove()
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <p v-if="draftNotice" class="rounded-lg bg-info/10 px-3 py-2 text-center text-xs text-info" role="status" aria-live="polite">{{ draftNotice }}</p>

    <!-- Umschalter: oben zentriert + sticky (unter dem App-Header, Safe-Area beachtet),
         damit man jederzeit in die Vorschau springen kann. Nur < lg (ab lg beide Spalten). -->
    <div class="sticky top-[calc(env(safe-area-inset-top,0px)+4rem)] z-[5] flex justify-center bg-base-200/95 py-2 backdrop-blur-sm lg:hidden">
      <div class="join">
        <button class="btn btn-sm join-item" :class="view === 'ausfuellen' ? 'btn-primary' : ''" @click="view = 'ausfuellen'">Ausfüllen</button>
        <button class="btn btn-sm join-item" :class="view === 'vorschau' ? 'btn-primary' : ''" @click="view = 'vorschau'">Vorschau</button>
      </div>
    </div>

    <!-- Wide-Screens: asymmetrischer Split — Ausfuell-Formular bleibt lesbar (~34rem), die Vorschau
         fuellt die restliche Breite (nutzt grosse Schirme, ohne das Formular unlesbar breit zu machen). -->
    <div class="lg:grid lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <!-- Ausfüllen: Struktur -->
      <div class="lg:block" :class="{ hidden: view !== 'ausfuellen' }">
        <div class="flex flex-col gap-5">
          <!-- Slice 4: Vorlagen-Auswahl (nur ab >1 Vorlage). Eingeklappt = aktive Vorlage; aufgeklappt = Liste. -->
          <div v-if="protocols.length > 1" class="rounded-lg border border-base-300 bg-base-100 p-2">
            <button type="button" class="flex min-h-11 w-full items-center gap-2 px-1 text-left text-sm" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
              <span aria-hidden="true">{{ collapsed ? '▸' : '▾' }}</span>
              <span class="text-base-content/60">Protokoll:</span>
              <span class="truncate font-semibold">{{ activeTitle }}</span>
            </button>
            <template v-if="!collapsed">
              <ul class="mt-1 flex flex-col gap-1" role="radiogroup" aria-label="Protokoll wählen">
                <li v-for="p in protocols" :key="p.id">
                  <button type="button" role="radio" :aria-checked="p.id === einsatzActiveId" class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm" :class="p.id === einsatzActiveId ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-base-200'" @click="choose(p.id)">
                    <span v-if="p.id === einsatzActiveId" aria-hidden="true">✓</span>
                    <span class="truncate">{{ titleOf(p) }}</span>
                    <span v-if="p.id === storage.settings.defaultProtocolId" class="badge badge-ghost badge-sm ml-auto">Standard</span>
                  </button>
                </li>
              </ul>
              <!-- ausserhalb der radiogroup (kein Radio) -->
              <button type="button" class="btn btn-ghost btn-xs mt-1" @click="toggleDefault">{{ isDefault ? 'Standard entfernen' : 'Als Standard merken' }}</button>
            </template>
          </div>

          <div>
            <h2 class="text-base font-semibold">{{ (root.title && root.title.trim()) || 'Protokoll' }}</h2>
            <p class="text-sm text-base-content/60">
              Felder ausfüllen: tippe auf <span class="whitespace-nowrap">✓/✎/−</span> je Feld (bestätigt · eigener Wert · nicht erhoben). Die Vorschau zeigt den Ausgabetext.
            </p>
          </div>

          <!-- Pflichtfeld-Vollstaendigkeit: dezent, nicht blockierend. Antippen springt zum ersten offenen
               Pflichtfeld. Bei 0 offen ausgeblendet (keine „alles gut"-Bestaetigung noetig). -->
          <button
            v-if="openRequired > 0"
            type="button"
            class="flex items-center gap-2 self-start rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-left text-sm text-warning"
            @click="scrollToFirstOpen"
          >
            <span class="badge badge-warning badge-sm shrink-0">{{ openRequired }}</span>
            <span>{{ openRequired === 1 ? 'Pflichtfeld' : 'Pflichtfelder' }} noch offen — zum ersten springen</span>
          </button>
          <div v-if="root.children.length" class="flex flex-col gap-6">
            <template v-for="child in root.children" :key="resetKey + '-' + child.id">
              <EinsatzSection v-if="child.type === 'container'" :node="child" :depth="0" :inside-collapse="false" />
              <MedplanFunction v-else-if="child.type === 'function' && child.functionKind === 'medikamentenplan'" :node="child" />
              <AerzteFunction v-else-if="child.type === 'function' && child.functionKind === 'aerzte'" :node="child" />
              <ScoreFunction v-else-if="child.type === 'function'" :node="child" />
              <EinsatzField v-else-if="child.type === 'field'" :node="child" />
            </template>
          </div>
          <p v-else class="rounded-lg border border-dashed border-base-300 px-4 py-10 text-center text-sm text-base-content/50">
            Noch keine Container. Lege im Tab „Vorlagen" welche an — sie erscheinen hier sofort.
          </p>
        </div>
      </div>

      <!-- Vorschau: Ausgabetext (gleicher reiner Renderer wie die finale Ausgabe) -->
      <div class="lg:block" :class="{ hidden: view !== 'vorschau' }">
        <div class="card bg-base-100 shadow lg:sticky lg:top-20">
          <div class="card-body gap-2 p-4">
            <OutputText :text="text" label="Ausgabetext" />
          </div>
        </div>
      </div>
    </div>

    <!-- Untere Aktionen: in BEIDEN Ansichten (Ausfuellen + Vorschau) verfuegbar, daher UNTER dem
         Grid (auf lg unter beiden Spalten). Gestapelt, zentriert, breitenbegrenzt. Senden =
         wiederholbar (kein „fertig"-Zustand); Abschließen destruktiv + getrennt + dezent. -->
    <div v-if="root.children.length" class="border-t border-base-200 pt-4">
      <div class="mx-auto flex w-full max-w-sm flex-col items-center gap-3">
        <button type="button" class="btn btn-primary w-full" :disabled="sending || reachable !== true" @click="senden">
          <span v-if="sending" class="loading loading-spinner loading-sm"></span>
          {{ sending ? 'Sende …' : 'An Gerät senden' }}
        </button>
        <p v-if="sendMsg" class="text-center text-xs" :class="sendMsg.kind === 'ok' ? 'text-success' : 'text-error'" role="status" aria-live="polite">{{ sendMsg.text }}</p>
        <p v-else-if="reachable !== true" class="text-center text-xs text-base-content/50">Bridge nicht verbunden — Senden gesperrt.</p>

        <div class="divider my-1 w-full"></div>

        <button type="button" class="btn btn-ghost btn-sm text-error" @click="showConfirm = true">Abschließen</button>
        <p class="text-center text-xs text-base-content/50">Löscht alle erfassten Werte dieses Einsatzes (Datenschutz).</p>
      </div>
    </div>

    <!-- Loesch-Bestaetigung (DSGVO): bewusster, expliziter Schritt -->
    <div class="modal" :class="{ 'modal-open': showConfirm }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="text-base font-semibold">Protokoll abschließen?</h3>
        <p class="py-3 text-sm">
          Wirklich fertig? Alle erfassten Eingaben werden jetzt <strong>gezielt und endgültig gelöscht</strong> —
          Datenschutz, besonders schützenswerte Gesundheitsdaten (Art. 9 DSGVO). Das lässt sich nicht rückgängig machen.
        </p>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm" @click="showConfirm = false">Abbrechen</button>
          <button type="button" class="btn btn-error btn-sm" @click="confirmReset">Endgültig löschen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="showConfirm = false"></button>
    </div>

    <!-- Slice 4: Wechsel-Confirm (nur wenn bereits Eingaben erfasst sind) -->
    <div class="modal" :class="{ 'modal-open': pendingId !== null }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="text-base font-semibold">Protokoll wechseln?</h3>
        <p class="py-3 text-sm">
          Beim Wechsel zu <strong>{{ pendingTitle }}</strong> werden die bereits erfassten Eingaben dieses Einsatzes <strong>nicht gespeichert</strong> und verworfen.
        </p>
        <div class="modal-action">
          <button type="button" class="btn btn-ghost btn-sm" @click="cancelSwitch">Weiter bearbeiten</button>
          <button type="button" class="btn btn-error btn-sm" @click="confirmSwitch">Eingaben verwerfen</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Weiter bearbeiten" @click="cancelSwitch"></button>
    </div>
  </div>
</template>
