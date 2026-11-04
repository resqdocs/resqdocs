<script lang="ts">
/** Hint-ID der Tour. Eine neue ID zeigt die Tour nach dem Update allen einmal erneut:
 *  'v3' stellt die neuen Begriffe und die ⓘ-Erklaerungen vor. */
export const TAB_GUIDE_HINT_ID = 'tab-guide-v3'
/** Wer diese ID schon hat, kannte die App vorher und bekommt zuerst die Seite „Neu“. */
const PREVIOUS_HINT_ID = 'tab-guide-v2'
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import InfoIcon from '@resqdocs/protocol-core-ui/components/InfoIcon.vue'
import TabIcon from '@resqdocs/protocol-core-ui/components/TabIcon.vue'
import TabRef from '@resqdocs/protocol-core-ui/components/TabRef.vue'
import { useStorage } from '@/storage/useStorage'
import { useDisclaimer } from '@/composables/useDisclaimer'
import { useAppVersion } from '@/composables/useAppVersion'

/**
 * Mehrseitige Onboarding-Tour (Mechanik der Erklaer-Hinweise): erscheint NACH dem
 * Haftungsausschluss (DisclaimerGate deckt mit z-50). Nach Best Practices
 * (NN/g Mobile-App Onboarding, Apple HIG Onboarding - Links in docs/sources.md):
 * wenige Seiten, EINE Idee pro Seite, fokussiert aufs Neuartige (Bridge-Konzept,
 * Tri-State), jederzeit ueberspringbar ("fast, fun, and optional").
 * "Los geht's"/"Ueberspringen" blendet dauerhaft aus (settings.dismissedHints);
 * wieder abrufbar ueber das ?-Symbol im Header und den Hinweis-Reset.
 */
const HINT_ID = TAB_GUIDE_HINT_ID
const storage = useStorage()
const disclaimer = useDisclaimer()

// KI-Empfehlung: dauerhaft auffindbar im Guide (über „?"), auch wenn der Vorlagen-Hinweis
// weggeklickt wurde. ?v=<echte App-Version> -> die KI-Seite stempelt sie in den Prompt (kein Rückfragen).
const { version } = useAppVersion()
const aiUrl = computed(() => `https://ai.resqdocs.app?v=${encodeURIComponent(version.value)}`)

// Erst zeigen, wenn (a) die persistierten Einstellungen geladen sind (sonst
// rendert die Tour kurz auf Defaults und verschwindet) und (b) der
// Haftungsausschluss bestaetigt ist (kein Durchschimmern hinter dem Gate).
const visible = computed(
  () =>
    storage.settingsLoaded.value &&
    disclaimer.ready.value &&
    !disclaimer.needsAck.value &&
    !storage.settings.dismissedHints.includes(HINT_ID),
)

const step = ref(0)
// Bisherige Nutzer sehen zuerst, was neu ist; bei einer Neuinstallation waere „heisst jetzt“ nur verwirrend.
const pages = computed(() =>
  storage.settings.dismissedHints.includes(PREVIOUS_HINT_ID)
    ? ['neu', 'begriffe', 'willkommen', 'bridge', 'einsatz', 'vorlagen', 'privat']
    : ['willkommen', 'bridge', 'einsatz', 'vorlagen', 'begriffe', 'privat'],
)
const page = computed(() => pages.value[step.value])
const LAST = computed(() => pages.value.length - 1)

function dismiss(): void {
  if (!storage.settings.dismissedHints.includes(HINT_ID)) {
    storage.settings.dismissedHints = [...storage.settings.dismissedHints, HINT_ID]
    void storage.saveSettings()
  }
  step.value = 0 // beim naechsten Abruf (?-Symbol) wieder vorn beginnen
}
function next(): void {
  if (step.value < LAST.value) step.value++
}
function prev(): void {
  if (step.value > 0) step.value--
}

// Swipe-Navigation (wie von App-Touren gewohnt), bewusst dependency-frei.
let touchX = 0
function onTouchStart(e: TouchEvent): void {
  touchX = e.changedTouches[0].clientX
}
function onTouchEnd(e: TouchEvent): void {
  const dx = e.changedTouches[0].clientX - touchX
  if (dx < -50) next()
  else if (dx > 50) prev()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-40 overflow-y-auto bg-base-200"
      role="dialog"
      aria-modal="true"
      aria-label="Einführung in die App"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <!-- Überspringen: absolut in der ECHTEN oberen rechten Ecke des Overlays (unabhängig von der
           zentrierten, breitenbegrenzten Content-Spalte) — sonst driftet es auf iPad/Großbild an die
           Spaltenkante bzw. optisch in die vertikale Mitte. Safe-Area + 44pt-Touch-Target. -->
      <button
        type="button"
        class="btn btn-ghost absolute z-10 min-h-11 min-w-11 top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))]"
        @click="dismiss"
      >
        Überspringen
      </button>
      <div
        class="mx-auto flex min-h-full w-full max-w-md flex-col pb-[max(24px,env(safe-area-inset-bottom))] pl-[max(24px,env(safe-area-inset-left))] pr-[max(24px,env(safe-area-inset-right))] pt-[max(56px,calc(env(safe-area-inset-top)+2.5rem))] sm:max-w-lg"
      >
        <!-- Seite „Neu“: nur fuer bisherige Nutzer, einmal nach dem Update -->
        <div v-if="page === 'neu'" class="flex flex-1 flex-col justify-center gap-4">
          <h1 class="text-center text-xl font-bold">Neu: Die App erklärt sich besser</h1>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body flex-row items-start gap-3 p-4">
              <span class="rounded-lg bg-primary/10 p-2 text-primary">
                <InfoIcon class="size-6" />
              </span>
              <p class="text-sm"><strong>Erklärungen per Tipp:</strong> Tippe auf das <InfoIcon class="inline-block size-[1.15em] align-[-0.2em] text-primary" /> neben einem Begriff, und die App erklärt ihn dir.</p>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body gap-2 p-4">
              <p class="text-sm"><strong>Neue Namen, gleiche Funktion:</strong></p>
              <ul class="flex flex-col gap-1 text-sm">
                <li>Container <span aria-hidden="true">→</span> <strong>Abschnitt</strong></li>
                <li>Block <span aria-hidden="true">→</span> <strong>Gespeicherter Abschnitt</strong></li>
                <li>Snippet <span aria-hidden="true">→</span> <strong>Textbaustein</strong></li>
                <li>Medikamentenplan <span aria-hidden="true">→</span> <strong>Medikationsplan</strong></li>
                <li>Ausgabe <span aria-hidden="true">→</span> <strong>Protokolltext</strong></li>
              </ul>
              <p class="text-xs text-base-content/60">Deine Vorlagen bleiben, wie sie sind.</p>
            </div>
          </div>
          <div class="card bg-base-100 shadow-sm">
            <div class="card-body p-4">
              <p class="text-sm"><strong>Klare Verweise:</strong> Steht im Text <TabRef tab="einsatz" />, ist der Tab unten in der Leiste gemeint.</p>
            </div>
          </div>
        </div>

        <!-- Seite „Begriffe“: die Teile einer Vorlage, mit denselben Zeichen wie im Aufbau und im Bausteine-Tab -->
        <div v-else-if="page === 'begriffe'" class="flex flex-1 flex-col justify-center gap-4">
          <h1 class="text-center text-xl font-bold">So ist eine Vorlage aufgebaut</h1>
          <ul class="card flex flex-col gap-3 bg-base-100 p-4 shadow-sm">
            <li class="flex items-start gap-3 text-sm"><span class="w-6 shrink-0 text-center text-base text-base-content/40" aria-hidden="true">▸</span><span><strong>Abschnitt:</strong> fasst Felder unter einer Überschrift zusammen.</span></li>
            <li class="flex items-start gap-3 text-sm"><span class="w-6 shrink-0 text-center text-base text-secondary" aria-hidden="true">◆</span><span><strong>Feld:</strong> eine einzelne Angabe, frei oder aus einer Liste.</span></li>
            <li class="flex items-start gap-3 text-sm"><span class="w-6 shrink-0 text-center text-base text-accent" aria-hidden="true">⊕</span><span><strong>Funktion:</strong> fertige Eingabehilfe, z. B. Medikationsplan oder NEWS2.</span></li>
            <li class="flex items-start gap-3 text-sm"><TabIcon tab="bausteine" class="size-6 shrink-0 text-primary" /><span><strong>Textbaustein:</strong> fertiger Text, den du immer wieder nutzt.</span></li>
            <li class="flex items-start gap-3 text-sm"><TabIcon tab="bausteine" class="size-6 shrink-0 text-primary" /><span><strong>Gespeicherter Abschnitt:</strong> ein Abschnitt, den du in andere Vorlagen einfügst.</span></li>
          </ul>
          <p class="text-center text-sm text-base-content/70">Die letzten beiden findest du unter <TabRef tab="bausteine" />.</p>
          <p class="text-center text-sm text-base-content/70">Mehr dazu erfährst du in der App: Tippe auf das <InfoIcon class="inline-block size-[1.15em] align-[-0.2em] text-primary" /> neben einem Begriff.</p>
        </div>

        <!-- Seite 1: Willkommen / Wertversprechen -->
        <div v-else-if="page === 'willkommen'" class="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <img src="/brand.svg" alt="ResQDocs" class="brand-logo brand-logo-light h-20 w-auto" />
          <img src="/brand-dark.svg" alt="ResQDocs" class="brand-logo brand-logo-dark h-20 w-auto" />
          <h1 class="text-2xl font-bold">Willkommen!</h1>
          <p class="text-base-content/80">
            Saubere Einsatzdokumentation - auf dem Handy verfasst,
            <strong>direkt ins Zielgerät getippt</strong>. Ohne Cloud, ohne Konto.
          </p>
        </div>

        <!-- Seite 2: Das Neuartige - die Bridge -->
        <div v-else-if="page === 'bridge'" class="flex flex-1 flex-col justify-center gap-5">
          <h1 class="text-center text-xl font-bold">So kommt dein Text ins Zielgerät</h1>
          <ol class="flex flex-col gap-3">
            <li class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-center gap-3 p-4">
                <span class="badge badge-primary badge-lg shrink-0">1</span>
                <p class="text-sm">Die <strong>ResQDocs-Bridge</strong> steckt am Zielgerät und wirkt dort wie eine USB-Tastatur.</p>
              </div>
            </li>
            <li class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-center gap-3 p-4">
                <span class="badge badge-primary badge-lg shrink-0">2</span>
                <p class="text-sm">Dein Handy verbindet sich mit dem <strong>WLAN der Bridge</strong> (ResQDocs-&lt;ID&gt;, Passwort <code class="select-text font-mono">resqdocs2026</code>).</p>
              </div>
            </li>
            <li class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-center gap-3 p-4">
                <span class="badge badge-primary badge-lg shrink-0">3</span>
                <p class="text-sm">Textfeld am Zielgerät antippen, in der App <strong>„An Zielgerät senden"</strong> - fertig.</p>
              </div>
            </li>
          </ol>
        </div>

        <!-- Seite 3: Dokumentieren mit Tri-State -->
        <div v-else-if="page === 'einsatz'" class="flex flex-1 flex-col justify-center gap-5">
          <h1 class="text-center text-xl font-bold">Dokumentieren im <TabRef tab="einsatz" /></h1>
          <p class="text-center text-sm text-base-content/70">Jedes Feld hat drei Zustände:</p>
          <div class="flex flex-col gap-3">
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-center gap-3 p-4">
                <span class="text-xl text-success">✓</span>
                <p class="text-sm"><strong>Bestätigt</strong> - der hinterlegte Standardwert wird übernommen.</p>
              </div>
            </div>
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-center gap-3 p-4">
                <span class="text-xl text-warning">✎</span>
                <p class="text-sm"><strong>Eigener Wert</strong> - du trägst selbst etwas ein.</p>
              </div>
            </div>
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-center gap-3 p-4">
                <span class="text-xl text-base-content/50">−</span>
                <p class="text-sm"><strong>Nicht erhoben</strong> - taucht im Protokolltext gar nicht auf. <em>Nicht erhoben = weglassen.</em></p>
              </div>
            </div>
          </div>
        </div>

        <!-- Seite 4: Vorlagen & Bausteine -->
        <div v-else-if="page === 'vorlagen'" class="flex flex-1 flex-col justify-center gap-5">
          <h1 class="text-center text-xl font-bold">Du bestimmst deine Vorlagen</h1>
          <div class="flex flex-col gap-3">
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-start gap-3 p-4">
                <span class="rounded-lg bg-primary/10 p-2 text-primary">
                  <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="8" y="3" width="12" height="15" rx="2" />
                    <path d="M4 7v12a2 2 0 0 0 2 2h11" />
                    <path d="M11.5 8h5M11.5 11.5h5" />
                  </svg>
                </span>
                <p class="text-sm">
                  In <TabRef tab="vorlagen" /> baust du eigene Vorlagen aus Abschnitten,
                  Feldern und Funktionen. Das <InfoIcon class="inline-block size-[1.15em] align-[-0.2em] text-primary" /> neben einem Begriff erklärt ihn.
                </p>
              </div>
            </div>
            <!-- KI-Empfehlung: der einfachste Weg zur ersten Vorlage; jederzeit hier im Guide auffindbar. -->
            <a :href="aiUrl" target="_blank" rel="noopener" class="card border border-primary/30 bg-primary/5 shadow-sm transition hover:bg-primary/10">
              <div class="card-body flex-row items-start gap-3 p-4">
                <span class="rounded-lg bg-primary/15 p-2 text-primary">
                  <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                </span>
                <p class="text-sm">
                  <strong>Am einfachsten mit KI:</strong> Lass deine erste Vorlage von deinem eigenen KI-Assistenten
                  (ChatGPT, Claude, Gemini) bauen — auf <span class="font-medium text-primary">ai.resqdocs.app</span>.
                  Er fragt alles ab und liefert die fertige Vorlage zum Import.
                </p>
              </div>
            </a>
            <div class="card bg-base-100 shadow-sm">
              <div class="card-body flex-row items-start gap-3 p-4">
                <span class="rounded-lg bg-primary/10 p-2 text-primary">
                  <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M4 7h9M19 7h1M4 17h5M15 17h5" />
                    <circle cx="16" cy="7" r="2" />
                    <circle cx="12" cy="17" r="2" />
                  </svg>
                </span>
                <p class="text-sm">
                  Medikationsplan mit Scan, NEWS2 und Pack-Years fügst du als <strong>Funktionen</strong> in deine Vorlage ein.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Seite 5: Privat by Design + CTA -->
        <div v-else-if="page === 'privat'" class="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span class="rounded-full bg-primary/10 p-4 text-primary">
            <svg class="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </span>
          <h1 class="text-xl font-bold">Privat by Design</h1>
          <p class="text-sm text-base-content/80">
            Patientendaten existieren nur vorübergehend, während du dokumentierst - getippt, an dein
            Zielgerät übertragen, automatisch gelöscht. <strong>Nichts davon geht an uns.</strong>
          </p>
          <p class="text-xs text-base-content/60">
            Ausführliche Anleitung: <span class="font-medium">resqdocs.app/anleitung</span>
            (auch unter <TabRef tab="einstellungen" /> → Info &amp; Hilfe).
          </p>
        </div>

        <!-- Fortschritts-Dots + Navigation -->
        <div class="flex flex-col gap-3 pt-4">
          <div class="flex justify-center gap-2" aria-hidden="true">
            <span
              v-for="i in LAST + 1"
              :key="i"
              class="h-2 w-2 rounded-full transition-colors"
              :class="i - 1 === step ? 'bg-primary' : 'bg-base-content/20'"
            />
          </div>
          <div class="flex items-center gap-2">
            <button v-if="step > 0" class="btn btn-ghost min-h-11" type="button" @click="prev">Zurück</button>
            <button v-if="step < LAST" class="btn btn-primary min-h-11 flex-1" type="button" @click="next">Weiter</button>
            <button v-else class="btn btn-primary min-h-11 flex-1" type="button" @click="dismiss">Los geht's</button>
          </div>
          <p class="text-center text-xs text-base-content/50">
            Diese Einführung findest du jederzeit über das ?-Symbol oben rechts.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
