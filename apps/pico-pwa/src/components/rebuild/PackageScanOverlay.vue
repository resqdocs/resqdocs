<script setup lang="ts">
/** Kamera für Medikamentenpackungen (CodeScanOverlay mit Packungs-Profil). Wird über listCaptureKey an den
 *  Medikationsplan im gemeinsamen Paket gereicht. Im Kamerabild steht ein Schalter „Mehrere Packungen“:
 *  aus = eine Packung lesen, dann schließt die Kamera; ein = sie bleibt offen, zählt mit, meldet schon vorhandene
 *  PZN (`known`) im Bild und liefert bei „Fertig“ alle auf einmal. Die Stellung gilt, solange die App läuft. */
import { computed } from 'vue'
import CodeScanOverlay from '@/components/CodeScanOverlay.vue'
import { PACKAGE_PROFILE } from '@/medplan/scanProfiles'
import { packageMultiOn } from './packageScanMode'

const props = defineProps<{ known?: string[] }>()
const emit = defineEmits<{ decoded: [result: unknown]; decodedMany: [results: unknown[]]; cancel: [] }>()
const multi = computed(() => ({
  on: packageMultiOn.value,
  toggleLabel: 'Mehrere Packungen',
  doneLabel: 'Fertig',
  countOne: '1 Packung erfasst',
  countMany: '{n} Packungen erfasst',
  duplicateLabel: 'Schon in der Liste',
  known: props.known ?? [],
}))
function rememberMultiOn(on: boolean): void {
  packageMultiOn.value = on
}
</script>

<template>
  <CodeScanOverlay
    :profile="PACKAGE_PROFILE"
    :multi="multi"
    @multi-on="rememberMultiOn"
    @decoded="(r) => emit('decoded', r)"
    @decoded-many="(r) => emit('decodedMany', r)"
    @cancel="emit('cancel')"
  />
</template>
