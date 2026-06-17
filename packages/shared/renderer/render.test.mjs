import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "./render.mjs";

const template = JSON.parse(
  readFileSync(new URL("../__fixtures__/sample-protocol.json", import.meta.url))
);

// --- Regression gegen das migrierte Seed-Protokoll (blocks → points) ---

test("alle 11 Blöcke in Original-Reihenfolge", () => {
  const titles = [
    "Alarmierung", "Allergien", "Vorerkrankungen", "Aktuelle Anamnese", "xABCDE",
    "Risikofaktoren", "Dauermedikation", "Impf-Status", "Verlauf / Maßnahmen",
    "Transport bzw. Verbleib", "Aufklärung & Einverständnis",
  ];
  const out = render(template);
  let from = 0;
  for (const t of titles) {
    const idx = out.indexOf(`# ${t} `, from);
    assert.ok(idx >= from, `Block "${t}" fehlt oder falsche Reihenfolge`);
    from = idx;
  }
});

test("Header-Format: '# Titel ' + '='-Auffüllung auf Breite 60", () => {
  const line = render(template).split("\n")[0];
  assert.match(line, /^# Alarmierung =+$/);
  assert.equal(line.length, 60);
});

test("xABCDE: B-Zeile rendert alle Normal-Befunde als Fließtext", () => {
  const out = render(template);
  assert.ok(out.includes(
    "B: Kein path. Atemgeräusch/Atemmuster. Kein Schnarchen, Gurgeln oder Stridor. " +
    "Atmung ist suffizient. Beidseits auskultatorisch belüftet, frei ohne RGs. " +
    "Keine Dyspnoe. Keine Zyanose. Keine gestauten HV. Normale Atemexkursionen. " +
    "Keine Hypoxiezeichen."
  ));
});

test("Befund mit Label rendert 'Label: Wert'", () => {
  assert.ok(render(template).includes("- Anfahrt: ohne besondere Vorkommnisse"));
  assert.ok(render(template).includes("- Medikamente: keine"));
});

test("field-Übersteuerung per String", () => {
  const out = render(template, { values: { einsatzmeldung: "Sturz aus dem Stand" } });
  assert.ok(out.includes("- Einsatzmeldung: Sturz aus dem Stand"));
});

test("leeres field rendert als Prompt mit Doppelpunkt", () => {
  assert.ok(render(template).includes("- Einsatzmeldung:"));
});

test("finding-Übersteuerung per String ⇒ abnormal", () => {
  const out = render(template, { values: { b_dyspnoe: "Dyspnoe bei geringer Belastung" } });
  assert.ok(out.includes("Dyspnoe bei geringer Belastung"));
  assert.ok(!out.includes("Keine Dyspnoe"));
});

test("finding-Übersteuerung per Objekt {state,value}", () => {
  const out = render(template, { values: { c_status: { state: "abnormal", value: "Kreislaufinstabil" } } });
  assert.match(out, /C: Kreislaufinstabil\./);
});

test("list rendert Einträge als Bullets, override ersetzt sie", () => {
  assert.ok(render(template).includes("- Alter"));
  const out = render(template, { values: { risikofaktoren: ["Diabetes", "KHK"] } });
  assert.ok(out.includes("- Diabetes") && out.includes("- KHK"));
  assert.ok(!out.includes("- Alter"));
});

test("text-Block (Aufklärung BGB) wird wörtlich gerendert", () => {
  assert.ok(render(template).includes("nach BGB § 630 A - H aufgeklärt"));
});

test("render mutiert die Vorlage nicht und ist deterministisch", () => {
  const snapshot = JSON.stringify(template);
  const a = render(template, { values: { einsatzmeldung: "X" } });
  const b = render(template, { values: { einsatzmeldung: "X" } });
  assert.equal(a, b);
  assert.equal(JSON.stringify(template), snapshot);
});

// --- Neue Fähigkeiten (#12): Variablen, Platzhalter, de-gender, visibleIf, optionale Blöcke ---

const demo = {
  schemaVersion: "0.1.0",
  id: "demo",
  title: "Demo",
  lang: "de",
  variables: [
    {
      id: "geschlecht", label: "Geschlecht", type: "select", grammar: "de-gender", default: "w",
      options: [
        { value: "w", label: "weiblich" },
        { value: "m", label: "männlich" },
        { value: "d", label: "divers" },
      ],
    },
    { id: "raucher", label: "Raucher", type: "boolean", default: false },
    { id: "alter", label: "Alter", type: "number", default: 50 },
    { id: "klinik", label: "Zielklinik", type: "text", default: "" },
  ],
  blocks: [
    {
      id: "az", title: "Allgemeinzustand",
      points: [
        { type: "finding", id: "bewusstsein", label: "Bewusstsein", normal: "{{patient}} ist wach und voll orientiert" },
        { type: "text", id: "anrede", content: "Wir haben {{der_die}} {{patient}} ({{var:geschlecht}}) versorgt." },
        { type: "field", id: "schwangerschaft", label: "Schwangerschaft", visibleIf: { var: "geschlecht", eq: "w" } },
        { type: "field", id: "py", label: "Packyears", visibleIf: { var: "raucher", truthy: true } },
        { type: "field", id: "ziel", label: "Ziel", visibleIf: { var: "klinik", filled: true } },
        { type: "field", id: "geriatrie", label: "Geriatrie", visibleIf: { var: "alter", in: [70, 80, 90] } },
      ],
    },
    {
      id: "folgemassnahme", title: "Folgemaßnahme",
      visibleIf: { point: "bewusstsein", state: "abnormal" },
      points: [{ type: "text", id: "fm", content: "Engmaschige Überwachung." }],
    },
    {
      id: "verweigerung", title: "Mitfahrtverweigerung", optional: true,
      points: [{ type: "text", id: "aufklaerung", content: "{{patient}} wurde über die Risiken aufgeklärt." }],
    },
  ],
};

test("de-gender Platzhalter: weiblich", () => {
  const out = render(demo, { variableValues: { geschlecht: "w" } });
  assert.ok(out.includes("Patientin ist wach und voll orientiert"));
  assert.ok(out.includes("Wir haben die Patientin (weiblich) versorgt."));
});

test("de-gender Platzhalter: männlich", () => {
  const out = render(demo, { variableValues: { geschlecht: "m" } });
  assert.ok(out.includes("Patient ist wach"));
  assert.ok(out.includes("Wir haben der Patient (männlich) versorgt."));
});

test("de-gender Platzhalter: divers (neutral)", () => {
  const out = render(demo, { variableValues: { geschlecht: "d" } });
  assert.ok(out.includes("der*die Patient*in (divers)"));
});

test("{{var:id}} bei select nutzt das Options-Label", () => {
  assert.ok(render(demo, { variableValues: { geschlecht: "m" } }).includes("(männlich)"));
});

test("visibleIf var/eq: Schwangerschaft nur bei geschlecht=w", () => {
  assert.ok(render(demo, { variableValues: { geschlecht: "w" } }).includes("- Schwangerschaft:"));
  assert.ok(!render(demo, { variableValues: { geschlecht: "m" } }).includes("- Schwangerschaft:"));
});

test("visibleIf var/truthy: boolean steuert Sichtbarkeit", () => {
  assert.ok(!render(demo).includes("- Packyears:"));
  assert.ok(render(demo, { variableValues: { raucher: true } }).includes("- Packyears:"));
});

test("visibleIf var/filled: text-Variable nicht leer", () => {
  assert.ok(!render(demo).includes("- Ziel:"));
  assert.ok(render(demo, { variableValues: { klinik: "UKE" } }).includes("- Ziel:"));
});

test("visibleIf var/in: number-Variable in Menge", () => {
  assert.ok(!render(demo, { variableValues: { alter: 50 } }).includes("- Geriatrie:"));
  assert.ok(render(demo, { variableValues: { alter: 80 } }).includes("- Geriatrie:"));
});

test("visibleIf point/state: Block sichtbar wenn Befund abnormal", () => {
  assert.ok(!render(demo).includes("# Folgemaßnahme "));
  const out = render(demo, { values: { bewusstsein: "somnolent" } });
  assert.ok(out.includes("# Folgemaßnahme "));
  assert.ok(out.includes("Engmaschige Überwachung."));
});

test("optionaler Block rendert nur, wenn in activeBlocks", () => {
  assert.ok(!render(demo).includes("# Mitfahrtverweigerung "));
  const out = render(demo, { activeBlocks: ["verweigerung"] });
  assert.ok(out.includes("# Mitfahrtverweigerung "));
  assert.ok(out.includes("Patientin wurde über die Risiken aufgeklärt."));
});

test("optionaler Block respektiert weiterhin Platzhalter/Variablen", () => {
  const out = render(demo, { activeBlocks: ["verweigerung"], variableValues: { geschlecht: "m" } });
  assert.ok(out.includes("Patient wurde über die Risiken aufgeklärt."));
});

test("unbekannter Platzhalter bleibt unverändert", () => {
  const p = { schemaVersion: "0.1.0", id: "x", title: "X", blocks: [
    { id: "b", title: "B", points: [{ type: "text", id: "t", content: "Hallo {{unbekannt}}" }] },
  ]};
  assert.ok(render(p).includes("Hallo {{unbekannt}}"));
});

test("Variablen-Default greift ohne Override", () => {
  // geschlecht default 'w' ⇒ Patientin, ohne explizite variableValues
  assert.ok(render(demo).includes("Patientin ist wach"));
});

test("render mutiert das Demo-Protokoll nicht", () => {
  const snapshot = JSON.stringify(demo);
  render(demo, { variableValues: { geschlecht: "m" }, values: { bewusstsein: "somnolent" }, activeBlocks: ["verweigerung"] });
  assert.equal(JSON.stringify(demo), snapshot);
});

test("excluded field (#43): KEINE Zeile, auch keine Label-Zeile", () => {
  const out = render(template, { values: { einsatzmeldung: { excluded: true } } });
  assert.ok(!out.includes("Einsatzmeldung"));
});

test("excluded field (#43): filled-Prädikat ist false, andere Felder unberührt", () => {
  const t = {
    schemaVersion: "0.1.0", id: "x", title: "X", lang: "de", variables: [],
    blocks: [{ id: "b", title: "B", points: [
      { type: "field", id: "f1", label: "Eins", value: "Standardtext" },
      { type: "field", id: "f2", label: "Zwei", visibleIf: { point: "f1", filled: true } },
    ] }],
  };
  // ohne excluded: f1 hat Standardtext -> filled -> f2 sichtbar
  assert.ok(render(t).includes("- Zwei:"));
  // excluded: f1 weg UND filled=false -> f2 unsichtbar
  const out = render(t, { values: { f1: { excluded: true } } });
  assert.ok(!out.includes("Eins"));
  assert.ok(!out.includes("Zwei"));
});

test("excluded field (#43): Haken wieder an (Override entfernt) stellt Standard her", () => {
  const out = render(template, { values: {} });
  assert.ok(out.includes("- Einsatzmeldung:"));
});

test("Überschriftenmuster (#68): pattern/fill/width konfigurierbar, Default unverändert", () => {
  const t = { schemaVersion: "0.1.0", id: "h", title: "H", lang: "de", variables: [],
    blocks: [{ id: "b", title: "Anamnese", points: [{ type: "text", id: "tx", content: "Inhalt" }] }] };
  // Default: '# Titel ' + '='-Auffüllung auf 60
  const def = render(t).split("\n")[0];
  assert.equal(def.length, 60);
  assert.ok(def.startsWith("# Anamnese ="));
  // Eigenes Muster + Füllzeichen + Breite
  const out = render(t, {}, { heading: { pattern: "== {titel} ", fill: "-", width: 30 } }).split("\n")[0];
  assert.equal(out, "== Anamnese " + "-".repeat(18));
  // Leeres Füllzeichen: keine Auffüllung, Muster getrimmt
  assert.equal(render(t, {}, { heading: { fill: "" } }).split("\n")[0], "# Anamnese");
  // Kaputtes Muster ohne {titel}: Fallback auf Default
  assert.ok(render(t, {}, { heading: { pattern: "kaputt" } }).split("\n")[0].startsWith("# Anamnese ="));
});

test("nicht erhoben (#71): einzelner Befund in der Gruppe entfaellt aus dem Satz", () => {
  // Maintainer-Beispiel: B ohne Auskultation - der Eintrag darf NIRGENDS erscheinen.
  const out = render(template, { values: { b_auskultation: { excluded: true } } });
  assert.ok(!out.includes("Auskultation") && !out.includes("auskult"), "Auskultation muss komplett fehlen");
  assert.ok(out.includes("B:"), "Rest der B-Gruppe bleibt");
});

test("nicht erhoben (#71): ganze Gruppe nicht erhoben -> Key-Zeile entfaellt", () => {
  const t = { schemaVersion: "0.1.0", id: "g", title: "G", lang: "de", variables: [],
    blocks: [{ id: "b", title: "ABCDE", points: [
      { type: "findingGroup", id: "ga", key: "A", findings: [
        { id: "a1", normal: "frei" }, { id: "a2", normal: "keine Schwellung" } ] },
      { type: "finding", id: "x1", label: "Bewusstsein", normal: "wach" },
    ] }] };
  const out = render(t, { values: { a1: { excluded: true }, a2: { excluded: true } } });
  assert.ok(!out.includes("A:"), "leere Gruppe darf keine Zeile erzeugen");
  assert.ok(out.includes("Bewusstsein"), "uebrige Punkte bleiben");
  // Einzelner standalone-Befund nicht erhoben:
  const out2 = render(t, { values: { x1: { excluded: true } } });
  assert.ok(!out2.includes("Bewusstsein"));
  assert.ok(out2.includes("A: frei. keine Schwellung."));
});

test("nicht erhoben (#71): state-/filled-Praedikate matchen nicht", () => {
  const t = { schemaVersion: "0.1.0", id: "v", title: "V", lang: "de", variables: [],
    blocks: [{ id: "b", title: "B", points: [
      { type: "finding", id: "f1", normal: "ok" },
      { type: "text", id: "warn", content: "Achtung", visibleIf: { point: "f1", state: "abnormal" } },
    ] }] };
  assert.ok(render(t, { values: { f1: "auffaellig" } }).includes("Achtung"));
  assert.ok(!render(t, { values: { f1: { excluded: true } } }).includes("Achtung"));
});

test("Befund-Variante (#73): gewählte Variante = normaler Befund mit anderem Text", () => {
  const t = { schemaVersion: "0.1.0", id: "v", title: "V", lang: "de", variables: [],
    blocks: [{ id: "b", title: "B", points: [
      { type: "finding", id: "ausk", label: "Auskultation", normal: "vesikulär ohne RGs",
        variants: ["vesikulär mit feuchten RGs", "abgeschwächt rechts"] },
    ] }] };
  // Default: normaler Text
  assert.ok(render(t).includes("vesikulär ohne RGs"));
  // Variante gewaehlt (normal-state mit value) -> normaler Befund, anderer Text
  const out = render(t, { values: { ausk: { state: "normal", value: "vesikulär mit feuchten RGs" } } });
  assert.ok(out.includes("vesikulär mit feuchten RGs"));
  assert.ok(!out.includes("ohne RGs"));
  // Variante ist NICHT 'abnormal' (filled bleibt false) - eigener Freitext bliebe abnormal
  const ab = render(t, { values: { ausk: "Knisterrasseln basal" } });
  assert.ok(ab.includes("Knisterrasseln basal"));
});

test("field.title (#70): rein Anzeige - taucht NICHT in der Ausgabe auf", () => {
  const t = { schemaVersion: "0.1.0", id: "ti", title: "T", lang: "de", variables: [],
    blocks: [{ id: "b", title: "Risikofaktoren", points: [
      { type: "field", id: "f1", title: "Nikotin", label: "", default: "Nikotinabusus" },
    ] }] };
  const out = render(t);
  assert.ok(!out.includes("Nikotin "), "Anzeige-Titel 'Nikotin' darf nicht getippt werden");
  assert.ok(out.includes("Nikotinabusus"), "der Standardinhalt (label leer) wird getippt");
});

test("Mehrzeiliger Feldwert (#144, BMP-Liste): Label-Zeile mit Bullet, Wertzeilen ohne '-'", () => {
  const t = { schemaVersion: "0.1.0", id: "mz", title: "M", lang: "de", variables: [],
    blocks: [{ id: "b", title: "Anamnese", points: [
      { type: "field", id: "med", label: "Dauermedikation" },
    ] }] };
  const out = render(t, { values: { med: "Ramipril 5 mg: 1-0-0-0\nASS 100: 0-1-0" } });
  const lines = out.split("\n");
  assert.ok(lines.includes("- Dauermedikation:"), out);
  assert.ok(lines.includes("Ramipril 5 mg: 1-0-0-0"), "Medikament auf eigener Zeile");
  assert.ok(lines.includes("ASS 100: 0-1-0"));
  assert.ok(!out.includes("- Ramipril"), "Medikamentzeilen ohne '-' voran");
  // Einzeiliger Wert bleibt wie bisher auf der Label-Zeile
  const single = render(t, { values: { med: "Ramipril 5 mg: 1-0-0-0" } });
  assert.ok(single.includes("- Dauermedikation: Ramipril 5 mg: 1-0-0-0"));
});

test("medikamente (#146): Label-Zeile mit Bullet, je Medikament eine Zeile ohne '-'", () => {
  const t = { schemaVersion: "0.2.0", id: "m", title: "M", lang: "de", variables: [],
    blocks: [{ id: "b", title: "Vorgeschichte", points: [
      { type: "medikamente", id: "meds", label: "Medikation" },
    ] }] };
  // Keine Zeilen -> Punkt entfaellt komplett (nicht erhoben = weglassen)
  assert.ok(!render(t).includes("Medikation"));
  const out = render(t, { values: { meds: [
    { name: "Hausarzt: Praxis Dr. Demo, Musterstadt" },
    { name: "Ramipril 5 mg", dosierung: "1-0-0-0" },
    { name: "ASS 100", dosierung: "0-1-0-0", kommentar: "laut Patient erhöht" },
  ] } });
  const lines = out.split("\n");
  assert.ok(lines.includes("- Medikation:"), out);
  assert.ok(lines.includes("Hausarzt: Praxis Dr. Demo, Musterstadt"));
  assert.ok(lines.includes("Ramipril 5 mg: 1-0-0-0"));
  assert.ok(lines.includes("ASS 100: 0-1-0-0 - laut Patient erhöht"));
  assert.ok(!out.includes("- Ramipril"), "Medikamentenzeilen ohne fuehrenden Strich");
});
