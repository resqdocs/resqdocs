# Container — saubere Implementierung (quellenbasiert)

> Bewertung unseres Entwurfs + Umsetzungsmuster, belegt. Synthese aus dem Workflow
> `container-impl-research` (JSONForms, SurveyJS, FormKit, JSON Schema, Redux, Immer, Vue-Docs).
> Stand 2026-06-23.

## Kurzfazit

Der Entwurf (`src/rebuild/model.ts` · `creator.ts` · `render.ts`) ist **idiomatisch — kein
Umbau**. Datenmodell = discriminated union ueber `type` + `children[]` (wie JSONForms/SurveyJS).
Hand-Rekursion mit Structural Sharing = richtig fuer Slice 1. **Kein Immer, keine Normalisierung
jetzt** (YAGNI). Ein paar kleine Praezisierungen wurden umgesetzt.

## Umgesetzte Praezisierungen

1. `removeNode`/`addChild`/`updateContainer`/`moveChild`: **No-Op gibt dieselbe Referenz zurueck**
   (Identitaet erhalten -> keine unnoetigen Re-Renders auf unbeteiligten Pfaden). [Redux]
2. **`DEFAULT_HEADING` eingefroren** (`Object.freeze`) — geteilter Fallback, eine Mutation wuerde
   global durchschlagen. [Immer pitfalls]
3. **`moveChild` von Index auf Kind-`id`** umgestellt (robust gegen Index-Drift, passt zur
   id-getriebenen UI).
4. **Tiefe bewusst unbegrenzt** fuer Slice 1, abgesichert durch einen 50-Ebenen-Render-Test.
   (SurveyJS bietet `maxPanelNestingLevel` als Option fuer spaeter.)
5. **Kein Immer / keine Normalisierung** — als Entscheidung im Code dokumentiert, inkl. Trigger.

## State-Shape: genested (jetzt) vs. normalisiert (spaeter)

Genested bleibt fuer Slice 1 (kleiner Baum, viel gelesen, ganzer Baum wird beim Klartext-Render
ohnehin serialisiert). Umstieg auf normalisiert (`byId` + `childIds` + `parentId`), wenn: > ~100
Knoten / > 4-5 Ebenen mit haeufigen Edits, Drag&Drop quer durch den Baum, oder spuerbare
Tipp-Latenz. [Redux normalizing-state-shape]

## Editor: rekursive Vue-Komponente (verifiziertes Muster)

- **Self-Reference ueber den Dateinamen:** `ContainerTreeNode.vue` darf `<ContainerTreeNode/>`
  ohne Import/Registrierung verwenden. [vuejs.org/api/sfc-spec]
- **`:key="child.id"`** im `v-for` (stabile id, nie Index — sonst falsche Wiederverwendung beim
  Move/Insert). [vuejs.org/api/built-in-special-attributes]
- **Aenderungen nach oben:** provide/inject mit einer zentralen `applyOp` am Editor-Root. Jede
  Node ruft eine reine Creator-Op (`updateContainer`/`addChild`/…), der Root ersetzt den Baum.
  Kein Prop-Drilling, die reinen `.ts`-Ops bleiben Single Source of Truth; `v-model` pro Feld
  INNERHALB einer Node ist fein. [vuejs.org provide-inject, v-model]
- **Reaktivitaet:** Wurzel in einem `ref` halten und `.value` komplett neu zuweisen
  (`root.value = updateContainer(root.value, …)`) — nie einen `reactive()`-Root neu zuweisen.
  `shallowRef` ist die spaetere Optimierung. [vuejs.org reactivity-fundamentals, performance]

## Quellen

- https://vuejs.org/api/sfc-spec , https://vuejs.org/api/built-in-special-attributes.html
- https://vuejs.org/guide/components/provide-inject.html , https://vuejs.org/guide/components/v-model
- https://vuejs.org/guide/essentials/reactivity-fundamentals.html , https://vuejs.org/guide/best-practices/performance.html
- https://jsonforms.io/docs/uischema/layouts , https://jsonforms.io/api/core/interfaces/categorization.html
- https://surveyjs.io/form-library/documentation/api-reference/panel-model
- https://formkit.com/essentials/schema , https://formkit.com/inputs/group
- https://json-schema.org/understanding-json-schema/structuring
- https://redux.js.org/usage/structuring-reducers/normalizing-state-shape , https://redux.js.org/faq/immutable-data/
- https://immerjs.github.io/immer/ , https://immerjs.github.io/immer/pitfalls/
