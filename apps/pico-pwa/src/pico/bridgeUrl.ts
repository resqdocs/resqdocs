// bridgeUrl.ts — Eingabe der Bridge-Adresse normalisieren (rein, testbar).
// Die Speicherschicht nimmt nur http(s)-Adressen an (settingsRepository) und faellt sonst still auf den
// Default zurueck. Wer die Adresse so eintippt, wie sie am Geraet steht („10.10.10.1"), bekommt deshalb
// `http://` ergaenzt; die Bridge spricht im lokalen WLAN nur http.

export type BridgeUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

/** "10.10.10.1" -> "http://10.10.10.1"; http(s) bleibt; anderes Schema -> Fehler; leer -> null. */
export function normalizeBridgeUrl(input: string): BridgeUrlResult | null {
  const v = input.trim()
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return { ok: true, url: v }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
    return { ok: false, error: 'Die Adresse muss mit http:// oder https:// beginnen.' }
  }
  return { ok: true, url: `http://${v}` }
}
