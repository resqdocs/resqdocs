<script setup lang="ts">
import { useCreatorSession } from '@/composables/useCreatorSession'
import ProtocolList from './ProtocolList.vue'
import ProtocolActions from './ProtocolActions.vue'
import ProtocolValidationPanel from './ProtocolValidationPanel.vue'
import ProtocolJsonView from './ProtocolJsonView.vue'
import ProtocolTestPreview from './ProtocolTestPreview.vue'
import ProtocolEditor from './editor/ProtocolEditor.vue'
import ProtocolImportExport from './ProtocolImportExport.vue'
import ProtocolBackup from './ProtocolBackup.vue'
import ProtocolLibraryActions from './ProtocolLibraryActions.vue'
import InsertFromLibrary from './InsertFromLibrary.vue'

/**
 * Vorlagen-Tab (#13-B, bis #138 "Protokolle"): Shell, NICHT der vollständige Editor. Verwendet die
 * flüchtige Creator-Session (kein Speichern). Verarbeitet nur neutrale Vorlagen.
 */
const { session, selected, isExample, validation, json, select, duplicate, rename, remove, createNew } =
  useCreatorSession()
</script>

<template>
  <div class="flex flex-col gap-4">
    <p class="text-sm text-base-content/60">
      Eigene Protokoll-Vorlagen erstellen und pflegen - die Grundlage für jeden Einsatz.
    </p>

    <div role="note" class="alert alert-info text-sm">
      Vorlagen sind neutrale Protokoll-Gerüste. Keine Patientendaten oder Einsatzdaten darin speichern.
    </div>

    <section class="card bg-base-100 shadow">
      <div class="card-body gap-3 p-4">
        <h2 class="card-title text-base">Vorlagen</h2>
        <ProtocolActions
          :selected-title="selected?.title ?? null"
          :can-act="!!selected"
          :read-only="isExample"
          @create="createNew"
          @duplicate="duplicate"
          @rename="rename"
          @remove="remove"
        />
        <!-- Auto-Persistenz (#108): Arbeitsstand wird laufend lokal gesichert -->
        <p class="rounded bg-success/10 px-3 py-2 text-xs text-base-content/80">
          Dein Arbeitsstand wird <strong>automatisch gespeichert</strong> und bleibt nach dem Schließen
          der App und nach Updates erhalten. Für ein zusätzliches Backup kannst du Vorlagen exportieren
          oder unten in die Bibliothek legen.
        </p>
        <ProtocolList
          :protocols="session.protocols"
          :selected-id="session.selectedProtocolId"
          @select="select"
        />
      </div>
    </section>

    <!-- Lokale Bibliothek (#13-F2) — bewusstes Laden/Speichern, kein Auto-Save -->
    <ProtocolLibraryActions />

    <!-- Import/Export (#13-E) — Import immer verfügbar, Export für die Auswahl -->
    <ProtocolImportExport />

    <!-- Voll-Backup (#108 Teil 2): alle Protokolle in eine Datei sichern/wiederherstellen -->
    <ProtocolBackup />

    <template v-if="selected">
      <section class="card bg-base-100 shadow">
        <div class="card-body gap-3 p-4">
          <h2 class="card-title text-base">{{ selected.title }}</h2>
          <div v-if="isExample" role="note" class="alert alert-info text-sm">
            <!-- Inhalt in EIN span gewickelt: daisyUI-alert ist Grid; mehrere
                 direkte Kinder (Text + <strong>) würden sonst je eine Spalte
                 bilden und horizontal überlaufen statt umzubrechen. -->
            <span>
              Schreibgeschützte <strong>Beispiel-Vorlage</strong>. Zum Anpassen oben auf
              <strong>„Duplizieren"</strong> – die Kopie ist frei bearbeitbar.
            </span>
          </div>
          <ProtocolValidationPanel v-else :validation="validation" />
        </div>
      </section>

      <!-- Editor + Library-Einfügen nur für bearbeitbare Protokolle (nicht Beispiel) -->
      <template v-if="!isExample">
        <!-- Geführter Editor (#13-C): Blöcke & Punkte -->
        <ProtocolEditor />

        <!-- Aus Textbausteinen einfügen (#13-F4): Copy-on-insert -->
        <InsertFromLibrary />
      </template>

      <section class="card bg-base-100 shadow">
        <div class="card-body gap-3 p-4">
          <ProtocolJsonView :json="json" />
          <div>
            <h3 class="mb-1 text-sm font-medium">Test-Vorschau</h3>
            <ProtocolTestPreview :protocol="selected" />
          </div>
        </div>
      </section>
    </template>
    <p v-else class="text-sm text-base-content/60">
      Kein Protokoll ausgewählt. Lege über „+ Neu" eines an.
    </p>
  </div>
</template>
