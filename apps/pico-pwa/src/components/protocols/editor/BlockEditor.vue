<script setup lang="ts">
import { useCreatorSessionCtx } from '@/composables/creatorSessionContext'
import BlockForm from './BlockForm.vue'
import PointList from './PointList.vue'
import PointEditor from './PointEditor.vue'
import VisibleIfEditor from './VisibleIfEditor.vue'

/** hideBlockActions an BlockForm durchreichen (Baustein-Editor, Variante A). */
withDefaults(defineProps<{ hideBlockActions?: boolean }>(), { hideBlockActions: false })

const { currentBlock } = useCreatorSessionCtx()
</script>

<template>
  <section v-if="currentBlock" class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <BlockForm :hide-block-actions="hideBlockActions" />
      <VisibleIfEditor target="block" />
      <div class="divider my-0" />
      <PointList />
      <PointEditor />
    </div>
  </section>
  <p v-else class="text-sm text-base-content/60">Wähle oben einen Block zum Bearbeiten.</p>
</template>
