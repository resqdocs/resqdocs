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
            <strong>Lokal:</strong> Vorlagen, Bausteine, Textbausteine und Einstellungen bleiben auf deinem
            Gerät. Kein Konto, keine Telemetrie, kein Tracking, keine Werbe-SDKs, keine Crash-Reporter.
          </p>
          <p>
            <strong>Einsatzeingaben:</strong> Was du im Einsatz einträgst, bleibt auf dem Gerät, geht nur über
            die Bridge an dein Zielgerät und wird automatisch gelöscht – beim Abschließen oder nach der unter
            „Datenschutz &amp; lokale Daten“ gewählten Zeit ohne Bearbeitung. Nie an uns, nie in die
            Sicherungen der App oder in geteilte Links.
          </p>
          <p>
            <strong>Verbindungen ins Internet</strong> gibt es nur in drei Fällen: der Blick auf die aktuelle
            Versionsnummer beim Öffnen der App (abschaltbar unter „App-Einstellungen“), das Teilen per Link – im Gerät
            verschlüsselt, für uns nicht lesbar – und die Cloud-Sicherung in dein eigenes iCloud bzw. Google
            Drive, die nur läuft, wenn du sie einschaltest. Eine externe Medikamenten- oder PZN-Datenbank
            ruft die App nicht ab.
          </p>
          <p>
            <strong>Persönliche PZN-Bibliothek:</strong> Deine PZN-Sammlung pflegst du selbst; sie liegt
            auf dem Gerät, ist individuell und <strong>nicht zum Teilen oder Weitergeben bestimmt</strong>.
          </p>
          <p>
            <strong>Kein Medizinprodukt:</strong> ResQDocs ist ein Hilfsmittel ohne Gewähr – es gilt der
            Haftungsausschluss (Hinweis beim Start). Verantwortlicher: siehe Impressum oben.
          </p>
          <p class="text-xs text-base-content/60">
            Ausführliche Datenschutzerklärung (alle Verarbeitungen, Speicherdauer, Rechtsgrundlagen, deine
            Rechte, Aufsichtsbehörde):
            <a class="link" href="https://resqdocs.app/datenschutz/" target="_blank" rel="noopener">resqdocs.app/datenschutz</a>.
            Lokale Daten kannst du jederzeit löschen (Einstellungen → „Datenschutz &amp; lokale Daten")
            oder durch Deinstallation. Stand: Oktober 2026
          </p>
        </div>
      </div>
  </div>
</template>
