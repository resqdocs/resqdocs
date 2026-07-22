// Minimaler In-Memory-Rate-Limiter (fester Zeitfenster-Zaehler pro Schluessel). BEWUSST simpel und
// nur als Fallback: der eigentliche Rate-Limit gehoert an den externen Reverse-Proxy, damit die IP
// nur dort fluechtig lebt und NIE in den Dienst gelangt. Wird ein Schluessel (z. B. IP) uebergeben,
// liegt er ausschliesslich fluechtig im Speicher und wird nicht persistiert.
export interface RateLimiter {
  /** true = erlaubt, false = Limit erreicht (HTTP 429). */
  allow(key: string): boolean
}

export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = () => Date.now(),
  maxKeys = 50_000,
): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>()
  return {
    allow(key) {
      const t = now()
      const cur = hits.get(key)
      if (cur && t < cur.resetAt) {
        if (cur.count >= limit) return false
        cur.count++
        return true
      }
      // Neuer/abgelaufener Schluessel. Map HART begrenzen (Schutz gegen Key-Explosion): erst abgelaufene
      // raeumen, reicht das nicht, ganz leeren. So bleibt die Arbeit beschraenkt statt pro Insert zu scannen.
      if (!cur && hits.size >= maxKeys) {
        for (const [k, v] of hits) if (t >= v.resetAt) hits.delete(k)
        if (hits.size >= maxKeys) hits.clear()
      }
      hits.set(key, { count: 1, resetAt: t + windowMs })
      return true
    },
  }
}
