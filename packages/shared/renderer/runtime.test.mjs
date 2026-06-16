import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildContext,
  evalPredicate,
  isBlockVisible,
  isPointVisible,
  getVisibleBlocks,
  getVisiblePoints,
  resolveText,
  resolveMaybeText,
  medikamenteRows,
} from "./runtime.mjs";
import { render } from "./render.mjs";

const seed = JSON.parse(
  readFileSync(new URL("../__fixtures__/sample-protocol.json", import.meta.url)),
);

const demo = {
  schemaVersion: "0.1.0",
  id: "demo",
  title: "Demo",
  variables: [
    { id: "geschlecht", type: "select", grammar: "de-gender", default: "w",
      options: [{ value: "w", label: "weiblich" }, { value: "m", label: "männlich" }] },
    { id: "raucher", type: "boolean", default: false },
  ],
  blocks: [
    { id: "az", title: "AZ", points: [
      { type: "finding", id: "bewusstsein", normal: "wach" },
      { type: "field", id: "schwangerschaft", label: "Schwangerschaft", visibleIf: { var: "geschlecht", eq: "w" } },
      { type: "field", id: "py", label: "Packyears", visibleIf: { var: "raucher", truthy: true } },
      { type: "field", id: "kombi", label: "Kombi", visibleIf: { all: [ { var: "raucher", truthy: true }, { var: "geschlecht", eq: "m" } ] } },
    ]},
    { id: "folge", title: "Folge", visibleIf: { var: "geschlecht", eq: "m" }, points: [
      { type: "text", id: "ft", content: "nur männlich" } ]},
    { id: "abh", title: "Abhängig", points: [
      { type: "field", id: "fa", label: "wenn bewusstsein auffällig",
        visibleIf: { point: "bewusstsein", state: "abnormal" } } ]},
    { id: "verweigerung", title: "Mitfahrtverweigerung", optional: true, points: [
      { type: "text", id: "v", content: "aufgeklärt" } ]},
  ],
};

const ctx = (cs) => buildContext(demo, cs);

test("Block ohne optional ist sichtbar", () => {
  assert.equal(isBlockVisible(demo.blocks[0], ctx({})), true);
});

test("Optionaler Block ohne Aktivierung ist nicht sichtbar", () => {
  const block = demo.blocks.find((b) => b.id === "verweigerung");
  assert.equal(isBlockVisible(block, ctx({})), false);
});

test("Optionaler Block mit Aktivierung ist sichtbar", () => {
  const block = demo.blocks.find((b) => b.id === "verweigerung");
  assert.equal(isBlockVisible(block, ctx({ activeBlocks: ["verweigerung"] })), true);
});

test("Block-visibleIf über Variable", () => {
  const folge = demo.blocks.find((b) => b.id === "folge");
  assert.equal(isBlockVisible(folge, ctx({ variableValues: { geschlecht: "w" } })), false);
  assert.equal(isBlockVisible(folge, ctx({ variableValues: { geschlecht: "m" } })), true);
});

test("Point-visibleIf über Variable", () => {
  const schwanger = demo.blocks[0].points.find((p) => p.id === "schwangerschaft");
  assert.equal(isPointVisible(schwanger, ctx({ variableValues: { geschlecht: "w" } })), true);
  assert.equal(isPointVisible(schwanger, ctx({ variableValues: { geschlecht: "m" } })), false);
});

test("Point-visibleIf über anderen Punktwert (state)", () => {
  const fa = demo.blocks.find((b) => b.id === "abh").points[0];
  assert.equal(isPointVisible(fa, ctx({})), false);
  assert.equal(isPointVisible(fa, ctx({ values: { bewusstsein: "somnolent" } })), true);
});

test("all/any/not", () => {
  const c = ctx({ variableValues: { geschlecht: "m", raucher: true } });
  assert.equal(evalPredicate({ all: [{ var: "raucher", truthy: true }, { var: "geschlecht", eq: "m" }] }, c), true);
  assert.equal(evalPredicate({ any: [{ var: "geschlecht", eq: "w" }, { var: "raucher", truthy: true }] }, c), true);
  assert.equal(evalPredicate({ not: { var: "geschlecht", eq: "w" } }, c), true);
  const c2 = ctx({ variableValues: { geschlecht: "w", raucher: false } });
  assert.equal(evalPredicate({ all: [{ var: "raucher", truthy: true }, { var: "geschlecht", eq: "m" }] }, c2), false);
  assert.equal(evalPredicate({ any: [{ var: "geschlecht", eq: "m" }, { var: "raucher", truthy: true }] }, c2), false);
});

test("getVisiblePoints filtert je nach Kontext", () => {
  const az = demo.blocks[0];
  const wIds = getVisiblePoints(az, ctx({ variableValues: { geschlecht: "w", raucher: false } })).map((p) => p.id);
  assert.deepEqual(wIds, ["bewusstsein", "schwangerschaft"]);
  const mRauchIds = getVisiblePoints(az, ctx({ variableValues: { geschlecht: "m", raucher: true } })).map((p) => p.id);
  assert.deepEqual(mRauchIds, ["bewusstsein", "py", "kombi"]);
});

test("getVisibleBlocks: optionaler erst bei Aktivierung, Block-visibleIf greift", () => {
  const base = getVisibleBlocks(demo, ctx({ variableValues: { geschlecht: "w" } })).map((b) => b.id);
  assert.deepEqual(base, ["az", "abh"]); // folge (nur m) + verweigerung (inaktiv) raus
  const mActive = getVisibleBlocks(
    demo, ctx({ variableValues: { geschlecht: "m" }, activeBlocks: ["verweigerung"] }),
  ).map((b) => b.id);
  assert.deepEqual(mActive, ["az", "folge", "abh", "verweigerung"]);
});

// --- Konsistenz: Renderer und Runtime sehen dieselbe Sichtbarkeit ---

function renderedBlockTitles(out) {
  return [...out.matchAll(/^# (.+?) =+$/gm)].map((m) => m[1]);
}

test("Renderer und Runtime liefern konsistente Block-Sichtbarkeit", () => {
  for (const cs of [
    {},
    { variableValues: { geschlecht: "m" } },
    { variableValues: { geschlecht: "m" }, activeBlocks: ["verweigerung"] },
    { values: { bewusstsein: "somnolent" } },
  ]) {
    const fromRuntime = getVisibleBlocks(demo, ctx(cs)).map((b) => b.title);
    const fromRender = renderedBlockTitles(render(demo, cs));
    assert.deepEqual(fromRender, fromRuntime, `Kontext ${JSON.stringify(cs)}`);
  }
});

test("Konsistenz mit echtem Seed (alle 11 Blöcke sichtbar)", () => {
  const c = buildContext(seed, {});
  const fromRuntime = getVisibleBlocks(seed, c).map((b) => b.title);
  const fromRender = renderedBlockTitles(render(seed, {}));
  assert.equal(fromRuntime.length, 11);
  assert.deepEqual(fromRender, fromRuntime);
});

test("App-CaseState mit echtem Seed: erwartete sichtbare Blöcke/Punkte", () => {
  const c = buildContext(seed, {});
  const blocks = getVisibleBlocks(seed, c);
  assert.ok(blocks.some((b) => b.id === "xabcde"));
  const xabcde = blocks.find((b) => b.id === "xabcde");
  // keine visibleIf im Seed ⇒ alle Punkte sichtbar
  assert.equal(getVisiblePoints(xabcde, c).length, xabcde.points.length);
});

test("buildContext/Sichtbarkeit mutiert das Protokoll nicht", () => {
  const snapshot = JSON.stringify(demo);
  const c = ctx({ variableValues: { geschlecht: "m" }, values: { bewusstsein: "x" }, activeBlocks: ["verweigerung"] });
  getVisibleBlocks(demo, c).forEach((b) => getVisiblePoints(b, c));
  assert.equal(JSON.stringify(demo), snapshot);
});

// --- Textauflösung (resolveText / resolveMaybeText) ---

const textDemo = {
  schemaVersion: "0.1.0", id: "td", title: "T",
  variables: [
    { id: "geschlecht", type: "select", grammar: "de-gender", default: "w",
      options: [{ value: "w", label: "weiblich" }, { value: "m", label: "männlich" }, { value: "d", label: "divers" }] },
    { id: "klinik", type: "text", default: "UKE" },
  ],
  blocks: [{ id: "b", title: "B", points: [] }],
};

test("{{var:id}} löst Textvariable auf", () => {
  assert.equal(resolveText("Ziel: {{var:klinik}}", buildContext(textDemo, {})), "Ziel: UKE");
});

test("{{var:id}} löst Select-Variable als Label auf (nicht als Wert)", () => {
  const c = buildContext(textDemo, { variableValues: { geschlecht: "m" } });
  assert.equal(resolveText("Geschlecht: {{var:geschlecht}}", c), "Geschlecht: männlich");
});

test("Default-Werte von Variablen werden berücksichtigt", () => {
  assert.equal(resolveText("{{var:klinik}}", buildContext(textDemo, {})), "UKE");
  assert.equal(resolveText("{{var:geschlecht}}", buildContext(textDemo, {})), "weiblich");
});

test("Case-Overrides werden berücksichtigt", () => {
  const c = buildContext(textDemo, { variableValues: { klinik: "AKH" } });
  assert.equal(resolveText("{{var:klinik}}", c), "AKH");
});

test("{{patient}} wird für w/m/d korrekt aufgelöst", () => {
  const p = (g) => resolveText("{{patient}}", buildContext(textDemo, { variableValues: { geschlecht: g } }));
  assert.equal(p("w"), "Patientin");
  assert.equal(p("m"), "Patient");
  assert.equal(p("d"), "Patient*in");
});

test("de-gender-Grammatik bleibt kompatibel (alle Tokens, männlich)", () => {
  const c = buildContext(textDemo, { variableValues: { geschlecht: "m" } });
  assert.equal(
    resolveText("{{der_die}} {{patient}} hat {{sein_ihr}} Buch; {{er_sie}}; {{eine_einen}}", c),
    "der Patient hat sein Buch; er; einen",
  );
});

test("unbekannte Platzhalter bleiben unverändert", () => {
  const c = buildContext(textDemo, {});
  assert.equal(resolveText("{{unbekannt}} und {{var:gibtsnicht}}", c), "{{unbekannt}} und {{var:gibtsnicht}}");
});

test("resolveMaybeText lässt Nicht-Strings unverändert, löst Strings auf", () => {
  const c = buildContext(textDemo, {});
  assert.equal(resolveMaybeText(undefined, c), undefined);
  assert.equal(resolveMaybeText(42, c), 42);
  assert.equal(resolveMaybeText("{{var:klinik}}", c), "UKE");
});

test("Renderer und resolveText liefern konsistente Ergebnisse", () => {
  const proto = {
    schemaVersion: "0.1.0", id: "k", title: "K",
    variables: [
      { id: "geschlecht", type: "select", grammar: "de-gender", default: "m",
        options: [{ value: "w", label: "weiblich" }, { value: "m", label: "männlich" }] },
    ],
    blocks: [{ id: "b", title: "Block", points: [
      { type: "text", id: "t", content: "{{der_die}} {{patient}} ({{var:geschlecht}})" },
    ]}],
  };
  const cs = { variableValues: { geschlecht: "w" } };
  const c = buildContext(proto, cs);
  const direct = resolveText("{{der_die}} {{patient}} ({{var:geschlecht}})", c);
  assert.equal(direct, "die Patientin (weiblich)");
  assert.ok(render(proto, cs).includes(direct), "Render-Output enthält dasselbe aufgelöste Ergebnis");
});

test("App-Runtime kann mit echtem Seed Texte auflösen (ohne Platzhalter unverändert)", () => {
  const c = buildContext(seed, {});
  const block = seed.blocks[0];
  assert.equal(resolveText(block.title, c), block.title); // Seed-Titel ohne Platzhalter
  const aufkl = seed.blocks.find((b) => b.id === "aufklaerung").points[0];
  assert.equal(resolveText(aufkl.content, c), aufkl.content);
});

test("resolveText mutiert das Protokoll nicht", () => {
  const snapshot = JSON.stringify(textDemo);
  const c = buildContext(textDemo, { variableValues: { geschlecht: "d" } });
  resolveText("{{patient}} {{var:klinik}} {{unbekannt}}", c);
  assert.equal(JSON.stringify(textDemo), snapshot);
});

test("medikamente (#146): filled nur bei Zeilen mit Namen, Zeilen nur aus values", () => {
  const t = { schemaVersion: "0.2.0", id: "m", title: "M", variables: [], blocks: [
    { id: "b", title: "B", points: [{ type: "medikamente", id: "meds", label: "Medikation" }] },
  ] };
  const leer = buildContext(t, {});
  assert.equal(leer.points.meds.filled, false);
  const ctx = buildContext(t, { values: { meds: [
    { name: "Ramipril 5 mg", dosierung: "1-0-0-0" },
    { name: "   " }, // ohne Namen -> zaehlt nicht
  ] } });
  assert.equal(ctx.points.meds.filled, true);
  assert.deepEqual(medikamenteRows(t.blocks[0].points[0], { meds: [{ name: "A" }, { name: " " }] }), [{ name: "A" }]);
});
