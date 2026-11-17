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
import { exportTemplates } from '@resqdocs/protocol-core/templateIO'
import { detectAndParse, kindNoun } from '@resqdocs/protocol-core/importRouter'
import { shareTransfer, receiveTransfer, TransferError, type TransferTtl } from '@resqdocs/protocol-core/transferClient'
import QrCode from '@/components/QrCode.vue'
import CodeScanOverlay from '@/components/CodeScanOverlay.vue'
import { QR_PROFILE } from '@/medplan/scanProfiles'
import { routeDetected } from '@/composables/useImportRouting'
import { useTemplateExport } from '@/composables/useTemplateExport'
import { useAppVersion } from '@/composables/useAppVersion'
import { incomingOpen, takeIncomingOpen } from '@/composables/useIncomingOpen'
import { offerImport } from '@/composables/useImportChoice'
import { readIncomingFile, discardIncomingFile } from '@/utils/fileTransfer'

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
const { sharing, shareTemplates } = useTemplateExport()

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
const exportJson = computed(() => (selectedTemplates.value.length ? exportTemplates(selectedTemplates.value) : ''))

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
  const res = await shareTemplates(selectedTemplates.value)
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

// Von aussen geoeffnet (angetippter Link / geteilte Datei, useIncomingOpen): NIE ohne Nachfrage abrufen
// oder importieren - ein „1× lesen"-Link waere sonst unbemerkt verbraucht. Bestaetigt laeuft es durch
// dieselben Pfade wie Einfuegen bzw. Datei-Import (inkl. Ueberschreiben-Dialog).
const incomingBusy = ref(false)
async function confirmIncoming(): Promise<void> {
  const item = takeIncomingOpen()
  if (!item) return
  if (item.kind === 'transfer') {
    receiveText.value = item.link
    await receiveViaLink()
    return
  }
  incomingBusy.value = true
  msg.value = null
  mode.value = 'import'
  try {
    const text = await readIncomingFile(item.url)
    importText.value = text
    await load(text)
  } catch {
    msg.value = { kind: 'err', text: 'Die Datei konnte nicht gelesen werden.' }
  } finally {
    incomingBusy.value = false
  }
}
function cancelIncoming(): void {
  const item = takeIncomingOpen()
  if (item?.kind === 'file') void discardIncomingFile(item.url)
}

/** Nach dem Übernehmen im ImportChoiceDialog: erste Vorlage öffnen, Import-Feld leeren. Bis dahin bleibt der
 *  empfangene Text im Feld stehen - bricht der Nutzer ab, geht ein schon verbrauchter „1× lesen“-Link nicht verloren. */
function afterImport(added: Container[]): void {
  if (added[0]) editor.selectProtocol(added[0].id)
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
  if (r.kind === 'protocol' || r.kind === 'bundle') {
    // Vorlage(n): Name wählen, bei Namensgleichheit überschreiben oder als neue Vorlage - im ImportChoiceDialog
    // Überschrieben wird nur auf ausdrückliche Wahl; Standard ist „als neue Vorlage“.
    msg.value = null
    offerImport(r.kind === 'bundle' ? r.trees : [r.tree], afterImport)
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
      <!-- Auswahl: eine oder mehrere Vorlagen. Mehrere gehen als Sammlung über Datei, Link und QR. -->
      <fieldset class="flex flex-col gap-1" data-export-selection>
        <div class="flex items-center justify-between gap-2">
          <legend class="text-xs font-semibold text-base-content/60">Welche Vorlagen?</legend>
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
            <span class="min-w-0 flex-1 truncate text-sm">{{ (p.title && p.title.trim()) || p.id }}</span>
          </label>
        </div>
        <p v-if="!selectedTemplates.length" class="text-xs text-warning">Mindestens eine Vorlage wählen.</p>
        <p v-else-if="selectedTemplates.length > 1" class="text-xs text-base-content/60">
          {{ selectedTemplates.length }} Vorlagen gehen zusammen raus. Ältere ResQDocs-Versionen können nur einzelne Vorlagen empfangen.
        </p>
      </fieldset>
      <div v-if="focus !== 'link'" class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-semibold text-base-content/60">Exportieren — als Datei/JSON</span>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-xs" type="button" :disabled="!selectedTemplates.length" @click="copyExport">{{ copied ? 'Kopiert' : 'JSON kopieren' }}</button>
            <button class="btn btn-ghost btn-xs" type="button" :disabled="sharing || !selectedTemplates.length" @click="downloadExport">Als Datei</button>
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
          <button class="btn btn-primary btn-xs" type="button" :disabled="shareBusy || !selectedTemplates.length" @click="shareViaLink">
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
          <button class="btn btn-primary btn-sm" type="button" :disabled="!importText.trim() || loadBusy || receiveBusy || incomingBusy" @click="load(importText)">Laden</button>
          <input type="file" accept="application/json,.json" class="file-input file-input-sm" @change="onFile" />
        </div>
        <p class="text-xs text-base-content/50">Wird als neue Vorlage importiert — bei gleichem Namen wird gefragt.</p>
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
      <!-- Erfolgskette rueckwaerts: Vorlagen entstehen auch per eigenem LLM auf ai.resqdocs.app. -->
      <p class="text-xs text-base-content/50">
        Tipp: Auf
        <a :href="aiUrl" target="_blank" rel="noopener" class="link link-primary">ai.resqdocs.app</a>
        erstellst du Vorlagen mit deinem eigenen KI-Assistenten.
      </p>
    </div>

    <p v-if="msg" class="text-xs" :class="msg.kind === 'ok' ? 'text-success' : 'text-error'">{{ msg.text }}</p>

    <!-- QR-Scanner für den Empfang eines Transfer-Links (Vollbild-Overlay). -->
    <CodeScanOverlay v-if="qrScanOpen" :profile="QR_PROFILE" @decoded="onQrDecoded($event.text)" @cancel="qrScanOpen = false" />

    <!-- Beide Rueckfragen per Teleport an body: TemplateIO sitzt im Daten-Blatt (.modal-bottom), dessen
         Regeln sonst auf die verschachtelte modal-box durchschlagen (unten angeklebt, eckig, eingerueckt). -->
    <Teleport to="body">
    <!-- Von aussen geoeffnet: angetippter Transfer-Link oder geteilte Datei -> erst nachfragen -->
    <div class="modal" :class="{ 'modal-open': incomingOpen !== null }" role="dialog" aria-modal="true">
      <div class="modal-box">
        <template v-if="incomingOpen?.kind === 'file'">
          <h3 class="text-base font-semibold">Datei importieren?</h3>
          <p class="py-3 text-sm"><strong class="break-all">{{ incomingOpen.name }}</strong> wird gelesen und importiert. Gibt es schon eine Vorlage mit gleichem Namen, wird vorher gefragt.</p>
        </template>
        <template v-else>
          <h3 class="text-base font-semibold">Link empfangen?</h3>
          <p class="py-3 text-sm">Der Inhalt wird abgerufen und auf diesem Gerät entschlüsselt. Ein Link mit der Einstellung „1× lesen“ ist danach verbraucht.</p>
        </template>
        <div class="modal-action flex-wrap">
          <button type="button" class="btn btn-ghost btn-sm" @click="cancelIncoming">Abbrechen</button>
          <button type="button" class="btn btn-primary btn-sm" @click="confirmIncoming">{{ incomingOpen?.kind === 'file' ? 'Importieren' : 'Empfangen' }}</button>
        </div>
      </div>
      <button type="button" class="modal-backdrop" aria-label="Abbrechen" @click="cancelIncoming"></button>
    </div>

    </Teleport>
  </div>
</template>
