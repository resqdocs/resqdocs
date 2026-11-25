// Autofokus für frisch eingeblendete Felder. Vue ruft einen Funktions-Ref teils, bevor das Feld im Dokument
// hängt; focus() verpufft dann still und die Tastatur bleibt zu. Deshalb: hängt das Feld schon, sofort
// fokussieren, sonst direkt nach dem laufenden Einhängen.

interface Focusable { isConnected: boolean; focus(): void }

export function focusWhenAttached(el: Focusable): void {
  if (el.isConnected) {
    el.focus()
    return
  }
  queueMicrotask(() => {
    if (el.isConnected) el.focus()
  })
}
