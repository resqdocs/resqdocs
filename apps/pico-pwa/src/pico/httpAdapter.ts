// httpAdapter.ts — HttpAdapter über CapacitorHttp (nativer HTTP-Layer).
//
// Die EINZIGE Stelle, die CapacitorHttp berührt. CapacitorHttp statt fetch im
// WebView → vermeidet CORS/Mixed-Content bei lokalen Verbindungen zur Bridge.
// KEIN Logging von Payloads. Keine Patientendaten in URLs.
import { CapacitorHttp } from '@capacitor/core'
import type { HttpAdapter } from './picoTypes'

export const capacitorHttpAdapter: HttpAdapter = {
  async get(url, opts = {}) {
    const res = await CapacitorHttp.get({
      url,
      headers: opts.headers,
      connectTimeout: opts.connectTimeout,
      readTimeout: opts.readTimeout,
    })
    return { status: res.status, data: res.data }
  },
  async post(url, body, opts = {}) {
    const res = await CapacitorHttp.post({
      url,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      data: body,
      connectTimeout: opts.connectTimeout,
      readTimeout: opts.readTimeout,
    })
    return { status: res.status, data: res.data }
  },
}
