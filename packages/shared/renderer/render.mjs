// render.mjs — reiner Renderer: Protokoll-Vorlage (+ pro-Einsatz-Zustand) → Klartext.
// Keine Abhängigkeiten. Übernehmbar in die PWA (Composer) und testbar mit node:test.
//
//   render(protocol, { variableValues, values, activeBlocks }, { heading }) -> string
//
//   protocol:       Vorlage nach SCHEMA.md (blocks → points, variables).
//   variableValues: { [varId]: wert } — überschreibt Variablen-Defaults (z. B. geschlecht).
//   values:         pro Punkt-/Befund-id Übersteuerung:
//                     - "Freitext"          → Wert setzen; bei finding ⇒ state "abnormal"
//                     - { value, state }    → explizit
//                     - ["a","b"]           → list-entries ersetzen
//   activeBlocks:   string[] — ids der aktivierten optionalen Blöcke.
//   heading:        { pattern, fill, width } — optionale Header-Formatierung (Default DEFAULT_HEADING).
//
// Eigenschaften: deterministisch; die Vorlage wird NICHT mutiert; Bedingungen (`visibleIf`)
// und Platzhalter sind deklarativ — kein eval, kein JavaScript aus Daten.
//
// Sichtbarkeit, Einsatz-Kontext und `visibleIf`-Auswertung leben zentral in
// runtime.mjs (von Renderer UND App genutzt — keine Doppel-Implementierung).

import {
  buildContext,
  getVisibleBlocks,
  getVisiblePoints,
  listEntries,
  medikamenteRows,
  resolveText,
} from "./runtime.mjs";

const HEADER_WIDTH = 60;

/** Default-Kopfzeile; per options.heading konfigurierbar (#68). */
export const DEFAULT_HEADING = Object.freeze({ pattern: "# {titel} ", fill: "=", width: HEADER_WIDTH });

function header(title, heading = DEFAULT_HEADING) {
  const pattern = typeof heading.pattern === "string" && heading.pattern.includes("{titel}")
    ? heading.pattern : DEFAULT_HEADING.pattern;
  const prefix = pattern.replaceAll("{titel}", title);
  const fill = typeof heading.fill === "string" ? heading.fill.slice(0, 1) : DEFAULT_HEADING.fill;
  if (!fill) return prefix.trimEnd();
  const width = Number.isFinite(Number(heading.width)) && Number(heading.width) > 0
    ? Number(heading.width) : DEFAULT_HEADING.width;
  return prefix + fill.repeat(Math.max(3, width - prefix.length));
}

// --- Rendern ---  (Sichtbarkeit + Platzhalter kommen zentral aus runtime.mjs)

function findingLine(f, ctx) {
  const ps = ctx.points[f.id];
  const body = resolveText(ps.value, ctx);
  const label = f.label ? resolveText(f.label, ctx) : null;
  return label ? `${label}: ${body}` : body;
}

function renderPoint(p, ctx) {
  switch (p.type) {
    case "field": {
      if (ctx.points[p.id].excluded) return null; // dreistufig (#43): entfernt
      const text = resolveText(ctx.points[p.id].value, ctx);
      if (!p.label) return text ? `- ${text}` : null;
      const lbl = resolveText(p.label, ctx);
      const sep = /[?:.!]$/.test(lbl) ? "" : ":";
      // Mehrzeilige Werte (#144, z. B. BMP-Medikationsliste): Label-Zeile mit
      // Bullet, die Wertzeilen darunter OHNE "-" voran (bessere Lesbarkeit).
      if (text && text.includes("\n")) return `- ${lbl}${sep}\n${text}`;
      return text ? `- ${lbl}${sep} ${text}` : `- ${lbl}${sep}`;
    }
    case "finding":
      // Nicht erhoben (#71): Zeile entfaellt komplett.
      if (ctx.points[p.id].excluded) return null;
      return `- ${findingLine(p, ctx)}`;
    case "findingGroup": {
      // Nicht erhobene Befunde aus dem Gruppensatz nehmen; ist die ganze
      // Gruppe nicht erhoben, entfaellt auch die "Key:"-Zeile (#71).
      const included = p.findings.filter((f) => !ctx.points[f.id].excluded);
      if (included.length === 0) return null;
      const body = included.map((f) => findingLine(f, ctx)).join(". ");
      return `${p.key}: ${body}.`;
    }
    case "list": {
      const entries = listEntries(p, ctx.values);
      return entries.length ? entries.map((e) => `- ${resolveText(e, ctx)}`).join("\n") : null;
    }
    case "text":
      return `- ${resolveText(p.content, ctx)}`;
    case "medikamente": {
      // #146: Zeilen kommen nur aus dem Einsatz; Format je Zeile
      // "Name: Dosierung - Kommentar" OHNE "-" voran (wie #144).
      const rows = medikamenteRows(p, ctx.values);
      if (!rows.length) return null;
      const lines = rows.map((r) => {
        const dosis = String(r.dosierung ?? "").trim();
        const kommentar = String(r.kommentar ?? "").trim();
        return `${String(r.name).trim()}${dosis ? `: ${dosis}` : ""}${kommentar ? ` - ${kommentar}` : ""}`;
      });
      const lbl = p.label ? resolveText(p.label, ctx) : null;
      return lbl ? `- ${lbl}:\n${lines.join("\n")}` : lines.join("\n");
    }
    default:
      throw new Error(`Unbekannter point.type: ${p.type}`);
  }
}

function renderBlock(block, ctx, heading) {
  const lines = getVisiblePoints(block, ctx)
    .map((p) => renderPoint(p, ctx))
    .filter((l) => l != null);
  return [header(resolveText(block.title, ctx), heading), ...lines].join("\n");
}

export function render(protocol, opts = {}, options = {}) {
  const ctx = buildContext(protocol, opts);
  const heading = { ...DEFAULT_HEADING, ...(options.heading ?? {}) };
  return getVisibleBlocks(protocol, ctx)
    .map((b) => renderBlock(b, ctx, heading))
    .join("\n\n");
}

export default render;
