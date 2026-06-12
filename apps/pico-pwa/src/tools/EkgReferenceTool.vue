<script setup lang="ts">
import { ref } from 'vue'

/**
 * EKG-Referenz / Spickzettel (#86): reine NACHSCHLAGE-Hilfe (Normzeiten +
 * Erinnerungs-Kennzeichen) als Feld-Tool — display-only, KEIN „Übernehmen",
 * emittiert nichts in den Feldinhalt. Offline, keine Requests (Netzwerk-Policy).
 *
 * Werte vom Maintainer kuratiert/freigegeben; Schwellen mit Primärquellen belegt
 * (siehe docs/medical-sources.md). Gedächtnisstütze, KEINE Diagnose.
 */
const dialog = ref<HTMLDialogElement | null>(null)
function open(): void {
  dialog.value?.showModal()
}
function close(): void {
  dialog.value?.close()
}
</script>

<template>
  <div>
    <button class="btn btn-sm" type="button" @click="open">EKG-Referenz</button>
    <dialog ref="dialog" class="modal">
      <div class="modal-box flex max-h-[85vh] flex-col gap-3 overflow-y-auto">
        <h3 class="text-base font-semibold">EKG-Referenz (Spickzettel)</h3>
        <p class="rounded bg-warning/10 px-3 py-2 text-xs text-warning">
          Gedächtnisstütze – ersetzt <strong>keine</strong> ärztliche Beurteilung. Keine Diagnose.
        </p>

        <section class="text-sm">
          <h4 class="mb-1 font-semibold text-base-content/80">Normzeiten (Erwachsene)</h4>
          <ul class="space-y-0.5">
            <li>P-Welle: &lt; 110 ms</li>
            <li>PQ/PR-Intervall: 120–200 ms</li>
            <li>QRS-Dauer: &lt; 120 ms</li>
            <li>
              QTc (frequenzkorrigiert): obere Norm m &lt; 450 / w &lt; 460 ms ·
              verlängert ≥ 470 (m) / ≥ 480 (w) ms
            </li>
            <li>Herzfrequenz: 60–100/min (Brady &lt; 60, Tachy &gt; 100)</li>
          </ul>
        </section>

        <section class="text-sm">
          <h4 class="mb-1 font-semibold text-base-content/80">Kennzeichen (Erinnerung, keine Diagnose)</h4>
          <ul class="space-y-1.5">
            <li><strong>AV-Block I°:</strong> PR konstant &gt; 200 ms.</li>
            <li>
              <strong>AV-Block II°:</strong> Mobitz I (Wenckebach) = zunehmende PR bis Ausfall;
              Mobitz II = plötzlicher Ausfall ohne PR-Zunahme.
            </li>
            <li><strong>AV-Block III°:</strong> AV-Dissoziation (P-Wellen und QRS unabhängig).</li>
            <li>
              <strong>Schenkelblock:</strong> QRS ≥ 120 ms. RBBB: rSR' in V1, breites S in I/V6.
              LBBB: breites/gekerbtes R in I/V6.
            </li>
            <li>
              <strong>STEMI-Kriterium:</strong> neue ST-Hebung am J-Punkt in ≥ 2 zusammenhängenden
              Ableitungen — ≥ 1 mm (Extremitäten + übrige Brustwand); V2–V3: ≥ 2 mm Männer ≥ 40 J,
              ≥ 2,5 mm Männer &lt; 40 J, ≥ 1,5 mm Frauen.
            </li>
            <li>
              <strong>Hemiblock:</strong> LAHB → überdrehter Linkstyp; LPHB → überdrehter Rechtstyp
              (Lagetyp über das Tool „EKG-Lagetyp" bestimmen).
            </li>
          </ul>
        </section>

        <p class="text-xs text-base-content/50">
          Quellen: Normintervalle, QT & Schenkelblock/Hemiblock — AHA/ACCF/HRS Recommendations
          for the Standardization and Interpretation of the ECG (2009, Teil III + IV, Circulation).
          AV-Block — ESC Guidelines on Cardiac Pacing and CRT (2021, Eur Heart J). STEMI-Kriterium —
          Fourth Universal Definition of Myocardial Infarction (2018, Circulation). Links:
          docs/medical-sources.md.
        </p>

        <div class="flex justify-end">
          <button class="btn btn-primary btn-sm" type="button" @click="close">Schließen</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button aria-label="Schließen">close</button></form>
    </dialog>
  </div>
</template>
