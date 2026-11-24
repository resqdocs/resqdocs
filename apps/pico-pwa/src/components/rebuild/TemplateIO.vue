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
import { templateLabel } from '@resqdocs/protocol-core-ui/nodeLabel'
import { useTreeEditor } from '@resqdocs/protocol-core-ui/treeEditor'
import { exportCollection, describeCollection } from '@resqdocs/protocol-core/collectionIO'
import ShareExtrasPick from '@resqdocs/protocol-core-ui/components/ShareExtrasPick.vue'
import { useBlockLibrary } from '@resqdocs/protocol-core-ui/useBlockLibrary'
import { useBausteine } from '@/composables/useBausteine'
import { detectAndParse, kindNoun } from '@resqdocs/protocol-core/importRouter'
import { shareTransfer, openTransfer, TransferError, type OpenedTransfer, type TransferTtl } from '@resqdocs/protocol-core/transferClient'
import QrCode from '@/components/QrCode.vue'
import ShortLinkToggle from '@resqdocs/protocol-core-ui/components/ShortLinkToggle.vue'
import { useShortLink } from '@resqdocs/protocol-core-ui/useShortLink'
import CodeScanOverlay from '@/components/CodeScanOverlay.vue'
import { QR_PROFILE } from '@/medplan/scanProfiles'
import { routeDetected } from '@/composables/useImportRouting'
import { useTemplateExport } from '@/composables/useTemplateExport'
import { useAppVersion } from '@/composables/useAppVersion'
import { takeIncomingOpen } from '@/composables/useIncomingOpen'
import { offerImport, offerCollection } from '@/composables/useImportChoice'
import { readIncomingFile } from '@/utils/fileTransfer'
import { ohneEigeneVorlage } from './aiToolHint'

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
const { sharing, shareCollection } = useTemplateExport()

// Export-Auswahl: eine oder mehrere Vorlagen. Default = die aktive und folgt ihr, solange nur eine
// gewählt ist. Mehrere = Sammlung (Datei, Link und QR); eine = Einzelformat, das auch ältere Apps lesen.
const selectedIds = ref<string[]>([root.value.id])
watch(() => root.value.id, (id) => { if (selectedIds.value.length <= 1) selectedIds.value = [id] })
// In der Reihenfolge der Bibliothek, nicht der Klick-Reihenfolge; gelöschte Vorlagen fallen heraus.
const selectedTemplates = computed<Container[]>(() => protocols.value.filter((p) => selectedIds.value.includes(p.id)))
const allSelected = computed(() => selectedTemplates.value.length === protocols.value.length)
function toggleSelected(id: string, on: boolean): void {
  selectedIds.value = on ? [...new Set([...selectedIds.value, id])] : selectedIds.value.filter((x) => x !== id)
  shareLink.value = null // ein alter Link passt nicht mehr zur Auswahl
}
function toggleAllSelected(): void {
  selectedIds.value = allSelected.value ? [root.value.id] : protocols.value.map((p) => p.id)
  shareLink.value = null
}
// Zusätzlich gespeicherte Abschnitte und Textbausteine mitgeben (Häkchen, Standard aus). Alles zusammen geht als
// eine Sammlung über Datei, Link und QR; auch ohne Vorlage möglich.
const blockLib = useBlockLibrary()
const bausteine = useBausteine()
const withBlocks = ref(false)
const withSnippets = ref(false)
const blockIds = ref<string[]>([])
const snippetIds = ref<string[]>([])
const selectedBlocks = computed<Container[]>(() => (withBlocks.value ? blockLib.blocks.value.filter((b) => blockIds.value.includes(b.id)) : []))
const selectedSnippets = computed(() =>
  withSnippets.value ? bausteine.snippets.value.filter((s) => snippetIds.value.includes(s.id) && s.text.trim()).map((s) => ({ title: s.title, text: s.text })) : [],
)
const selectedCount = computed(() => selectedTemplates.value.length + selectedBlocks.value.length + selectedSnippets.value.length)
const mitExtras = computed(() => selectedBlocks.value.length + selectedSnippets.value.length > 0)
watch([withBlocks, withSnippets, blockIds, snippetIds], () => { shareLink.value = null })
watch(mode, (m) => {
  // Für die Auswahl die Bibliotheken laden (TemplateIO kann vor dem Bausteine-Tab geöffnet werden).
  if (m !== 'export') return
  if (!blockLib.loaded.value) void blockLib.reload().catch(() => {})
  if (!bausteine.loaded.value) void bausteine.reload().catch(() => {})
})
const exportJson = computed(() =>
  selectedCount.value ? exportCollection({ templates: selectedTemplates.value, blocks: selectedBlocks.value, snippets: selectedSnippets.value }) : '',
)

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
defineExpose({ openShare, openExport, openReceive, openImportFile, acceptIncoming, loadFile })
// Vorlage(n) übernommen: Das Ergebnis meldet das Übernehmen-Fenster; das Blatt „Daten“ hat dann nichts mehr zu zeigen.
const emit = defineEmits<{ imported: [] }>()

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
  const res = await shareCollection({ templates: selectedTemplates.value, blocks: selectedBlocks.value, snippets: selectedSnippets.value })
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
const shareLink = ref<{ link: string; code: string; deleteToken: string } | null>(null)
const linkCopied = ref(false)
const { short: shortWanted, shortBusy, shortError, shownLink, displayLink, displayLabel, isCode, copyFailed, copyShown } = useShortLink(() => shareLink.value, transferCfg)

async function shareViaLink(): Promise<void> {
  shareBusy.value = true
  msg.value = null
  shareLink.value = null
  try {
    const r = await shareTransfer(exportJson.value, ttl.value, transferCfg)
    shareLink.value = { link: r.link, code: r.code, deleteToken: r.deleteToken }
  } catch (e) {
    msg.value = { kind: 'err', text: e instanceof TransferError ? e.message : 'Teilen fehlgeschlagen.' }
  } finally {
    shareBusy.value = false
  }
}
async function copyLink(): Promise<void> {
  if (!shareLink.value) return
  try {
    await copyShown()
    linkCopied.value = true
    window.setTimeout(() => (linkCopied.value = false), 2000)
  } catch {
    /* Zwischenablage nicht verfügbar: der ganze Link wird unter dem Feld eingeblendet (copyFailed). */
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
// Per Link geholter Inhalt, der noch nicht übernommen ist. Ein „1× lesen“-Link ist bis dahin nur für dieses Gerät
// reserviert: Übernehmen verbraucht ihn, Abbrechen gibt ihn wieder frei.
// Jeder Import bekommt SEINEN Link mit (Parameter l): ein späterer Abruf oder Import darf weder den falschen Link
// verbrauchen noch das Feld eines neueren Inhalts leeren.
let link: OpenedTransfer | null = null
function linkHint(l: OpenedTransfer | null): string | undefined {
  return l && l.priorOpens > 0 ? 'Dieser Link wurde vorher schon einmal geöffnet, aber nicht übernommen.' : undefined
}
function consumeLink(l: OpenedTransfer | null): void {
  if (link === l) link = null
  void l?.consume()
}
async function releaseLink(l: OpenedTransfer | null): Promise<void> {
  if (!l) return
  if (link === l) link = null
  // Freigegeben: der Link gilt wieder, der Inhalt muss hier nicht liegen bleiben. Das Feld nur anfassen, wenn dort
  // noch der Inhalt DIESES Links steht (nicht der eines neueren Abrufs oder einer Datei).
  const released = l.reserved && (await l.release())
  if (importText.value !== l.text) return
  if (released) {
    importText.value = ''
    return
  }
  // Schon verbraucht (älterer Transfer-Dienst) oder offline: den Inhalt zum späteren „Laden“ zeigen.
  if (focus.value === 'link') focus.value = 'file'
}

async function receiveViaLink(incoming = false): Promise<void> {
  receiveBusy.value = true
  msg.value = null
  try {
    // Ein noch offener früherer Abruf wird zuerst freigegeben (abwarten: derselbe Link wäre sonst noch reserviert).
    await releaseLink(link)
    link = await openTransfer(receiveText.value, transferCfg)
    const json = link.text
    // Den entschlüsselten Klartext ZUERST in die Import-Textarea legen: schlägt die Erkennung fehl
    // (z. B. neuere Schema-Version), geht er NICHT verloren — das Burn-Blob ist serverseitig schon weg.
    // Bei Erfolg räumt load() importText selbst wieder ab.
    importText.value = json
    mode.value = 'import'
    receiveText.value = ''
    await load(json, incoming)
  } catch (e) {
    msg.value = { kind: 'err', text: e instanceof TransferError ? e.message : 'Empfangen fehlgeschlagen.' }
  } finally {
    receiveBusy.value = false
  }
}

// Von aussen geoeffnet (angetippter Link / geteilte Datei, useIncomingOpen): gleich abrufen bzw. lesen, das
// Antippen war die Entscheidung. Importiert wird erst nach „übernehmen“ im ImportChoiceDialog, auch bei einem
// einzelnen gespeicherten Abschnitt oder Textbaustein. Ein „1× lesen“-Link gilt erst dann als geöffnet.
const incomingBusy = ref(false)
async function acceptIncoming(): Promise<void> {
  const item = takeIncomingOpen()
  if (!item) return
  if (item.kind === 'transfer') {
    receiveText.value = item.link
    await receiveViaLink(true)
    return
  }
  incomingBusy.value = true
  msg.value = null
  mode.value = 'import'
  try {
    const text = await readIncomingFile(item.url)
    importText.value = text
    await load(text, true)
  } catch {
    msg.value = { kind: 'err', text: 'Die Datei konnte nicht gelesen werden.' }
  } finally {
    incomingBusy.value = false
  }
}

/** Nach dem Übernehmen im ImportChoiceDialog: erste Vorlage öffnen, Import-Feld leeren. Bis dahin bleibt der
 *  empfangene Text im Feld stehen - bricht der Nutzer ab, geht ein schon verbrauchter „1× lesen“-Link nicht verloren. */
function afterImport(added: Container[], l: OpenedTransfer | null): void {
  consumeLink(l)
  if (added[0]) editor.selectProtocol(added[0].id)
  importText.value = ''
  mode.value = 'closed'
  emit('imported')
}
const loadBusy = ref(false)
async function load(text: string, incoming = false): Promise<void> {
  if (loadBusy.value) return // Doppelklick-Schutz (routeDetected speichert async -> sonst Duplikat)
  loadBusy.value = true
  try {
    await runLoad(text, incoming)
  } finally {
    loadBusy.value = false
  }
}
async function runLoad(text: string, incoming: boolean): Promise<void> {
  // Schema-erkennend: eine hier eingeworfene Baustein-/Snippet-Datei landet trotzdem am richtigen Ort.
  // Gehört der Text zum zuletzt geöffneten Link? Wenn nicht (Datei, eingefügter oder geänderter Text), hat der Link
  // mit diesem Import nichts zu tun und wird freigegeben statt später verbraucht.
  const mine = link && link.text === text ? link : null
  if (link && !mine) await releaseLink(link)
  const r = detectAndParse(text)
  if (!r.ok) {
    msg.value = { kind: 'err', text: (r.kind ? `${kindNoun(r.kind)} erkannt, aber ` : '') + r.error }
    await releaseLink(mine)
    return
  }
  const extras = { onCancel: () => void releaseLink(mine), hint: linkHint(mine) }
  const done = (added: Container[]): void => afterImport(added, mine)
  if (r.kind === 'protocol' || r.kind === 'bundle') {
    // Vorlage(n): Name wählen, bei Namensgleichheit überschreiben oder als neue Vorlage - im ImportChoiceDialog
    // Überschrieben wird nur auf ausdrückliche Wahl; Standard ist „als neue Vorlage“.
    msg.value = null
    if (r.kind === 'bundle') offerCollection(r, done, extras) // auch gespeicherte Abschnitte und Textbausteine
    else offerImport([r.tree], done, extras)
    return
  }
  // Von aussen gekommen: auch ein einzelner gespeicherter Abschnitt oder Textbaustein erst nach „übernehmen“.
  if (incoming) {
    msg.value = null
    offerCollection({ trees: [], blocks: r.kind === 'block' ? [r.tree] : [], snippets: r.kind === 'snippet' ? [r.snippet] : [] }, done, extras)
    return
  }
  // Baustein/Snippet: zentral ans richtige Ziel (landet in der Bausteine-Bibliothek).
  const outcome = await routeDetected(r)
  if (outcome.ok) consumeLink(mine)
  else await releaseLink(mine)
  msg.value = { kind: outcome.ok ? 'ok' : 'err', text: outcome.message }
  if (outcome.ok) {
    importText.value = ''
    mode.value = 'closed'
  }
}

function onFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // dieselbe Datei lässt sich danach erneut wählen
  if (file) loadFile(file)
}
/** Gewählte Datei lesen und wie eingefügten Text importieren (auch aus der Dateiauswahl der Vorlagenliste). */
function loadFile(file: File): void {
  msg.value = null
  const reader = new FileReader()
  reader.onload = () => load(String(reader.result ?? ''))
  reader.onerror = () => (msg.value = { kind: 'err', text: 'Die Datei konnte nicht gelesen werden.' })
  reader.readAsText(file)
}
const fileInput = ref<HTMLInputElement | null>(null)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-if="focus === 'all'" class="flex flex-wrap justify-center gap-2">
      <button class="btn btn-sm" type="button" :class="mode === 'export' ? 'btn-primary' : ''" @click="toggle('export')">Exportieren</button>
      <button class="btn btn-sm" type="button" :class="mode === 'import' ? 'btn-primary' : ''" @click="toggle('import')">Importieren</button>
    </div>

    <div v-if="mode === 'export'" class="flex flex-col gap-2 rounded-lg border border-base-300 p-3">
      <!-- Auswahl: eine oder mehrere Vorlagen. Mehrere gehen als Sammlung über Datei, Link und QR. -->
      <fieldset class="flex min-w-0 flex-col gap-1" data-export-selection>
        <div class="flex items-center justify-between gap-2">
          <legend class="text-xs font-semibold text-base-content/75">Welche Vorlagen?</legend>
          <button v-if="protocols.length > 1" class="btn btn-ghost btn-xs" type="button" @click="toggleAllSelected">
            {{ allSelected ? 'Nur aktive' : 'Alle' }}
          </button>
        </div>
        <div class="flex max-h-48 flex-col overflow-y-auto rounded border border-base-300">
          <label v-for="p in protocols" :key="p.id" class="flex min-h-11 cursor-pointer items-center gap-3 border-b border-base-200 px-3 last:border-b-0">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              :checked="selectedIds.includes(p.id)"
              :data-export-pick="p.id"
              @change="toggleSelected(p.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="min-w-0 flex-1 truncate text-sm">{{ templateLabel(p) }}</span>
          </label>
        </div>
        <ShareExtrasPick
          v-model:block-ids="blockIds"
          v-model:snippet-ids="snippetIds"
          v-model:with-blocks="withBlocks"
          v-model:with-snippets="withSnippets"
          :blocks="blockLib.blocks.value"
          :snippets="bausteine.snippets.value"
        />
        <p v-if="!selectedCount" class="text-xs text-warning">Mindestens eine Vorlage, einen gespeicherten Abschnitt oder einen Textbaustein wählen.</p>
        <p v-else-if="selectedCount > 1" class="text-xs text-base-content/75">
          {{ describeCollection({ templates: selectedTemplates, blocks: selectedBlocks, snippets: selectedSnippets }) }} gehen zusammen raus.
          {{ mitExtras ? 'Zum Empfangen braucht die Gegenseite ResQDocs 2.1 oder neuer.' : 'Ältere ResQDocs-Versionen können nur einzelne Vorlagen empfangen.' }}
        </p>
      </fieldset>
      <div v-if="focus !== 'link'" class="flex flex-col gap-2">
        <!-- Darf umbrechen: bei 393 px passen Überschrift und beide Knöpfe nicht in eine Zeile („Als Datei“ ragte hinaus). -->
        <div class="flex flex-wrap items-center justify-between gap-x-2">
          <span class="min-w-0 text-xs font-semibold text-base-content/75">Exportieren — als Datei/JSON</span>
          <div class="ml-auto flex shrink-0 gap-1">
            <button class="btn btn-ghost btn-xs" type="button" :disabled="!selectedCount" @click="copyExport">{{ copied ? 'Kopiert' : 'JSON kopieren' }}</button>
            <button class="btn btn-ghost btn-xs" type="button" :disabled="sharing || !selectedCount" @click="downloadExport">Als Datei</button>
          </div>
        </div>
        <pre class="max-h-60 overflow-auto rounded bg-base-200 p-2 text-xs"><code>{{ exportJson }}</code></pre>
      </div>

      <!-- Verschlüsselter Kurzzeit-Transfer: erzeugt einen Link, der die Vorlage verschlüsselt beim
           Dienst ablegt. Der Schlüssel steckt im Link selbst (nicht beim Server). -->
      <div v-if="focus !== 'file'" ref="shareSection" :class="['flex flex-col gap-2', focus === 'all' ? 'border-t border-base-300 pt-2' : '']">
        <span class="text-xs font-semibold text-primary">Teilen — verschlüsselter Link & QR</span>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-1 text-xs font-semibold text-base-content/75">
            Gültig
            <select v-model="ttl" class="select select-xs" aria-label="Gültigkeit des Transfer-Links">
              <option v-for="o in TTL_LABELS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </label>
          <button class="btn btn-primary btn-xs" type="button" :disabled="shareBusy || !selectedCount" @click="shareViaLink">
            {{ shareBusy ? 'Erstelle …' : 'Link erstellen' }}
          </button>
        </div>
        <ShortLinkToggle v-model="shortWanted" :busy="shortBusy" :error="shortError" />
        <div v-if="shareLink" class="flex flex-col items-stretch gap-1 rounded bg-base-200 p-2">
          <div class="flex flex-col items-stretch gap-1">
            <input :value="displayLink" readonly class="input input-xs w-full font-mono" :class="isCode ? 'text-base! tracking-wider' : ''" :aria-label="displayLabel" data-share-link />
            <p v-if="copyFailed" class="select-all break-all font-mono text-xs" data-share-full-link>{{ shownLink }}</p>
            <button class="btn btn-ghost btn-sm min-h-11 self-end" type="button" @click="copyLink">{{ linkCopied ? 'Kopiert' : 'Kopieren' }}</button>
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
      <!-- Datei zuerst (Hauptweg), Einfügen als zweiter Weg. „Weiter“ führt zu „Vorlage übernehmen“. -->
      <div v-if="focus !== 'link'" class="flex flex-col gap-2">
        <span v-if="focus === 'all'" class="text-xs font-semibold text-base-content/75">Importieren — aus Datei/JSON</span>
        <button class="btn btn-primary min-h-11 w-full" type="button" :disabled="loadBusy || receiveBusy || incomingBusy" data-import-file @click="fileInput?.click()">Datei auswählen…</button>
        <input ref="fileInput" type="file" accept="application/json,.json" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFile" />
        <p class="text-xs text-base-content/75">Wird als neue Vorlage importiert — bei gleichem Namen wird gefragt.</p>
        <label class="pt-1 text-xs font-semibold text-base-content/75" for="template-import-text">Oder Text einfügen</label>
        <textarea id="template-import-text" v-model="importText" rows="5" class="textarea textarea-bordered w-full text-xs" placeholder="Inhalt der Datei oder Antwort des KI-Assistenten hier einfügen"></textarea>
        <button class="btn btn-sm min-h-11 self-end" type="button" :disabled="!importText.trim() || loadBusy || receiveBusy || incomingBusy" data-import-paste @click="load(importText)">Weiter</button>
      </div>

      <!-- Per Transfer-Link empfangen: entschlüsselt lokal und läuft durch dieselbe Erkennung wie ein Import.
           Zwei klar getrennte Wege — Link einfügen ODER QR scannen (Scan empfängt sofort, kein zweiter Tap). -->
      <div v-if="focus !== 'file'" ref="receiveSection" :class="['flex flex-col gap-2', focus === 'all' ? 'border-t border-base-300 pt-2' : '']">
        <span class="text-xs font-semibold text-primary">Empfangen — verschlüsselter Link & QR</span>
        <div class="flex items-center gap-2">
          <input
            v-model="receiveText"
            class="input input-bordered input-sm w-full font-mono text-xs"
            placeholder="Code, resq.li/… oder Transfer-Link"
            aria-label="Code oder Transfer-Link einfügen"
            autocapitalize="off"
            autocorrect="off"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="btn btn-primary btn-sm" type="button" :disabled="!receiveText.trim() || receiveBusy" @click="receiveViaLink()">
            {{ receiveBusy ? 'Lade …' : 'Empfangen' }}
          </button>
        </div>
        <div class="divider my-0 text-xs text-base-content/75">oder</div>
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
      <!-- Erfolgskette rueckwaerts: Vorlagen entstehen auch per eigenem LLM auf ai.resqdocs.app. Nur solange es keine
           Vorlage mit Inhalt gibt, wie die Karte über der Liste (sonst warb der Bildschirm zweimal dafür). -->
      <p v-if="ohneEigeneVorlage(protocols)" class="text-xs text-base-content/75">
        Tipp: Auf
        <a draggable="false" :href="aiUrl" target="_blank" rel="noopener" class="link link-primary">ai.resqdocs.app</a>
        erstellst du Vorlagen mit deinem eigenen KI-Assistenten.
      </p>
    </div>

    <p v-if="msg" class="text-xs" :class="msg.kind === 'ok' ? 'text-success' : 'text-error'">{{ msg.text }}</p>

    <!-- QR-Scanner für den Empfang eines Transfer-Links (Vollbild-Overlay). -->
    <CodeScanOverlay v-if="qrScanOpen" :profile="QR_PROFILE" @decoded="onQrDecoded($event.text)" @cancel="qrScanOpen = false" />

  </div>
</template>
