// storedTextGuard.ts — Pruefung des Textes fuer den Knopf an der Bridge, VOR dem Speichern.
//
// Der Knopf tippt den Text ohne Handy. Er darf deshalb nur Text sein: keine Steuerzeichen ausser dem
// Zeilenumbruch, keine Programmaufrufe, Shell-Verkettungen oder Internetadressen. Durchgesetzt wird
// das von der Bridge selbst (firmware/bridge/bridge_s2/StoredGuard.h, beim Ablegen und vor jedem
// Tippen); diese Datei ist dieselbe Pruefung in der App, damit man den Grund sofort sieht.
//
// Liste und Verfahren muessen mit StoredGuard.h uebereinstimmen - der Test vergleicht beide Listen
// und laeuft ueber dieselben Beispiele (firmware/test/storedguard/vectors.tsv).
// Reine Logik (im Node-Test nutzbar). Der Text wird hier nur geprueft, nie gespeichert oder geloggt.

/** [Muster in Kleinbuchstaben, Wortgrenze links, Wortgrenze rechts] */
export type GuardNeedle = readonly [pattern: string, left: boolean, right: boolean]

export const GUARD_NEEDLES: readonly GuardNeedle[] = [
  // Kommandozeilen und Skript-Interpreter
  ['powershell', true, true],
  ['pwsh', true, true],
  ['cmd.exe', true, false],
  ['cmd /', true, false],
  ['bash', true, true],
  ['zsh', true, true],
  ['sudo', true, true],
  ['python', true, true],
  ['python3', true, true],
  ['perl', true, true],
  ['osascript', true, true],
  ['wscript', true, true],
  ['cscript', true, true],
  ['mshta', true, true],
  ['rundll32', true, true],
  ['regsvr32', true, true],
  ['msiexec', true, true],
  ['wmic', true, true],
  // Laden und Verbinden
  ['curl', true, true],
  ['wget', true, true],
  ['certutil', true, true],
  ['bitsadmin', true, true],
  ['ssh', true, true],
  ['scp', true, true],
  ['netcat', true, true],
  ['ncat', true, true],
  ['http://', false, false],
  ['https://', false, false],
  ['ftp://', false, false],
  ['file://', false, false],
  ['javascript:', false, false],
  ['vbscript:', false, false],
  ['<script', false, false],
  ['\\\\', false, false],
  // System veraendern
  ['schtasks', true, true],
  ['netsh', true, true],
  ['regedit', true, true],
  ['taskkill', true, true],
  ['diskpart', true, true],
  ['bcdedit', true, true],
  ['vssadmin', true, true],
  ['icacls', true, true],
  ['chmod', true, true],
  ['chown', true, true],
  ['mkfs', true, false],
  ['reg add', true, false],
  ['reg delete', true, false],
  ['net user', true, false],
  ['net localgroup', true, false],
  ['rm -rf', true, false],
  ['rm -fr', true, false],
  ['del /', true, false],
  ['format c:', true, false],
  ['shutdown /', true, false],
  ['shutdown -', true, false],
  ['hkey_', false, false],
  ['hklm:', false, false],
  ['hkcu:', false, false],
  ['c:\\windows', false, false],
  ['/bin/', false, false],
  ['/etc/', false, false],
  ['/dev/tcp', false, false],
  // PowerShell-Bausteine
  ['iex', true, true],
  ['invoke-', true, false],
  ['start-process', true, false],
  ['new-object', true, false],
  ['set-executionpolicy', true, false],
  ['add-mppreference', true, false],
  ['downloadstring', false, false],
  ['downloadfile', false, false],
  ['frombase64string', false, false],
  ['encodedcommand', false, false],
  ['-enc ', false, false],
  ['$env:', false, false],
  // Shell-Verkettung und Ersetzung
  ['&&', false, false],
  ['||', false, false],
  ['$(', false, false],
  ['${', false, false],
  ['2>&1', false, false],
  ['%appdata%', false, false],
  ['%temp%', false, false],
  ['%comspec%', false, false],
  ['%systemroot%', false, false],
  // Ausfuehrbare Dateien
  ['.exe', false, true],
  ['.bat', false, true],
  ['.ps1', false, true],
  ['.vbs', false, true],
  ['.scr', false, true],
  ['.msi', false, true],
  ['.dll', false, true],
]

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: 'control' }
  | { ok: false; reason: 'command'; match: string }

/** Zeichen, die beim Vergleich uebergangen werden (Tarnung in der Windows-Konsole/PowerShell). */
const skipped = (c: string): boolean => c === '^' || c === '"' || c === "'" || c === '`'
const fold = (c: string): string => (c >= 'A' && c <= 'Z' ? c.toLowerCase() : c)
const alnum = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')

/** Passt das Muster ab Position i? Gibt die Position hinter dem Treffer zurueck, sonst -1. */
function matchAt(s: string, i: number, needle: string): number {
  let j = i
  let last = ''
  for (let k = 0; k < needle.length; ) {
    if (j >= s.length) return -1
    const raw = s[j]
    if (skipped(raw)) { j++; continue }
    const c = fold(raw)
    if (c === ' ' && last === ' ') { j++; continue }
    if (c !== needle[k]) return -1
    last = c
    j++
    k++
  }
  return j
}

function findCommand(s: string): string | null {
  let prev = ''
  for (let i = 0; i < s.length; i++) {
    if (skipped(s[i])) continue
    const c = fold(s[i])
    for (const [needle, left, right] of GUARD_NEEDLES) {
      if (needle[0] !== c) continue
      if (left && alnum(prev)) continue
      const end = matchAt(s, i, needle)
      if (end < 0) continue
      if (right) {
        let r = end
        while (r < s.length && skipped(s[r])) r++
        if (r < s.length && alnum(fold(s[r]))) continue
      }
      return needle
    }
    prev = c
  }
  return null
}

/** Zeilenenden vereinheitlichen (eingefuegter Text aus Windows bringt \r\n mit). */
export function normalizeStoredText(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Prueft den Text so, wie die Bridge ihn prueft. Vorher `normalizeStoredText` anwenden. */
export function checkStoredText(text: string): GuardResult {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code < 0x20 && code !== 0x0a) || code === 0x7f) return { ok: false, reason: 'control' }
  }
  const match = findCommand(text)
  return match === null ? { ok: true } : { ok: false, reason: 'command', match }
}

/** Meldung fuer die Anzeige. */
export function guardMessage(result: GuardResult): string {
  if (result.ok) return ''
  if (result.reason === 'control') {
    return 'Der Text enthält einen Tabulator oder ein anderes Steuerzeichen. Erlaubt sind nur Schrift und Zeilenumbrüche.'
  }
  return `Der Text enthält ${result.match.trim()} und lässt sich so nicht speichern. Befehle, Programmaufrufe und Internetadressen tippt der Knopf nicht.`
}
