<script setup lang="ts">
/**
 * Vorlage exportieren/importieren (versioniertes JSON). Export mit Auswahl (Select, Default = aktive
 * Vorlage, folgt ihr bis zur manuellen Umstellung); der Pro-Vorlage-Export im Bibliotheks-Kebab teilt
 * sich die Share-Logik via useTemplateExport. Serialisierung/Validierung liegt rein + node-getestet in
 * rebuild/templateIO.ts. Import ergaenzt/ersetzt im geteilten Baum -> sofort in Editor UND Einsatz.
 */
import { ref, computed, watch, nextTick } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { useProtocolTree } from '@resqdocs/protocol-core-ui/useProtocolTree'
import { useTreeEditor } from '@resqdocs/protocol-core-ui/treeEditor'
import { exportTemplate } from '@resqdocs/protocol-core/templateIO'
import { detectAndParse, kindNoun } from '@resqdocs/protocol-core/importRouter'
import { shareTransfer, receiveTransfer, TransferError, type TransferTtl } from '@resqdocs/protocol-core/transferClient'
import QrCode from '@/components/QrCode.vue'
import QrScanOverlay from '@/components/QrScanOverlay.vue'
import { routeDetected } from '@/composables/useImportRouting'
import { useTemplateExport } from '@/composables/useTemplateExport'
import { useAppVersion } from '@/composables/useAppVersion'

// Optionaler Dev-Override der Transfer-Dienst-URL (sonst Default aus dem Client).
const transferCfg = (import.meta.env.VITE_TRANSFER_URL as string | undefined)
  ? { baseUrl: import.meta.env.VITE_TRANSFER_URL as string }
  : undefined

const tree = useProtocolTree()
const { root } = tree
const protocols = tree.protocols
const editor = useTreeEditor()
// ?v=<echte App-Version> mitgeben -> die KI-Seite stempelt sie in den Prompt (Versions-Check ohne Rueckfrage).
const { version: appVersion } = useAppVersion()
const aiUrl = computed(() => `https://ai.resqdocs.app?v=${encodeURIComponent(appVersion.value)}`)

const mode = ref<'closed' | 'export' | 'import'>('closed')
const importText = ref('')
const msg = ref<{ kind: 'ok' | 'err'; text: string } | null>(null)
const copied = ref(false)
const { sharing, shareTemplate } = useTemplateExport()

// Export-Auswahl (B): welche Vorlage? Default = die aktive und folgt ihr, bis manuell umgestellt.
const selectedId = ref(root.value.id)
watch(() => root.value.id, (id) => { selectedId.value = id })
const selectedTemplate = computed<Container>(() => protocols.value.find((p) => p.id === selectedId.value) ?? root.value)
const exportJson = computed(() => exportTemplate(selectedTemplate.value))

function toggle(m: 'export' | 'import'): void {
  mode.value = mode.value === m ? 'closed' : m
  msg.value = null
}

// Direkte Sprungpunkte aus dem Vorlagen-Menue (LibraryBar): „Teilen" oeffnet den verschluesselten
// Link-Abschnitt, „Empfangen" den Empfangs-Abschnitt — bewusst getrennt vom Datei-Export/-Import.
// focus steuert, WELCHER Abschnitt sichtbar ist, damit jeder Einstieg NUR seine Sache zeigt:
// 'link' = verschluesselter Transfer (Teilen/Empfangen), 'file' = Datei/JSON (Export/Import), 'all' = beides.
const focus = ref<'all' | 'file' | 'link'>('all')
const shareSection = ref<HTMLElement | null>(null)
const receiveSection = ref<HTMLElement | null>(null)
/** Teilen (verschluesselter Link) fuer DIESE Vorlage. */
function openShare(): void {
  mode.value = 'export'; focus.value = 'link'; msg.value = null
  void nextTick(() => shareSection.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
/** Exportieren (Datei/JSON) fuer DIESE Vorlage. */
function openExport(): void {
  mode.value = 'export'; focus.value = 'file'; msg.value = null
}
/** Empfangen (verschluesselter Link) -> neue Vorlage. */
function openReceive(): void {
  mode.value = 'import'; focus.value = 'link'; msg.value = null
  void nextTick(() => receiveSection.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
}
/** Importieren (Datei/JSON) -> neue Vorlage. */
function openImportFile(): void {
  mode.value = 'import'; focus.value = 'file'; msg.value = null
}
defineExpose({ openShare, openExport, openReceive, openImportFile })

async function copyExport(): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportJson.value)
    copied.value = true
  } catch {
    copied.value = false
  }
  window.setTimeout(() => (copied.value = false), 2000)
}

async function downloadExport(): Promise<void> {
  const res = await shareTemplate(selectedTemplate.value)
  if (!res.ok && res.error) msg.value = { kind: 'err', text: 'Export fehlgeschlagen: ' + res.error }
}

// --- Übertragen (verschlüsselter Kurzzeit-Transfer, optional) ----------------------------------------
const TTL_LABELS: { value: TransferTtl; label: string }[] = [
  { value: 'burn', label: '1× lesen' },
  { value: '1h', label: '1 Stunde' },
  { value: '24h', label: '24 Stunden' },
  { value: '7d', label: '7 Tage' },
]
const ttl = ref<TransferTtl>('burn')
const shareBusy = ref(false)
const shareLink = ref<{ link: string; code: string } | null>(null)
const linkCopied = ref(false)

async function shareViaLink(): Promise<void> {
  shareBusy.value = true
  msg.value = null
  shareLink.value = null
  try {
    const r = await shareTransfer(exportJson.value, ttl.value, transferCfg)
    shareLink.value = { link: r.link, code: r.code }
  } catch (e) {
    msg.value = { kind: 'err', text: e instanceof TransferError ? e.message : 'Teilen fehlgeschlagen.' }
  } finally {
    shareBusy.value = false
  }
}
async function copyLink(): Promise<void> {
  if (!shareLink.value) return
  try {
    await navigator.clipboard.writeText(shareLink.value.link)
    linkCopied.value = true
    window.setTimeout(() => (linkCopied.value = false), 2000)
  } catch {
    /* Clipboard nicht verfügbar — Nutzer kann den Link manuell markieren. */
  }
}

const receiveText = ref('')
const receiveBusy = ref(false)
const qrScanOpen = ref(false)
function onQrDecoded(raw: string): void {
  qrScanOpen.value = false
  receiveText.value = raw
  void receiveViaLink() // gescannter Link -> derselbe Empfangs-Pfad wie eingefügt
}
async function receiveViaLink(): Promise<void> {
  receiveBusy.value = true
  msg.value = null
  try {
    const json = await receiveTransfer(receiveText.value, transferCfg)
    // Den entschlüsselten Klartext ZUERST in die Import-Textarea legen: schlägt die Erkennung fehl
    // (z. B. neuere Schema-Version), geht er NICHT verloren — das Burn-Blob ist serverseitig schon weg.
    // Bei Erfolg räumt load() importText selbst wieder ab.
    importText.value = json
    mode.value = 'import'
    receiveText.value = ''
    await load(json)
  } catch (e) {
    msg.value = { kind: 'err', text: e instanceof TransferError ? e.message : 'Empfangen fehlgeschlagen.' }
  } finally {
    receiveBusy.value = false
  }
}

const pendingImport = ref<{ tree: Container; existingId: string; name: string } | null>(null)

function finishImport(added: Container): void {
  editor.selectProtocol(added.id)
  msg.value = { kind: 'ok', text: 'Vorlage importiert.' }
  importText.value = ''
  mode.value = 'closed'
}
const loadBusy = ref(false)
async function load(text: string): Promise<void> {
  if (loadBusy.value) return // Doppelklick-Schutz (routeDetected speichert async -> sonst Duplikat)
  loadBusy.value = true
  try {
    await runLoad(text)
  } finally {
    loadBusy.value = false
  }
}
async function runLoad(text: string): Promise<void> {
  // Schema-erkennend: eine hier eingeworfene Baustein-/Snippet-Datei landet trotzdem am richtigen Ort.
  const r = detectAndParse(text)
  if (!r.ok) {
    msg.value = { kind: 'err', text: (r.kind ? `${kindNoun(r.kind)} erkannt, aber ` : '') + r.error }
    return
  }
  if (r.kind === 'protocol') {
    // Vorlage: Ueberschreiben NUR bei Namensgleichheit (das, was der Nutzer sieht). Die interne id
    // kollidiert geraeteuebergreifend zufaellig (Default-Vorlage = id 'protokoll') und darf NIE
    // Ueberschreiben ausloesen — sonst wuerde eine anders benannte Vorlage still zerstoert. Kein
    // Namens-Treffer -> als NEUE Vorlage (kollisionssicher) -> nie Datenverlust, hoechstens eine Dublette.
    const target = tree.resolveImportTarget(r.tree)
    if (target.mode === 'overwrite') {
      pendingImport.value = { tree: r.tree, existingId: target.existingId, name: target.name }
      return
    }
    finishImport(tree.importProtocol(r.tree))
    return
  }
  // Baustein/Snippet: zentral ans richtige Ziel (landet in der Bausteine-Bibliothek).
  const outcome = await routeDetected(r)
  msg.value = { kind: outcome.ok ? 'ok' : 'err', text: outcome.message }
  if (outcome.ok) {
    importText.value = ''
    mode.value = 'closed'
  }
}
function doOverwrite(): void {
  const p = pendingImport.value
  if (p) finishImport(tree.overwriteProtocolById(p.existingId, p.tree))
  pendingImport.value = null
}
function doRename(): void {
  if (pendingImport.value) finishImport(tree.importProtocol(pendingImport.value.tree, true))
  pendingImport.value = null
}
function cancelImport(): void {
  pendingImport.value = null
}

function onFile(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => load(String(reader.result ?? ''))
  reader.readAsText(file)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="focus === 'all'" class="flex flex-wrap justify-center gap-2">
      <button class="btn btn-sm" type="button" :class="mode === 'export' ? 'btn-primary' : ''" @click="toggle('export')">Exportieren</button>
      <button class="btn btn-sm" type="button" :class="mode === 'import' ? 'btn-primary' : ''" @click="toggle('import')">Importieren</button>
    </div>

    <div v-if="mode === 'export'" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs font-semibold text-base-content/60">Welche Vorlage?</span>
        <select v-model="selectedId" class="select select-sm w-full" aria-label="Vorlage wählen">
          <option v-for="p in protocols" :key="p.id" :value="p.id">{{ (p.title && p.title.trim()) || p.id }}</option>
        </select>
      </label>
      <div v-if="focus !== 'link'" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-base-content/60">Exportieren — als Datei/JSON</span>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-xs" type="button" @click="copyExport">{{ copied ? 'Kopiert' : 'JSON kopieren' }}</button>
            <button class="btn btn-ghost btn-xs" type="button" :disabled="sharing" @click="downloadExport">Als Datei</button>
          </div>
        </div>
        <pre class="max-h-60 overflow-auto rounded bg-base-200 p-2 text-xs"><code>{{ exportJson }}</code></pre>
      </div>

      <!-- Verschlüsselter Kurzzeit-Transfer: erzeugt einen Link, der die Vorlage verschlüsselt beim
           Dienst ablegt. Der Schlüssel steckt im Link selbst (nicht beim Server). -->
      <div v-if="focus !== 'file'" ref="shareSection" :class="['flex flex-col gap-2', focus === 'all' ? 'border-t border-base-300 pt-2' : '']">
        <span class="text-xs font-semibold text-primary">Teilen — verschlüsselter Link + QR</span>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-1 text-xs font-semibold text-base-content/60">
            Gültig
            <select v-model="ttl" class="select select-xs" aria-label="Gültigkeit des Transfer-Links">
              <option v-for="o in TTL_LABELS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button class="btn btn-primary btn-xs" type="button" :disabled="shareBusy" @click="shareViaLink">
            {{ shareBusy ? 'Erstelle …' : 'Link erstellen' }}
          </button>
        </div>
        <div v-if="shareLink" class="flex flex-col items-stretch gap-1 rounded bg-base-200 p-2">
          <div class="flex items-center gap-2">
            <input :value="shareLink.link" readonly class="input input-xs w-full font-mono" aria-label="Transfer-Link" />
            <button class="btn btn-ghost btn-xs" type="button" @click="copyLink">{{ linkCopied ? 'Kopiert' : 'Kopieren' }}</button>
          </div>
          <!-- QR zum Abscannen mit einem anderen Gerät (trägt nur den Link, keine Nutzdaten). -->
          <div class="flex justify-center py-1">
            <QrCode :value="shareLink.link" :size="180" />
          </div>
          <p class="text-xs text-warning">
            Der Link ist wie ein Passwort — wer ihn hat, kann die Vorlage öffnen. Er läuft ab und wird dann
            gelöscht; „1× lesen" verfällt nach dem ersten Öffnen.
          </p>
        </div>
      </div>
    </div>

    <div v-if="mode === 'import'" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
      <div v-if="focus !== 'link'" class="flex flex-col gap-2">
        <span class="text-xs font-semibold text-base-content/60">Importieren — aus Datei/JSON</span>
        <textarea v-model="importText" rows="5" class="textarea textarea-bordered w-full text-xs" placeholder='{"schema":"resqdocs-protocol","version":1,"tree":{ ... }}'></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primary btn-sm" type="button" :disabled="!importText.trim() || loadBusy || receiveBusy" @click="load(importText)">Laden</button>
          <input type="file" accept="application/json,.json" class="file-input file-input-sm" @change="onFile" />
        </div>
        <p class="text-xs text-base-content/50">Wird als neue Vorlage importiert — bei gleicher Kennung wird gefragt.</p>
      </div>

      <!-- Per Transfer-Link empfangen: entschlüsselt lokal und läuft durch dieselbe Erkennung wie ein Import.
           Zwei klar getrennte Wege — Link einfügen ODER QR scannen (Scan empfängt sofort, kein zweiter Tap). -->
      <div v-if="focus !== 'file'" ref="receiveSection" :class="['flex flex-col gap-2', focus === 'all' ? 'border-t border-base-300 pt-2' : '']">
        <span class="text-xs font-semibold text-primary">Empfangen — verschlüsselter Link + QR</span>
        <div class="flex items-center gap-2">
          <input
            v-model="receiveText"
            class="input input-bordered input-sm w-full font-mono text-xs"
            placeholder="https://transfer.resqdocs.app/#…"
            aria-label="Transfer-Link einfügen"
          />
          <button class="btn btn-primary btn-sm" type="button" :disabled="!receiveText.trim() || receiveBusy" @click="receiveViaLink">
            {{ receiveBusy ? 'Lade …' : 'Empfangen' }}
          </button>
        </div>
        <div class="divider my-0 text-xs text-base-content/40">oder</div>
        <button
          class="btn btn-outline btn-sm min-h-11 w-full gap-2"
          type="button"
          :disabled="receiveBusy"
          @click="qrScanOpen = true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="h-5 w-5 shrink-0" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 8.25V6A2.25 2.25 0 0 1 6 3.75h2.25M15.75 3.75H18A2.25 2.25 0 0 1 20.25 6v2.25M20.25 15.75V18A2.25 2.25 0 0 1 18 20.25h-2.25M8.25 20.25H6A2.25 2.25 0 0 1 3.75 18v-2.25" />
            <path stroke-linecap="round" d="M7.5 12h9" />
          </svg>
          QR-Code scannen
        </button>
      </div>
      <!-- Erfolgskette rueckwaerts (#261): Vorlagen entstehen auch per eigenem LLM auf ai.resqdocs.app. -->
      <p class="text-xs text-base-content/50">
        Tipp: Auf
        <a :href="aiUrl" target="_blank" rel="noopener" class="link link-primary">ai.resqdocs.app</a>
        erstellst du Vorlagen mit deinem eigenen KI-Assistenten.
      </p>
    </div>

    <p v-if="msg" class="text-xs" :class="msg.kind === 'ok' ? 'text-success' : 'text-error'">{{ msg.text }}</p>

    <!-- QR-Scanner für den Empfang eines Transfer-Links (Vollbild-Overlay). -->
    <QrScanOverlay v-if="qrScanOpen" @decoded="onQrDecoded" @cancel="qrScanOpen = false" />

    <!-- Kollision: Vorlage mit gleicher Kennung existiert -> ueberschreiben oder als neue importieren -->
    <div class="modal" :class="{ 'modal-open': pendingImport !== null }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <h3 class="text-base font-semibold">Vorlage existiert bereits</h3>
        <p class="py-3 text-sm">Es gibt schon eine Vorlage mit dem Namen <strong>{{ pendingImport?.name }}</strong>. Überschreiben oder als neue Vorlage importieren?</p>
        <div class="modal-action flex-wrap">
          <button type="button" class="btn btn-ghost btn-sm" @click="cancelImport">Abbrechen</button>
          <button type="button" class="btn btn-sm" @click="doRename">Als neue importieren</button>
          <button type="button" class="btn btn-error btn-sm" @click="doOverwrite">Überschreiben</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="cancelImport"></button>
    </div>
  </div>
</template>
