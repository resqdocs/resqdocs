<script setup lang="ts">
/** Eigenschaften des ausgewaehlten Knotens - Container ODER Feld. Liest die Auswahl aus der
 *  Tree-API, schreibt ueber reine Creator-Ops (tree.update). daisyUI-5 fieldset = Label oben,
 *  volle Breite. id-Umbenennen migriert den Einsatz-Wert (siehe EditorView.update). */
import { computed, ref, watch } from 'vue'
import type { Container, Node, Heading, FunctionConfig } from '@resqdocs/protocol-core/model'
import { DEFAULT_HEADING, DEFAULT_SEPARATOR } from '@resqdocs/protocol-core/model'
import { FUNCTION_REGISTRY } from '@resqdocs/protocol-core/functions/registry'
import { findNode, findPath, suggestFreeId } from '@resqdocs/protocol-core/creator'
import { sanitizeId } from '@resqdocs/protocol-core/ids'
import { appendOptions } from '@resqdocs/protocol-core/optionList'
import { useTreeEditor } from '../treeEditor.ts'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{ root: Container }>()
const tree = useTreeEditor()

const node = computed<Node | null>(() => (tree.selectedId.value ? findNode(props.root, tree.selectedId.value) : null))
const heading = computed<Heading>(() => ({ ...DEFAULT_HEADING, ...(node.value?.heading ?? {}) }))
const isRoot = computed(() => !!node.value && node.value.id === props.root.id)
// Grundvoraussetzung fuer ALLE Titel-Format-Optionen: ein nicht-leerer Titel. Ohne Titel gibt es keine
// Ueberschrift zu gestalten -> die Optionen werden AUSGEBLENDET (v-if), NICHT geleert. Die gesetzten Werte
// bleiben im Modell und sind wieder editierbar, sobald ein Titel da ist. Nur-Whitespace zaehlt als leer.
const hasTitle = computed(() => !!node.value?.title?.trim())
// Listen-Funktion (Medikamentenplan/Aerzte) = mehrzeilige Zeilen-Liste -> bekommt das Zeilen-Format.
// Quelle: Registry-Marker singleLine (Score wie Pack-Years/NEWS2 = einzeilig -> keine Liste; unbekannt ->
// keine Liste). Titel/inline/Banner sind bei ALLEN Knoten identisch (bewusst, fuer die Wiedererkennung):
// inline verhaelt sich wie beim Feld - Default Block, explizit waehlbar (auch fuer Listen, 2026-07-03).
const isListFunction = computed(() => {
  const n = node.value
  const def = n?.type === 'function' ? FUNCTION_REGISTRY[n.functionKind] : undefined
  return !!def && !def.singleLine
})

// Feld-Trenner ist VERERBBAR: ein Container ohne eigenen separator erbt vom naechsten Vorfahren
// (sonst DEFAULT_SEPARATOR). Pro Container aktiv ueberschreiben = Wert eintragen; leer = erben.
const inheritedSeparator = computed<string>(() => {
  if (!node.value) return DEFAULT_SEPARATOR
  const path = findPath(props.root, node.value.id)
  for (let i = path.length - 2; i >= 0; i--) {
    const n = path[i]
    if (n.type === 'container' && typeof n.separator === 'string') return n.separator
  }
  return DEFAULT_SEPARATOR
})
const ownSeparator = computed<string | undefined>(() => (node.value && node.value.type === 'container' ? node.value.separator : undefined))
const effectiveSeparator = computed<string>(() => ownSeparator.value ?? inheritedSeparator.value)
// Platzhalter den geerbten Wert GEQUOTET zeigen, sonst sind Rand-Leerzeichen unsichtbar (", " sieht aus wie ",").
const separatorPlaceholder = computed<string>(() => `„${inheritedSeparator.value}"`)
function setSeparator(raw: string): void {
  set({ separator: raw === '' ? undefined : raw }) // leer -> undefined => erbt
}

function set(patch: Record<string, unknown>): void {
  if (node.value) tree.update(node.value.id, patch)
}
function setHeading(patch: Partial<Heading>): void {
  if (node.value) tree.update(node.value.id, { heading: { ...heading.value, ...patch } })
}

// Titel auf eigener Zeile (Banner/Trenner) - fuer Container UND Feld. Nur die Default-Logik unterscheidet
// sich: Container per Default eigene Zeile (!titleInline), Feld per Default inline (ausser mehrzeilig).
const titleOwnLine = computed<boolean>(() => {
  const n = node.value
  if (!n || !n.showTitle) return false
  if (n.type === 'container' || n.type === 'function') return !n.titleInline
  return n.titleInline === false || (n.titleInline === undefined && !!n.multiline)
})
function setTitleOwnLine(on: boolean): void {
  const n = node.value
  if (!n) return
  if (n.type === 'container' || n.type === 'function') {
    // Banner an = Titel auf eigener Zeile = strukturell Block -> inline-Flags raeumen (wie beim Feld,
    // sonst reaktiviert sich ein stale inline still beim spaeteren Banner-Aus).
    if (on) set({ titleInline: false, inline: false, noSeparatorBefore: false })
    else set({ titleInline: true })
    return
  }
  // Feld: Banner ist strukturell ein BLOCK -> beim Einschalten die inline-Optionen mit raeumen.
  if (on) set({ titleInline: false, inline: false, noSeparatorBefore: false })
  else set({ titleInline: true }) // explizit inline (ueberschreibt auch den mehrzeilig-Default)
}
// Funktions-Zeilen-Format (config) mergen + leere Werte raeumen, damit das Modell rein bleibt.
function setConfig(patch: Partial<FunctionConfig>): void {
  const n = node.value
  if (!n || n.type !== 'function') return
  const next: FunctionConfig = { ...(n.config ?? {}), ...patch }
  if (next.rowLayout === 'block') delete next.rowLayout // 'block' = Default -> nicht ins Modell
  for (const k of Object.keys(next) as (keyof FunctionConfig)[]) if (next[k] === undefined) delete next[k]
  set({ config: Object.keys(next).length ? next : undefined })
}

// Select-Optionen (am Feld). Gesetzte options -> das Feld ist ein Select.
function fieldOptions(): string[] {
  return node.value?.type === 'field' && Array.isArray(node.value.options) ? node.value.options : []
}
function addOption(): void {
  // Optionen -> Select; „mehrzeilig" gilt nur fuer Freitext -> beim Wechsel zum Select bereinigen.
  // Banner-Zustand einfrieren, falls er nur ueber den mehrzeilig-Default kam (sonst springt er still aus).
  set({ options: [...fieldOptions(), ''], multiline: undefined, titleInline: titleOwnLine.value ? false : node.value?.type === 'field' ? node.value.titleInline : undefined })
}
// „Liste einfuegen": viele Optionen auf einmal anlegen (z. B. Alarmierungscodes, eine pro Zeile).
// Bestehende Optionen bleiben unangetastet; Doppeltes wird uebersprungen (Regeln: optionList.ts).
const pasteOpen = ref(false)
const pasteText = ref('')
const pasteInfo = ref('')
watch(
  () => node.value?.id,
  () => {
    pasteOpen.value = false
    pasteText.value = ''
    pasteInfo.value = ''
  },
)
function applyPastedOptions(): void {
  const r = appendOptions(fieldOptions(), pasteText.value)
  if (r.added === 0) {
    pasteInfo.value = r.duplicates ? `Nichts Neues – ${r.duplicates} schon vorhanden.` : 'Keine Zeilen erkannt.'
    return
  }
  // wie addOption: Optionen -> Select; „mehrzeilig" bereinigen, Banner-Zustand einfrieren.
  set({ options: r.options, multiline: undefined, titleInline: titleOwnLine.value ? false : node.value?.type === 'field' ? node.value.titleInline : undefined })
  pasteInfo.value = `${r.added} übernommen${r.duplicates ? `, ${r.duplicates} doppelt übersprungen` : ''}.`
  pasteText.value = ''
  pasteOpen.value = false
}
function setOption(i: number, value: string): void {
  const opts = fieldOptions().slice()
  const old = opts[i]
  opts[i] = value
  const patch: Record<string, unknown> = { options: opts }
  if (node.value?.type === 'field' && node.value.default === old) patch.default = value // Default mitziehen
  // Exklusiv-Markierung referenziert den exakten String -> beim Umbenennen mitziehen, sonst wird sie „tot".
  if (node.value?.type === 'field' && node.value.exclusiveOptions?.includes(old))
    patch.exclusiveOptions = node.value.exclusiveOptions.map((o) => (o === old ? value : o))
  set(patch)
}
function removeOption(i: number): void {
  const opts = fieldOptions().slice()
  const removed = opts[i]
  opts.splice(i, 1)
  const patch: Record<string, unknown> = { options: opts.length ? opts : undefined }
  if (node.value?.type === 'field' && node.value.default === removed) patch.default = undefined
  if (!opts.length) {
    patch.allowCustom = undefined // keine Optionen mehr -> kein „individuell"
    patch.multiple = undefined // ... und kein Multi-Select
    patch.exclusiveOptions = undefined
    patch.defaultEmpty = undefined
  } else if (node.value?.type === 'field' && node.value.exclusiveOptions?.includes(removed)) {
    const ex = node.value.exclusiveOptions.filter((o) => o !== removed)
    patch.exclusiveOptions = ex.length ? ex : undefined
  }
  set(patch)
}
// Option loeschen — bei nicht-leerer Option vorher via ConfirmDialog nachfragen (EINHEITLICH zum Block-/
// Vorlagen-Loeschen, gleiches Modal). Leere (frische) Option direkt entfernen.
const pendingOptionDelete = ref<number | null>(null)
function confirmRemoveOption(i: number): void {
  const opt = fieldOptions()[i]
  if (opt && opt.trim() !== '') pendingOptionDelete.value = i
  else removeOption(i)
}
function doDeleteOption(): void {
  if (pendingOptionDelete.value !== null) removeOption(pendingOptionDelete.value)
  pendingOptionDelete.value = null
}
/** Eine Option als „schliesst andere aus" markieren/entmarkieren (Multi-Select). Schreibt den exakten
 *  Options-String in exclusiveOptions — kein zweites Vokabular. */
function toggleExclusiveOption(opt: string, on: boolean): void {
  if (node.value?.type !== 'field') return
  const cur = node.value.exclusiveOptions ?? []
  const next = on ? [...new Set([...cur, opt])] : cur.filter((o) => o !== opt)
  set({ exclusiveOptions: next.length ? next : undefined })
}
function moveOption(i: number, delta: number): void {
  const opts = fieldOptions().slice()
  const j = i + delta
  if (j < 0 || j >= opts.length) return
  ;[opts[i], opts[j]] = [opts[j], opts[i]]
  set({ options: opts })
}
// Effektiver Default fuer die „als Standard"-Markierung: ein default, der keine (nicht-leere)
// Option ist, faellt auf die oberste Option zurueck (deckungsgleich mit fillValue).
const effectiveFieldDefault = computed<string | undefined>(() => {
  if (node.value?.type !== 'field') return undefined
  const opts = (node.value.options ?? []).filter((o) => o !== '')
  if (!opts.length) return node.value.default
  const d = node.value.default
  return d != null && opts.includes(d) ? d : opts[0]
})

// id ist Identifier UND Key im Einsatz-Werte-Store: nur Buchstaben/Ziffern/_/-, eindeutig im Baum.
// Eigener Entwurf + Commit on blur, damit Tippen nicht staendig saniert wird.
const idDraft = ref('')
const idError = ref<string | null>(null)
// „Als Baustein speichern": dezenter Erfolg/Fehler-Status; beim Knotenwechsel zurueckgesetzt (node-watch).
const saveOutcome = ref<{ ok: boolean; msg: string } | null>(null)
watch(
  node,
  (n) => {
    idDraft.value = n?.id ?? ''
    idError.value = null
    saveOutcome.value = null
  },
  { immediate: true },
)
function commitId(): void {
  if (!node.value) return
  const id = sanitizeId(idDraft.value)
  // Bei Fehler den Tippstand NICHT zuruecksetzen (kein stummer Ruecksprung) - sichtbar markieren.
  if (!id) {
    idError.value = 'Die id darf nicht leer sein.'
    return
  }
  if (id !== node.value.id && findNode(props.root, id)) {
    idError.value = `„${id}" ist schon vergeben. Frei wäre z. B. „${suggestFreeId(props.root, id)}".`
    return
  }
  idError.value = null
  idDraft.value = id
  if (id !== node.value.id) set({ id })
}
async function saveAsBaustein(): Promise<void> {
  if (!node.value || node.value.type !== 'container') return
  const targetId = node.value.id // beim Aufruf festhalten
  const r = await tree.saveContainerAsBaustein(targetId)
  // Hat der Nutzer waehrend des (nativen, async) Speicherns den Knoten gewechselt, das Outcome NICHT
  // unter dem neuen Knoten anzeigen (der node-watch hat saveOutcome laengst zurueckgesetzt) - Verify.
  if (!node.value || node.value.id !== targetId) return
  saveOutcome.value = r.ok ? { ok: true, msg: `Als Baustein „${r.title}" gespeichert.` } : { ok: false, msg: r.error }
}
</script>

<template>
  <div v-if="node" class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <span class="badge badge-sm self-start" :class="node.type === 'field' ? 'badge-secondary' : node.type === 'function' ? 'badge-accent' : 'badge-ghost'">{{ node.type === 'function' ? 'Funktion' : node.type === 'field' ? 'Feld' : 'Container' }}</span>

      <!-- BASIS: Titel - der Name, den man pflegt. Die interne id liegt unter „Erweitert". -->
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Titel</legend>
        <input class="input w-full" :value="node.title ?? ''" :placeholder="node.type === 'field' ? 'z. B. Atmung' : 'z. B. Anamnese'" @input="set({ title: ($event.target as HTMLInputElement).value })" />
      </fieldset>

      <!-- FELD: Standardwert (nur ohne Optionen; beim Select kommt der Standard aus der Optionsliste) -->
      <fieldset v-if="node.type === 'field' && !(node.options && node.options.length)" class="fieldset">
        <legend class="fieldset-legend">Standardwert</legend>
        <!-- mehrzeilig -> Textarea (sonst wuerde ein importierter \n-Default beim Editieren abgeschnitten) -->
        <textarea v-if="node.multiline" class="textarea w-full" rows="3" :value="node.default ?? ''" placeholder="z. B. unauffällig" @input="set({ default: ($event.target as HTMLTextAreaElement).value })" />
        <input v-else class="input w-full" :value="node.default ?? ''" placeholder="z. B. unauffällig" @input="set({ default: ($event.target as HTMLInputElement).value })" />
      </fieldset>

      <!-- FELD: mehrzeilig (nur ohne Optionen; mit Optionen = Select, kein Freitext -> ausgeblendet) -->
      <label v-if="node.type === 'field' && !(node.options && node.options.length)" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.multiline === true" @change="set({ multiline: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">Mehrzeilig (großes Textfeld für lange Eingaben)</span>
      </label>

      <!-- FELD: Auswahl-Optionen (Select). Gesetzt -> das Feld ist ein Select. „als Standard" = Radio.
           Bei „mehrzeilig" ausgeblendet: Select (Optionen) und Textarea schliessen sich aus. -->
      <div v-if="node.type === 'field' && !node.multiline" class="space-y-2 rounded-lg bg-base-200/50 p-3">
        <span class="text-xs font-semibold text-base-content/60">Auswahl-Optionen <span class="font-normal text-base-content/40">(leer = einfaches Feld)</span></span>
        <div v-for="(opt, i) in (node.options ?? [])" :key="i" class="flex items-center gap-1">
          <input v-if="!(node.multiple && node.defaultEmpty) && new Set((node.options ?? []).filter((o) => o !== '')).size > 1" type="radio" class="radio radio-xs shrink-0" :name="`default-${node.id}`" :checked="effectiveFieldDefault === opt" :aria-label="`als Standard: ${opt}`" title="als Standard" @change="set({ default: opt })" />
          <input class="input input-sm min-w-0 flex-1" :value="opt" placeholder="Option" @input="setOption(i, ($event.target as HTMLInputElement).value)" />
          <!-- Multi-Select: Option als „schliesst andere aus" (Keine/Normal) markieren -->
          <label v-if="node.multiple && opt !== ''" class="flex shrink-0 cursor-pointer items-center gap-1" :title="`„${opt}“ schließt andere Auswahlen aus`">
            <input type="checkbox" class="checkbox checkbox-xs" :checked="(node.exclusiveOptions ?? []).includes(opt)" :aria-label="`„${opt}“ schließt andere aus`" @change="toggleExclusiveOption(opt, ($event.target as HTMLInputElement).checked)" />
            <span class="text-xs text-base-content/50">excl.</span>
          </label>
          <button type="button" class="btn btn-ghost btn-xs px-1" :disabled="i === 0" aria-label="nach oben" @click="moveOption(i, -1)">↑</button>
          <button type="button" class="btn btn-ghost btn-xs px-1" :disabled="i === (node.options?.length ?? 0) - 1" aria-label="nach unten" @click="moveOption(i, 1)">↓</button>
          <button type="button" class="btn btn-ghost btn-xs px-1 text-error" aria-label="entfernen" @click="confirmRemoveOption(i)">✕</button>
        </div>
        <div class="flex flex-wrap gap-1">
          <button type="button" class="btn btn-ghost btn-xs" @click="addOption">＋ Eintrag hinzufügen</button>
          <button type="button" class="btn btn-ghost btn-xs" :aria-expanded="pasteOpen" @click="pasteOpen = !pasteOpen; pasteInfo = ''">Liste einfügen</button>
        </div>
        <!-- „Liste einfuegen": z. B. mehrere hundert Codes „Zahl: Einsatzmeldung" auf einmal -->
        <div v-if="pasteOpen" class="flex flex-col gap-1">
          <textarea
            v-model="pasteText"
            rows="6"
            class="textarea textarea-bordered textarea-sm w-full font-mono"
            :placeholder="'Eine Option pro Zeile, z. B.\n010: Bewusstlosigkeit\n011: ICB / SAB'"
            aria-label="Optionen einfügen, eine pro Zeile"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <p class="text-xs text-base-content/50">Vorhandene Optionen bleiben; doppelte werden übersprungen.</p>
          <div class="flex gap-1">
            <button type="button" class="btn btn-primary btn-xs" :disabled="!pasteText.trim()" @click="applyPastedOptions">Übernehmen</button>
            <button type="button" class="btn btn-ghost btn-xs" @click="pasteOpen = false; pasteText = ''">Abbrechen</button>
          </div>
        </div>
        <p v-if="pasteInfo" class="text-xs text-base-content/60" role="status">{{ pasteInfo }}</p>
        <label v-if="node.options && node.options.length" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.allowCustom === true" @change="set({ allowCustom: ($event.target as HTMLInputElement).checked })" />
          <span class="text-sm">„individuell" erlauben (Freitext als letzte Option)</span>
        </label>
        <label v-if="node.options && node.options.length" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.multiple === true" @change="set(($event.target as HTMLInputElement).checked ? { multiple: true } : { multiple: undefined, exclusiveOptions: undefined, defaultEmpty: undefined })" />
          <span class="text-sm">Mehrfachauswahl erlauben</span>
        </label>
        <!-- Optional OHNE Vorauswahl starten (z. B. Einsatzcodes). Ohne den Schalter bleibt die
             Standard-Option wie bisher vorausgewaehlt. Beim Einschalten den (dann bedeutungslosen) Standard raeumen. -->
        <label v-if="node.multiple" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.defaultEmpty === true" @change="set(($event.target as HTMLInputElement).checked ? { defaultEmpty: true, default: undefined } : { defaultEmpty: undefined })" />
          <span class="text-sm">Startet ohne Auswahl <span class="text-base-content/50">(nichts vorausgewählt, z. B. Einsatzcodes)</span></span>
        </label>
      </div>

      <!-- FUNKTION (alle Arten): Standardtext-Fallback in der Ausgabe (node.default), wenn die Funktion nichts
           ausgibt - Listen ohne Einträge bzw. Rechner ohne Ergebnis. Erfasste Werte/Zeilen haben Vorrang. -->
      <fieldset v-if="node.type === 'function'" class="fieldset">
        <legend class="fieldset-legend">Standardtext (wenn leer / nicht erhoben)</legend>
        <input class="input w-full" :value="node.default ?? ''" :placeholder="isListFunction ? 'z. B. keine Dauermedikation bekannt' : 'z. B. Score nicht erhoben'" @input="set({ default: ($event.target as HTMLInputElement).value || undefined })" />
        <p class="text-xs text-base-content/50">Wird in der Ausgabe gezeigt, wenn die Funktion nichts ausgibt (keine Einträge / kein Ergebnis). Erfasste Werte haben Vorrang.</p>
      </fieldset>

      <!-- BASIS: Ueberschrift/Titel in der Ausgabe (showTitle). Beim Feld = „Abschnitt mit Ueberschrift".
           Nur bei vorhandenem Titel: ohne Titel gibt es nichts zu zeigen -> Option ausgeblendet. -->
      <label v-if="hasTitle" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.showTitle === true" @change="set({ showTitle: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">{{ node.type === 'field' ? 'Als Abschnitt mit Überschrift ausgeben' : 'Titel in der Ausgabe zeigen' }}</span>
      </label>

      <!-- FELD/FUNKTION: Pflichtfeld. Im Einsatz entfaellt der −-Zustand (nicht erhoben); ✓/✎ bleiben.
           Ein leeres Pflichtfeld wird nur visuell als „noch offen" markiert (kein Zwang, keine Sperre). -->
      <label
        v-if="node.type === 'field' || node.type === 'function'"
        class="flex w-full items-center gap-2 py-0"
        :class="node.type === 'field' && node.defaultExcluded ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.type === 'field' && node.defaultExcluded ? 'Nicht zusammen mit „Startet auf \u201anicht erhoben\u2018\u201c moeglich.' : undefined"
      >
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.required === true" :disabled="node.type === 'field' && node.defaultExcluded === true" @change="set({ required: ($event.target as HTMLInputElement).checked || undefined })" />
        <span class="text-sm">Pflichtfeld <span class="whitespace-nowrap text-base-content/50">(✓ / ✎, kein „nicht erhoben")</span></span>
      </label>

      <!-- FELD: UNO Reverse. Das Feld startet im Einsatz auf „nicht erhoben" statt auf „bestaetigt" und
           erscheint erst in der Ausgabe, wenn der Anwender es bewusst einschaltet. Fuer Felder, die man
           nur in bestimmten Lagen braucht.
           Schliesst sich mit „Pflichtfeld" aus: ein Pflichtfeld darf nicht still entfallen. Statt den
           Widerspruch zuzulassen und spaeter aufzuloesen, ist der jeweils andere Schalter gesperrt -
           so kann er gar nicht erst entstehen. -->
      <label
        v-if="node.type === 'field'"
        class="flex w-full items-center gap-2 py-0"
        :class="node.required ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.required ? 'Nicht zusammen mit „Pflichtfeld\u201c moeglich - ein Pflichtfeld darf nicht still entfallen.' : undefined"
      >
        <input
          type="checkbox"
          class="toggle toggle-sm shrink-0"
          :checked="node.defaultExcluded === true"
          :disabled="node.required === true"
          @change="set({ defaultExcluded: ($event.target as HTMLInputElement).checked || undefined })"
        />
        <span class="text-sm">Startet auf „nicht erhoben" <span class="whitespace-nowrap text-base-content/50">(nur bei Bedarf einschalten)</span></span>
      </label>

      <!-- CONTAINER: einklappbar + als „nicht erhoben" markierbar (Basis).
           NICHT am Wurzel-Container: die Wurzel wird im Einsatz nie als Sektion gerendert (EinsatzView zeigt nur
           die Kinder), also greift weder Einklappen (EinsatzSection) noch „nicht erhoben" (Zustand nur pro Sektion
           setzbar) — beide waeren an der ersten Ebene wirkungslos. -->
      <label v-if="node.type === 'container' && !isRoot" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.collapsible === true" @change="set({ collapsible: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">einklappbar</span>
      </label>
      <label
        v-if="node.type === 'container' && !isRoot"
        class="flex w-full items-center gap-2 py-0"
        :class="node.defaultExcluded ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.defaultExcluded ? 'Wird von „Startet auf \u201anicht erhoben\u2018\u201c vorausgesetzt.' : undefined"
      >
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.excludable === true" :disabled="node.defaultExcluded === true" @change="set({ excludable: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">Als „nicht erhoben" markierbar <span class="whitespace-nowrap">(✓ / −)</span></span>
      </label>
      <!-- CONTAINER: UNO Reverse. Der ganze Abschnitt startet auf „nicht erhoben" und erscheint erst,
           wenn der Anwender ihn zuschaltet - ein Tipp statt jedes Feld einzeln.
           Setzt „Als nicht erhoben markierbar" automatisch mit: ohne den ✓/−-Schalter liesse sich der
           Abschnitt gar nicht wieder einschalten, das Flag waere wirkungslos. Deshalb auch die Sperre
           andersherum - excludable laesst sich nicht abschalten, solange UNO Reverse an ist. -->
      <label v-if="node.type === 'container' && !isRoot" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input
          type="checkbox"
          class="toggle toggle-sm shrink-0"
          :checked="node.defaultExcluded === true"
          @change="set(($event.target as HTMLInputElement).checked ? { defaultExcluded: true, excludable: true } : { defaultExcluded: undefined })"
        />
        <span class="text-sm">Startet auf „nicht erhoben" <span class="whitespace-nowrap text-base-content/50">(nur bei Bedarf zuschalten)</span></span>
      </label>

      <!-- CONTAINER (nicht Wurzel): den Teilbaum als wiederverwendbaren Baustein in der Bibliothek ablegen -->
      <div v-if="node.type === 'container' && !isRoot" class="space-y-1">
        <button type="button" class="btn btn-outline btn-sm self-start" @click="saveAsBaustein">Als Baustein speichern</button>
        <p v-if="saveOutcome" class="text-xs" :class="saveOutcome.ok ? 'text-success' : 'text-error'">{{ saveOutcome.msg }}</p>
      </div>

      <!-- ERWEITERT (Progressive Disclosure): selten Gebrauchtes eingeklappt - interne id, Titel-Format,
           Layout/Trenner, Ausgabe-Optionen. Default zu; Kopf zeigt die id als Vorschau. -->
      <!-- BEWUSST kein daisyUI-.collapse: dessen animiertes Auf-/Zuklappen nutzt content-visibility:hidden->visible
           (+ interpolate-size min-height/height 0->auto). Der Inhalt ist geschlossen NICHT gelayoutet und wird beim
           Oeffnen erstmalig vermessen; auf iOS/Android-WebView sitzt der Erst-Layout erst nach einem Reflow (Tap)
           korrekt -> die Felder ruecken sichtbar nach. Natives <details> layoutet in EINEM Pass, kein Nachruecken. -->
      <details class="group rounded-lg bg-base-200/50">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span class="shrink-0">Erweitert</span>
          <code class="min-w-0 flex-1 truncate font-mono text-xs text-base-content/50">id: {{ node.id }}</code>
          <span class="shrink-0 text-base-content/50 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <div class="space-y-3 px-4 pb-4">
          <!-- Identifier (id): interner Schluessel, auto-vergeben, selten noetig. Sichtbare Inline-Validierung.
               NICHT fuer die Wurzel: deren id IST die Vorlagen-Kennung (Bibliothek) - ein Rename hier wuerde
               editorActiveId desynchronisieren (Editor spraenge bei mehreren Vorlagen still auf eine andere). -->
          <fieldset v-if="!isRoot" class="fieldset">
            <legend class="fieldset-legend">Identifier (id)</legend>
            <input class="input w-full font-mono" :class="idError ? 'input-error' : ''" v-model="idDraft" @change="commitId" @blur="commitId" />
            <p v-if="idError" role="alert" class="flex items-start gap-1 text-sm text-error"><span aria-hidden="true">⚠</span><span>{{ idError }}</span></p>
            <p v-else class="text-xs text-base-content/50">Interner Schlüssel · wird automatisch vergeben · nur ändern, wenn ein fester Export-Schlüssel gebraucht wird</p>
          </fieldset>
          <p v-else class="text-xs text-base-content/50">Wurzel des Protokolls · die Kennung „{{ node.id }}" wird über die Bibliothek verwaltet (Titel umbenennen).</p>

          <!-- Titel-Format (nur wenn Ueberschrift/Titel in der Ausgabe): prefix/suffix; Container zusaetzlich inline-Titel + Banner -->
          <!-- Block+Margin statt Flex-gap: WKWebView/WebKit rendert Flex-/Grid-gap-Abstaende beim Erst-Layout
               zu gross und korrigiert erst nach einem Reflow (Tap) — margin-basierter Abstand umgeht den Bug.
               Quellen: Apple DevForums 737214, daisyUI #2410, Tailwind #3394, philipwalton/flexbugs. -->
          <div v-if="node.showTitle && hasTitle" class="space-y-3">
            <span class="text-xs font-semibold text-base-content/60">Titel-Format</span>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Präfix</legend>
              <input class="input w-full font-mono" :value="heading.prefix" placeholder="## " @input="setHeading({ prefix: ($event.target as HTMLInputElement).value })" />
            </fieldset>
            <fieldset class="fieldset">
              <legend class="fieldset-legend">Suffix</legend>
              <input class="input w-full font-mono" :value="heading.suffix" placeholder=": " @input="setHeading({ suffix: ($event.target as HTMLInputElement).value })" />
            </fieldset>
            <!-- Titel als eigene Zeile (Banner/Trenner) - Container, Feld UND Funktion; Inhalt rutscht darunter. -->
            <label class="flex w-full cursor-pointer items-center gap-2 py-0">
              <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="titleOwnLine" @change="setTitleOwnLine(($event.target as HTMLInputElement).checked)" />
              <span class="text-sm">Titel als eigene Zeile (Trenner/Banner — Inhalt darunter)</span>
            </label>
            <!-- Füllzeichen/Breite/Bezug nur wenn Titel auf eigener Zeile (inline ignoriert sie). -->
            <template v-if="titleOwnLine">
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Füllzeichen (leer = keins)</legend>
                <input class="input w-full font-mono" maxlength="1" :value="heading.fill" placeholder="=" @input="setHeading({ fill: ($event.target as HTMLInputElement).value })" />
              </fieldset>
              <fieldset v-if="!!heading.fill" class="fieldset">
                <legend class="fieldset-legend">Breite</legend>
                <input type="number" class="input w-full" min="0" max="200" :value="heading.width" @input="setHeading({ width: Number(($event.target as HTMLInputElement).value) })" />
              </fieldset>
              <fieldset v-if="!!heading.fill && heading.width > 0" class="fieldset">
                <legend class="fieldset-legend">Füllzeichen-Bezug</legend>
                <select class="select w-full" :value="heading.fillMode" @change="setHeading({ fillMode: (($event.target as HTMLSelectElement).value as 'inclusive' | 'exclusive') })">
                  <option value="inclusive">inklusive (konstante Gesamtbreite)</option>
                  <option value="exclusive">exklusive (feste Füllzeichen-Zahl)</option>
                </select>
              </fieldset>
              <!-- Absatz davor: optische Leerzeile vor dem Banner, wirkt nur wenn etwas darueber steht.
                   NICHT am Wurzel-Container: dort steht nie etwas darueber -> Grundvoraussetzung unerfuellbar. -->
              <label v-if="!isRoot" class="flex w-full cursor-pointer items-center gap-2 py-0">
                <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.blankLineBefore === true" @change="set({ blankLineBefore: ($event.target as HTMLInputElement).checked })" />
                <span class="text-sm">Absatz davor (Leerzeile, wenn etwas darüber steht)</span>
              </label>
            </template>
          </div>

          <!-- FELD oder FUNKTION (Score ODER Liste): block/inline + Trenner-Opt-out. Wie beim Feld: Default
               Block, inline explizit waehlbar. Entfaellt bei aktivem Banner (Titel auf eigener Zeile = Block). -->
          <template v-if="(node.type === 'field' || node.type === 'function') && !titleOwnLine">
            <label class="flex w-full cursor-pointer items-center gap-2 py-0">
              <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.inline === true" @change="set(($event.target as HTMLInputElement).checked ? { inline: true } : { inline: false, noSeparatorBefore: false })" />
              <span class="text-sm">Inline (an vorheriges Element anhängen statt neue Zeile)</span>
            </label>
            <label v-if="node.inline" class="flex w-full cursor-pointer items-center gap-2 py-0">
              <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.noSeparatorBefore === true" @change="set({ noSeparatorBefore: ($event.target as HTMLInputElement).checked })" />
              <span class="text-sm">Kein Trenner davor (direkt ans vorherige kleben)</span>
            </label>
          </template>

          <!-- CONTAINER: Ausgabe-Optionen (Feld-Trenner + Text wenn leer) -->
          <template v-if="node.type === 'container'">
            <fieldset v-if="node.children.length > 0" class="fieldset">
              <legend class="fieldset-legend">Feld-Trenner (zwischen inline-Elementen)</legend>
              <input class="input w-full font-mono" :value="node.separator ?? ''" :placeholder="separatorPlaceholder" @input="setSeparator(($event.target as HTMLInputElement).value)" />
              <p v-if="isRoot" class="text-xs text-base-content/50">Standard fürs ganze Protokoll · leer = „, "</p>
              <p v-else class="text-xs text-base-content/50">leer = erbt · aktuell wirksam: „{{ effectiveSeparator }}"</p>
            </fieldset>
            <!-- „Text wenn leer" NICHT am Wurzel-Container: greift nur, wenn das GANZE Protokoll leer
                 rendert (render.ts:137-139) — ein komplett leeres Protokoll braucht ohnehin keine Ausgabe.
                 Am Root also sinnlos; Feld-Trenner (Protokoll-Standard) bleibt dagegen. -->
            <fieldset v-if="!isRoot" class="fieldset">
              <legend class="fieldset-legend">Text wenn leer</legend>
              <input class="input w-full" :value="node.emptyText ?? ''" placeholder="z. B. unauffällig" @input="set({ emptyText: ($event.target as HTMLInputElement).value || undefined })" />
              <p class="text-xs text-base-content/50">Wird in der Ausgabe genutzt, wenn der Container angezeigt wird, seine Felder aber nichts ausgeben.</p>
            </fieldset>
          </template>

          <!-- FUNKTION mit Zeilen-Liste (Medikamentenplan/Ärzte): Zeilen-Format. Score-Funktionen
               (Pack-Years) haben keine Zeilen-Liste -> kein Zeilen-Format, nur die Titel-Optionen oben. -->
          <template v-if="node.type === 'function' && isListFunction">
            <span class="text-xs font-semibold text-base-content/60">Zeilen-Format</span>
            <label class="flex w-full cursor-pointer items-center gap-2 py-0">
              <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.config?.rowLayout === 'inline'" @change="setConfig(($event.target as HTMLInputElement).checked ? { rowLayout: 'inline', rowPrefix: undefined, rowSuffix: undefined } : { rowLayout: 'block', rowSeparator: undefined })" />
              <span class="text-sm">Hintereinander (eine Zeile, mit Trenner) statt untereinander</span>
            </label>
            <!-- hintereinander -> freier Trenner -->
            <fieldset v-if="node.config?.rowLayout === 'inline'" class="fieldset">
              <legend class="fieldset-legend">Trenner zwischen Einträgen</legend>
              <input class="input w-full font-mono" :value="node.config?.rowSeparator ?? ''" placeholder="z. B.  ·  oder ;" @input="setConfig({ rowSeparator: ($event.target as HTMLInputElement).value || undefined })" />
              <p class="text-xs text-base-content/50">leer = Standard-Trenner „, "</p>
            </fieldset>
            <!-- untereinander -> Praefix/Suffix je Zeile -->
            <template v-else>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Präfix je Zeile</legend>
                <input class="input w-full font-mono" :value="node.config?.rowPrefix ?? ''" placeholder="z. B. - " @input="setConfig({ rowPrefix: ($event.target as HTMLInputElement).value || undefined })" />
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Suffix je Zeile</legend>
                <input class="input w-full font-mono" :value="node.config?.rowSuffix ?? ''" placeholder="z. B. ;" @input="setConfig({ rowSuffix: ($event.target as HTMLInputElement).value || undefined })" />
              </fieldset>
            </template>
          </template>
        </div>
      </details>
    </div>
  </div>
  <p v-else class="text-sm text-base-content/50">Nichts ausgewählt — links unter „Aufbau" einen Eintrag wählen.</p>

  <!-- Option loeschen: gleiches Modal wie Block-/Vorlagen-Loeschen (einheitlich, kein nativer confirm) -->
  <ConfirmDialog
    v-if="pendingOptionDelete !== null && node?.type === 'field'"
    :title="`Option „${(node.options ?? [])[pendingOptionDelete] ?? ''}“ löschen?`"
    message="Die Option wird aus der Auswahlliste entfernt."
    confirm-label="Löschen"
    @confirm="doDeleteOption"
    @cancel="pendingOptionDelete = null"
  />
</template>
