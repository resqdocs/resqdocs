<script setup lang="ts">
/**
 * Rechtliches: Impressum (§ 5 DDG) + Datenschutzerklärung.
 *
 * Statischer Inhalt (gilt für alle Nutzer gleich; KEIN nutzer-editierbares Feld) —
 * Änderungen am Impressum/Stand erfolgen hier im Quelltext. Die Datenschutz-
 * Formulierung spiegelt die No-Tracking-Politik der App (kein Analytics, keine
 * Patientendaten, Netzwerk nur lokale Bridge — kein externer PZN-/Medikamenten-
 * Abruf —, Kamera nur BMP-Scan).
 *
 * Hinweis: kein Ersatz für rechtliche Beratung; ladungsfähige Anschrift + Kontakt
 * sind Pflicht und vom Maintainer zu prüfen.
 */
</script>

<template>
  <div class="flex flex-col gap-4">
      <h3 class="font-medium">Rechtliches</h3>

      <!-- Impressum -->
      <div>
        <h4 class="mb-1 text-sm font-semibold">Impressum</h4>
        <p class="text-xs text-base-content/60">Angaben gemäß § 5 DDG</p>
        <div class="mt-2 space-y-0.5 text-sm leading-relaxed">
          <p>[Anbieter]</p>
          <p>[Anschrift]</p>
          <p>[PLZ Ort]</p>
          <p>Deutschland</p>
        </div>
        <div class="mt-2 space-y-0.5 text-sm leading-relaxed">
          <p><span class="text-base-content/60">Vertreten durch:</span> [Name]</p>
          <p><span class="text-base-content/60">E-Mail:</span> support@resqdocs.app</p>
        </div>
        <div class="mt-2 space-y-0.5 text-sm leading-relaxed">
          <p><span class="text-base-content/60">Registergericht:</span> [Registergericht]</p>
          <p><span class="text-base-content/60">USt-IdNr.:</span> [USt-IdNr]</p>
        </div>
        <p class="mt-2 text-sm">
          <span class="text-base-content/60">Verantwortlich für den Inhalt:</span> [Anbieter]
        </p>
        <p class="mt-1 text-sm">
          <span class="text-base-content/60">Entwicklung:</span> [Name]
        </p>
      </div>

      <div class="divider my-0"></div>

      <!-- Datenschutz: Kurzfassung, in-app (offline) erreichbar. Ausführliche Fassung auf der Landing
           (resqdocs.app/datenschutz) — dort Hosting, Server-Logfiles, Betroffenenrechte, Aufsichtsbehörde. -->
      <div>
        <h4 class="mb-1 text-sm font-semibold">Datenschutz – das Wichtigste</h4>
        <div class="space-y-2 text-sm leading-relaxed text-base-content/90">
          <p>
            <strong>Lokal:</strong> Alle Daten – Protokolle, Vorlagen, Einstellungen – bleiben auf deinem
            Gerät. Keine Cloud, keine Telemetrie, kein Tracking, keine Werbe-SDKs, keine Crash-Reporter.
          </p>
          <p>
            <strong>Patientendaten flüchtig:</strong> Im Einsatz eingegebene Inhalte werden nur temporär
            verarbeitet und automatisch gelöscht – keine dauerhafte Speicherung, keine Übertragung an uns.
          </p>
          <p>
            <strong>Keine externe Datenbank:</strong> Die App ruft <strong>keine</strong> externen
            Medikamenten- oder PZN-Datenbanken ab und überträgt dafür keine Daten. Die einzige
            Netzwerkverbindung ist die lokale ResQDocs-Bridge (Pico) in deinem WLAN.
          </p>
          <p>
            <strong>Persönliche PZN-Bibliothek:</strong> Deine PZN-Sammlung pflegst du selbst; sie liegt
            rein lokal auf dem Gerät, ist individuell und <strong>nicht zum Teilen oder Weitergeben
            bestimmt</strong>.
          </p>
          <p>
            <strong>Kein Medizinprodukt:</strong> ResQDocs ist ein Hilfsmittel ohne Gewähr – es gilt der
            Haftungsausschluss (Hinweis beim Start). Verantwortlicher: siehe Impressum oben.
          </p>
          <p class="text-xs text-base-content/60">
            Ausführliche Datenschutzerklärung (Hosting, Server-Logfiles, Betroffenenrechte,
            Aufsichtsbehörde):
            <a class="link" href="https://resqdocs.app/datenschutz/" target="_blank" rel="noopener">resqdocs.app/datenschutz</a>.
            Lokale Daten kannst du jederzeit löschen (Einstellungen → „Datenschutz &amp; lokale Daten")
            oder durch Deinstallation. Stand: Juni 2026
          </p>
        </div>
      </div>
  </div>
</template>
