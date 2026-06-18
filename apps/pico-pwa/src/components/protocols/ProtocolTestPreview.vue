<script setup lang="ts">
import { computed } from 'vue'
import { render, type ProtocolTemplate } from '@resqdocs/protocol-core/renderer/render.mjs'
import RenderPreview from '@/components/RenderPreview.vue'
import { useStorage } from '@/storage/useStorage'

/**
 * Test-Vorschau über den BESTEHENDEN Renderer/Runtime mit neutralem
 * Standardzustand (Variablen-Defaults, keine Eingabedaten). Flüchtig, keine
 * Patientendaten, keine Persistenz.
 */
const props = defineProps<{ protocol: ProtocolTemplate | null }>()
const storage = useStorage()

const text = computed(() => {
  if (!props.protocol) return ''
  try {
    return render(props.protocol, {}, {
      heading: {
        pattern: storage.settings.headingPattern,
        fill: storage.settings.headingFill,
        width: storage.settings.headingWidth,
      },
    })
  } catch (e) {
    return `Vorschau nicht möglich: ${(e as Error).message}`
  }
})
</script>

<template>
  <div>
    <p class="mb-1 text-xs text-base-content/60">
      Test-Vorschau (neutraler Standardzustand, keine Eingabe-/Patientendaten).
    </p>
    <RenderPreview :text="text" />
  </div>
</template>
