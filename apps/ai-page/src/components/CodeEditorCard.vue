<script setup lang="ts">
/**
 * Terminal-Hero. Ablauf: Befehl tippt sich -> Braille-Spinner („generiere …") -> der Prompt
 * DEKODIERT sich aus Glyph-Rauschen (TextScramble/soulwire, bounded settle -> ruhig, nicht hektisch;
 * Whitespace bleibt fest, damit das Layout steht) -> idle: ruhiger Block-Cursor wandert + flackert
 * hier und da kurz ein Zeichen / denkt kurz (Spinner). Alles rein OPTISCH — Copy liefert IMMER den
 * echten, vollstaendigen Prompt (props.code). Volle Hoehe vorab reserviert (Ghost). reduced-motion:
 * sofort fertige Ausgabe, kein rAF, kein Idle.
 * Quellen: soulwire TextScramble (codepen mEMPrK), cli-spinners (sindresorhus), web.dev prefers-reduced-motion.
 */
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps<{ code: string; title?: string; version?: string }>()

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const GLYPHS = '!<>-_\\/[]{}=+*^?#%&$@~|'
const cmd = computed(() => '$ resqdocs prompt ' + (props.title && props.title.includes('en') ? '--en' : '--de'))

type Phase = 'command' | 'spinner' | 'output'
const phase = ref<Phase>('command')
const cmdShown = ref(0)
const spin = ref(0)
const spinning = ref(false)
const revealing = ref(false)
const revealText = ref('') // aktuelle Anzeige des Prompt-Koerpers (waehrend Reveal scrambelnd, danach = props.code)
const cursorPos = ref(0)
const flickerGlyph = ref<string | null>(null)

const glyph = (): string => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
const reduce = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches

let chain = 0 // sequentielle Tipp-/Idle-Kette (immer nur eine offen)
let redecode = 0 // periodischer Wieder-Decode
let raf = 0
function clearAll(): void {
  if (chain) clearTimeout(chain)
  if (redecode) clearTimeout(redecode)
  if (raf) cancelAnimationFrame(raf)
  chain = 0; redecode = 0; raf = 0
}
function later(fn: () => void, ms: number): void { chain = setTimeout(fn, ms) }

// Den coolen Decode-Effekt ab und zu von selbst wiederholen (Ambient). Copy bleibt immer der echte Prompt.
function scheduleRedecode(): void {
  redecode = setTimeout(() => {
    if (phase.value === 'output' && !revealing.value) initScramble() // erneut dekodieren
    scheduleRedecode()
  }, 22000 + Math.random() * 20000)
}

function start(): void {
  clearAll()
  cmdShown.value = 0; spin.value = 0; spinning.value = false; revealing.value = false; flickerGlyph.value = null
  if (!props.code) { phase.value = 'command'; revealText.value = ''; return }
  if (reduce()) { // ohne Animation: alles sofort fertig
    cmdShown.value = cmd.value.length
    revealText.value = props.code
    cursorPos.value = props.code.length - 1
    phase.value = 'output'
    return
  }
  phase.value = 'command'
  typeCommand()
  scheduleRedecode() // den Effekt ab und zu wiederholen
}

function typeCommand(): void {
  if (cmdShown.value >= cmd.value.length) { later(startSpinner, 280); return }
  cmdShown.value += 1
  later(typeCommand, 55 + Math.random() * 75) // gemaechliches Befehl-Tippen
}

function startSpinner(): void {
  phase.value = 'spinner'
  let n = 0
  const step = (): void => {
    spin.value = (spin.value + 1) % SPINNER.length
    n += 1
    if (n < 18) later(step, 85) // ~1,5 s Braille-Spinner
    else initScramble()
  }
  step()
}

// Reveal: jedes Nicht-Whitespace-Zeichen scrambelt bis zu seinem (gestaffelten) end-Frame, dann LOCK.
function initScramble(): void {
  if (chain) clearTimeout(chain) // laufende Idle-Kette abraeumen, sauber neu dekodieren
  if (raf) cancelAnimationFrame(raf)
  const code = props.code
  const scr = Array.from(code, (c) => {
    const fixed = /\s/.test(c) // Leerzeichen/Umbrueche fest -> Layout bleibt ruhig
    return { fixed, final: c, end: fixed ? 0 : Math.floor(18 + Math.random() * 72), ch: fixed ? c : glyph() }
  })
  phase.value = 'output'
  revealing.value = true
  cursorPos.value = code.length - 1
  revealText.value = scr.map((s) => s.ch).join('')
  let frame = 0
  const tick = (): void => {
    frame += 1
    let done = true
    for (const s of scr) {
      if (s.fixed) continue
      if (frame >= s.end) s.ch = s.final
      else { done = false; if (Math.random() < 0.3) s.ch = glyph() }
    }
    revealText.value = scr.map((s) => s.ch).join('')
    if (done) { raf = 0; revealing.value = false; later(wander, 700) }
    else raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

// Idle: ruhiger Cursor wandert + flackert ab und zu kurz EIN Zeichen / denkt kurz nach (Spinner).
function wander(): void {
  if (phase.value !== 'output' || revealing.value) return
  const r = Math.random()
  if (r < 0.2) { // an Ort und Stelle kurz „nachdenken"
    spinning.value = true
    let n = 0
    const sp = (): void => {
      spin.value = (spin.value + 1) % SPINNER.length
      n += 1
      if (n < 12) later(sp, 95)
      else { spinning.value = false; later(wander, 500) }
    }
    sp(); return
  }
  cursorPos.value = Math.floor(Math.random() * props.code.length) // neue ruhige Position
  if (r < 0.62) { // ein Zeichen kurz „glitchen" (nur optisch; Copy bleibt echt)
    let k = 0
    const fl = (): void => {
      flickerGlyph.value = glyph()
      k += 1
      if (k < 5) later(fl, 75)
      else { flickerGlyph.value = null; later(wander, 1600 + Math.random() * 1800) }
    }
    fl(); return
  }
  later(wander, 1600 + Math.random() * 1900) // langsames Wandern
}

watch(() => props.code, (c) => { if (c) start() }, { immediate: true })
onBeforeUnmount(clearAll)

// --- Anzeigemodell: head + Cursor-Zeichen + tail (ein Modell fuer alle Phasen) ---
const showOutput = computed(() => phase.value === 'output')
const ghost = computed(() => cmd.value + '\n\n' + props.code + '\n') // reserviert die volle Hoehe
const head = computed(() => {
  if (phase.value === 'command') return cmd.value.slice(0, cmdShown.value)
  if (phase.value === 'spinner') return cmd.value + '\n' + SPINNER[spin.value] + '  generiere …'
  return cmd.value + '\n\n' + revealText.value.slice(0, cursorPos.value)
})
const tail = computed(() => (showOutput.value ? revealText.value.slice(cursorPos.value + 1) : ''))
const curChar = computed(() => {
  if (phase.value === 'command') return ' '
  if (spinning.value) return SPINNER[spin.value]
  if (flickerGlyph.value) return flickerGlyph.value
  return revealText.value[cursorPos.value] || ' '
})
const showCursor = computed(() => phase.value === 'command' || phase.value === 'output')
const cursorSteady = computed(() => spinning.value || flickerGlyph.value !== null || revealing.value)

// Copy: IMMER der echte Prompt — die Effekte sind rein optisch.
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined
async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.code)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = props.code
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  copied.value = true
  clearTimeout(copyTimer)
  copyTimer = setTimeout(() => (copied.value = false), 2200)
}
onBeforeUnmount(() => clearTimeout(copyTimer))
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="overflow-hidden rounded-2xl border border-white/10 bg-[#0f1830] shadow-2xl ring-1 ring-black/20">
      <!-- Titlebar -->
      <div class="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <span class="flex gap-1.5" aria-hidden="true">
          <span class="h-3 w-3 rounded-full" :class="{ 'animate-pulse': !showOutput || revealing }" style="background: var(--coral)"></span>
          <span class="h-3 w-3 rounded-full bg-white/20"></span>
          <span class="h-3 w-3 rounded-full bg-white/20"></span>
        </span>
        <span class="flex-1 truncate font-mono text-xs text-white/55">{{ title || 'prompt.md' }}<span v-if="version" class="text-white/35"> · {{ version }}</span></span>
        <button type="button" class="rounded-md p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white/80" :aria-label="copied ? 'Kopiert' : 'Prompt kopieren'" @click="copy">
          <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-4 w-4" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z" /></svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-emerald-400" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
        </button>
      </div>
      <!-- Body: Ghost reserviert die volle Hoehe (unsichtbar), aktive Anzeige liegt darueber. Klick kopiert. -->
      <div class="relative px-4 py-4" role="button" tabindex="0" aria-label="Prompt kopieren" @click="copy" @keydown.enter="copy">
        <pre class="invisible m-0 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed" aria-hidden="true">{{ ghost }}</pre>
        <pre class="absolute left-4 right-4 top-4 m-0 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-white/85">{{ head }}<span v-if="showCursor" class="term-cursor" :class="{ 'is-steady': cursorSteady }">{{ curChar }}</span>{{ tail }}</pre>
      </div>
    </div>

    <button type="button" class="self-center rounded-xl px-6 py-3 font-semibold text-white shadow-lg transition active:scale-[.98]" :style="{ background: copied ? '#1a7f4b' : 'var(--navy)' }" @click="copy">
      {{ copied ? '✓ Kopiert!' : 'Prompt kopieren' }}
    </button>
    <p class="-mt-2 text-center text-xs text-[color:var(--navy)]/55" aria-live="polite">{{ copied ? 'In der Zwischenablage — jetzt in dein LLM einfügen.' : 'Selbsttragend — dein LLM lädt die Doku selbst.' }}</p>
  </div>
</template>

<style scoped>
/* Block-Cursor: klassisch Terminal, dezenter Glow, harter steps-Blink (authentisch). */
.term-cursor {
  display: inline-block;
  border-radius: 1px;
  background: var(--coral);
  color: #0f1830;
  box-shadow: 0 0 8px 2px rgba(240, 83, 73, 0.45), 0 0 20px 5px rgba(240, 83, 73, 0.1);
  animation: term-blink 1.1s steps(2, end) infinite;
}
.term-cursor.is-steady { animation: none; } /* waehrend Reveal/Spinner/Flicker steht der Cursor ruhig */
@keyframes term-blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0.2; }
}
@media (prefers-reduced-motion: reduce) {
  .term-cursor { animation: none; opacity: 0.85; }
}
</style>
