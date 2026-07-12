// Semver-Vergleich (dreiteilig x.y.z, fehlende Teile = 0). Rueckgabe <0 / 0 / >0.
// Gemeinsame Quelle fuer Firmware-Update-Check (App) UND Versions-Gating (Online-Editor:
// functionKinds/Eigenschaften nach der vom Nutzer gewaehlten App-Version).
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10) || 0)
  const pb = b.split('.').map((s) => parseInt(s, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/** a >= b (Mindestversions-Gate). */
export function versionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0
}
