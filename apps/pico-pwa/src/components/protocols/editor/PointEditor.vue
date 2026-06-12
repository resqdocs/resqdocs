<script setup lang="ts">
import { useCreatorSession } from '@/composables/useCreatorSession'
import PointForm from './PointForm.vue'
import VisibleIfEditor from './VisibleIfEditor.vue'

const { currentPoint } = useCreatorSession()
</script>

<template>
  <div v-if="currentPoint" class="flex flex-col gap-2 rounded-lg bg-base-200 p-3">
    <PointForm />
    <VisibleIfEditor target="point" />
  </div>
  <p v-else class="text-sm text-base-content/60">
    Punkt oben in der Liste antippen, um ihn zu bearbeiten (bei Befundgruppen: dort liegen auch
    Einzelbefunde und „Einklappbar im Einsatz").
  </p>
</template>
