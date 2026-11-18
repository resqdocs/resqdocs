// Testphase: eine TestFlight-/Play-Testversion für eine große Funktion, die nie veröffentlicht wird.
// Ihr Build bekommt eine Kennung (scripts/release/build-testphase.sh setzt die VITE_TEST_PHASE_*-Werte);
// normale Release-Builds haben keine. Mit Kennung zeigt die App beim Start statt der Einführung den
// Hinweis auf die Testanleitung und oben dauerhaft einen Streifen „Testversion“.

export interface TestPhase {
  id: string
  title: string
  url: string
}

/** Nur eine vollständige, plausible Kennung zählt; alles andere ist ein normaler Build. Die Anleitung
 *  muss auf der eigenen Webseite liegen, damit ein Build nie auf eine fremde Seite verweist. */
export function parseTestPhase(env: Record<string, unknown> | undefined): TestPhase | null {
  const id = typeof env?.VITE_TEST_PHASE_ID === 'string' ? env.VITE_TEST_PHASE_ID.trim() : ''
  const title = typeof env?.VITE_TEST_PHASE_TITLE === 'string' ? env.VITE_TEST_PHASE_TITLE.trim() : ''
  const url = typeof env?.VITE_TEST_PHASE_URL === 'string' ? env.VITE_TEST_PHASE_URL.trim() : ''
  if (!/^[a-z0-9-]{1,40}$/.test(id) || title === '' || title.length > 60) return null
  if (!/^https:\/\/resqdocs\.app\/testphase\/[a-z0-9-]{12,}\/$/.test(url)) return null
  return { id, title, url }
}

export const TEST_PHASE: TestPhase | null = parseTestPhase((import.meta as { env?: Record<string, unknown> }).env)
