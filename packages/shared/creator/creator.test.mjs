import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SCHEMA_VERSION,
  createUniqueId,
  collectProtocolIds,
  createProtocol,
  duplicateProtocol,
  renameProtocol,
  addBlock,
  updateBlock,
  removeBlock,
  moveBlock,
  movePoint,
  duplicateBlock,
  insertBlock,
  addPoint,
  updatePoint,
  removePoint,
  duplicatePoint,
  addVariable,
  updateVariable,
  removeVariable,
  findVariableReferences,
  isSimpleVisibleIf,
  createSimpleVisibleIf,
  assertValidProtocolDraft,
  exportProtocol,
  parseImport,
} from "./creator.mjs";

const seed = JSON.parse(
  readFileSync(new URL("../__fixtures__/sample-protocol.json", import.meta.url)),
);

// --- IDs ---

test("createUniqueId: stabil, kollisionsfrei, Zähler-Suffix", () => {
  assert.equal(createUniqueId("Atemweg (A)", []), "atemweg-a");
  assert.equal(createUniqueId("Block", new Set(["block"])), "block-2");
  assert.equal(createUniqueId("Block", new Set(["block", "block-2"])), "block-3");
  assert.equal(createUniqueId("", new Set(["id"])), "id-2");
});

test("collectProtocolIds erfasst Variablen/Blöcke/Punkte/findingGroup-Kinder", () => {
  const ids = collectProtocolIds(seed);
  assert.ok(ids.has("alarmierung")); // block
  assert.ok(ids.has("einsatzmeldung")); // point
  assert.ok(ids.has("b_dyspnoe")); // findingGroup child
});

// --- Protokoll ---

test("neues Protokoll ist S1-kompatibel", () => {
  const p = createProtocol({ title: "Mein Protokoll" });
  assert.equal(p.schemaVersion, SCHEMA_VERSION);
  assert.equal(p.title, "Mein Protokoll");
  assert.ok(p.id && typeof p.id === "string");
  assert.deepEqual(p.blocks, []);
  assert.deepEqual(p.variables, []);
  assert.equal(assertValidProtocolDraft(p).valid, true);
});

test("createProtocol übernimmt KEINE fremden Felder (kein caseState in Vorlage)", () => {
  const p = createProtocol({ title: "X", values: { a: "geheim" }, activeBlocks: ["b"], variableValues: { g: "w" } });
  assert.ok(!("values" in p));
  assert.ok(!("activeBlocks" in p));
  assert.ok(!("variableValues" in p));
});

test("meta.source erzwingt keine privaten Daten (nur wenn übergeben)", () => {
  assert.ok(!("meta" in createProtocol({ title: "X" })));
  assert.equal(createProtocol({ title: "X", meta: { source: "muster" } }).meta.source, "muster");
});

test("Protokoll duplizieren ohne Mutation, neue id", () => {
  const p = addBlock(createProtocol({ title: "Orig" }), { title: "B1" });
  const snap = JSON.stringify(p);
  const dup = duplicateProtocol(p);
  assert.notEqual(dup.id, p.id);
  assert.match(dup.title, /\(Kopie\)$/);
  assert.equal(JSON.stringify(p), snap, "Original unverändert");
});

test("renameProtocol ändert Titel, id bleibt stabil; leerer Titel abgelehnt", () => {
  const p = createProtocol({ title: "Alt" });
  const r = renameProtocol(p, "Neu");
  assert.equal(r.title, "Neu");
  assert.equal(r.id, p.id);
  assert.throws(() => renameProtocol(p, "  "), /nicht leer/);
});

// --- Block ---

test("Block hinzufügen: optional default false, eindeutige id", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { title: "Block A" });
  p = addBlock(p, { title: "Block A" }); // gleicher Titel ⇒ andere id
  assert.equal(p.blocks.length, 2);
  assert.equal(p.blocks[0].optional, false);
  assert.notEqual(p.blocks[0].id, p.blocks[1].id);
});

test("Block: leerer Titel abgelehnt", () => {
  assert.throws(() => addBlock(createProtocol({ title: "P" }), { title: "" }), /nicht leer/);
  const p = addBlock(createProtocol({ title: "P" }), { title: "B" });
  assert.throws(() => updateBlock(p, p.blocks[0].id, { title: " " }), /nicht leer/);
});

test("optionalen Block setzen", () => {
  let p = addBlock(createProtocol({ title: "P" }), { title: "Verweigerung" });
  const id = p.blocks[0].id;
  p = updateBlock(p, id, { optional: true });
  assert.equal(p.blocks[0].optional, true);
});

test("Block duplizieren erzeugt neue ids (Block + Punkte) und remappt visibleIf", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { title: "B" });
  const bId = p.blocks[0].id;
  p = addPoint(p, bId, { type: "finding", id: "f1", normal: "x" });
  p = addPoint(p, bId, { type: "field", id: "fld", label: "L", visibleIf: { point: "f1", state: "abnormal" } });
  const dup = duplicateBlock(p, bId);
  assert.equal(dup.blocks.length, 2);
  const copy = dup.blocks[1];
  assert.notEqual(copy.id, bId);
  const copyPointIds = copy.points.map((x) => x.id);
  assert.ok(!copyPointIds.includes("f1") && !copyPointIds.includes("fld"), "Punkt-ids neu");
  // visibleIf des kopierten Felds zeigt auf den kopierten finding, nicht auf den alten
  const copiedField = copy.points.find((x) => x.type === "field");
  assert.notEqual(copiedField.visibleIf.point, "f1");
  assert.ok(copyPointIds.includes(copiedField.visibleIf.point), "Referenz remappt auf Kopie");
  assert.equal(assertValidProtocolDraft(dup).valid, true);
});

test("removeBlock entfernt nur den Zielblock, ohne Mutation", () => {
  let p = addBlock(addBlock(createProtocol({ title: "P" }), { title: "A" }), { title: "B" });
  const snap = JSON.stringify(p);
  const r = removeBlock(p, p.blocks[0].id);
  assert.equal(r.blocks.length, 1);
  assert.equal(JSON.stringify(p), snap);
});

// --- Punkte: alle 5 Typen ---

test("Punkt hinzufügen für alle 5 Typen, valide", () => {
  let p = addBlock(createProtocol({ title: "P" }), { title: "B" });
  const b = p.blocks[0].id;
  p = addPoint(p, b, { type: "field", label: "Feld" });
  p = addPoint(p, b, { type: "finding", label: "Befund", normal: "o.B." });
  p = addPoint(p, b, { type: "findingGroup", key: "B", findings: [{ label: "x", normal: "frei" }] });
  p = addPoint(p, b, { type: "list", label: "Liste", entries: ["a", "b"] });
  p = addPoint(p, b, { type: "text", content: "Hinweis" });
  const types = p.blocks[0].points.map((x) => x.type);
  assert.deepEqual(types, ["field", "finding", "findingGroup", "list", "text"]);
  // findingGroup-Kind hat eine generierte id
  assert.ok(p.blocks[0].points[2].findings[0].id);
  assert.equal(assertValidProtocolDraft(p).valid, true);
});

test("ungültiger Punkt-Typ wird abgelehnt", () => {
  const p = addBlock(createProtocol({ title: "P" }), { title: "B" });
  assert.throws(() => addPoint(p, p.blocks[0].id, { type: "slider" }), /Ungültiger Punkt-Typ/);
});

test("updatePoint: Typwechsel nach Anlage abgelehnt, id nicht editierbar", () => {
  let p = addBlock(createProtocol({ title: "P" }), { title: "B" });
  p = addPoint(p, p.blocks[0].id, { type: "finding", id: "f", normal: "x" });
  assert.throws(() => updatePoint(p, "f", { type: "field" }), /Typwechsel/);
  assert.throws(() => updatePoint(p, "f", { id: "neu" }), /nicht editierbar/);
  const r = updatePoint(p, "f", { normal: "neu" });
  assert.equal(r.blocks[0].points[0].normal, "neu");
});

test("duplicatePoint: neue id, findingGroup-Kinder neu, ohne Mutation", () => {
  let p = addBlock(createProtocol({ title: "P" }), { title: "B" });
  p = addPoint(p, p.blocks[0].id, { type: "findingGroup", id: "grp", key: "A", findings: [{ id: "c1", normal: "x" }] });
  const snap = JSON.stringify(p);
  const r = duplicatePoint(p, "grp");
  assert.equal(r.blocks[0].points.length, 2);
  assert.notEqual(r.blocks[0].points[1].id, "grp");
  assert.notEqual(r.blocks[0].points[1].findings[0].id, "c1");
  assert.equal(JSON.stringify(p), snap);
});

test("removePoint entfernt Zielpunkt", () => {
  let p = addBlock(createProtocol({ title: "P" }), { title: "B" });
  p = addPoint(p, p.blocks[0].id, { type: "text", id: "t", content: "x" });
  assert.equal(removePoint(p, "t").blocks[0].points.length, 0);
});

// --- Variablen: alle 4 Typen ---

test("Variable hinzufügen für alle 4 Typen", () => {
  let p = createProtocol({ title: "P" });
  p = addVariable(p, { type: "select", label: "Geschlecht", options: [{ value: "w", label: "weiblich" }], default: "w", grammar: "de-gender" });
  p = addVariable(p, { type: "boolean", label: "Raucher", default: false });
  p = addVariable(p, { type: "text", label: "Klinik" });
  p = addVariable(p, { type: "number", label: "Alter", default: 50 });
  assert.deepEqual(p.variables.map((v) => v.type), ["select", "boolean", "text", "number"]);
  assert.equal(assertValidProtocolDraft(p).valid, true);
});

test("select-Variable ohne options abgelehnt", () => {
  assert.throws(() => addVariable(createProtocol({ title: "P" }), { type: "select", label: "X" }), /options/);
});

test("ungültiger Variablen-Typ abgelehnt", () => {
  assert.throws(() => addVariable(createProtocol({ title: "P" }), { type: "date" }), /Ungültiger Variablen-Typ/);
});

test("doppelte ids werden bei Anlage vermieden (variable vs block vs point)", () => {
  let p = createProtocol({ title: "P" });
  p = addVariable(p, { type: "text", id: "x", label: "X" });
  p = addBlock(p, { id: "x", title: "X" }); // kollidiert ⇒ andere id
  p = addPoint(p, p.blocks[0].id, { type: "text", id: "x", content: "c" }); // kollidiert ⇒ andere id
  const ids = [p.variables[0].id, p.blocks[0].id, p.blocks[0].points[0].id];
  assert.equal(new Set(ids).size, 3, "alle ids eindeutig");
});

test("removeVariable lässt Referenzen stehen; findVariableReferences findet sie", () => {
  let p = createProtocol({ title: "P" });
  p = addVariable(p, { type: "select", id: "g", label: "G", options: [{ value: "w", label: "w" }] });
  p = addBlock(p, { title: "B" });
  p = addPoint(p, p.blocks[0].id, { type: "text", content: "Hallo {{var:g}}", visibleIf: { var: "g", eq: "w" } });
  const refs = findVariableReferences(p, "g");
  assert.ok(refs.some((r) => r.kind === "placeholder"));
  assert.ok(refs.some((r) => r.kind === "visibleIf"));
  const r = removeVariable(p, "g");
  assert.equal(r.variables.length, 0);
  // Referenz bleibt (weiche Dangling-Ref) ⇒ Validierung warnt, ist aber gültig
  const v = assertValidProtocolDraft(r);
  assert.equal(v.valid, true);
  assert.ok(v.warnings.some((w) => /unbekannte Variable 'g'/.test(w)));
});

// --- Einfaches visibleIf ---

test("createSimpleVisibleIf erzeugt korrekte Prädikate", () => {
  assert.deepEqual(createSimpleVisibleIf({ source: "var", id: "g", op: "eq", value: "w" }), { var: "g", eq: "w" });
  assert.deepEqual(createSimpleVisibleIf({ source: "var", id: "r", op: "truthy" }), { var: "r", truthy: true });
  assert.deepEqual(createSimpleVisibleIf({ source: "point", id: "bw", op: "state", value: "abnormal" }), { point: "bw", state: "abnormal" });
  assert.deepEqual(createSimpleVisibleIf({ source: "var", id: "a", op: "in", value: [70, 80] }), { var: "a", in: [70, 80] });
});

test("createSimpleVisibleIf lehnt ungültige Eingaben ab", () => {
  assert.throws(() => createSimpleVisibleIf({ source: "x", id: "a", op: "eq" }), /source/);
  assert.throws(() => createSimpleVisibleIf({ source: "var", id: "", op: "eq" }), /id/);
  assert.throws(() => createSimpleVisibleIf({ source: "var", id: "a", op: "nope" }), /Operator/);
  assert.throws(() => createSimpleVisibleIf({ source: "var", id: "a", op: "state" }), /state/);
});

test("isSimpleVisibleIf erkennt einfache vs. komplexe Regeln", () => {
  assert.equal(isSimpleVisibleIf({ var: "g", eq: "w" }), true);
  assert.equal(isSimpleVisibleIf({ point: "p", state: "abnormal" }), true);
  // komplex / nicht simpel:
  assert.equal(isSimpleVisibleIf({ all: [{ var: "g", eq: "w" }] }), false);
  assert.equal(isSimpleVisibleIf({ any: [] }), false);
  assert.equal(isSimpleVisibleIf({ not: { var: "g", eq: "w" } }), false);
  assert.equal(isSimpleVisibleIf({ var: "g", point: "p", eq: "w" }), false); // zwei Quellen
  assert.equal(isSimpleVisibleIf({ var: "g" }), false); // kein Operator
  assert.equal(isSimpleVisibleIf({ var: "g", eq: "w", truthy: true }), false); // zwei Operatoren
  assert.equal(isSimpleVisibleIf({ var: "g", state: "abnormal" }), false); // state nur für point
  assert.equal(isSimpleVisibleIf(null), false);
});

// --- Validierung ---

test("assertValidProtocolDraft: leerer Titel + doppelte ids + ungültiger Typ", () => {
  const bad = {
    schemaVersion: "0.1.0", id: "p", title: "",
    blocks: [
      { id: "b", title: "", points: [{ type: "field", id: "dup" }, { type: "bogus", id: "x" }] },
      { id: "b", title: "B2", points: [{ type: "field", id: "dup" }] },
    ],
  };
  const res = assertValidProtocolDraft(bad);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => /Titel darf nicht leer/.test(e)));
  assert.ok(res.errors.some((e) => /Doppelte id: 'b'/.test(e)));
  assert.ok(res.errors.some((e) => /Doppelte id: 'dup'/.test(e)));
  assert.ok(res.errors.some((e) => /Ungültiger Punkt-Typ/.test(e)));
});

// --- #2b: feldscharfe issues (additiv, errors/warnings unverändert) ---

test("issues: findingGroup ohne key trägt blockId+pointId+field='key'", () => {
  const p = {
    schemaVersion: "0.2.0", id: "p", title: "T",
    blocks: [{ id: "b1", title: "B", points: [{ type: "findingGroup", id: "fg1", key: "", findings: [] }] }],
  };
  const res = assertValidProtocolDraft(p);
  assert.equal(res.valid, false);
  // errors-String wie bisher (unverändert)
  assert.ok(res.errors.some((e) => e === "findingGroup 'fg1' ohne key"));
  // issues: feldscharf
  const it = (res.issues ?? []).find((x) => x.message === "findingGroup 'fg1' ohne key");
  assert.ok(it, "issue für fehlenden key vorhanden");
  assert.equal(it.severity, "error");
  assert.equal(it.blockId, "b1");
  assert.equal(it.pointId, "fg1");
  assert.equal(it.field, "key");
});

test("issues: dangling visibleIf-Punktreferenz ist Warnung mit pointId-Ort", () => {
  const p = {
    schemaVersion: "0.2.0", id: "p", title: "T",
    blocks: [{
      id: "b1", title: "B",
      points: [{ type: "field", id: "a", label: "A", visibleIf: { point: "weg", truthy: true } }],
    }],
  };
  const res = assertValidProtocolDraft(p);
  // String-Warnung unverändert
  assert.ok(res.warnings.some((w) => /unbekannten Punkt 'weg'/.test(w)));
  const it = (res.issues ?? []).find((x) => /unbekannten Punkt 'weg'/.test(x.message));
  assert.ok(it, "issue für dangling point vorhanden");
  assert.equal(it.severity, "warning");
  assert.equal(it.blockId, "b1");
  assert.equal(it.pointId, "a"); // der Punkt, dessen visibleIf dangelt
  assert.equal(it.field, "visibleIf");
});

test("issues: ungültige Eingabe (null) → Parität errors/issues im Early-Return", () => {
  const res = assertValidProtocolDraft(null);
  assert.equal(res.valid, false);
  assert.deepEqual(res.errors, ["Protokoll fehlt/ungültig"]);
  assert.equal((res.issues ?? []).length, 1);
  assert.equal(res.issues[0].message, "Protokoll fehlt/ungültig");
  assert.equal(res.issues[0].severity, "error");
});

test("issues: gültiges Protokoll → keine issues; valide Felder unverändert", () => {
  const res = assertValidProtocolDraft(seed);
  assert.equal(res.valid, true);
  assert.deepEqual(res.issues, []);
});

test("issues: errors/warnings bleiben byte-gleich; issues ist additive Parallelspur", () => {
  const bad = {
    schemaVersion: "0.2.0", id: "p", title: "",
    blocks: [{ id: "b", title: "", points: [{ type: "findingGroup", id: "fg", key: "", findings: [] }] }],
  };
  const res = assertValidProtocolDraft(bad);
  // jede issue-Message existiert auch als String in errors bzw. warnings (gleiche Texte)
  for (const it of res.issues ?? []) {
    const bucket = it.severity === "error" ? res.errors : res.warnings;
    assert.ok(bucket.includes(it.message), `Message in ${it.severity}-Liste: ${it.message}`);
  }
  // Anzahl error-issues == errors, warning-issues == warnings (1:1 additiv)
  const errIssues = (res.issues ?? []).filter((x) => x.severity === "error").length;
  const warnIssues = (res.issues ?? []).filter((x) => x.severity === "warning").length;
  assert.equal(errIssues, res.errors.length);
  assert.equal(warnIssues, res.warnings.length);
});

// --- Export / Import gegen Fixture-Seed ---
// Die Inhalts-Tests laufen gegen ein STABILES Fixture (__fixtures__/sample-protocol.json),
// damit Änderungen an der ausgelieferten Beispiel-Vorlage (Funktionsdemo) sie nicht brechen.

test("Seed besteht den Draft-Check", () => {
  assert.equal(assertValidProtocolDraft(seed).valid, true);
});

// Separate Zusicherung, dass die LIVE-Beispiel-Vorlage immer gültig bleibt.
test("Live-Beispiel-Vorlage (protocols/standardprotokoll.json) ist gültig", () => {
  const live = JSON.parse(
    readFileSync(new URL("../../../protocols/standardprotokoll.json", import.meta.url)),
  );
  assert.equal(assertValidProtocolDraft(live).valid, true);
});

test("exportProtocol/parseImport Round-Trip mit echtem Seed", () => {
  const json = exportProtocol(seed);
  const res = parseImport(json);
  assert.equal(res.ok, true);
  assert.deepEqual(res.protocol, seed);
});

test("exportProtocol lehnt ungültiges Protokoll ab", () => {
  assert.throws(() => exportProtocol({ schemaVersion: "0.1.0", id: "p", title: "", blocks: [] }), /Export abgelehnt/);
});

test("parseImport lehnt ungültiges JSON ab", () => {
  const res = parseImport("{ kaputt ");
  assert.equal(res.ok, false);
  assert.ok(res.errors[0].includes("Ungültiges JSON"));
});

test("parseImport lehnt schema-ungültiges Protokoll ab", () => {
  const res = parseImport(JSON.stringify({ schemaVersion: "0.1.0", id: "p", title: "X", blocks: "nope" }));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /blocks muss ein Array sein/.test(e)));
});

// --- Reinheit / Trennung ---

test("alle Mutatoren lassen das Eingabeprotokoll unverändert", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { title: "B" });
  const bId = p.blocks[0].id;
  p = addPoint(p, bId, { type: "finding", id: "f", normal: "x" });
  p = addVariable(p, { type: "boolean", id: "v", label: "V" });
  const snap = JSON.stringify(p);
  addBlock(p, { title: "C" });
  updateBlock(p, bId, { optional: true });
  removeBlock(p, bId);
  duplicateBlock(p, bId);
  addPoint(p, bId, { type: "text", content: "y" });
  updatePoint(p, "f", { normal: "z" });
  removePoint(p, "f");
  duplicatePoint(p, "f");
  updateVariable(p, "v", { label: "W" });
  removeVariable(p, "v");
  assert.equal(JSON.stringify(p), snap, "kein Mutator verändert die Eingabe");
});

test("keine caseState-Struktur in erzeugten Protokollen", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { title: "B" });
  p = addPoint(p, p.blocks[0].id, { type: "field", label: "L" });
  const json = JSON.stringify(p);
  assert.ok(!/\"values\"|\"activeBlocks\"|\"variableValues\"|caseState/.test(json));
});

// --- #13-F4: insertBlock (Copy-on-insert eines externen Blocks) ---

test("insertBlock fügt Kopie an, ohne Quelle/Protokoll zu mutieren", () => {
  let p = createProtocol({ title: "P" });
  const ext = { id: "ext", title: "Mitfahrtverweigerung", points: [{ type: "text", id: "t", content: "Text" }] };
  const extSnap = JSON.stringify(ext);
  const pSnap = JSON.stringify(p);
  const out = insertBlock(p, ext);
  assert.equal(out.blocks.length, 1);
  assert.equal(out.blocks[0].title, "Mitfahrtverweigerung");
  assert.equal(JSON.stringify(ext), extSnap, "Quelle unverändert");
  assert.equal(JSON.stringify(p), pSnap, "Eingabe-Protokoll unverändert");
  assert.equal(assertValidProtocolDraft(out).valid, true);
});

test("insertBlock vergibt kollisionsfreie Block- und Punkt-IDs", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { id: "b", title: "B" });
  p = addPoint(p, "b", { type: "finding", id: "f1", normal: "x" });
  // externer Block kollidiert in Block- UND Punkt-id
  const ext = { id: "b", title: "Extern", points: [{ type: "finding", id: "f1", normal: "y" }] };
  const out = insertBlock(p, ext);
  const blockIds = out.blocks.map((b) => b.id);
  assert.equal(new Set(blockIds).size, 2, "Block-ids eindeutig");
  const pointIds = out.blocks.flatMap((b) => b.points.map((x) => x.id));
  assert.equal(new Set(pointIds).size, pointIds.length, "Punkt-ids eindeutig");
});

test("insertBlock remappt interne visibleIf-point-Referenzen, var-Refs bleiben", () => {
  const p = createProtocol({ title: "P" });
  const ext = {
    id: "ext", title: "E",
    points: [
      { type: "finding", id: "src", normal: "x" },
      { type: "field", id: "dep", label: "D", visibleIf: { all: [{ point: "src", state: "abnormal" }, { var: "g", eq: "w" }] } },
    ],
  };
  const out = insertBlock(p, ext);
  const blk = out.blocks[0];
  const src = blk.points[0];
  const dep = blk.points[1];
  assert.equal(dep.visibleIf.all[0].point, src.id, "point-Referenz auf neue id remappt");
  assert.notEqual(dep.visibleIf.all[0].point, "src");
  assert.equal(dep.visibleIf.all[1].var, "g", "var-Referenz bleibt erhalten");
});

test("moveBlock verschiebt rauf/runter; No-op an den Raendern (#46)", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { title: "Eins" });
  p = addBlock(p, { title: "Zwei" });
  p = addBlock(p, { title: "Drei" });
  const ids = p.blocks.map((b) => b.id);
  p = moveBlock(p, ids[2], "up");
  assert.deepEqual(p.blocks.map((b) => b.id), [ids[0], ids[2], ids[1]]);
  p = moveBlock(p, ids[0], "up"); // erster nach oben = No-op
  assert.equal(p.blocks[0].id, ids[0]);
  p = moveBlock(p, ids[1], "down"); // letzter nach unten = No-op
  assert.equal(p.blocks.at(-1).id, ids[1]);
  // Eingabe nicht mutiert (clone-Vertrag)
  const before = JSON.stringify(p);
  moveBlock(p, ids[0], "down");
  assert.equal(JSON.stringify(p), before);
});

test("movePoint verschiebt innerhalb des Blocks; wirft bei unbekanntem Punkt (#46)", () => {
  let p = createProtocol({ title: "P" });
  p = addBlock(p, { title: "B" });
  const blockId = p.blocks[0].id;
  p = addPoint(p, blockId, { type: "field", label: "A" });
  p = addPoint(p, blockId, { type: "field", label: "B" });
  p = addPoint(p, blockId, { type: "finding", label: "C", normal: "ok" });
  const pts = () => p.blocks[0].points.map((x) => x.label);
  p = movePoint(p, p.blocks[0].points[2].id, "up");
  assert.deepEqual(pts(), ["A", "C", "B"]);
  p = movePoint(p, p.blocks[0].points[0].id, "up"); // Rand: No-op
  assert.deepEqual(pts(), ["A", "C", "B"]);
  assert.throws(() => movePoint(p, "gibtsnicht", "up"), /nicht gefunden/);
});

test("medikamente (#146): anlegbar, validierbar, OHNE entries (keine Patientendaten in Vorlagen)", () => {
  let p = createProtocol({ title: "T" });
  p = addBlock(p, { title: "B" });
  p = addPoint(p, p.blocks[0].id, { type: "medikamente", label: "Medikation" });
  const pt = p.blocks[0].points[0];
  assert.equal(pt.type, "medikamente");
  assert.equal(pt.label, "Medikation");
  assert.ok(!("entries" in pt), "Vorlage traegt keine Medikamenten-Zeilen");
  assert.deepEqual(assertValidProtocolDraft(p).errors ?? [], []);
});
