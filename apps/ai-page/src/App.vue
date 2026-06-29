<script setup lang="ts">
/**
 * ai.resqdocs.app — „Bring dein eigenes LLM": Nutzer kopiert den (kurzen) Prompt, fuegt ihn in SEIN
 * LLM ein, das die Doku laedt (oder via Paste-Fallback) und ein Protokoll-JSON erzeugt -> Editor-Import.
 * Prompt-primaer; Doku ist nur eine rohe Datei fuers LLM. Artefakte kommen aus public/ (aus ai-docs/).
 */
import { ref, computed, onMounted, watch } from 'vue'
import CodeEditorCard from './components/CodeEditorCard.vue'

type Lang = 'de' | 'en'
const lang = ref<Lang>('de')
const prompt = ref('')
const version = ref<{ protocolVersion?: number; appVersion?: string; token?: string } | null>(null)
const docCopied = ref(false)

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
    sub: 'Kopiere den Prompt in dein eigenes LLM (ChatGPT, Claude, Gemini). Es lädt die Doku, stellt dir ein paar Fragen und gibt dir ein fertiges Protokoll-JSON für den Editor. ResQDocs hostet keine KI — deine Daten bleiben bei dir.',
    privacy: 'Nur Struktur, keine Patientendaten: die KI baut die leere Vorlage, nie einen Fall.',
    steps: [
      { n: '1', t: 'Prompt kopieren', d: 'Ein Klick.' },
      { n: '2', t: 'In dein LLM einfügen', d: 'ChatGPT, Claude, Gemini — egal welches.' },
      { n: '3', t: 'Fragen beantworten', d: 'Das Modell führt dich durch Titel, Abschnitte, Felder und zeigt eine Vorschau.' },
      { n: '4', t: 'JSON importieren', d: 'Auf editor.resqdocs.app einfügen — fertig.' },
    ],
    fbTitle: 'Dein LLM kann die Doku nicht laden?',
    fbText: 'Manche Modelle (oft ChatGPT/Copilot) rufen keine URLs ab. Dann kopiere die Doku und füge sie nach dem Prompt ein:',
    copyDoc: 'Doku kopieren',
    docCopied: '✓ Doku kopiert',
    powerTitle: 'Für Vielnutzer',
    powerText: 'Lege den Prompt einmal als System-Anweisung in einem ChatGPT-Custom-GPT, Claude-Project oder Gemini-Gem an — dann brauchst du ihn nicht jedes Mal zu kopieren.',
    importTitle: 'Ergebnis importieren',
    importText: 'Öffne den Editor, „Importieren", füge das JSON ein. Passt die Format-Version nicht zu deiner App, sagt dir der Editor klar Bescheid.',
    openEditor: 'Editor öffnen',
    footer: 'Open Source · keine KI gehostet · keine Patientendaten',
  },
  en: {
    heading: 'Protocol templates with your LLM',
    sub: 'Copy the prompt into your own LLM (ChatGPT, Claude, Gemini). It loads the docs, asks you a few questions and gives you a finished protocol JSON for the editor. ResQDocs hosts no AI — your data stays with you.',
    privacy: 'Structure only, no patient data: the AI builds the empty template, never a case.',
    steps: [
      { n: '1', t: 'Copy the prompt', d: 'One click.' },
      { n: '2', t: 'Paste into your LLM', d: 'ChatGPT, Claude, Gemini — any of them.' },
      { n: '3', t: 'Answer the questions', d: 'The model guides you through title, sections, fields and shows a preview.' },
      { n: '4', t: 'Import the JSON', d: 'Paste it at editor.resqdocs.app — done.' },
    ],
    fbTitle: 'Your LLM cannot load the docs?',
    fbText: 'Some models (often ChatGPT/Copilot) do not fetch URLs. Then copy the docs and paste them after the prompt:',
    copyDoc: 'Copy the docs',
    docCopied: '✓ Docs copied',
    powerTitle: 'For power users',
    powerText: 'Set the prompt up once as a system instruction in a ChatGPT custom GPT, Claude project or Gemini gem — then you do not need to copy it every time.',
    importTitle: 'Import the result',
    importText: 'Open the editor, "Import", paste the JSON. If the format version does not match your app, the editor tells you clearly.',
    openEditor: 'Open the editor',
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
          <CodeEditorCard :code="prompt" :title="`prompt.${lang}.md`" :version="version?.token" />
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
        <button type="button" class="mt-3 rounded-lg border border-[color:var(--navy)]/20 px-4 py-2 text-sm font-medium transition hover:bg-[color:var(--navy)]/5" @click="copyDoc">
          {{ docCopied ? t.docCopied : t.copyDoc }}
        </button>
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
        <a href="https://editor.resqdocs.app" target="_blank" rel="noopener" class="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[color:var(--navy)] transition hover:bg-white/90">{{ t.openEditor }} →</a>
      </section>

      <footer class="mt-14 text-center text-xs text-[color:var(--navy)]/45">
        {{ t.footer }}<template v-if="badge"> · {{ badge }}</template>
      </footer>
    </main>
  </div>
</template>
