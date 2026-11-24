<script setup lang="ts">
/** Eigenschaften des ausgewaehlten Knotens - Container ODER Feld. Liest die Auswahl aus der
 *  Tree-API, schreibt ueber reine Creator-Ops (tree.update). daisyUI-5 fieldset = Label oben,
 *  volle Breite. id-Umbenennen migriert den Einsatz-Wert (siehe EditorView.update). */
import { computed, inject, ref, watch } from 'vue'
import type { Condition, ConditionalDefault, Container, Field, Node, Heading, FunctionConfig } from '@resqdocs/protocol-core/model'
import { DEFAULT_HEADING, DEFAULT_SEPARATOR } from '@resqdocs/protocol-core/model'
import TabRef from './TabRef.vue'
import { FUNCTION_REGISTRY, FUNCTION_ROW_INLINE_SEPARATOR, LEGACY_ROW_INLINE_SEPARATOR } from '@resqdocs/protocol-core/functions/registry'
import { findNode, findPath, suggestFreeId } from '@resqdocs/protocol-core/creator'
import { sanitizeId } from '@resqdocs/protocol-core/ids'
import { applyOptionEdit, planOptionEdit, type OptionDraft } from '@resqdocs/protocol-core/optionDraft'
import { joinFieldValues, multiSeparatorOf } from '@resqdocs/protocol-core/fill'
import { dependencyCandidates } from '@resqdocs/protocol-core/dependencies'
import { useTreeEditor } from '../treeEditor.ts'
import OptionsDialog from './OptionsDialog.vue'
import InfoTip from './InfoTip.vue'
import ConditionEditor from './ConditionEditor.vue'
import { INFO } from '../terms.ts'
import { defaultYields, withDefaultYield } from '../defaultYield.ts'
import { allowedFunctionKindsKey } from '../injection.ts'
import { optionsEditRequest } from '../optionsEditRequest.ts'

import ClozeSettings from './cloze/ClozeSettings.vue'
const props = defineProps<{ root: Container }>()
const tree = useTreeEditor()
// Nur der Online-Editor stellt die Versions-Auswahl bereit. Dort gibt es keine Tab-Leiste, auf die ein Text verweisen koennte.
const isOnlineEditor = inject(allowedFunctionKindsKey, null) !== null

const node = computed<Node | null>(() => (tree.selectedId.value ? findNode(props.root, tree.selectedId.value) : null))
const heading = computed<Heading>(() => ({ ...DEFAULT_HEADING, ...(node.value?.heading ?? {}) }))
const isRoot = computed(() => !!node.value && node.value.id === props.root.id)
// Grundvoraussetzung fuer ALLE Titel-Format-Optionen: ein nicht-leerer Titel. Ohne Titel gibt es keine
// Ueberschrift zu gestalten -> die Optionen werden AUSGEBLENDET (v-if), NICHT geleert. Die gesetzten Werte
// bleiben im Modell und sind wieder editierbar, sobald ein Titel da ist. Nur-Whitespace zaehlt als leer.
const hasTitle = computed(() => !!node.value?.title?.trim())
// Listen-Funktion (Medikamentenplan/Aerzte) = mehrzeilige Zeilen-Liste -> bekommt das Zeilen-Format
// (im Bereich „Funktionskonfiguration").
// Quelle: Registry-Marker singleLine (Score wie Pack-Years/NEWS2 = einzeilig -> keine Liste; unbekannt ->
// keine Liste). Titel/inline/Banner sind bei ALLEN Knoten identisch (bewusst, fuer die Wiedererkennung):
// inline verhaelt sich wie beim Feld - Default Block, explizit waehlbar (auch fuer Listen, 2026-07-03).
const isListFunction = computed(() => {
  const n = node.value
  const def = n?.type === 'function' ? FUNCTION_REGISTRY[n.functionKind] : undefined
  return !!def && !def.singleLine
})
// Score mit eigenem Text ab der Schwelle (z. B. EGSYS): Beschriftung und Standardtext aus der Registry.
const thresholdTextDef = computed(() => {
  const n = node.value
  return n?.type === 'function' ? FUNCTION_REGISTRY[n.functionKind]?.thresholdText : undefined
})
// Bereich „Funktionskonfiguration": da, sobald die Funktion mindestens eine eigene Option anbietet.
// Neue Optionen weiterer Funktionen hier ergaenzen. Im Kopf steht bewusst keine Vorschau, sondern ein ⓘ,
// das den Bereich allgemein erklaert (Maintainer-Wunsch).
// Funktion mit frei waehlbarem Zeilenende (z. B. EGSYS): Standard und Beschriftung aus der Registry.
const lineEndDef = computed(() => {
  const n = node.value
  return n?.type === 'function' ? FUNCTION_REGISTRY[n.functionKind]?.lineEnd : undefined
})
const hasFunctionConfig = computed(() => !!thresholdTextDef.value || !!lineEndDef.value || isListFunction.value)
// Zeilenende: das Feld zeigt den geltenden Wert (WYSIWYG). Leeren heisst „nichts am Ende" und wird als ''
// gespeichert; der Standard selbst wird nicht ins Modell geschrieben.
function setLineEnd(v: string): void {
  setConfig({ lineEnd: v === lineEndDef.value?.standard ? undefined : v })
}

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

// --- Abhaengigkeit. Zwei Regelarten, beide ueber Bedingungen „im Auswahlfeld X ist eine dieser Optionen gewaehlt":
//  - Erscheinen (dependsOn): das Element erscheint im Einsatz nur, wenn die Bedingungen zutreffen. Setzt
//    „Startet auf nicht erhoben" voraus (bei Abschnitten zusaetzlich „markierbar"): so bleibt das Element in
//    aelteren App-Versionen, die die Regel nicht kennen, aus und laesst sich dort von Hand einschalten.
//  - Inhalt (defaultWhen, nur Felder): solange eine Bedingung zutrifft, gilt ein anderer Standardwert.
const MAX_CONDITIONS = 3
const MAX_DEFAULT_RULES = 5
const fieldLabel = (f: Field): string => f.title?.trim() || f.id
const fieldNode = computed<Field | null>(() => (node.value?.type === 'field' ? node.value : null))
const depCandidates = computed<Field[]>(() => (node.value && !isRoot.value ? dependencyCandidates(props.root, node.value) : []))
const depConditions = computed<Condition[]>(() => node.value?.dependsOn?.conditions ?? [])
const defaultRules = computed<ConditionalDefault[]>(() => fieldNode.value?.defaultWhen ?? [])
/** Eigene Optionen des Feldes: bei einem Auswahlfeld muss der abhaengige Standardwert eine davon sein. */
const ownOptions = computed<string[]>(() => [...new Set((fieldNode.value?.options ?? []).filter((o) => o !== ''))])
function conditionSource(c: Condition): Field | null {
  const found = c.fieldId ? findNode(props.root, c.fieldId) : null
  return found && found.type === 'field' && found.options?.some((o) => o !== '') ? found : null
}
/** Eine Regel zeigt auf ein Feld, das es nicht mehr gibt oder das kein Auswahlfeld mehr ist. */
const depBroken = computed(() => [...depConditions.value, ...defaultRules.value].some((c) => !conditionSource(c)))
const depSummary = computed<string>(() => {
  const parts: string[] = []
  const first = depConditions.value[0]
  if (first) {
    const source = conditionSource(first)
    const more = depConditions.value.length > 1 ? ` +${depConditions.value.length - 1}` : ''
    parts.push(source ? `${fieldLabel(source)}: ${first.options.join(', ') || 'noch keine Option'}${more}` : 'Feld fehlt')
  }
  if (defaultRules.value.length) parts.push(defaultRules.value.length === 1 ? '1 Standardwert-Regel' : `${defaultRules.value.length} Standardwert-Regeln`)
  return parts.length ? parts.join(' · ') : 'keine'
})
/** Pflichtfeld und Erscheinen-Regel schliessen sich aus (wie Pflichtfeld und „Startet auf nicht erhoben"). */
const depBlockedByRequired = computed(() => !!node.value && node.value.type !== 'container' && node.value.required === true)
function setDependency(on: boolean): void {
  const n = node.value
  if (!n) return
  if (!on) return set({ dependsOn: undefined })
  const first = depCandidates.value[0]
  if (!first) return
  set({ dependsOn: { conditions: [{ fieldId: first.id, options: [] }] }, defaultExcluded: true, ...(n.type === 'container' ? { excludable: true } : {}) })
}
function setConditions(conditions: Condition[]): void {
  const dep = node.value?.dependsOn
  if (!dep) return
  if (!conditions.length) return set({ dependsOn: undefined })
  // „Eine genügt" ergibt nur mit mehreren Bedingungen Sinn.
  set({ dependsOn: dep.match === 'any' && conditions.length > 1 ? { conditions, match: 'any' } : { conditions } })
}
function updateCondition(i: number, condition: Condition): void {
  setConditions(depConditions.value.map((c, k) => (k === i ? condition : c)))
}
function addCondition(): void {
  const first = depCandidates.value[0]
  if (first) setConditions([...depConditions.value, { fieldId: first.id, options: [] }])
}
function removeCondition(i: number): void {
  setConditions(depConditions.value.filter((_, k) => k !== i))
}
function setMatchAny(on: boolean): void {
  set({ dependsOn: on ? { conditions: depConditions.value, match: 'any' } : { conditions: depConditions.value } })
}
function setDefaultRules(rules: ConditionalDefault[]): void {
  set({ defaultWhen: rules.length ? rules : undefined })
}
function addDefaultRule(): void {
  const first = depCandidates.value[0]
  if (first) setDefaultRules([...defaultRules.value, { fieldId: first.id, options: [], value: ownOptions.value[0] ?? '' }])
}
function updateDefaultRule(i: number, patch: Partial<ConditionalDefault>): void {
  setDefaultRules(defaultRules.value.map((r, k) => (k === i ? { ...r, ...patch } : r)))
}
function removeDefaultRule(i: number): void {
  setDefaultRules(defaultRules.value.filter((_, k) => k !== i))
}

// --- Kopfzeilen der aufklappbaren Bereiche: kurze Vorschau, damit man zugeklappt sieht, was drinsteht.
const listSummary = computed<string>(() => {
  const f = fieldNode.value
  const count = (f?.options ?? []).filter((o) => o !== '').length
  if (!f || !count) return 'keine'
  const parts = [count === 1 ? '1 Option' : `${count} Optionen`]
  if (f.multiple) parts.push('Mehrfachauswahl')
  const sep = f.multiple ? multiSeparatorOf(f) : undefined
  if (sep !== undefined) parts.push(`Trenner „${sep.trim() || sep}“`)
  if (f.allowCustom) parts.push('individuell')
  return parts.join(' · ')
})
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

// Auswahl-Optionen (am Feld). Gesetzte options -> das Feld ist eine Auswahl. Bearbeitet werden sie im Fenster
// „Optionen bearbeiten“ (OptionsDialog): Tabelle im Browser, Vollbild-Liste am Handy. Übernehmen ist EIN Schritt
// und zieht Standard, „allein“ und Verweise anderer Elemente mit (optionDraft.ts).
const optionsOpen = ref(false)
// Beim Wechsel des Elements schließt das Fenster; ein Wunsch von außen (optionsEditRequest) öffnet es für sein Feld.
watch(
  [() => node.value?.id, optionsEditRequest],
  ([id, wanted], [oldId]) => {
    if (id !== oldId) optionsOpen.value = false
    if (wanted === null || wanted !== id || node.value?.type !== 'field') return
    optionsEditRequest.value = null
    optionsOpen.value = true
  },
  { immediate: true },
)
const filledOptions = computed<string[]>(() => (fieldNode.value?.options ?? []).filter((o) => o !== ''))

// --- Mehrfachauswahl: wie die gewaehlten Werte im Protokolltext verbunden werden (multiSeparator).
// Auswahlknoepfe mit Beispiel aus den eigenen Optionen statt Klappliste (alle Varianten sichtbar, docs/sources.md).
type SeparatorChoice = 'aufzaehlung' | 'komma' | 'semikolon' | 'eigen'
const SEPARATOR_CHOICES: { key: SeparatorChoice; label: string; sep?: string }[] = [
  { key: 'aufzaehlung', label: 'Aufzählung' },
  { key: 'komma', label: 'Komma', sep: ', ' },
  { key: 'semikolon', label: 'Semikolon', sep: '; ' },
  { key: 'eigen', label: 'Eigener Trenner' },
]
const choiceOf = (sep: string | undefined): SeparatorChoice => (sep === undefined ? 'aufzaehlung' : (SEPARATOR_CHOICES.find((c) => c.sep === sep)?.key ?? 'eigen'))
// „Eigener Trenner" ohne Text bleibt gewaehlt, bis man etwas eintippt (der Wert faellt so lange auf die Aufzaehlung zurueck).
const separatorChoice = ref<SeparatorChoice>('aufzaehlung')
watch(
  () => [fieldNode.value?.id, fieldNode.value ? multiSeparatorOf(fieldNode.value) : undefined] as const,
  ([id, sep], old) => {
    const sameField = old !== undefined && old[0] === id
    // Solange „Eigener Trenner“ gewählt ist, bleibt es dabei, auch wenn der getippte Wert gerade einer Vorgabe
    // gleicht („; “ auf dem Weg zu „; – “): sonst spränge die Wahl um und das Feld verschwände beim Tippen.
    if (!(sameField && separatorChoice.value === 'eigen')) separatorChoice.value = choiceOf(sep)
  },
  { immediate: true },
)
const customSeparator = computed<string>(() => (separatorChoice.value === 'eigen' ? (fieldNode.value?.multiSeparator ?? '') : ''))
function separatorExample(sep: string | undefined): string {
  // Eigene Optionen nur, solange das Beispiel kurz bleibt; sonst A, B, C.
  const own = filledOptions.value.slice(0, 3)
  return joinFieldValues(own.length >= 2 && own.every((o) => o.length <= 16) ? own : ['A', 'B', 'C'], sep)
}
function chooseSeparator(key: SeparatorChoice): void {
  separatorChoice.value = key
  if (key !== 'eigen') set({ multiSeparator: SEPARATOR_CHOICES.find((c) => c.key === key)?.sep })
}
function setCustomSeparator(raw: string): void {
  const s = raw.replace(/[\r\n]+/g, ' ')
  set({ multiSeparator: s === '' ? undefined : s })
}
const optionsPreview = computed<string>(() => {
  const list = filledOptions.value
  if (list.length <= 3) return list.join(' · ')
  return `${list.slice(0, 3).join(' · ')} und ${list.length - 3} weitere`
})
function applyOptions(d: OptionDraft): void {
  const f = fieldNode.value
  if (!f) return
  // Aus einem Textfeld wird eine Auswahl: „mehrzeilig“ gilt nur für Freitext; den Banner-Zustand einfrieren, falls er
  // nur über den mehrzeilig-Standard kam (sonst springt er still aus).
  const extra = filledOptions.value.length ? {} : { multiline: undefined, titleInline: titleOwnLine.value ? false : f.titleInline }
  const id = f.id
  tree.transform((root) => applyOptionEdit(root, id, planOptionEdit(root, id, d), extra))
  optionsOpen.value = false
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

// „Standardwert weicht" (Mehrfachauswahl): die Standard-Option als „allein" fuehren, siehe defaultYield.ts.
const defaultYield = computed(() => node.value?.type === 'field' && defaultYields(node.value.exclusiveOptions, effectiveFieldDefault.value))
function setDefaultYield(on: boolean): void {
  if (node.value?.type !== 'field') return
  set({ exclusiveOptions: withDefaultYield(node.value.exclusiveOptions, effectiveFieldDefault.value, on) })
}

// id ist Identifier UND Key im Einsatz-Werte-Store: nur Buchstaben/Ziffern/_/-, eindeutig im Baum.
// Eigener Entwurf + Commit on blur, damit Tippen nicht staendig saniert wird.
const idDraft = ref('')
const idError = ref<string | null>(null)
// „Als Baustein speichern": dezenter Erfolg/Fehler-Status; beim Knotenwechsel zurueckgesetzt (node-watch).
// ok: Titel des gespeicherten Abschnitts (Meldung nennt den Ort je nach App/Editor), sonst die Fehlermeldung.
const saveOutcome = ref<{ ok: true; title: string } | { ok: false; msg: string } | null>(null)
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
  saveOutcome.value = r.ok ? { ok: true, title: r.title } : { ok: false, msg: r.error }
}
</script>

<template>
  <div v-if="node" class="card bg-base-100 shadow">
    <div class="card-body gap-3 p-4">
      <div class="flex items-center gap-1 self-start">
        <span class="badge badge-sm" :class="node.type === 'field' ? 'badge-secondary' : node.type === 'function' ? 'badge-accent' : 'badge-ghost'">{{ node.type === 'function' ? 'Funktion' : node.type === 'field' ? 'Feld' : 'Abschnitt' }}</span>
        <InfoTip :info="node.type === 'function' ? INFO.function : node.type === 'field' ? INFO.field : INFO.section" />
      </div>

      <ClozeSettings v-if="node.type === 'container' && !isRoot" :node="node" :root="root" />

      <!-- ALLGEMEIN (eigener aufklappbarer Bereich, offen): das, was man fast immer einstellt - Titel und wie er im
           Protokolltext steht, Standardwert, Pflichtfeld, „nicht erhoben", gleiche Zeile. Abhaengige Einstellungen
           stehen eingerueckt direkt unter ihrem Schalter. Gleiches <details>-Muster wie „Erweitert" (siehe dort). -->
      <details open class="group rounded-lg bg-base-200/50">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span class="shrink-0">Allgemein</span>
          <InfoTip :info="INFO.general" />
          <span class="min-w-0 flex-1 truncate text-xs text-base-content/75">{{ node.title?.trim() || 'ohne Titel' }}</span>
          <span class="shrink-0 text-base-content/75 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <!-- space-y statt flex-col+gap: WebKit/WKWebView rechnet vertikale gap-Abstaende beim ersten Layout
             doppelt (kam mit a2350bf zurueck). Waechter: webkitGap.test.ts. -->
        <div class="space-y-3 px-4 pb-4">
      <!-- BASIS: Titel - der Name, den man pflegt. Die interne id liegt unter „Erweitert". -->
      <fieldset class="fieldset">
        <legend class="fieldset-legend">Titel</legend>
        <input class="input w-full" :value="node.title ?? ''" :placeholder="node.type === 'field' ? 'z. B. Atmung' : 'z. B. Anamnese'" @input="set({ title: ($event.target as HTMLInputElement).value })" />
      </fieldset>

      <!-- FELD: Standardwert (nur ohne Optionen; beim Select kommt der Standard aus der Optionsliste) -->
      <fieldset v-if="node.type === 'field' && !(node.options && node.options.length)" class="fieldset">
        <legend class="fieldset-legend">Standardwert <InfoTip :info="INFO.defaultValue" /></legend>
        <!-- mehrzeilig -> Textarea (sonst wuerde ein importierter \n-Default beim Editieren abgeschnitten) -->
        <textarea v-if="node.multiline" class="textarea w-full" rows="3" :value="node.default ?? ''" placeholder="z. B. unauffällig" @input="set({ default: ($event.target as HTMLTextAreaElement).value })" />
        <input v-else class="input w-full" :value="node.default ?? ''" placeholder="z. B. unauffällig" @input="set({ default: ($event.target as HTMLInputElement).value })" />
      </fieldset>

      <!-- FUNKTION (alle Arten): Standardtext-Fallback in der Ausgabe (node.default), wenn die Funktion nichts
           ausgibt - Listen ohne Einträge bzw. Rechner ohne Ergebnis. Erfasste Werte/Zeilen haben Vorrang. -->
      <fieldset v-if="node.type === 'function'" class="fieldset">
        <legend class="fieldset-legend">Standardwert (wenn leer / nicht erhoben)</legend>
        <input class="input w-full" :value="node.default ?? ''" :placeholder="isListFunction ? 'z. B. keine Dauermedikation bekannt' : 'z. B. Score nicht erhoben'" @input="set({ default: ($event.target as HTMLInputElement).value || undefined })" />
        <p class="text-xs text-base-content/75">Steht im Protokolltext, wenn die Funktion nichts ausgibt (keine Einträge / kein Ergebnis). Erfasste Werte haben Vorrang.</p>
      </fieldset>

      <!-- BASIS: Ueberschrift/Titel in der Ausgabe (showTitle). Beim Feld = „Abschnitt mit Ueberschrift".
           Nur bei vorhandenem Titel: ohne Titel gibt es nichts zu zeigen -> Option ausgeblendet. -->
      <label v-if="hasTitle" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.showTitle === true" @change="set({ showTitle: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">Titel im Protokolltext zeigen</span>
        <InfoTip :info="INFO.showTitle" class="ml-auto" />
      </label>

      <!-- Titel-Format: steht direkt unter dem Schalter, von dem es abhaengt (nur wenn der Titel im Protokolltext
           steht): prefix/suffix, Titel als eigene Zeile samt Fuellzeichen und Absatz davor. Eingerueckt = gehoert zum Schalter. -->
      <!-- Block+Margin statt Flex-gap: WKWebView/WebKit rendert Flex-/Grid-gap-Abstaende beim Erst-Layout
           zu gross und korrigiert erst nach einem Reflow (Tap) — margin-basierter Abstand umgeht den Bug.
           Quellen: Apple DevForums 737214, daisyUI #2410, Tailwind #3394, philipwalton/flexbugs. -->
      <div v-if="node.showTitle && hasTitle" class="space-y-3 border-l-2 border-base-300 pl-3" data-title-format>
        <span class="text-xs font-semibold text-base-content/75">Titel-Format <InfoTip :info="INFO.titleFormat" /></span>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Präfix <InfoTip :info="INFO.prefix" /></legend>
          <input class="input w-full font-mono" :value="heading.prefix" placeholder="## " @input="setHeading({ prefix: ($event.target as HTMLInputElement).value })" />
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Suffix <InfoTip :info="INFO.suffix" /></legend>
          <input class="input w-full font-mono" :value="heading.suffix" placeholder=": " @input="setHeading({ suffix: ($event.target as HTMLInputElement).value })" />
        </fieldset>
        <!-- Titel als eigene Zeile (Banner/Trenner) - Container, Feld UND Funktion; Inhalt rutscht darunter. -->
        <label class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="titleOwnLine" @change="setTitleOwnLine(($event.target as HTMLInputElement).checked)" />
          <span class="text-sm">Titel als eigene Zeile (Trenner/Banner — Inhalt darunter)</span>
          <InfoTip :info="INFO.titleOwnLine" class="ml-auto" />
        </label>
        <!-- Füllzeichen/Breite/Bezug nur wenn Titel auf eigener Zeile (inline ignoriert sie). -->
        <template v-if="titleOwnLine">
          <fieldset class="fieldset">
            <legend class="fieldset-legend">Füllzeichen (leer = keins) <InfoTip :info="INFO.fill" /></legend>
            <input class="input w-full font-mono" maxlength="1" :value="heading.fill" placeholder="=" @input="setHeading({ fill: ($event.target as HTMLInputElement).value })" />
          </fieldset>
          <fieldset v-if="!!heading.fill" class="fieldset">
            <legend class="fieldset-legend">Breite <InfoTip :info="INFO.width" /></legend>
            <input type="number" class="input w-full" min="0" max="200" :value="heading.width" @input="setHeading({ width: Number(($event.target as HTMLInputElement).value) })" />
          </fieldset>
          <fieldset v-if="!!heading.fill && heading.width > 0" class="fieldset">
            <legend class="fieldset-legend">Füllzeichen-Bezug <InfoTip :info="INFO.fillMode" /></legend>
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
            <InfoTip :info="INFO.blankLineBefore" class="ml-auto" />
          </label>
        </template>
      </div>

      <!-- FELD/FUNKTION: Pflichtfeld. Im Einsatz entfaellt der −-Zustand (nicht erhoben); ✓/✎ bleiben.
           Ein leeres Pflichtfeld wird nur visuell als „noch offen" markiert (kein Zwang, keine Sperre). -->
      <label
        v-if="node.type === 'field' || node.type === 'function'"
        class="flex w-full items-center gap-2 py-0"
        :class="node.defaultExcluded ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.defaultExcluded ? 'Nicht zusammen mit „Startet auf \u201anicht erhoben\u2018\u201c moeglich.' : undefined"
      >
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.required === true" :disabled="node.defaultExcluded === true" @change="set({ required: ($event.target as HTMLInputElement).checked || undefined })" />
        <span class="text-sm">Pflichtfeld <span class="whitespace-nowrap text-base-content/75">(✓ / ✎, kein „nicht erhoben")</span></span>
        <InfoTip :info="INFO.required" class="ml-auto" />
      </label>

      <!-- FELD: mehrzeilig (nur ohne Optionen; mit Optionen = Select, kein Freitext -> ausgeblendet) -->
      <label v-if="node.type === 'field' && !(node.options && node.options.length)" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.multiline === true" @change="set({ multiline: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">Mehrzeilig (großes Textfeld für lange Eingaben)</span>
        <InfoTip :info="INFO.multiline" class="ml-auto" />
      </label>

      <!-- FELD/FUNKTION: UNO Reverse. Der Knoten startet im Einsatz auf „nicht erhoben" statt auf
           „bestaetigt" und erscheint erst in der Ausgabe, wenn der Anwender ihn bewusst einschaltet.
           Fuer Felder und Funktionen, die man nur in bestimmten Lagen braucht.
           Schliesst sich mit „Pflichtfeld" aus: ein Pflichtfeld darf nicht still entfallen. Statt den
           Widerspruch zuzulassen und spaeter aufzuloesen, ist der jeweils andere Schalter gesperrt -
           so kann er gar nicht erst entstehen. -->
      <label
        v-if="node.type === 'field' || node.type === 'function'"
        class="flex w-full items-center gap-2 py-0"
        :class="node.required || node.dependsOn ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.dependsOn ? 'Wird von der Abhängigkeit vorausgesetzt.' : node.required ? 'Nicht zusammen mit „Pflichtfeld\u201c moeglich - ein Pflichtfeld darf nicht still entfallen.' : undefined"
      >
        <input
          type="checkbox"
          class="toggle toggle-sm shrink-0"
          :checked="node.defaultExcluded === true"
          :disabled="node.required === true || !!node.dependsOn"
          @change="set({ defaultExcluded: ($event.target as HTMLInputElement).checked || undefined })"
        />
        <span class="text-sm">Startet auf „nicht erhoben" <span class="whitespace-nowrap text-base-content/75">(nur bei Bedarf einschalten)</span></span>
        <InfoTip :info="node.type === 'function' ? INFO.functionStartsExcluded : INFO.fieldStartsExcluded" class="ml-auto" />
      </label>

      <!-- FELD oder FUNKTION: in derselben Zeile wie das vorherige Element (inline) + Trenner-Opt-out darunter.
           Haeufig gebraucht, deshalb hier und nicht unter „Erweitert". Standard ist eine eigene Zeile; entfaellt,
           solange der Titel auf eigener Zeile steht (Banner = immer eigener Block). -->
      <template v-if="(node.type === 'field' || node.type === 'function') && !titleOwnLine">
        <label class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.inline === true" @change="set(($event.target as HTMLInputElement).checked ? { inline: true } : { inline: false, noSeparatorBefore: false })" />
          <span class="text-sm">Inline (an vorheriges Element anhängen statt neue Zeile)</span>
          <InfoTip :info="INFO.inline" class="ml-auto" />
        </label>
        <label v-if="node.inline" class="flex w-full cursor-pointer items-center gap-2 border-l-2 border-base-300 py-0 pl-3">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.noSeparatorBefore === true" @change="set({ noSeparatorBefore: ($event.target as HTMLInputElement).checked })" />
          <span class="text-sm">Kein Trenner davor (direkt ans vorherige kleben)</span>
          <InfoTip :info="INFO.noSeparatorBefore" class="ml-auto" />
        </label>
      </template>

      <!-- CONTAINER: einklappbar + als „nicht erhoben" markierbar (Basis).
           NICHT am Wurzel-Container: die Wurzel wird im Einsatz nie als Sektion gerendert (EinsatzView zeigt nur
           die Kinder), also greift weder Einklappen (EinsatzSection) noch „nicht erhoben" (Zustand nur pro Sektion
           setzbar) — beide waeren an der ersten Ebene wirkungslos. -->
      <label v-if="node.type === 'container' && !isRoot" class="flex w-full cursor-pointer items-center gap-2 py-0">
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.collapsible === true" @change="set({ collapsible: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">einklappbar</span>
        <InfoTip :info="INFO.collapsible" class="ml-auto" />
      </label>
      <label
        v-if="node.type === 'container' && !isRoot"
        class="flex w-full items-center gap-2 py-0"
        :class="node.defaultExcluded ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.defaultExcluded ? 'Wird von „Startet auf \u201anicht erhoben\u2018\u201c vorausgesetzt.' : undefined"
      >
        <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.excludable === true" :disabled="node.defaultExcluded === true" @change="set({ excludable: ($event.target as HTMLInputElement).checked })" />
        <span class="text-sm">Als „nicht erhoben" markierbar <span class="whitespace-nowrap">(✓ / −)</span></span>
        <InfoTip :info="INFO.excludable" class="ml-auto" />
      </label>
      <!-- CONTAINER: UNO Reverse. Der ganze Abschnitt startet auf „nicht erhoben" und erscheint erst,
           wenn der Anwender ihn zuschaltet - ein Tipp statt jedes Feld einzeln.
           Setzt „Als nicht erhoben markierbar" automatisch mit: ohne den ✓/−-Schalter liesse sich der
           Abschnitt gar nicht wieder einschalten, das Flag waere wirkungslos. Deshalb auch die Sperre
           andersherum - excludable laesst sich nicht abschalten, solange UNO Reverse an ist. -->
      <label
        v-if="node.type === 'container' && !isRoot"
        class="flex w-full items-center gap-2 py-0"
        :class="node.dependsOn ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
        :title="node.dependsOn ? 'Wird von der Abhängigkeit vorausgesetzt.' : undefined"
      >
        <input
          type="checkbox"
          class="toggle toggle-sm shrink-0"
          :checked="node.defaultExcluded === true"
          :disabled="!!node.dependsOn"
          @change="set(($event.target as HTMLInputElement).checked ? { defaultExcluded: true, excludable: true } : { defaultExcluded: undefined })"
        />
        <span class="text-sm">Startet auf „nicht erhoben" <span class="whitespace-nowrap text-base-content/75">(nur bei Bedarf zuschalten)</span></span>
        <InfoTip :info="INFO.sectionStartsExcluded" class="ml-auto" />
      </label>

      <!-- CONTAINER (nicht Wurzel): den Teilbaum als wiederverwendbaren Baustein in der Bibliothek ablegen -->
      <div v-if="node.type === 'container' && !isRoot" class="space-y-1">
        <div class="flex items-center gap-1">
          <button type="button" class="btn btn-outline btn-sm" @click="saveAsBaustein">Für andere Vorlagen speichern</button>
          <InfoTip :info="isOnlineEditor ? INFO.saveForOtherTemplatesEditor : INFO.saveForOtherTemplates" class="ml-1" />
        </div>
        <p v-if="saveOutcome" class="text-xs" :class="saveOutcome.ok ? 'text-success' : 'text-error'" data-save-outcome>
          <template v-if="!saveOutcome.ok">{{ saveOutcome.msg }}</template>
          <template v-else-if="isOnlineEditor">„{{ saveOutcome.title }}“ unter „Gespeicherte Abschnitte“ gespeichert.</template>
          <template v-else>„{{ saveOutcome.title }}“ unter <TabRef tab="bausteine" /> gespeichert.</template>
        </p>
      </div>
        </div>
      </details>

      <!-- LISTENOPTIONEN (eigener aufklappbarer Bereich): alles rund um die Auswahlliste eines Feldes.
           FELD: Auswahl-Optionen (Select). Gesetzt -> das Feld ist ein Select. „als Standard" = Radio.
           Bei „mehrzeilig" ausgeblendet: Select (Optionen) und Textarea schliessen sich aus. AUSNAHME: hat
           ein importiertes Feld trotzdem Optionen UND mehrzeilig, bleibt der Bereich sichtbar - sonst waeren die
           Optionen weder zu sehen noch zu aendern (Mehrzeilig-Schalter und Standardwert sind bei Optionen
           ohnehin ausgeblendet). Im Einsatz ist das Feld eine Auswahl; nach dem Loeschen der letzten Option
           erscheinen Mehrzeilig und Standardwert wieder. Ueber die Oberflaeche entsteht der Zustand nicht neu:
           addOption/Einfuegen setzen multiline zurueck. -->
      <details v-if="node.type === 'field' && (!node.multiline || !!node.options?.length)" class="group rounded-lg bg-base-200/50">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span class="shrink-0">Listenoptionen</span>
          <InfoTip :info="INFO.listOptions" />
          <span class="min-w-0 flex-1 truncate text-xs text-base-content/75">{{ listSummary }}</span>
          <span class="shrink-0 text-base-content/75 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <div class="space-y-2 px-4 pb-4">
        <!-- Übersicht; bearbeitet wird im Fenster „Optionen bearbeiten“ (Tabelle bzw. Vollbild-Liste) -->
        <div class="space-y-2 rounded-lg border border-base-300 bg-base-100 p-3" data-options-summary>
          <div class="flex items-center gap-1">
            <span class="text-xs font-semibold text-base-content/75">Auswahl-Optionen</span>
            <InfoTip :info="INFO.options" />
            <span class="ml-auto text-xs text-base-content/75">{{ filledOptions.length === 1 ? '1 Option' : `${filledOptions.length} Optionen` }}</span>
          </div>
          <template v-if="filledOptions.length">
            <p class="text-sm [overflow-wrap:anywhere]">{{ optionsPreview }}</p>
            <p v-if="!(node.multiple && node.defaultEmpty)" class="text-xs text-base-content/75 [overflow-wrap:anywhere]">Standard: {{ effectiveFieldDefault }}</p>
            <p v-if="node.multiple && (node.exclusiveOptions ?? []).length" class="text-xs text-base-content/75">Schließt andere aus: {{ (node.exclusiveOptions ?? []).length === 1 ? '1 Option' : `${(node.exclusiveOptions ?? []).length} Optionen` }}</p>
          </template>
          <p v-else class="text-xs text-base-content/75">Noch keine Optionen: das Feld ist ein Textfeld.</p>
          <button type="button" class="btn btn-outline btn-sm min-h-11 w-full" data-options-edit @click="optionsOpen = true">{{ filledOptions.length ? 'Optionen bearbeiten' : 'Auswahlliste anlegen' }}</button>
        </div>
        <label v-if="node.options && node.options.length" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.allowCustom === true" @change="set(($event.target as HTMLInputElement).checked ? { allowCustom: true } : { allowCustom: false, customMultiline: undefined })" />
          <span class="text-sm">„individuell" erlauben (Freitext als letzte Option)</span>
          <InfoTip :info="INFO.allowCustom" class="ml-auto" />
        </label>
        <!-- Nur bei „individuell": frei schreiben im grossen Textfeld statt in einer Zeile. -->
        <label v-if="node.options && node.options.length && node.allowCustom" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.customMultiline === true" @change="set({ customMultiline: ($event.target as HTMLInputElement).checked ? true : undefined })" />
          <span class="text-sm">Großes Textfeld bei „individuell" <span class="text-base-content/75">(für längere Texte)</span></span>
          <InfoTip :info="INFO.customMultiline" class="ml-auto" />
        </label>
        <label v-if="node.options && node.options.length" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.multiple === true" @change="set(($event.target as HTMLInputElement).checked ? { multiple: true } : { multiple: undefined, exclusiveOptions: undefined, defaultEmpty: undefined, multiSeparator: undefined })" />
          <span class="text-sm">Mehrfachauswahl erlauben</span>
          <InfoTip :info="INFO.multiple" class="ml-auto" />
        </label>
        <!-- Optional OHNE Vorauswahl starten (z. B. Einsatzcodes). Ohne den Schalter bleibt die
             Standard-Option wie bisher vorausgewaehlt. Beim Einschalten den (dann bedeutungslosen) Standard raeumen. -->
        <label v-if="node.multiple" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.defaultEmpty === true" @change="set(($event.target as HTMLInputElement).checked ? { defaultEmpty: true, default: undefined } : { defaultEmpty: undefined })" />
          <span class="text-sm">Startet ohne Auswahl <span class="text-base-content/75">(nichts vorausgewählt, z. B. Einsatzcodes)</span></span>
          <InfoTip :info="INFO.defaultEmpty" class="ml-auto" />
        </label>
        <!-- Standardwert als pauschale Aussage (z. B. Normalbefund): weicht, sobald genauer gewaehlt wird. -->
        <label v-if="node.multiple && !node.defaultEmpty && effectiveFieldDefault" class="flex w-full cursor-pointer items-center gap-2 py-0">
          <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="defaultYield" @change="setDefaultYield(($event.target as HTMLInputElement).checked)" />
          <span class="text-sm">Standardwert weicht <span class="text-base-content/75">(verschwindet, sobald etwas anderes gewählt wird)</span></span>
          <InfoTip :info="INFO.defaultYield" class="ml-auto" />
        </label>
        <!-- Verbindung der gewaehlten Werte im Protokolltext; ohne Einstellung die deutsche Aufzaehlung. -->
        <fieldset v-if="node.multiple" class="fieldset min-w-0" data-multi-separator>
          <legend class="fieldset-legend">Verbindung im Protokolltext <InfoTip :info="INFO.multiSeparator" /></legend>
          <div class="space-y-0">
            <label v-for="c in SEPARATOR_CHOICES" :key="c.key" class="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" class="radio radio-sm shrink-0" :name="`multi-separator-${node.id}`" :checked="separatorChoice === c.key" :data-multi-separator-choice="c.key" @change="chooseSeparator(c.key)" />
              <span class="min-w-0 text-sm">{{ c.label }}<span v-if="c.key !== 'eigen'" class="text-base-content/75 [overflow-wrap:anywhere]">: „{{ separatorExample(c.sep) }}“</span></span>
            </label>
          </div>
          <div v-if="separatorChoice === 'eigen'" class="flex min-w-0 items-center gap-2 pl-7">
            <input class="input input-sm w-24 shrink-0 font-mono" data-multi-separator-input aria-label="Eigener Trenner" placeholder=" / " :value="customSeparator" @input="setCustomSeparator(($event.target as HTMLInputElement).value)" />
            <span class="min-w-0 text-xs text-base-content/75 [overflow-wrap:anywhere]">„{{ separatorExample(customSeparator || undefined) }}“ · Leerzeichen zählen mit</span>
          </div>
        </fieldset>
        </div>
      </details>

      <!-- FUNKTIONSKONFIGURATION (eigener aufklappbarer Bereich zwischen „Allgemein" und „Abhängigkeit",
           Maintainer-Wunsch): Einstellungen, die eine Funktion selbst anbietet. Allgemein gedacht - neue
           Optionen weiterer Funktionen kommen hierher. Erscheint nur, wenn die Funktion etwas anbietet
           (hasFunctionConfig). Kopf mit ⓘ statt Vorschau. Heute: Text ab der Schwelle und Zeilenende (EGSYS) sowie
           das Zeilen-Format der Listen-Funktionen (Medikationsplan, Kontakte/Ärzte). -->
      <details v-if="node.type === 'function' && hasFunctionConfig" class="group rounded-lg bg-base-200/50">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span class="shrink-0">Funktionskonfiguration</span>
          <InfoTip :info="INFO.functionConfig" />
          <span class="flex-1" aria-hidden="true"></span>
          <span class="shrink-0 text-base-content/75 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <div class="space-y-2 px-4 pb-4">
          <fieldset v-if="thresholdTextDef" class="fieldset">
            <legend class="fieldset-legend">{{ thresholdTextDef.label }} <InfoTip :info="INFO.thresholdText" /></legend>
            <input class="input w-full" :value="node.config?.thresholdText ?? ''" :placeholder="thresholdTextDef.standard" @input="setConfig({ thresholdText: ($event.target as HTMLInputElement).value.trim() ? ($event.target as HTMLInputElement).value : undefined })" />
            <p class="text-xs text-base-content/75">leer = Standard „{{ thresholdTextDef.standard }}“</p>
          </fieldset>
          <fieldset v-if="lineEndDef" class="fieldset">
            <legend class="fieldset-legend">{{ lineEndDef.label }} <InfoTip :info="INFO.lineEnd" /></legend>
            <input class="input w-24 font-mono" :value="node.config?.lineEnd ?? lineEndDef.standard" @input="setLineEnd(($event.target as HTMLInputElement).value)" />
            <p class="text-xs text-base-content/75">{{ lineEndDef.standard ? `Standard „${lineEndDef.standard}“ · leer = nichts am Ende` : 'Standard: nichts am Ende' }}</p>
          </fieldset>
          <!-- Listen-Funktion (Medikamentenplan/Kontakte/Ärzte): Zeilen-Format. Score-Funktionen haben keine
               Zeilen-Liste -> kein Zeilen-Format. -->
          <template v-if="isListFunction">
            <span class="text-xs font-semibold text-base-content/75">Zeilen-Format</span>
            <label class="flex w-full cursor-pointer items-center gap-2 py-0">
              <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.config?.rowLayout === 'inline'" @change="setConfig(($event.target as HTMLInputElement).checked ? { rowLayout: 'inline', rowPrefix: undefined, rowSuffix: undefined } : { rowLayout: 'block', rowSeparator: undefined })" />
              <span class="text-sm">Hintereinander (eine Zeile, mit Trenner) statt untereinander</span>
              <InfoTip :info="INFO.rowLayout" class="ml-auto" />
            </label>
            <!-- hintereinander -> freier Trenner -->
            <fieldset v-if="node.config?.rowLayout === 'inline'" class="fieldset">
              <legend class="fieldset-legend">Trenner zwischen Einträgen <InfoTip :info="INFO.rowSeparator" /></legend>
              <input class="input w-full font-mono" :value="node.config?.rowSeparator ?? ''" placeholder="z. B.  |  oder  / " @input="setConfig({ rowSeparator: ($event.target as HTMLInputElement).value || undefined })" />
              <!-- Wert aus der Konstante, die der Renderer nutzt - sonst laufen Text und Ausgabe wieder auseinander. -->
              <p class="text-xs text-base-content/75">leer = Standard-Trenner „{{ FUNCTION_ROW_INLINE_SEPARATOR }}“ (Semikolon)</p>
              <!-- Der frühere Standard: Der Renderer behandelt ihn wie „leer“ (rowSeparatorOf), das Feld zeigt ihn aber noch. -->
              <p v-if="node.config?.rowSeparator === LEGACY_ROW_INLINE_SEPARATOR" class="text-xs text-base-content/75" data-legacy-separator>Der Mittelpunkt war früher der Standard, die Bridge kann ihn nicht tippen. Im Protokolltext steht dafür „{{ FUNCTION_ROW_INLINE_SEPARATOR }}“.</p>
            </fieldset>
            <!-- untereinander -> Praefix/Suffix je Zeile -->
            <template v-else>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Präfix je Zeile <InfoTip :info="INFO.rowPrefix" /></legend>
                <input class="input w-full font-mono" :value="node.config?.rowPrefix ?? ''" placeholder="z. B. - " @input="setConfig({ rowPrefix: ($event.target as HTMLInputElement).value || undefined })" />
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Suffix je Zeile <InfoTip :info="INFO.rowSuffix" /></legend>
                <input class="input w-full font-mono" :value="node.config?.rowSuffix ?? ''" placeholder="z. B. ;" @input="setConfig({ rowSuffix: ($event.target as HTMLInputElement).value || undefined })" />
              </fieldset>
            </template>
          </template>
        </div>
      </details>

      <!-- ABHAENGIGKEIT: eigener aufklappbarer Bereich ueber „Erweitert" (gleiches <details>-Muster, siehe dort).
           Der Kopf zeigt die Regeln als Vorschau. Nicht an der Wurzel - die ist im Einsatz kein eigenes Element. -->
      <details v-if="!isRoot" class="group rounded-lg bg-base-200/50">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span class="shrink-0">Abhängigkeit</span>
          <InfoTip :info="INFO.dependency" />
          <span class="min-w-0 flex-1 truncate text-xs " :class="depBroken ? 'text-error' : 'text-base-content/75'">{{ depSummary }}</span>
          <span class="shrink-0 text-base-content/75 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <div class="space-y-4 px-4 pb-4">
          <!-- ERSCHEINEN: das Element ist im Einsatz ausgeblendet, bis die Bedingungen zutreffen. -->
          <div class="space-y-3">
            <label
              class="flex w-full items-center gap-2 py-0"
              :class="!node.dependsOn && (depBlockedByRequired || !depCandidates.length) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
              :title="!node.dependsOn && depBlockedByRequired ? 'Nicht zusammen mit „Pflichtfeld\u201c möglich.' : undefined"
            >
              <input
                type="checkbox"
                class="toggle toggle-sm shrink-0"
                :checked="!!node.dependsOn"
                :disabled="!node.dependsOn && (depBlockedByRequired || !depCandidates.length)"
                @change="setDependency(($event.target as HTMLInputElement).checked)"
              />
              <span class="text-sm">Nur anzeigen, wenn eine Bedingung zutrifft</span>
              <InfoTip :info="INFO.dependencyVisible" class="ml-auto" />
            </label>
            <p v-if="!depCandidates.length && !node.dependsOn" class="text-xs text-base-content/75">
              In dieser Vorlage gibt es noch kein anderes Feld mit Auswahl-Optionen, von dem dieses Element abhängen könnte.
            </p>
            <template v-if="node.dependsOn">
              <div v-for="(c, i) in depConditions" :key="i" class="space-y-2 rounded-lg border border-base-300 p-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-base-content/75">Bedingung {{ i + 1 }}</span>
                  <button v-if="depConditions.length > 1" type="button" class="btn btn-ghost btn-xs text-error" @click="removeCondition(i)">Entfernen</button>
                </div>
                <ConditionEditor :root="root" :condition="c" :choices="depCandidates" options-label="Trifft zu, wenn eine davon gewählt ist" @update="updateCondition(i, $event)" />
              </div>
              <button v-if="depConditions.length < MAX_CONDITIONS" type="button" class="btn btn-ghost btn-xs" @click="addCondition">＋ Weitere Bedingung</button>
              <label v-if="depConditions.length > 1" class="flex w-full cursor-pointer items-center gap-2 py-0">
                <input type="checkbox" class="toggle toggle-sm shrink-0" :checked="node.dependsOn.match === 'any'" @change="setMatchAny(($event.target as HTMLInputElement).checked)" />
                <span class="text-sm">Eine Bedingung genügt <span class="text-base-content/75">(sonst müssen alle zutreffen)</span></span>
                <InfoTip :info="INFO.dependencyAny" class="ml-auto" />
              </label>
            </template>
          </div>

          <!-- INHALT (nur Felder): solange eine Bedingung zutrifft, gilt ein anderer Standardwert. -->
          <div v-if="fieldNode" class="space-y-3 border-t border-base-300 pt-3">
            <div class="flex items-center gap-1">
              <span class="text-sm">Anderer Standardwert</span>
              <InfoTip :info="INFO.defaultWhen" class="ml-auto" />
            </div>
            <div v-for="(r, i) in defaultRules" :key="i" class="space-y-2 rounded-lg border border-base-300 p-3">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-semibold text-base-content/75">Regel {{ i + 1 }}</span>
                <button type="button" class="btn btn-ghost btn-xs text-error" @click="removeDefaultRule(i)">Entfernen</button>
              </div>
              <ConditionEditor :root="root" :condition="r" :choices="depCandidates" options-label="Gilt, wenn eine davon gewählt ist" @update="updateDefaultRule(i, $event)" />
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Standardwert in diesem Fall</legend>
                <select v-if="ownOptions.length" class="select w-full" :value="ownOptions.includes(r.value) ? r.value : ''" @change="updateDefaultRule(i, { value: ($event.target as HTMLSelectElement).value })">
                  <option v-if="!ownOptions.includes(r.value)" value="" disabled>Option wählen …</option>
                  <option v-for="o in ownOptions" :key="o" :value="o">{{ o }}</option>
                </select>
                <textarea v-else-if="fieldNode.multiline" class="textarea w-full" rows="3" :value="r.value" @input="updateDefaultRule(i, { value: ($event.target as HTMLTextAreaElement).value })" />
                <input v-else class="input w-full" :value="r.value" @input="updateDefaultRule(i, { value: ($event.target as HTMLInputElement).value })" />
              </fieldset>
            </div>
            <p v-if="!depCandidates.length && !defaultRules.length" class="text-xs text-base-content/75">
              Dafür braucht es ein anderes Feld mit Auswahl-Optionen.
            </p>
            <button v-if="defaultRules.length < MAX_DEFAULT_RULES" type="button" class="btn btn-ghost btn-xs" :disabled="!depCandidates.length" @click="addDefaultRule">＋ Regel hinzufügen</button>
            <p v-if="defaultRules.length > 1" class="text-xs text-base-content/75">Treffen mehrere Regeln zu, gilt die oberste.</p>
          </div>
        </div>
      </details>

      <!-- ERWEITERT (Progressive Disclosure): nur noch selten Gebrauchtes - interne id, bei Abschnitten Feld-Trenner
           und Text wenn leer. Titel-Format und Inline stehen unter „Allgemein" bei ihren Schaltern. Default zu;
           Kopf zeigt die id als Vorschau. -->
      <!-- BEWUSST kein daisyUI-.collapse: dessen animiertes Auf-/Zuklappen nutzt content-visibility:hidden->visible
           (+ interpolate-size min-height/height 0->auto). Der Inhalt ist geschlossen NICHT gelayoutet und wird beim
           Oeffnen erstmalig vermessen; auf iOS/Android-WebView sitzt der Erst-Layout erst nach einem Reflow (Tap)
           korrekt -> die Felder ruecken sichtbar nach. Natives <details> layoutet in EINEM Pass, kein Nachruecken. -->
      <details class="group rounded-lg bg-base-200/50">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span class="shrink-0">Erweitert</span>
          <InfoTip :info="INFO.advanced" />
          <code class="min-w-0 flex-1 truncate font-mono text-xs text-base-content/75">id: {{ node.id }}</code>
          <span class="shrink-0 text-base-content/75 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
        </summary>
        <div class="space-y-3 px-4 pb-4">
          <!-- Identifier (id): interner Schluessel, auto-vergeben, selten noetig. Sichtbare Inline-Validierung.
               NICHT fuer die Wurzel: deren id IST die Vorlagen-Kennung (Bibliothek) - ein Rename hier wuerde
               editorActiveId desynchronisieren (Editor spraenge bei mehreren Vorlagen still auf eine andere). -->
          <fieldset v-if="!isRoot" class="fieldset">
            <legend class="fieldset-legend">Kennung (id) <InfoTip :info="INFO.id" /></legend>
            <input class="input w-full font-mono" :class="idError ? 'input-error' : ''" v-model="idDraft" @change="commitId" @blur="commitId" />
            <p v-if="idError" role="alert" class="flex items-start gap-1 text-sm text-error"><span aria-hidden="true">⚠</span><span>{{ idError }}</span></p>
            <p v-else class="text-xs text-base-content/75">Interne Kennung · wird automatisch vergeben · normalerweise nicht ändern</p>
          </fieldset>
          <p v-else class="text-xs text-base-content/75">Oberste Ebene der Vorlage · die Kennung „{{ node.id }}" wird über die Bibliothek verwaltet (Titel umbenennen).</p>

          <!-- CONTAINER: Ausgabe-Optionen (Feld-Trenner + Text wenn leer) -->
          <template v-if="node.type === 'container'">
            <fieldset v-if="node.children.length > 0" class="fieldset">
              <legend class="fieldset-legend">Feld-Trenner (zwischen inline-Elementen) <InfoTip :info="INFO.separator" /></legend>
              <input class="input w-full font-mono" :value="node.separator ?? ''" :placeholder="separatorPlaceholder" @input="setSeparator(($event.target as HTMLInputElement).value)" />
              <p v-if="isRoot" class="text-xs text-base-content/75">Gilt für die ganze Vorlage · leer = „, "</p>
              <p v-else class="text-xs text-base-content/75">leer = erbt · aktuell wirksam: „{{ effectiveSeparator }}"</p>
            </fieldset>
            <!-- „Text wenn leer" NICHT am Wurzel-Container: greift nur, wenn das GANZE Protokoll leer
                 rendert (render.ts:137-139) — ein komplett leeres Protokoll braucht ohnehin keine Ausgabe.
                 Am Root also sinnlos; Feld-Trenner (Protokoll-Standard) bleibt dagegen. -->
            <fieldset v-if="!isRoot" class="fieldset">
              <legend class="fieldset-legend">Text wenn leer <InfoTip :info="INFO.emptyText" /></legend>
              <input class="input w-full" :value="node.emptyText ?? ''" placeholder="z. B. unauffällig" @input="set({ emptyText: ($event.target as HTMLInputElement).value || undefined })" />
              <p class="text-xs text-base-content/75">Steht im Protokolltext, wenn der Abschnitt angezeigt wird, seine Felder aber nichts ausgeben.</p>
            </fieldset>
          </template>

        </div>
      </details>
    </div>
  </div>
  <p v-else class="text-sm text-base-content/75">Nichts ausgewählt — links unter „Aufbau" einen Eintrag wählen.</p>

  <!-- Optionen bearbeiten: eigenes Fenster, schreibt erst bei „Übernehmen“/„Fertig“ -->
  <OptionsDialog v-if="optionsOpen && fieldNode" :field="fieldNode" :root="root" @close="optionsOpen = false" @apply="applyOptions" />
</template>
