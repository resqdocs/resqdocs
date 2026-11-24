<script setup lang="ts">
/**
 * Rückfrage vor dem Teilen einer Sicherung. Steht direkt bei dem Knopf, der sie auslöst
 * („Aktuellen Stand exportieren“ oben, „Exportieren“ an einer Sicherung im Verlauf), und rückt beim Öffnen
 * ins Bild. Ein Fehler beim Teilen steht im Kasten selbst, nicht an anderer Stelle der Seite.
 */
import { onMounted, ref } from 'vue'

defineProps<{ busy: boolean; error?: string }>()
const emit = defineEmits<{ share: []; cancel: [] }>()
const box = ref<HTMLElement | null>(null)
onMounted(() => box.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
</script>

<template>
  <div ref="box" class="scroll-my-4 rounded-lg border border-info/40 bg-info/10 p-3 text-sm" data-share-confirm>
    <p><strong>Sicherung teilen?</strong> Diese Datei enthält <strong>nur Vorlagen, gespeicherte Abschnitte,
      Textbausteine und die PZN-Datenbank — keine Patientendaten.</strong> Legst du sie in iCloud, Drive, Mail o. Ä., verlässt sie dein Gerät und liegt
      außerhalb der App. <strong>Das wählst und verantwortest du selbst</strong> (kein Zurückholen möglich).</p>
    <p v-if="error" role="alert" class="mt-2 font-medium text-error" data-share-error>{{ error }}</p>
    <div class="mt-2 flex flex-wrap gap-2">
      <button class="btn btn-primary btn-sm min-h-11" type="button" :disabled="busy" @click="emit('share')">
        {{ busy ? 'Teilt …' : 'Teilen' }}
      </button>
      <button class="btn btn-outline btn-sm min-h-11" type="button" :disabled="busy" @click="emit('cancel')">Abbrechen</button>
    </div>
  </div>
</template>
