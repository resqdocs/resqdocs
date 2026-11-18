import { createApp } from 'vue'
import { installKeyboardInset } from '@resqdocs/protocol-core-ui/keyboardInset'
import './style.css'
import App from './App.vue'

// Sichtbaren Bereich für Fenster und Knopfzeilen bereitstellen (Bildschirmtastatur).
installKeyboardInset()
createApp(App).mount('#app')
