// creator.mjs — pure, Vue-freie Domainlogik des Protokoll-Kreators (#13-A).
//
// Erzeugt/bearbeitet NEUTRALE S1-Protokollvorlagen (blocks → points, variables,
// visibleIf, optionale Blöcke). KEINE UI, KEINE Persistenz, KEINE Einsatz-/
// Patientendaten, KEIN caseState. Alle Funktionen sind rein: sie geben eine neue
// Struktur zurück und mutieren die Eingabe NICHT (deep-clone via structuredClone).
//
// Render-/Sichtbarkeits-Auswertung bleibt in der Runtime (packages/shared/renderer);
// hier wird nichts davon dupliziert — der Kreator KONSTRUIERT und VALIDIERT nur.
//
// Maßgeblich: docs/protocol-creator-mvp.md. Autoritative Schema-Prüfung bleibt
// protocol.schema.json (CI/Export); assertValidProtocolDraft ist ein leichter
// Struktur-/Draft-Check für die Editier-Schleife.

/** Aktuelle Entwicklungs-Schemaversion (0.x). 1.0/MVP deklariert der Maintainer. */
export const SCHEMA_VERSION = "0.2.0"; // 0.2.0: Punkt-Typ medikamente (#146)

export const POINT_TYPES = ["field", "finding", "findingGroup", "list", "text", "medikamente"];
export const VARIABLE_TYPES = ["select", "boolean", "text", "number"];
/** Operatoren des einfachen (MVP) visibleIf-Editors — genau eine Bedingung. */
export const SIMPLE_OPS = ["eq", "in", "truthy", "filled", "state"];

// structuredClone wirft DataCloneError auf Proxies (z. B. Vue-reactive, bug-089).
// Fallback: JSON-Roundtrip - Protokolle sind reine JSON-Daten, verlustfrei.
const clone = (x) => {
  try {
    return structuredClone(x);
  } catch {
    return JSON.parse(JSON.stringify(x));
  }
};

// --- IDs ----------------------------------------------------------------------

export function slugify(text) {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stabile, kollisionsfreie id aus einem Basis-Text + (falls nötig) Zähler-Suffix. */
export function createUniqueId(base, existingIds) {
  const set = existingIds instanceof Set ? existingIds : new Set(existingIds ?? []);
  const root = slugify(base) || "id";
  if (!set.has(root)) return root;
  let n = 2;
  while (set.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/**
 * Fehlende Punkt-IDs nachruesten (#66): Seed-/Import-Protokolle koennen
 * findingGroups OHNE Punkt-id enthalten (Schema verlangte dort nur `key`) -
 * Auswahl und updatePoint arbeiten aber ueber p.id. Liefert eine Kopie, in
 * der JEDER Punkt eine kollisionsfreie id hat; vorhandene ids bleiben.
 */
export function ensureProtocolPointIds(protocol) {
  const copy = clone(protocol);
  const ids = collectProtocolIds(copy);
  for (const b of copy.blocks ?? []) {
    for (const pt of b.points ?? []) {
      if (!pt.id) {
        pt.id = createUniqueId(pt.key || pt.label || pt.type || "punkt", ids);
        ids.add(pt.id);
      }
    }
  }
  return copy;
}

/** Alle internen ids (Variablen, Blöcke, Punkte, findingGroup-Kinder) eines Protokolls. */
export function collectProtocolIds(protocol) {
  const ids = new Set();
  for (const v of protocol?.variables ?? []) if (v.id) ids.add(v.id);
  for (const b of protocol?.blocks ?? []) {
    if (b.id) ids.add(b.id);
    for (const p of b.points ?? []) {
      if (p.id) ids.add(p.id);
      if (p.type === "findingGroup") for (const f of p.findings ?? []) if (f.id) ids.add(f.id);
    }
  }
  return ids;
}

function remapPredicate(pred, idMap) {
  if (!pred || typeof pred !== "object") return pred;
  const out = { ...pred };
  if ("point" in out && idMap.has(out.point)) out.point = idMap.get(out.point);
  for (const k of ["all", "any"]) if (Array.isArray(out[k])) out[k] = out[k].map((p) => remapPredicate(p, idMap));
  if (out.not) out.not = remapPredicate(out.not, idMap);
  return out;
}

// --- Protokoll ----------------------------------------------------------------

export function createProtocol(input = {}) {
  const title = input.title ?? "Neues Protokoll";
  // Bewusst NUR bekannte Protokoll-Felder übernehmen (kein blindes Spread →
  // keine caseState/Einsatzdaten gelangen in eine Vorlage).
  const protocol = {
    schemaVersion: SCHEMA_VERSION,
    id: input.id || createUniqueId(title || "protokoll", new Set()),
    title,
    lang: input.lang ?? "de",
    variables: clone(input.variables ?? []),
    blocks: clone(input.blocks ?? []),
  };
  if (input.meta && typeof input.meta === "object" && input.meta.source != null) {
    protocol.meta = { source: String(input.meta.source) };
  }
  return protocol;
}

export function duplicateProtocol(protocol) {
  const copy = clone(protocol);
  delete copy.example; // ein Duplikat ist eine editierbare Kopie, keine Beispiel-Vorlage
  copy.title = `${protocol.title ?? "Protokoll"} (Kopie)`;
  // Nur die protocol.id muss neu sein; interne ids bleiben (self-consistent,
  // erhält visibleIf-Referenzen). Kollision mit der Quelle wird vermieden.
  copy.id = createUniqueId(copy.title, new Set([protocol.id]));
  return copy;
}

export function renameProtocol(protocol, title) {
  if (!String(title ?? "").trim()) throw new Error("Protokoll-Titel darf nicht leer sein");
  const copy = clone(protocol);
  copy.title = title; // id bleibt stabil
  return copy;
}

// --- Block --------------------------------------------------------------------

export function addBlock(protocol, input = {}) {
  const title = input.title ?? "Neuer Block";
  if (!String(title).trim()) throw new Error("Block-Titel darf nicht leer sein");
  const copy = clone(protocol);
  const ids = collectProtocolIds(copy);
  const block = {
    id: input.id && !ids.has(input.id) ? input.id : createUniqueId(title, ids),
    title,
    optional: input.optional ?? false,
    points: clone(input.points ?? []),
  };
  if (input.visibleIf) block.visibleIf = clone(input.visibleIf);
  if (input.snippetSlot) block.snippetSlot = input.snippetSlot;
  copy.blocks = [...(copy.blocks ?? []), block];
  return copy;
}

export function updateBlock(protocol, blockId, patch = {}) {
  const copy = clone(protocol);
  const block = (copy.blocks ?? []).find((b) => b.id === blockId);
  if (!block) throw new Error(`Block nicht gefunden: ${blockId}`);
  if ("id" in patch && patch.id !== blockId) throw new Error("Block-id ist nicht editierbar");
  if ("title" in patch) {
    if (!String(patch.title ?? "").trim()) throw new Error("Block-Titel darf nicht leer sein");
    block.title = patch.title;
  }
  if ("optional" in patch) block.optional = Boolean(patch.optional);
  if ("visibleIf" in patch) {
    if (patch.visibleIf == null) delete block.visibleIf;
    else block.visibleIf = clone(patch.visibleIf);
  }
  if ("snippetSlot" in patch) block.snippetSlot = patch.snippetSlot;
  return copy; // Punkte werden über die Punkt-Funktionen geändert
}

export function removeBlock(protocol, blockId) {
  const copy = clone(protocol);
  copy.blocks = (copy.blocks ?? []).filter((b) => b.id !== blockId);
  return copy;
}

/** Element in einem Array um eine Position verschieben (No-op an den Raendern). */
function moveInArray(arr, index, direction) {
  const target = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= arr.length) return false;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
  return true;
}

/** Block um eine Position verschieben (#46). direction: "up" | "down". No-op am Rand. */
export function moveBlock(protocol, blockId, direction) {
  const copy = clone(protocol);
  const blocks = copy.blocks ?? [];
  moveInArray(blocks, blocks.findIndex((b) => b.id === blockId), direction);
  return copy;
}

/** Punkt innerhalb seines Blocks verschieben (#46). direction: "up" | "down". No-op am Rand. */
export function movePoint(protocol, pointId, direction) {
  const copy = clone(protocol);
  const { block, index } = findPoint(copy, pointId);
  if (!block) throw new Error(`Punkt nicht gefunden: ${pointId}`);
  moveInArray(block.points, index, direction);
  return copy;
}

export function duplicateBlock(protocol, blockId) {
  const copy = clone(protocol);
  const idx = (copy.blocks ?? []).findIndex((b) => b.id === blockId);
  if (idx === -1) throw new Error(`Block nicht gefunden: ${blockId}`);
  const ids = collectProtocolIds(copy);
  const dup = clone(copy.blocks[idx]);
  dup.title = `${copy.blocks[idx].title} (Kopie)`;
  dup.id = createUniqueId(dup.title, ids);
  ids.add(dup.id);

  // Neue ids für Punkte + findingGroup-Kinder; interne visibleIf-Referenzen remappen.
  const idMap = new Map();
  for (const p of dup.points ?? []) {
    if (p.id) { const nid = createUniqueId(p.label || p.type, ids); ids.add(nid); idMap.set(p.id, nid); p.id = nid; }
    if (p.type === "findingGroup") for (const f of p.findings ?? []) {
      if (f.id) { const nid = createUniqueId(f.label || "finding", ids); ids.add(nid); idMap.set(f.id, nid); f.id = nid; }
    }
  }
  for (const p of dup.points ?? []) if (p.visibleIf) p.visibleIf = remapPredicate(p.visibleIf, idMap);
  if (dup.visibleIf) dup.visibleIf = remapPredicate(dup.visibleIf, idMap);

  copy.blocks.splice(idx + 1, 0, dup);
  return copy;
}

/**
 * Fügt einen EXTERNEN Block (z. B. aus der Bibliothek) als KOPIE ans Ende ein:
 * neue, kollisionsfreie Block-/Punkt-/findingGroup-Kind-IDs; interne
 * `visibleIf`-`point`-Referenzen werden mit-remappt; `var`-Referenzen und
 * Referenzen auf Punkte AUSSERHALB des Blocks bleiben unverändert (können danach
 * als Dangling-Warnung in assertValidProtocolDraft erscheinen). Quelle wird nicht
 * mutiert (tiefe Kopie).
 */
export function insertBlock(protocol, block) {
  if (!block || typeof block !== "object") throw new Error("Einzufügender Block fehlt");
  const copy = clone(protocol);
  const ids = collectProtocolIds(copy);
  const dup = clone(block);
  dup.id = createUniqueId(dup.title || "block", ids);
  ids.add(dup.id);

  const idMap = new Map();
  for (const p of dup.points ?? []) {
    if (p.id) { const nid = createUniqueId(p.label || p.type, ids); ids.add(nid); idMap.set(p.id, nid); p.id = nid; }
    if (p.type === "findingGroup") for (const f of p.findings ?? []) {
      if (f.id) { const nid = createUniqueId(f.label || "finding", ids); ids.add(nid); idMap.set(f.id, nid); f.id = nid; }
    }
  }
  for (const p of dup.points ?? []) if (p.visibleIf) p.visibleIf = remapPredicate(p.visibleIf, idMap);
  if (dup.visibleIf) dup.visibleIf = remapPredicate(dup.visibleIf, idMap);

  copy.blocks = [...(copy.blocks ?? []), dup];
  return copy;
}

// --- Punkt --------------------------------------------------------------------

function buildPoint(type, input, ids) {
  const base = input.label || input.key || type;
  const id = input.id && !ids.has(input.id) ? input.id : createUniqueId(base, ids);
  ids.add(id);
  const p = { type, id };
  if (input.label != null) p.label = input.label;
  if (input.visibleIf) p.visibleIf = clone(input.visibleIf);
  switch (type) {
    case "field":
      if (input.default != null) p.default = input.default;
      if (input.value != null) p.value = input.value;
      if (Array.isArray(input.options)) p.options = [...input.options];
      break;
    case "finding":
      p.normal = input.normal ?? "";
      if (input.value != null) p.value = input.value;
      p.state = input.state ?? "normal";
      break;
    case "findingGroup":
      p.key = input.key ?? "";
      p.findings = (Array.isArray(input.findings) ? input.findings : []).map((f) => {
        const fid = f.id && !ids.has(f.id) ? f.id : createUniqueId(f.label || "finding", ids);
        ids.add(fid);
        const out = { id: fid, normal: f.normal ?? "" };
        if (f.label != null) out.label = f.label;
        if (f.value != null) out.value = f.value;
        out.state = f.state ?? "normal";
        return out;
      });
      break;
    case "list":
      p.entries = Array.isArray(input.entries) ? [...input.entries] : [];
      break;
    case "text":
      p.content = input.content ?? "";
      break;
    case "medikamente":
      // #146: nur id/label/visibleIf - die Zeilen entstehen im Einsatz
      // (Vorlagen enthalten nie Patientendaten, also auch keine Medikamente).
      break;
    default:
      throw new Error(`Ungültiger Punkt-Typ: ${type}`);
  }
  return p;
}

export function addPoint(protocol, blockId, input = {}) {
  const type = input.type ?? "field";
  if (!POINT_TYPES.includes(type)) throw new Error(`Ungültiger Punkt-Typ: ${type}`);
  const copy = clone(protocol);
  const block = (copy.blocks ?? []).find((b) => b.id === blockId);
  if (!block) throw new Error(`Block nicht gefunden: ${blockId}`);
  const ids = collectProtocolIds(copy);
  block.points = [...(block.points ?? []), buildPoint(type, input, ids)];
  return copy;
}

function findPoint(protocol, pointId) {
  for (const block of protocol.blocks ?? []) {
    const index = (block.points ?? []).findIndex((p) => p.id === pointId);
    if (index !== -1) return { block, point: block.points[index], index };
  }
  return { block: null, point: null, index: -1 };
}

export function updatePoint(protocol, pointId, patch = {}) {
  const copy = clone(protocol);
  const { point } = findPoint(copy, pointId);
  if (!point) throw new Error(`Punkt nicht gefunden: ${pointId}`);
  if ("id" in patch && patch.id !== pointId) throw new Error("Punkt-id ist nicht editierbar");
  if ("type" in patch && patch.type !== point.type) {
    throw new Error("Typwechsel nach Anlage ist im MVP nicht möglich (Post-MVP)");
  }
  // findingGroup-Findings: ids stabil halten / fehlende ergänzen.
  if (point.type === "findingGroup" && Array.isArray(patch.findings)) {
    const ids = collectProtocolIds(copy);
    point.findings.forEach((f) => ids.delete(f.id));
    point.findings = patch.findings.map((f) => {
      const fid = f.id && !ids.has(f.id) ? f.id : createUniqueId(f.label || "finding", ids);
      ids.add(fid);
      const out = { id: fid, normal: f.normal ?? "" };
      if (f.label != null) out.label = f.label;
      if (f.value != null) out.value = f.value;
      out.state = f.state ?? "normal";
      return out;
    });
  }
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "type" || k === "findings") continue;
    if (v === undefined) delete point[k];
    else point[k] = clone(v);
  }
  return copy;
}

export function removePoint(protocol, pointId) {
  const copy = clone(protocol);
  for (const block of copy.blocks ?? []) {
    const before = (block.points ?? []).length;
    block.points = (block.points ?? []).filter((p) => p.id !== pointId);
    if (block.points.length !== before) break;
  }
  return copy;
}

export function duplicatePoint(protocol, pointId) {
  const copy = clone(protocol);
  const { block, index } = findPoint(copy, pointId);
  if (!block) throw new Error(`Punkt nicht gefunden: ${pointId}`);
  const ids = collectProtocolIds(copy);
  const dup = clone(block.points[index]);
  const idMap = new Map();
  const nid = createUniqueId(dup.label || dup.type, ids); ids.add(nid);
  if (dup.id) idMap.set(dup.id, nid);
  dup.id = nid;
  if (dup.type === "findingGroup") for (const f of dup.findings ?? []) {
    const fnid = createUniqueId(f.label || "finding", ids); ids.add(fnid);
    if (f.id) idMap.set(f.id, fnid);
    f.id = fnid;
  }
  if (dup.visibleIf) dup.visibleIf = remapPredicate(dup.visibleIf, idMap);
  block.points.splice(index + 1, 0, dup);
  return copy;
}

// --- Variablen ----------------------------------------------------------------

export function addVariable(protocol, input = {}) {
  const type = input.type ?? "text";
  if (!VARIABLE_TYPES.includes(type)) throw new Error(`Ungültiger Variablen-Typ: ${type}`);
  if (type === "select" && !Array.isArray(input.options)) throw new Error("select-Variable benötigt options");
  const copy = clone(protocol);
  const ids = collectProtocolIds(copy);
  const id = input.id && !ids.has(input.id) ? input.id : createUniqueId(input.label || input.id || type, ids);
  const v = { id, type };
  if (input.label != null) v.label = input.label;
  if (type === "select") v.options = clone(input.options);
  if (input.default !== undefined) v.default = input.default;
  if (input.grammar) v.grammar = input.grammar;
  copy.variables = [...(copy.variables ?? []), v];
  return copy;
}

export function updateVariable(protocol, variableId, patch = {}) {
  const copy = clone(protocol);
  const v = (copy.variables ?? []).find((x) => x.id === variableId);
  if (!v) throw new Error(`Variable nicht gefunden: ${variableId}`);
  if ("id" in patch && patch.id !== variableId) throw new Error("Variablen-id ist nicht editierbar");
  if ("type" in patch && patch.type !== v.type) throw new Error("Variablen-Typwechsel ist im MVP nicht vorgesehen");
  for (const [k, val] of Object.entries(patch)) {
    if (k === "id" || k === "type") continue;
    if (val === undefined) delete v[k];
    else v[k] = clone(val);
  }
  if (v.type === "select" && !Array.isArray(v.options)) throw new Error("select-Variable benötigt options");
  return copy;
}

/** Wo eine Variable referenziert wird (visibleIf + {{var:id}}-Platzhalter). */
export function findVariableReferences(protocol, variableId) {
  const refs = [];
  const scanPred = (pred, where) => {
    if (!pred || typeof pred !== "object") return;
    if (pred.var === variableId) refs.push({ kind: "visibleIf", where });
    for (const k of ["all", "any"]) if (Array.isArray(pred[k])) pred[k].forEach((p) => scanPred(p, where));
    if (pred.not) scanPred(pred.not, where);
  };
  const re = new RegExp(`\\{\\{\\s*var:${variableId}\\s*\\}\\}`);
  const scanText = (s, where) => { if (typeof s === "string" && re.test(s)) refs.push({ kind: "placeholder", where }); };
  for (const b of protocol.blocks ?? []) {
    if (b.visibleIf) scanPred(b.visibleIf, `block:${b.id}`);
    scanText(b.title, `block.title:${b.id}`);
    for (const p of b.points ?? []) {
      if (p.visibleIf) scanPred(p.visibleIf, `point:${p.id}`);
      for (const f of ["label", "default", "value", "normal", "content"]) scanText(p[f], `point.${f}:${p.id}`);
      (p.entries ?? []).forEach((e, i) => scanText(e, `point.entries[${i}]:${p.id}`));
      (p.findings ?? []).forEach((f) => ["label", "normal", "value"].forEach((k) => scanText(f[k], `finding.${k}:${f.id}`)));
    }
  }
  return refs;
}

/**
 * Entfernt eine Variable. Referenzen (visibleIf/Platzhalter) bleiben bewusst
 * erhalten (weiche Dangling-Refs: zur Laufzeit harmlos — Prädikat wird falsch,
 * Platzhalter bleibt Text). Aufrufer sollte vorher findVariableReferences()
 * anzeigen; assertValidProtocolDraft meldet Dangling-Refs als WARNUNG.
 */
export function removeVariable(protocol, variableId) {
  const copy = clone(protocol);
  copy.variables = (copy.variables ?? []).filter((v) => v.id !== variableId);
  return copy;
}

// --- Einfaches visibleIf (MVP) ------------------------------------------------

export function isSimpleVisibleIf(pred) {
  if (!pred || typeof pred !== "object" || Array.isArray(pred)) return false;
  if (pred.all || pred.any || pred.not) return false;
  const hasVar = pred.var != null;
  const hasPoint = pred.point != null;
  if (hasVar === hasPoint) return false; // genau eine Quelle
  const ops = SIMPLE_OPS.filter((o) => o in pred);
  if (ops.length !== 1) return false;
  if (hasVar && ops[0] === "state") return false; // state nur für Punkte
  return true;
}

export function createSimpleVisibleIf(input = {}) {
  const { source, id, op } = input;
  if (source !== "var" && source !== "point") throw new Error("source muss 'var' oder 'point' sein");
  if (!id) throw new Error("id erforderlich");
  if (!SIMPLE_OPS.includes(op)) throw new Error(`Operator nicht unterstützt: ${op}`);
  if (source === "var" && op === "state") throw new Error("state gilt nur für Punkte");
  const pred = { [source]: id };
  switch (op) {
    case "eq": pred.eq = input.value; break;
    case "in":
      if (!Array.isArray(input.value)) throw new Error("Operator 'in' erwartet ein Array als value");
      pred.in = [...input.value];
      break;
    case "truthy": pred.truthy = input.value ?? true; break;
    case "filled": pred.filled = input.value ?? true; break;
    case "state": pred.state = input.value ?? "abnormal"; break;
    default: break;
  }
  return pred;
}

// --- Validierung (leichter Draft-Check; autoritativ bleibt protocol.schema.json)

const PRED_KEYS = new Set(["var", "point", "eq", "in", "truthy", "filled", "state", "all", "any", "not"]);

function isValidPredicate(pred) {
  if (!pred || typeof pred !== "object" || Array.isArray(pred)) return false;
  const keys = Object.keys(pred);
  if (keys.length === 0 || keys.some((k) => !PRED_KEYS.has(k))) return false;
  if (pred.all && (!Array.isArray(pred.all) || !pred.all.every(isValidPredicate))) return false;
  if (pred.any && (!Array.isArray(pred.any) || !pred.any.every(isValidPredicate))) return false;
  if (pred.not && !isValidPredicate(pred.not)) return false;
  if ("state" in pred && !["normal", "abnormal"].includes(pred.state)) return false;
  return true;
}

export function assertValidProtocolDraft(protocol) {
  const errors = [];
  const warnings = [];
  // issues: feldscharfe Parallel-Spur zu errors/warnings (#2b). Trägt zusätzlich
  // den bekannten Ort (blockId/pointId/findingId/field) mit. Die String-Listen
  // errors/warnings bleiben UNVERÄNDERT (gleiche Texte, gleiche Reihenfolge) —
  // additiv, damit kein bestehender Konsument bricht.
  const issues = [];
  const pushIssue = (severity, message, loc) => {
    const it = { message, severity };
    if (loc) for (const k of ["blockId", "pointId", "findingId", "field"]) if (loc[k] != null) it[k] = loc[k];
    issues.push(it);
  };
  const e = (m, loc) => { errors.push(m); pushIssue("error", m, loc); };
  const w = (m, loc) => { warnings.push(m); pushIssue("warning", m, loc); };
  if (!protocol || typeof protocol !== "object") {
    e("Protokoll fehlt/ungültig"); // über e() → errors + issues bleiben paritätisch
    return { valid: false, errors, warnings, issues };
  }

  if (typeof protocol.schemaVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(protocol.schemaVersion)) e("schemaVersion fehlt oder ungültig", { field: "schemaVersion" });
  if (!String(protocol.id ?? "").trim()) e("Protokoll-id fehlt", { field: "id" });
  if (!String(protocol.title ?? "").trim()) e("Protokoll-Titel darf nicht leer sein", { field: "title" });
  if (!Array.isArray(protocol.blocks)) e("blocks muss ein Array sein", { field: "blocks" });

  // Eindeutigkeit pro Namespace (Blöcke / Punkte+findingGroup-Kinder / Variablen)
  // — Block- und Punkt-ids dürfen sich überschneiden (getrennte Runtime-Namespaces).
  const uniqIn = (set, id, label, loc) => {
    if (id == null) return;
    if (set.has(id)) e(`Doppelte id: '${id}' (${label})`, loc);
    else set.add(id);
  };
  const blockIds = new Set();
  const pointIdsSeen = new Set();
  const variableIds = new Set();

  for (const v of protocol.variables ?? []) {
    if (!String(v.id ?? "").trim()) e("Variable ohne id", { field: "variable" });
    uniqIn(variableIds, v.id, "variable", { field: "variable" });
    if (!VARIABLE_TYPES.includes(v.type)) e(`Ungültiger Variablen-Typ: ${v.type}`, { field: "variable" });
    if (v.type === "select" && !Array.isArray(v.options)) e(`select-Variable '${v.id}' ohne options`, { field: "variable" });
  }

  for (const b of protocol.blocks ?? []) {
    if (!String(b.id ?? "").trim()) e("Block ohne id", { field: "block" });
    uniqIn(blockIds, b.id, "block", { blockId: b.id });
    if (!String(b.title ?? "").trim()) e(`Block '${b.id}' ohne Titel`, { blockId: b.id, field: "title" });
    if (b.visibleIf && !isValidPredicate(b.visibleIf)) e(`Block '${b.id}': ungültiges visibleIf`, { blockId: b.id, field: "visibleIf" });
    if (!Array.isArray(b.points)) { e(`Block '${b.id}': points kein Array`, { blockId: b.id, field: "points" }); continue; }
    for (const p of b.points) {
      if (!POINT_TYPES.includes(p.type)) { e(`Ungültiger Punkt-Typ: ${p.type}`, { blockId: b.id, field: "type" }); continue; }
      if (p.id != null) uniqIn(pointIdsSeen, p.id, "point", { blockId: b.id, pointId: p.id });
      if (!String(p.id ?? "").trim() && p.type !== "findingGroup") e(`Punkt (${p.type}) ohne id`, { blockId: b.id, field: "id" });
      if (p.type === "finding" && typeof p.normal !== "string") e(`finding '${p.id}' ohne normal`, { blockId: b.id, pointId: p.id, field: "normal" });
      if (p.type === "list" && !Array.isArray(p.entries)) e(`list '${p.id}' ohne entries`, { blockId: b.id, pointId: p.id, field: "entries" });
      if (p.type === "text" && typeof p.content !== "string") e(`text '${p.id}' ohne content`, { blockId: b.id, pointId: p.id, field: "content" });
      if (p.type === "findingGroup") {
        if (!String(p.key ?? "").trim()) e(`findingGroup '${p.id}' ohne key`, { blockId: b.id, pointId: p.id, field: "key" });
        if (!Array.isArray(p.findings)) e(`findingGroup '${p.id}' ohne findings`, { blockId: b.id, pointId: p.id, field: "findings" });
        for (const f of p.findings ?? []) {
          if (!String(f.id ?? "").trim()) e("findingGroup-finding ohne id", { blockId: b.id, pointId: p.id, field: "finding" });
          else uniqIn(pointIdsSeen, f.id, "finding", { blockId: b.id, pointId: p.id, findingId: f.id });
          if (typeof f.normal !== "string") e(`finding '${f.id}' ohne normal`, { blockId: b.id, pointId: p.id, findingId: f.id, field: "normal" });
        }
      }
      if (p.visibleIf && !isValidPredicate(p.visibleIf)) e(`Punkt '${p.id}': ungültiges visibleIf`, { blockId: b.id, pointId: p.id, field: "visibleIf" });
    }
  }

  // Warnungen: Dangling-Referenzen in visibleIf.
  const varIds = new Set((protocol.variables ?? []).map((v) => v.id));
  const pointIds = new Set();
  for (const b of protocol.blocks ?? []) for (const p of b.points ?? []) {
    if (p.id) pointIds.add(p.id);
    if (p.type === "findingGroup") for (const f of p.findings ?? []) if (f.id) pointIds.add(f.id);
  }
  const checkRefs = (pred, where, loc) => {
    if (!pred || typeof pred !== "object") return;
    if (pred.var != null && !varIds.has(pred.var)) w(`${where}: visibleIf referenziert unbekannte Variable '${pred.var}'`, { ...loc, field: "visibleIf" });
    if (pred.point != null && !pointIds.has(pred.point)) w(`${where}: visibleIf referenziert unbekannten Punkt '${pred.point}'`, { ...loc, field: "visibleIf" });
    for (const k of ["all", "any"]) if (Array.isArray(pred[k])) pred[k].forEach((x) => checkRefs(x, where, loc));
    if (pred.not) checkRefs(pred.not, where, loc);
  };
  for (const b of protocol.blocks ?? []) {
    if (b.visibleIf) checkRefs(b.visibleIf, `block:${b.id}`, { blockId: b.id });
    for (const p of b.points ?? []) if (p.visibleIf) checkRefs(p.visibleIf, `point:${p.id}`, { blockId: b.id, pointId: p.id });
  }

  return { valid: errors.length === 0, errors, warnings, issues };
}

// --- Export / Import (Vorbereitung) -------------------------------------------

/** Serialisiert NUR valide Protokolle (sonst Fehler). */
export function exportProtocol(protocol) {
  const res = assertValidProtocolDraft(protocol);
  if (!res.valid) throw new Error(`Export abgelehnt — ungültiges Protokoll: ${res.errors.join("; ")}`);
  return JSON.stringify(protocol, null, 2);
}

/** Parst + validiert importiertes JSON. Lehnt ungültiges JSON/Schema ab. */
export function parseImport(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    return { ok: false, errors: [`Ungültiges JSON: ${err.message}`], warnings: [] };
  }
  const res = assertValidProtocolDraft(parsed);
  if (!res.valid) return { ok: false, errors: res.errors, warnings: res.warnings };
  const major = String(parsed.schemaVersion).split(".")[0];
  if (major !== "0" && major !== "1") {
    return { ok: false, errors: [`Nicht unterstützte schemaVersion: ${parsed.schemaVersion}`], warnings: res.warnings };
  }
  return { ok: true, protocol: parsed, warnings: res.warnings };
}
