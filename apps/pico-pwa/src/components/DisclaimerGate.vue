<script setup lang="ts">
import TabRef from '@resqdocs/protocol-core-ui/components/TabRef.vue'
import { useDisclaimer } from '@/composables/useDisclaimer'

/**
 * Hinweis beim Start: Haftung und Nutzung in EINEM Dialog, danach kommt die Einführung (TabGuide wartet auf
 * needsAck). Sperrt die App beim ersten Start und wenn sich der Text geändert hat (Logik in useDisclaimer),
 * bis „Verstanden und einverstanden“ getippt ist; Hintergrund-Tippen schließt hier nicht.
 * Aus den Einstellungen (Info & Rechtliches → Info & Hilfe) öffnet derselbe Dialog zum Lesen, mit „Schließen“.
 *
 * „Vollständiger Hinweis“ klappt den ganzen Text auf (Inhalt wie DISCLAIMER.md im Repo), offline und ohne die
 * Sperre zu verlassen. Ein Dateiname erscheint in der Oberfläche nicht.
 *
 * Wortlaut zwischen den Markierungen hinweis:start/hinweis:end gehört zu DISCLAIMER_TEXT_VERSION. Wer ihn ändert,
 * hebt die Textversion an (Wächter disclaimerGate.test.ts), damit alle den neuen Text einmal bestätigen.
 */
const { ready, needsAck, reading, acknowledge, close } = useDisclaimer()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="ready && (needsAck || reading)"
      class="overlay-backdrop--strong fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      data-disclaimer
      @click.self="!needsAck && close()"
    >
      <div class="overlay-surface--strong card max-h-full w-full max-w-lg overflow-y-auto">
        <div class="card-body gap-4 p-6 pb-0">
          <div class="flex items-center gap-3">
            <img draggable="false" src="/brand.svg" alt="ResQDocs" class="brand-logo brand-logo-light h-8 w-auto" />
            <img draggable="false" src="/brand-dark.svg" alt="ResQDocs" class="brand-logo brand-logo-dark h-8 w-auto" />
          </div>

          <h2 id="disclaimer-title" class="card-title text-lg">Wichtiger Hinweis</h2>

          <!-- hinweis:start -->
          <div class="space-y-3 text-sm leading-relaxed text-base-content/90">
            <p>
              ResQDocs ist ein freies, quelloffenes Hilfsmittel für die Dokumentation im Rettungsdienst. Die App
              trifft keine medizinischen Entscheidungen, stellt keine Diagnosen und ersetzt nicht deine fachliche
              Beurteilung.
            </p>
            <p>
              <strong>Für deine Dokumentation bist du selbst verantwortlich.</strong> Prüfe Eingaben, gescannte
              Angaben und den Protokolltext, bevor du ihn verwendest. Die Nutzung erfolgt auf eigene Verantwortung.
              Die Software wird ohne Gewähr bereitgestellt (GPL-3.0); eine Haftung für Richtigkeit, Eignung oder
              Folgen der Nutzung wird nicht übernommen.
            </p>
            <p>
              Was du im Einsatz einträgst, bleibt auf diesem Handy, bis du den Einsatz löschst oder die eingestellte
              Frist abläuft. Weitergegeben wird es nur, wenn du es auslöst: über die Bridge an dein Zielgerät oder
              indem du den Protokolltext kopierst. Die App sendet keine Nutzungsdaten (keine Telemetrie).
            </p>
            <p class="text-base-content/75">
              Dieser Hinweis erscheint beim ersten Start und erneut, wenn sich sein Inhalt ändert. Du findest ihn
              jederzeit unter <TabRef tab="einstellungen" /> → Info &amp; Rechtliches.
            </p>
          </div>

          <details class="rounded-lg border border-base-300 text-sm" data-disclaimer-full>
            <summary class="flex min-h-11 cursor-pointer items-center px-3 font-medium">Vollständiger Hinweis</summary>
            <div class="space-y-3 px-3 pb-3 leading-relaxed text-base-content/90">
              <h3 class="font-semibold">Zweck und Grenzen</h3>
              <p>
                ResQDocs ist ein Werkzeug zur Unterstützung der Einsatzdokumentation im Rettungsdienst. Die App trifft
                keine medizinischen Entscheidungen, stellt keine Diagnosen, gibt keine Behandlungsempfehlungen und
                ersetzt nicht die fachliche Beurteilung durch qualifiziertes Personal.
              </p>
              <h3 class="font-semibold">Medizinische Eigenverantwortung</h3>
              <p>
                Gescannte oder eingegebene Angaben (z. B. aus Medikationsplänen oder Packungscodes) können
                unvollständig oder fehlerhaft sein. Die Verantwortung für die Richtigkeit der Dokumentation sowie für
                jede medizinische Beurteilung und Entscheidung liegt beim Anwender bzw. beim qualifizierten Personal.
                Eingaben sind vor der Verwendung zu prüfen.
              </p>
              <h3 class="font-semibold">Software-Gewährleistung</h3>
              <p>
                Die Software wird unter GPL-3.0-or-later bereitgestellt, ohne jegliche Gewährleistung, im durch
                anwendbares Recht zulässigen Umfang (siehe Abschnitte 15 und 16 der GPL-3.0).
              </p>
              <h3 class="font-semibold">Datenschutz (Patientendaten)</h3>
              <p>Die App ist auf Datenminimierung ausgelegt:</p>
              <ul class="list-disc space-y-1 pl-5">
                <li>
                  <strong>Keine dauerhafte Speicherung von Patientendaten.</strong> In den Einsatz eingegebene Inhalte
                  sind flüchtig und dienen nur der unmittelbaren Verarbeitung.
                </li>
                <li>
                  <strong>Lokal auf dem Gerät.</strong> Einsatzeingaben verlassen das Gerät nur, wenn der Anwender es
                  auslöst: über die Bridge im lokalen Netz an sein Zielgerät oder indem er den Protokolltext kopiert.
                  Es gibt keine Telemetrie. Verbindungen ins Internet gibt es nur für die Prüfung auf eine neue
                  App-Version (abschaltbar) und für Funktionen, die der Anwender selbst auslöst oder einschaltet
                  (Teilen von Vorlagen per Link, Cloud-Sicherung, Laden einer eigenen PZN-Bibliothek); Einsatzeingaben
                  sind darin nicht enthalten.
                </li>
                <li>
                  <strong>Keine Roh-Scan-Speicherung.</strong> Rohe Barcode-/BMP-Payloads, Kamerabilder und Frames
                  werden nicht dauerhaft gespeichert; aus Scans wird nur der benötigte Arbeitsstand übernommen.
                </li>
                <li>
                  <strong>Temporärer Einsatzentwurf mit Ablauf.</strong> Ein laufender Entwurf kann lokal kurzfristig
                  fortgesetzt werden und wird nach Inaktivität automatisch gelöscht (einstellbare Frist).
                </li>
                <li>
                  <strong>Eigenverantwortung.</strong> Für bewusst gespeicherte oder exportierte Inhalte ist der
                  Anwender selbst verantwortlich. Dies ist keine Rechtsberatung; Einsatz und Konfiguration sind durch
                  die verantwortliche Stelle zu prüfen.
                </li>
              </ul>
              <h3 class="font-semibold">PZN-Bibliothek: Datenverantwortung</h3>
              <p>
                Die persönliche PZN-Bibliothek ist eine vom Anwender selbst angelegte und gepflegte Sammlung. Für
                Inhalt, Herkunft und Verwendung der Einträge ist der Anwender selbst verantwortlich. Vorgesehene
                Nutzung: eigene Einträge (manuelle Eingabe oder Packungs-Scan), ausschließlich lokal, nicht aus
                fremden/lizenzierten Datenquellen befüllt und nicht zur Weitergabe bestimmt.
              </p>
              <p>
                Hintergrund: PZN→Produkt-Stammdaten in Deutschland sind ein lizenzpflichtiges Produkt der IFA GmbH
                (IFA-Rohdatenlizenz) und unterliegen dem EU-Datenbankrecht (sui generis, Art. 7 RL 96/9/EG). Das
                eigenständige Erfassen einzelner PZN aus eigenem Scan/eigener Eingabe ist davon nicht erfasst; das
                Entnehmen aus fremden (IFA-abgeleiteten) Quellen oder das Verteilen einer Sammlung hingegen schon.
                Das Projekt stellt das Werkzeug bereit und hat keinen Einfluss darauf, wie Anwender es nutzen.
              </p>
            </div>
          </details>
          <!-- hinweis:end -->
        </div>

        <!-- Knopfzeile klebt unten: auch bei aufgeklapptem vollständigem Hinweis ohne Suchen erreichbar. -->
        <div class="sticky bottom-0 flex justify-end bg-base-100 px-6 pb-6 pt-4">
          <button v-if="needsAck" class="btn btn-primary min-h-11" type="button" data-disclaimer-ack @click="acknowledge">
            Verstanden und einverstanden
          </button>
          <button v-else class="btn min-h-11" type="button" data-disclaimer-close @click="close">Schließen</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
