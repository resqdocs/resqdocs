<script setup lang="ts">
import { useCreatorSession } from '@/composables/useCreatorSession'
import BlockForm from './BlockForm.vue'
import PointList from './PointList.vue'
import PointEditor from './PointEditor.vue'
import VisibleIfEditor from './VisibleIfEditor.vue'

const { currentBlock } = useCreatorSession()
</script>

<template>
  <section v-if="currentBlock" class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <BlockForm />
      <VisibleIfEditor target="block" />
      <div class="divider my-0" />
      <PointList />
      <PointEditor />
    </div>
  </section>
  <p v-else class="text-sm text-base-content/60">Wähle oben einen Block zum Bearbeiten.</p>
</template>
