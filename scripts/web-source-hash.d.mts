// Typ-Deklaration für das reine JS-Hash-Modul (importiert von apps/pico-pwa/vite.config.ts und
// apps/pico-pwa/scripts/check-bundle-fresh.mjs), damit vue-tsc den .mjs-Import nicht als implicit any meldet.
export function hashWebSources(repoRoot?: string): string
