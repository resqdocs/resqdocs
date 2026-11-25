// packageScanMode.ts — Stellung des Schalters „Mehrere Packungen“ im Kamerabild. Gilt, solange die App läuft:
// Wer mehrere Packungen scannt, tut das meist den ganzen Einsatz über. Nach einem Neustart steht er wieder auf aus.
import { ref } from 'vue'

export const packageMultiOn = ref(false)
