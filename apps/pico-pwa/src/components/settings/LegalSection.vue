<script setup lang="ts">
/**
 * Rechtliches: Impressum (§ 5 DDG) + Datenschutzerklärung.
 *
 * Statischer Inhalt (gilt für alle Nutzer gleich; KEIN nutzer-editierbares Feld) —
 * Änderungen am Impressum/Stand erfolgen hier im Quelltext. Die Datenschutz-
 * Formulierung spiegelt die No-Tracking-Politik der App (kein Analytics, keine
 * Patientendaten, Netzwerk nur lokale Bridge + PZN-HTTPS, Kamera nur BMP-Scan).
 *
 * Hinweis: kein Ersatz für rechtliche Beratung; ladungsfähige Anschrift + Kontakt
 * sind Pflicht und vom Maintainer zu prüfen.
 */
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-4 p-4">
      <h3 class="font-medium">Rechtliches</h3>

      <!-- Impressum -->
      <div>
        <h4 class="mb-1 text-sm font-semibold">Impressum</h4>
        <p class="text-xs text-base-content/60">Angaben gemäß § 5 DDG</p>
        <!-- Platzhalter: Der Betreiber dieser App-Distribution traegt hier die
             eigenen ladungsfaehigen Angaben ein (Pflicht nach § 5 DDG). -->
        <div class="mt-2 space-y-0.5 text-sm leading-relaxed">
          <p>[Name des Anbieters]</p>
          <p>[Strasse und Hausnummer]</p>
          <p>[PLZ Ort]</p>
          <p>[Land]</p>
        </div>
        <div class="mt-2 space-y-0.5 text-sm leading-relaxed">
          <p><span class="text-base-content/60">E-Mail:</span> [Kontakt-E-Mail]</p>
        </div>
        <p class="mt-2 text-sm">
          <span class="text-base-content/60">Verantwortlich für den Inhalt:</span> [Name]
        </p>
      </div>

      <div class="divider my-0"></div>

      <!-- Datenschutzerklärung -->
      <div>
        <h4 class="mb-1 text-sm font-semibold">Datenschutzerklärung</h4>
        <div class="space-y-3 text-sm leading-relaxed text-base-content/90">
          <p>
            <strong>Verantwortlicher:</strong> [Anbieter-Angaben wie im Impressum].
          </p>
          <p>
            <strong>Grundsatz:</strong> ResQDocs ist ein Hilfsmittel zur Einsatzdokumentation. Die App
            erhebt <strong>keine</strong> personenbezogenen Daten zu Analyse- oder Werbezwecken. Es gibt
            <strong>kein Tracking, keine Analytik, keine Werbe-SDKs und keine Crash-Reporter</strong>.
          </p>
          <p>
            <strong>Lokale Datenverarbeitung:</strong> Deine Protokolle, Vorlagen und Einstellungen werden
            ausschließlich <strong>lokal auf deinem Gerät</strong> gespeichert und nicht an uns oder Dritte
            übertragen.
          </p>
          <p>
            <strong>Patientendaten:</strong> In den Einsatz eingegebene Inhalte sind flüchtig und werden
            nicht dauerhaft gespeichert oder übertragen.
          </p>
          <p>
            <strong>Netzwerkverbindungen:</strong> Die App verbindet sich ausschließlich mit (a) der
            lokalen ResQDocs-Bridge (Pico) in deinem WLAN, um Text an ein Zielgerät zu übertragen, und
            (b) der Medikamenten-/PZN-Datenbank über eine verschlüsselte HTTPS-Verbindung zum Abruf von
            Medikamenteninformationen. Darüber hinaus findet keine Kommunikation mit Servern statt.
          </p>
          <p>
            <strong>Kamera:</strong> Die Kamera wird ausschließlich zum Scannen des Medikationsplan-Codes
            (BMP) verwendet; es werden keine Fotos gespeichert oder übertragen.
          </p>
          <p>
            <strong>Deine Rechte (DSGVO):</strong> Da keine personenbezogenen Daten erhoben oder gespeichert
            werden, fallen Auskunfts-, Löschungs- oder Widerspruchsrechte uns gegenüber regelmäßig nicht an.
            Lokale Daten kannst du jederzeit in der App löschen (Einstellungen → „Datenschutz & lokale Daten")
            oder durch Deinstallation der App.
          </p>
          <p>
            <strong>App-Stores:</strong> Beim Bezug der App über einen App-Store (Apple App Store, Google
            Play, Huawei AppGallery) gelten zusätzlich die Datenschutzbestimmungen des jeweiligen Anbieters;
            auf dessen Datenverarbeitung haben wir keinen Einfluss.
          </p>
          <p class="text-xs text-base-content/60">Stand: Juni 2026</p>
        </div>
      </div>
    </div>
  </section>
</template>
