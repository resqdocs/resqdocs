/// <reference types="vite/client" />

/**
 * Build-Kennung, zur Build-Zeit von Vite injiziert (siehe vite.config.ts `define`).
 * Ändert sich mit jedem Build/Update; Grundlage des Haftungsausschluss-Gates.
 */
declare const __APP_BUILD_ID__: string
