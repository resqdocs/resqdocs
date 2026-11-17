<script setup lang="ts">
/** Kamera für EINE Medikamentenpackung (CodeScanOverlay mit Packungs-Profil). Wird über listCaptureKey an den
 *  Medikationsplan im gemeinsamen Paket gereicht; Events werden 1:1 durchgegeben. */
import CodeScanOverlay from '@/components/CodeScanOverlay.vue'
import { PACKAGE_PROFILE } from '@/medplan/scanProfiles'

const emit = defineEmits<{ decoded: [result: unknown]; cancel: [] }>()
</script>

<template>
  <CodeScanOverlay :profile="PACKAGE_PROFILE" @decoded="(r) => emit('decoded', r)" @cancel="emit('cancel')" />
</template>
