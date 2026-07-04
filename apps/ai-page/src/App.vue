<script setup lang="ts">
/**
 * ai.resqdocs.app — „Bring dein eigenes LLM": Nutzer kopiert den (kurzen) Prompt, fuegt ihn in SEIN
 * LLM ein, das die Doku laedt (oder via Paste-Fallback) und ein Protokoll-JSON erzeugt -> Import in
 * der ResQDocs-App (Vorlagen -> ⋮ -> Daten -> Importieren; #261 — der Web-Editor ist kein Ziel mehr).
 * Prompt-primaer; Doku ist nur eine rohe Datei fuers LLM. Artefakte kommen aus public/ (aus ai-docs/).
 */
import { ref, computed, onMounted, watch } from 'vue'
import CodeEditorCard from './components/CodeEditorCard.vue'

type Lang = 'de' | 'en'
const lang = ref<Lang>('de')
const prompt = ref('')
const version = ref<{ protocolVersion?: number; appVersion?: string; token?: string } | null>(null)
const docCopied = ref(false)
// ?v=<App-Version>: die App oeffnet ai.resqdocs.app mit ihrer ECHTEN Version (useAppVersion, inkl. Dev/
// Beta-Builds) -> in den kopierten Prompt stempeln, damit die KI den Versions-Check (A3) ohne Rueckfrage
// kennt. Direktbesucher ohne Param -> die KI fragt manuell (Doku A3). Sanitisiert (keine Prompt-Injektion).
const appParam = ref<string | null>(null)
const versionNote = computed(() =>
  !appParam.value
    ? ''
    : lang.value === 'de'
      ? `\n\n---\nMeine ResQDocs-Version ist ${appParam.value} — nutze das direkt für den Versions-Check (A3 der Doku) und frag mich nicht erneut danach.`
      : `\n\n---\nMy ResQDocs version is ${appParam.value} — use this directly for the version check (A3 of the doc); do not ask me again.`,
)
const promptForCopy = computed(() => (appParam.value && prompt.value ? prompt.value + versionNote.value : prompt.value))

async function loadPrompt(): Promise<void> {
  try {
    prompt.value = await (await fetch(`/prompt.${lang.value}.md`)).text()
  } catch {
    prompt.value = ''
  }
}
async function copyDoc(): Promise<void> {
  try {
    const text = await (await fetch(`/doc.${lang.value}.md`)).text()
    await navigator.clipboard.writeText(text)
    docCopied.value = true
    setTimeout(() => (docCopied.value = false), 2200)
  } catch {
    /* ignore */
  }
}
onMounted(async () => {
  try {
    const p = new URLSearchParams(window.location.search).get('v')
    if (p) appParam.value = p.replace(/[^0-9A-Za-z.()\s_-]/g, '').trim().slice(0, 40) || null
  } catch {
    /* ignore */
  }
  try {
    version.value = await (await fetch('/version.json')).json()
  } catch {
    /* ignore */
  }
  await loadPrompt()
})
watch(lang, loadPrompt)

const TEXT = {
  de: {
    heading: 'Protokoll-Vorlagen mit deinem LLM',
    sub: 'Kopiere den Prompt in dein eigenes LLM (ChatGPT, Claude, Gemini). Es lädt die Doku, stellt dir ein paar Fragen und gibt dir ein fertiges Protokoll-JSON für die ResQDocs-App. ResQDocs hostet keine KI — deine Daten bleiben bei dir.',
    privacy: 'Nur Struktur, keine Patientendaten: die KI baut die leere Vorlage, nie einen Fall.',
    steps: [
      { n: '1', t: 'Prompt kopieren', d: 'Ein Klick.' },
      { n: '2', t: 'In dein LLM einfügen', d: 'ChatGPT, Claude, Gemini — egal welches.' },
      { n: '3', t: 'Fragen beantworten', d: 'Das Modell führt dich durch Titel, Abschnitte, Felder und zeigt eine Vorschau.' },
      { n: '4', t: 'In der App importieren', d: 'ResQDocs-App: Vorlagen → ⋮ → Daten → Importieren.' },
    ],
    fbTitle: 'Dein LLM kann die Doku nicht laden?',
    fbText: 'Bei Gemini ist das der Normalfall („Ich kann den Link nicht öffnen"); ChatGPT/Claude brauchen teils die aktivierte Websuche. Die KI sagt dir dann selbst Bescheid — dann hier die Doku kopieren und als Nachricht einfügen ODER herunterladen und als Datei anhängen:',
    copyDoc: 'Doku kopieren',
    docCopied: '✓ Doku kopiert',
    downloadDoc: 'Doku herunterladen',
    versionDetected: 'Deine App-Version wurde erkannt und ist im Prompt enthalten:',
    powerTitle: 'Für Vielnutzer',
    powerText: 'Lege den Prompt einmal als System-Anweisung in einem ChatGPT-Custom-GPT, Claude-Project oder Gemini-Gem an — dann brauchst du ihn nicht jedes Mal zu kopieren.',
    importTitle: 'Ergebnis in die App importieren',
    importText: 'Öffne die ResQDocs-App: Tab „Vorlagen" → oben rechts „⋮" → „Daten" → „Importieren" → JSON einfügen (oder .json-Datei wählen) → „Laden". Passt die Format-Version nicht zu deiner App-Version, sagt dir der Import klar Bescheid.',
    openEditor: 'ResQDocs-App laden',
    footer: 'Open Source · keine KI gehostet · keine Patientendaten',
  },
  en: {
    heading: 'Protocol templates with your LLM',
    sub: 'Copy the prompt into your own LLM (ChatGPT, Claude, Gemini). It loads the docs, asks you a few questions and gives you a finished protocol JSON for the ResQDocs app. ResQDocs hosts no AI — your data stays with you.',
    privacy: 'Structure only, no patient data: the AI builds the empty template, never a case.',
    steps: [
      { n: '1', t: 'Copy the prompt', d: 'One click.' },
      { n: '2', t: 'Paste into your LLM', d: 'ChatGPT, Claude, Gemini — any of them.' },
      { n: '3', t: 'Answer the questions', d: 'The model guides you through title, sections, fields and shows a preview.' },
      { n: '4', t: 'Import in the app', d: 'ResQDocs app: Vorlagen → ⋮ → Daten → Importieren.' },
    ],
    fbTitle: 'Your LLM cannot load the docs?',
    fbText: 'With Gemini this is the normal case ("I cannot open the link"); ChatGPT/Claude may need web search enabled. The AI will tell you itself — then copy the docs here and paste them as a message OR download them and attach as a file:',
    copyDoc: 'Copy the docs',
    docCopied: '✓ Docs copied',
    downloadDoc: 'Download the docs',
    versionDetected: 'Your app version was detected and is included in the prompt:',
    powerTitle: 'For power users',
    powerText: 'Set the prompt up once as a system instruction in a ChatGPT custom GPT, Claude project or Gemini gem — then you do not need to copy it every time.',
    importTitle: 'Import the result into the app',
    importText: 'Open the ResQDocs app: tab "Vorlagen" → "⋮" at the top right → "Daten" → "Importieren" → paste the JSON (or pick a .json file) → "Laden". If the format version does not match your app version, the import tells you clearly.',
    openEditor: 'Get the ResQDocs app',
    footer: 'Open source · no AI hosted · no patient data',
  },
} as const
const t = computed(() => TEXT[lang.value])
// Public-Asset als gebundener String -> kein statischer Import-Transform durch das Vue-Plugin.
const signet = '/signet.svg'
const badge = computed(() =>
  version.value ? `Format v${version.value.protocolVersion ?? '?'} · App ≥ ${version.value.appVersion ?? '?'}` : '',
)
</script>

<template>
  <div class="min-h-full bg-white text-[color:var(--navy)]">
    <!-- Header -->
    <header class="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
      <img :src="signet" alt="ResQDocs" class="h-8 w-auto" />
      <span class="font-semibold">ResQDocs</span>
      <span v-if="badge" class="hidden rounded-full border border-[color:var(--navy)]/15 px-2.5 py-1 text-xs text-[color:var(--navy)]/60 sm:inline">{{ badge }}</span>
      <div class="ml-auto inline-flex overflow-hidden rounded-full border border-[color:var(--navy)]/15 text-xs">
        <button type="button" class="px-3 py-1.5 transition" :class="lang === 'de' ? 'bg-[color:var(--navy)] text-white' : 'text-[color:var(--navy)]/60'" @click="lang = 'de'">DE</button>
        <button type="button" class="px-3 py-1.5 transition" :class="lang === 'en' ? 'bg-[color:var(--navy)] text-white' : 'text-[color:var(--navy)]/60'" @click="lang = 'en'">EN</button>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-5 pb-20">
      <!-- Hero -->
      <section class="pt-6 sm:pt-10">
        <p class="inline-flex items-center gap-2 rounded-full bg-[color:var(--coral)]/10 px-3 py-1 text-xs font-medium text-[color:var(--coral-text)]">
          <span aria-hidden="true">🔒</span> {{ t.privacy }}
        </p>
        <h1 class="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{{ t.heading }}</h1>
        <p class="mt-3 max-w-2xl text-base leading-relaxed text-[color:var(--navy)]/70">{{ t.sub }}</p>

        <div class="mt-7">
          <CodeEditorCard :code="promptForCopy" :title="`prompt.${lang}.md`" :version="version?.token" />
          <p v-if="appParam" class="mt-2 text-xs text-[color:var(--navy)]/60">{{ t.versionDetected }} <strong>{{ appParam }}</strong></p>
        </div>
      </section>

      <!-- 3 (4) Schritte -->
      <section class="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="s in t.steps" :key="s.n" class="rounded-xl border border-[color:var(--navy)]/10 bg-white p-4 shadow-sm">
          <div class="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--navy)] text-sm font-bold text-white">{{ s.n }}</div>
          <h3 class="mt-2 font-semibold">{{ s.t }}</h3>
          <p class="mt-1 text-sm text-[color:var(--navy)]/65">{{ s.d }}</p>
        </div>
      </section>

      <!-- Paste-Fallback -->
      <section class="mt-12 rounded-xl border border-[color:var(--navy)]/10 bg-[color:var(--navy)]/[0.03] p-5">
        <h2 class="font-semibold">{{ t.fbTitle }}</h2>
        <p class="mt-1 text-sm text-[color:var(--navy)]/70">{{ t.fbText }}</p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" class="rounded-lg border border-[color:var(--navy)]/20 px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--navy)]/5" @click="copyDoc">
            {{ docCopied ? t.docCopied : t.copyDoc }}
          </button>
          <a :href="`/doc.${lang}.md`" :download="`resqdocs-doku.${lang}.md`" class="rounded-lg border border-[color:var(--navy)]/20 px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--navy)]/5">{{ t.downloadDoc }}</a>
        </div>
      </section>

      <!-- Power-Varianten -->
      <section class="mt-8">
        <h2 class="font-semibold">{{ t.powerTitle }}</h2>
        <p class="mt-1 max-w-2xl text-sm text-[color:var(--navy)]/70">{{ t.powerText }}</p>
      </section>

      <!-- Import -->
      <section class="mt-12 rounded-2xl bg-[color:var(--navy)] p-6 text-white">
        <h2 class="text-lg font-semibold">{{ t.importTitle }}</h2>
        <p class="mt-1 text-sm text-white/75">{{ t.importText }}</p>
        <a href="https://resqdocs.app" target="_blank" rel="noopener" class="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-white/90">{{ t.openEditor }} →</a>
      </section>

      <footer class="mt-14 text-center text-xs text-[color:var(--navy)]/45">
        {{ t.footer }}<template v-if="badge"> · {{ badge }}</template>
      </footer>
    </main>
  </div>
</template>
