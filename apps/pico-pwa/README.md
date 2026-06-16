# apps/pico-pwa — Composer-App

Mobile-first Composer-App von ResQDocs. Gemeinsame **Vue-3-Codebasis** (Composition API, Vite,
TypeScript, Tailwind CSS, Konsta UI / daisyUI), die über **Capacitor** als native iOS-/Android-App
ausgeliefert wird und **lokal-first** funktioniert.

Die Kommunikation mit dem Pico 2 W läuft über eine **gekapselte HTTP-Schicht** (`@capacitor/http`,
z. B. `usePicoApi()` / `usePicoConnection()`). Patientendaten werden nur flüchtig verarbeitet und
**nicht persistent** gespeichert.

> Wird im nächsten Schritt scaffolded (Vite + Vue 3 + TS + Tailwind + Capacitor).
