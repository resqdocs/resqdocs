<script setup lang="ts">
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import VariableList from './VariableList.vue'
import VariableForm from './VariableForm.vue'

/** Variablen-Bereich (#13-D): Liste + Formular für die ausgewählte Variable. */
const { currentVariable } = useCreatorSessionCtx()
</script>

<template>
  <section class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <VariableList />
      <VariableForm v-if="currentVariable" />
    </div>
  </section>
</template>
