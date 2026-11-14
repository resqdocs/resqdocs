// keepAwake.ts — Bildschirm anlassen, solange die Bridge tippt und die App den Fortschritt zeigt.
//
// Eigenes Mini-Plugin (android/.../KeepAwakePlugin.kt, ios/App/App/KeepAwakePlugin.swift): setzt nur das
// „Bildschirm an"-Kennzeichen des eigenen Fensters. Keine Berechtigung, wirkt nur im Vordergrund.
// Im Browser (Entwicklung) gibt es das Plugin nicht - dann passiert nichts.
import { Capacitor, registerPlugin } from '@capacitor/core'

interface ResQKeepAwakePlugin {
  set(options: { on: boolean }): Promise<void>
}

const ResQKeepAwake = registerPlugin<ResQKeepAwakePlugin>('ResQKeepAwake')

let current = false

/** Setzt den Zustand; ruft das Plugin nur bei einer Aenderung. Wirft nicht. */
export function setKeepAwake(on: boolean): void {
  if (on === current) return
  current = on
  if (!Capacitor.isNativePlatform()) return
  // Fehlschlag ist unkritisch (Bildschirm geht dann wie ueblich aus); beim naechsten Wechsel erneut versuchen.
  void ResQKeepAwake.set({ on }).catch(() => {
    current = !on
  })
}
