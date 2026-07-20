<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useStorage } from '@/storage/useStorage'
import { useBausteine } from '@/composables/useBausteine'
import { useTemporaryCaseDraft } from '@/composables/useTemporaryCaseDraft'
import { useReworkCaseDraft } from '@/rebuild/useReworkCaseDraft'
import { collectLibraryDiagnostics, type LibraryDiagnostics } from '@/rebuild/libraryDiagnostics'
import { useProtocolPersistence } from '@resqdocs/protocol-core-ui/protocolPersistence'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import { useCaseValues } from '@resqdocs/protocol-core-ui/useCaseValues'
import {
  CASE_DRAFT_TTL_MIN_HOURS,
  CASE_DRAFT_TTL_MAX_HOURS,
} from '@/composables/temporaryCaseDraft'

/**
 * Datenschutz & lokale Daten. Zwei Dinge:
 *  - Zeitfaktor: wie lange ein laufender Einsatz-Entwurf ohne Bearbeitung erhalten bleibt.
 *  - Werksreset: setzt die App vollständig auf den Auslieferungszustand zurück (für Geräte-Ausmusterung).
 * Bewusst KEINE Teil-Löschknöpfe mehr: die einzige sensible Sache (der temporäre Einsatzentwurf) endet
 * ohnehin durch „Abschließen" und durch Ablauf; alles Übrige ist neutrales Arbeitsmaterial.
 */
const storage = useStorage()
const bausteine = useBausteine()
const legacyDraft = useTemporaryCaseDraft() // evtl. Alt-Entwurf aus einer Vor-Rework-Version
const reworkDraft = useReworkCaseDraft()
const protocols = useProtocolPersistence()
const blockLib = useBlockLibrary()
const caseValues = useCaseValues()

const TTL_OPTIONS = Array.from(
  { length: CASE_DRAFT_TTL_MAX_HOURS - CASE_DRAFT_TTL_MIN_HOURS + 1 },
  (_, i) => CASE_DRAFT_TTL_MIN_HOURS + i,
)

function onTtlChange(e: Event): void {
  const h = Number((e.target as HTMLSelectElement).value)
  void storage.saveSettings({ caseDraftTtlHours: h })
}

const confirming = ref(false)
const busy = ref(false)
const status = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)

// READ-ONLY Bibliothek-Diagnose (1.2.1-Vorfall): sichtbar machen, ob Vorlagen auf der Platte liegen und
// ob sie lesbar sind — ohne etwas zu verändern. Beim Öffnen der Sektion einmal laden, manuell erneuerbar.
const diag = ref<LibraryDiagnostics | null>(null)
const diagBusy = ref(false)

async function loadDiag(): Promise<void> {
  diagBusy.value = true
  try {
    diag.value = await collectLibraryDiagnostics()
  } finally {
    diagBusy.value = false
  }
}

/** Ampel-Auswertung der Rohzahlen für die UI. */
type DiagVerdict = { kind: 'ok' | 'warn' | 'err' | 'info'; msg: string }
function diagVerdict(d: LibraryDiagnostics): DiagVerdict {
  // Web/Vorschau ZUERST (setzt bewusst error='Web/Dev …'): das ist ein NORMALER Zustand, kein Fehler ->
  // neutral grau, nicht alarmierend rot. Erst danach echte Fehler.
  if (!d.native) return { kind: 'info', msg: 'Web-Vorschau — keine lokale Datenbank (nur zur Entwicklung).' }
  if (d.error) return { kind: 'err', msg: `Lokale Datenbank nicht erreichbar: ${d.error}` }
  if (!d.tableExists) return { kind: 'info', msg: 'Noch keine Vorlagen-Tabelle angelegt (frische Installation).' }
  const raw = d.rawRows ?? 0
  const readable = d.readableRows ?? 0
  if (raw === 0) return { kind: 'info', msg: 'Keine Vorlagen in der Datenbank gespeichert (leer oder Neuinstallation).' }
  if (readable === raw) return { kind: 'ok', msg: `${raw} ${raw === 1 ? 'Vorlage' : 'Vorlagen'} gespeichert und lesbar.` }
  return {
    kind: 'warn',
    msg:
      `${raw} ${raw === 1 ? 'Eintrag ist' : 'Einträge sind'} gespeichert, davon ${readable} lesbar. ` +
      `${raw - readable} vorhandene, aktuell nicht lesbare ${raw - readable === 1 ? 'Vorlage wird' : 'Vorlagen werden'} ` +
      `NICHT gelöscht oder überschrieben. Bitte die App weder zurücksetzen noch deinstallieren und den Support kontaktieren.`,
  }
}

onMounted(() => {
  void loadDiag()
})

/** Werksreset: WIRKLICH alles lokal löschen — inkl. eines laufenden Einsatzes (bewusst, hinter der
 *  Bestätigung). Deckt beide Speicher-Stapel ab: die Rework-Bibliotheken (rework_protocols/-blocks,
 *  bisher NICHT abgeräumt — das war der Bug) und den alten Library-Stapel (Mustertexte + Alt-Tabellen).
 *  setProtocols([]) im Protokoll-Reset stellt sofort eine leere Standard-Vorlage her -> kein leerer
 *  Zustand, kein Crash. */
async function runReset(): Promise<void> {
  busy.value = true
  status.value = null
  try {
    // ZUERST die Patientendaten — sie sind das Einzige, das wirklich schuetzenswert ist, und liegen
    // in den Preferences (unabhaengig von SQLite, also am robustesten loeschbar). Wuerden sie zuletzt
    // laufen, koennte ein Fehler in einer der neutralen SQLite-Loeschungen (gesperrte DB, voller
    // Speicher) sie auf der Platte zuruecklassen — genau falschherum fuer einen Datenschutz-Reset.
    caseValues.reset() // sichtbare Einsatz-Werte im RAM (synchron, kann nicht fehlschlagen)
    await reworkDraft.remove() // laufender Einsatzentwurf (Preferences)
    await legacyDraft.discard() // Alt-Entwurf-Key aus Vor-Rework-Zeiten (Preferences)
    // Danach das neutrale Arbeitsmaterial (SQLite).
    await protocols.resetLibrary() // Vorlagen (rework_protocols) -> eine leere Standard-Vorlage
    await blockLib.resetLibrary() // Bausteine (rework_blocks)
    await storage.resetLibrary() // Mustertexte (library_snippets) + tote Alt-Tabellen
    await bausteine.reload()
    await storage.resetSettings() // Einstellungen inkl. Standardvorlage-Zeiger + Zeitfaktor
    status.value = { kind: 'ok', msg: 'Die App wurde auf den Auslieferungszustand zurückgesetzt.' }
  } catch (e) {
    status.value = { kind: 'err', msg: `Fehlgeschlagen: ${(e as Error).message}` }
  } finally {
    busy.value = false
    confirming.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <h3 class="font-medium">Datenschutz &amp; lokale Daten</h3>

    <ul class="list-disc pl-5 text-xs text-base-content/70">
      <li>Patientendaten werden <strong>nicht dauerhaft gespeichert</strong>.</li>
      <li>
        Ein laufender Einsatz bleibt lokal erhalten (auch nach App-Neustart) und wird durch
        <strong>„Abschließen"</strong> im Einsatz-Tab sowie nach Ablauf der unten gewählten Zeit
        <strong>ohne Bearbeitung</strong> automatisch gelöscht.
      </li>
      <li>Vorlagen, Bausteine und Mustertexte sind <strong>neutrale Vorlagen</strong> — keine Patientendaten.</li>
    </ul>

    <!-- Zeitfaktor: Sliding-Idle-Frist des Einsatz-Entwurfs -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <label class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-medium">Laufenden Einsatz ohne Bearbeitung löschen nach</span>
        <select
          class="select select-bordered select-sm min-h-11"
          :value="storage.settings.caseDraftTtlHours"
          aria-label="Zeit bis zur automatischen Löschung eines unbearbeiteten Einsatzes, in Stunden"
          @change="onTtlChange"
        >
          <option v-for="h in TTL_OPTIONS" :key="h" :value="h">{{ h }} {{ h === 1 ? 'Stunde' : 'Stunden' }}</option>
        </select>
      </label>
      <p class="mt-1 text-xs text-base-content/60">
        Jede Bearbeitung setzt die Zeit neu. Ohne Bearbeitung wird der laufende Einsatz nach dieser
        Frist automatisch gelöscht.
      </p>
    </div>

    <!-- Bibliothek-Diagnose (read-only): zeigt, ob Vorlagen lokal liegen und lesbar sind (1.2.1-Vorfall). -->
    <div class="rounded-lg bg-base-200/60 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-medium">Vorlagen-Bibliothek — Status</span>
        <button
          class="btn btn-ghost btn-xs min-h-11"
          type="button"
          :disabled="diagBusy"
          @click="loadDiag"
        >
          {{ diagBusy ? 'Prüft …' : 'Neu prüfen' }}
        </button>
      </div>

      <!-- Persistente Live-Region: Ergebnis nach „Neu prüfen" wird Screenreadern angesagt (wie SaveStatusBadge). -->
      <div role="status" aria-live="polite">
        <template v-if="diag">
          <p
            class="mt-1 text-xs"
            :class="{
              'text-success': diagVerdict(diag).kind === 'ok',
              'text-warning': diagVerdict(diag).kind === 'warn',
              'text-error': diagVerdict(diag).kind === 'err',
              'text-base-content/60': diagVerdict(diag).kind === 'info',
            }"
          >
            {{ diagVerdict(diag).msg }}
          </p>
          <p class="mt-1 text-[11px] text-base-content/40">
            Speicher: {{ diag.native ? diag.platform : 'web' }} ·
            Migrationsstand: {{ diag.migrationVersion ?? '–' }}
            <br />
            Vorlagen: {{ diag.rawRows ?? '–' }} (lesbar {{ diag.readableRows ?? '–' }}) ·
            Bausteine: {{ diag.blockRows ?? '–' }} ·
            PZN: {{ diag.pznRows ?? '–' }} ·
            Mustertexte: {{ diag.snippetRows ?? '–' }}
          </p>
        </template>
        <p v-else class="mt-1 text-xs text-base-content/60">Status wird ermittelt …</p>
      </div>
    </div>

    <!-- Werksreset -->
    <div class="rounded-lg border border-error/30 p-3">
      <p class="text-sm font-medium">App zurücksetzen</p>
      <p class="mt-1 text-xs text-base-content/60">
        Setzt die App auf den Auslieferungszustand zurück: löscht alle Vorlagen, Bausteine, Mustertexte,
        Einstellungen und einen laufenden Einsatz. Gedacht für die Weitergabe oder Ausmusterung des Geräts.
      </p>
      <button
        v-if="!confirming"
        class="btn btn-outline btn-error btn-sm mt-2 min-h-11"
        type="button"
        :disabled="busy"
        @click="status = null; confirming = true"
      >
        App zurücksetzen
      </button>

      <div v-else role="alert" class="alert alert-error mt-2 flex-col items-start gap-2 text-sm">
        <span
          >Wirklich <strong>alles lokal löschen</strong>? Vorlagen, Bausteine, Mustertexte, Einstellungen und
          ein laufender Einsatz werden gelöscht. Das lässt sich nicht rückgängig machen.</span
        >
        <div class="flex gap-2">
          <button class="btn btn-error btn-xs min-h-11" type="button" :disabled="busy" @click="runReset">
            {{ busy ? 'Wird zurückgesetzt …' : 'Alles löschen' }}
          </button>
          <button class="btn btn-ghost btn-xs min-h-11" type="button" :disabled="busy" @click="confirming = false">
            Abbrechen
          </button>
        </div>
      </div>
    </div>

    <p v-if="status" class="text-sm" :class="status.kind === 'ok' ? 'text-success' : 'text-error'">{{ status.msg }}</p>
  </div>
</template>
