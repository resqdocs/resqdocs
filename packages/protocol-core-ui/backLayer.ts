// backLayer.ts — das oberste offene Fenster finden und auf seinem eigenen Weg schließen.
//
// EINE Stelle für „Zurück“ (Android, in der App) und Escape (Browser, Online-Editor), statt Code in jedem Fenster.
// Es gibt kein Verzeichnis offener Fenster: gefragt wird die Seite selbst. Ein Fenster ist alles, was den ganzen
// Bildschirm deckt; das oberste ist das, was in der Bildschirmmitte zuoberst liegt (Hit-Test). Das stimmt auch für
// Fenster in der obersten Ebene des Browsers (<dialog>), für an body gehängte Fenster und für jede z-Reihenfolge.
//
// Geschlossen wird nie am Fenster vorbei, sondern über das Bedienelement, das es selbst dafür hat:
//   1. `data-back-escape` am Fenster: Es behandelt Escape selbst und kennt Zwischenschritte (z. B. erst die Rückfrage
//      „Verwerfen?“, dann zurück in die Liste). Es bekommt genau dieses Escape.
//   2. `data-back-close` an einem Knopf im Fenster: dieser Knopf wird ausgelöst (z. B. „Abbrechen“, ✕, „Später“).
//   3. sonst der Rand, den daisyUI-Fenster von Haus aus haben (`.modal-backdrop`, bei <dialog> das Formular am Rand):
//      Zurück wirkt wie der Tipp daneben.
//   4. ein Knopf, der selbst den Bildschirm deckt (Rand eines Menüs oder einer Erklärung): er wird ausgelöst.
// Ein Fenster ohne solchen Weg bleibt offen (z. B. der Hinweis beim Start, der bestätigt werden muss).
// Damit gilt für ungespeicherte Eingaben in einem Fenster dasselbe wie bei dessen eigenem Schließen: Hier entsteht
// keine zweite Logik, die etwas verwirft oder behält.

/** Was als Fenster zählt: ein offenes <dialog>, ein offenes daisyUI-Fenster, eine bildschirmfüllende Fläche. */
export const LAYER_SELECTOR = 'dialog[open], .modal-open, .fixed.inset-0'

/** Die wenigen DOM-Fähigkeiten, die die Regeln brauchen (in Tests durch einfache Objekte ersetzbar). */
export interface LayerEl {
  matches(selector: string): boolean
  closest(selector: string): LayerEl | null
  querySelector(selector: string): LayerEl | null
}

export type CloseRoute =
  | { how: 'escape'; el: LayerEl } // das Fenster behandelt Escape selbst
  | { how: 'click'; el: LayerEl } // eigener Schließen-Knopf oder Rand
  | { how: 'dialog'; el: LayerEl } // <dialog> ohne Rand-Formular: dialog.close()

/** Oberstes Fenster aus den Elementen in der Bildschirmmitte (oberstes zuerst). */
export function layerOf(hits: readonly LayerEl[]): LayerEl | null {
  for (const el of hits) {
    const layer = el.closest(LAYER_SELECTOR)
    if (layer) return layer
  }
  return null
}

/** Der eigene Schließen-Weg eines Fensters; null, wenn es keinen hat (dann bleibt es offen). */
export function closeRoute(layer: LayerEl): CloseRoute | null {
  if (layer.matches('[data-back-escape]')) return { how: 'escape', el: layer }
  const marked = layer.querySelector('[data-back-close]')
  if (marked) return { how: 'click', el: marked }
  if (layer.matches('dialog[open]')) {
    const edge = layer.querySelector(':scope > form[method="dialog"] button')
    return edge ? { how: 'click', el: edge } : { how: 'dialog', el: layer }
  }
  if (layer.matches('.modal-open')) {
    const edge = layer.querySelector(':scope > .modal-backdrop')
    return edge ? { how: 'click', el: edge } : null
  }
  if (layer.matches('button')) return { how: 'click', el: layer }
  return null
}

/** Oberstes offenes Fenster der Seite; null, wenn keines offen ist (oder die Umgebung kein Layout kennt). */
export function topLayer(doc: Document = document): Element | null {
  const view = doc.defaultView
  if (!view || typeof doc.elementsFromPoint !== 'function') return null
  const hits = doc.elementsFromPoint(view.innerWidth / 2, view.innerHeight / 2)
  return layerOf(hits as unknown as LayerEl[]) as unknown as Element | null
}

/** Ergebnis von closeLayer: geschlossen (bzw. angestoßen) oder ohne eigenen Schließen-Weg. */
export type CloseResult = 'closed' | 'locked'

/** Ein Fenster auf seinem eigenen Weg schließen. Ein gesperrter Schließen-Knopf (das Fenster arbeitet gerade)
 *  zählt als behandelt: Es passiert nichts, wie beim Tippen auf den Knopf. */
export function closeLayer(layer: Element): CloseResult {
  const route = closeRoute(layer as unknown as LayerEl)
  if (!route) return 'locked'
  const el = route.el as unknown as HTMLElement
  if (route.how === 'escape') {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  } else if (route.how === 'dialog') {
    ;(el as HTMLDialogElement).close()
  } else {
    el.click()
  }
  return 'closed'
}

/**
 * Escape schließt das oberste Fenster, wenn es das nicht schon selbst tut (Browser und Online-Editor).
 *
 * Vorsichtig, damit nichts doppelt schließt: Das Fenster wird VOR allen anderen gemerkt. Erst wenn die Taste
 * unbehandelt durchgelaufen ist (nicht abgefangen, kein preventDefault) und dasselbe Fenster danach immer noch oben
 * liegt, schließt diese Stelle es über seinen eigenen Weg. Fenster, die Escape selbst behandeln (Rückfragen, die
 * Optionsliste, <dialog> des Browsers), sind dann schon zu oder haben die Taste verbraucht.
 */
export function installEscapeClose(doc: Document = document): void {
  const view = doc.defaultView
  if (!view) return
  let seen: Element | null = null
  view.addEventListener(
    'keydown',
    (e) => {
      seen = e.key === 'Escape' && e.isTrusted ? topLayer(doc) : null
    },
    true,
  )
  view.addEventListener('keydown', (e) => {
    const layer = seen
    seen = null
    if (!layer || e.key !== 'Escape' || e.defaultPrevented) return
    // <dialog> schließt der Browser selbst; Fenster mit eigener Escape-Behandlung haben sie gerade bekommen.
    if (layer.matches('dialog[open], [data-back-escape]')) return
    view.setTimeout(() => {
      if (topLayer(doc) === layer) closeLayer(layer)
    }, 0)
  })
}
