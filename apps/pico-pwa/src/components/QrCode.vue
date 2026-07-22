<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { BrowserQRCodeSvgWriter } from '@zxing/browser'

/** QR-Anzeige eines kurzen Strings (Transfer-Link) als Inline-SVG. Lokal erzeugt (@zxing), kein Netz.
 *  Weißer Hintergrund + Quiet-Zone, damit der Code sicher scanbar bleibt. */
const props = defineProps<{ value: string; size?: number }>()
const host = ref<HTMLDivElement | null>(null)

function render(): void {
  if (!host.value) return
  const size = props.size ?? 200
  try {
    host.value.replaceChildren(new BrowserQRCodeSvgWriter().write(props.value, size, size))
  } catch {
    host.value.replaceChildren() // z. B. leerer Wert -> nichts anzeigen statt Absturz
  }
}
onMounted(render)
watch(() => [props.value, props.size], render)
</script>

<template>
  <div ref="host" class="inline-block rounded bg-white p-2" role="img" aria-label="QR-Code des Transfer-Links" />
</template>
