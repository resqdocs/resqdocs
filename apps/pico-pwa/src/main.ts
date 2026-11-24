import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { installAppKeyboard } from './shell/keyboard'
import { installAppBack } from './shell/back'
import { installAppHaptics } from './shell/haptics'

// Bildschirmtastatur (@capacitor/keyboard): Zustand für Fenster und Knopfzeilen, auf iOS ohne Leiste ↑ ↓ ✓
// schließbar. Die Messung des sichtbaren Bereichs (keyboardInset.ts) braucht nur der Online-Editor.
installAppKeyboard()
// „Zurück“ auf Android (Taste und Geste): oberstes Fenster, Unterseite, Tab Einsatz, dann das System.
installAppBack()
// Haptik an wenigen, benannten Stellen (Regler „Vibration“ in den Einstellungen).
installAppHaptics()
createApp(App).mount('#app')
