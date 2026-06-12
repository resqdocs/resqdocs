// runtime.mjs — gemeinsame, dependency-freie Laufzeit-Logik für Protokolle.
//
// EINZIGE Quelle für: Einsatz-Kontext (aufgelöste Variablen + Punkt-Zustände),
// `visibleIf`-Auswertung und Sichtbarkeit von Blöcken/Punkten. Renderer
// (render.mjs) UND App-Eingabemaske nutzen dieselben Funktionen — `visibleIf`
// ist damit NICHT doppelt implementiert.
//
// Bedingungen sind deklarativ (var/point + eq/in/truthy/filled/state + all/any/not).
// KEIN eval, kein JavaScript aus Daten. Die Vorlage wird NIE mutiert.

// Grammatik-Pack `de-gender`: Tokens aus dem Wert einer de-gender-Variablen (w/m/d).
export const DE_GENDER = {
  w: { patient: "Patientin",   der_die: "die",     er_sie: "sie",    sein_ihr: "ihr",     eine_einen: "eine" },
  m: { patient: "Patient",     der_die: "der",     er_sie: "er",     sein_ihr: "sein",    eine_einen: "einen" },
  d: { patient: "Patient*in",  der_die: "der*die", er_sie: "er*sie", sein_ihr: "sein*ihr", eine_einen: "eine*n" },
};

export function override(values, id) {
  if (!id || !(id in values)) return undefined;
  const v = values[id];
  if (typeof v === "string") return { value: v };
  return v;
}

// Roh-Auflösung eines Befunds (vor Platzhalter-Ersetzung): { state, body, excluded }.
// "Nicht erhoben = weglassen" (#71): Override { excluded: true } nimmt den Befund
// komplett aus der Ausgabe; state ist dann undefined (state-Praedikate matchen nicht).
export function findingState(f, values) {
  const ov = override(values, f.id) || {};
  if (ov.excluded === true) return { state: undefined, body: "", excluded: true };
  const state = ov.state ?? (ov.value != null ? "abnormal" : f.state ?? "normal");
  // Bei state "normal" kann ov.value eine gewaehlte VARIANTE sein (#73) - sonst f.normal.
  const body = state === "normal" ? (ov.value ?? f.normal) : (ov.value ?? f.value ?? f.normal);
  return { state, body, excluded: false };
}

export function listEntries(p, values) {
  const ov = override(values, p.id);
  return Array.isArray(ov?.value) ? ov.value : Array.isArray(ov) ? ov : (p.entries ?? []);
}

/**
 * Medikations-Zeilen eines medikamente-Punkts (#146): kommen AUSSCHLIESSLICH
 * aus dem Einsatz (values) - die Vorlage definiert nur das Element und enthaelt
 * nie Patientendaten. Zeilen ohne Namen zaehlen nicht.
 */
export function medikamenteRows(p, values) {
  const ov = override(values, p.id);
  const rows = Array.isArray(ov?.value) ? ov.value : Array.isArray(ov) ? ov : [];
  return rows.filter((r) => r && String(r.name ?? "").trim());
}

// --- Einsatz-Kontext: aufgelöste Variablen + Grammatik + Punkt-Zustände -------

export function buildContext(protocol, { variableValues = {}, values = {}, activeBlocks = [] } = {}) {
  const vars = {};
  const grammar = {};
  for (const v of protocol.variables ?? []) {
    const val = v.id in variableValues ? variableValues[v.id] : v.default;
    vars[v.id] = val;
    if (v.grammar === "de-gender" && val in DE_GENDER) Object.assign(grammar, DE_GENDER[val]);
  }

  // Alle Punkt-Zustände vorab auflösen (unabhängig von Sichtbarkeit), damit ein
  // `visibleIf` auf jeden anderen Punkt verweisen kann — render-reihenfolge-unabhängig
  // und für Renderer wie UI identisch.
  const points = {};
  for (const b of protocol.blocks ?? []) {
    for (const p of b.points ?? []) registerPoint(points, p, values);
  }

  return { vars, grammar, values, activeBlocks: new Set(activeBlocks), points, protocol };
}

function registerPoint(points, p, values) {
  switch (p.type) {
    case "field": {
      const ov = override(values, p.id) || {};
      // Dreistufig (#43): { excluded: true } nimmt das Feld fuer diesen Einsatz
      // KOMPLETT aus der Ausgabe (auch keine Label-Zeile); `filled` ist false.
      if (ov.excluded === true) {
        points[p.id] = { value: "", state: undefined, filled: false, excluded: true };
        break;
      }
      const value = (ov.value ?? p.value) || p.default || "";
      points[p.id] = { value, state: undefined, filled: Boolean(value) };
      break;
    }
    case "finding": {
      const { state, body, excluded } = findingState(p, values);
      points[p.id] = { value: body, state, filled: state === "abnormal", excluded };
      break;
    }
    case "findingGroup": {
      for (const f of p.findings) {
        const { state, body, excluded } = findingState(f, values);
        points[f.id] = { value: body, state, filled: state === "abnormal", excluded };
      }
      break;
    }
    case "list": {
      if (p.id) points[p.id] = { value: undefined, state: undefined, filled: listEntries(p, values).length > 0 };
      break;
    }
    case "text": {
      if (p.id) points[p.id] = { value: p.content, state: undefined, filled: Boolean(p.content) };
      break;
    }
    case "medikamente": {
      // Keine Zeile erfasst = nicht erhoben = weglassen (#71-Grundsatz).
      points[p.id] = { value: undefined, state: undefined, filled: medikamenteRows(p, values).length > 0 };
      break;
    }
    default:
      throw new Error(`Unbekannter point.type: ${p.type}`);
  }
}

// --- Platzhalter / Textauflösung ----------------------------------------------
//   {{var:id}}  → Variablenwert (bei select: Options-Label)
//   {{patient}} u. a. → de-gender-Grammatik (aus ctx.grammar)
//   Unbekannter Platzhalter → unverändert.
// EINZIGE Implementierung — von Renderer UND App genutzt.

export function resolveText(input, ctx) {
  if (typeof input !== "string") return input;
  return input.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (whole, name) => {
    if (name.startsWith("var:")) {
      const id = name.slice(4).trim();
      const val = ctx.vars[id];
      if (val == null) return whole;
      const v = ctx.protocol.variables?.find((x) => x.id === id);
      if (v?.type === "select") {
        const opt = v.options?.find((o) => o.value === val);
        return opt ? opt.label : String(val);
      }
      return String(val);
    }
    return name in ctx.grammar ? ctx.grammar[name] : whole;
  });
}

/** Wie resolveText, lässt aber Nicht-Strings (undefined/Zahlen/…) unverändert durch. */
export function resolveMaybeText(input, ctx) {
  return typeof input === "string" ? resolveText(input, ctx) : input;
}

// --- Bedingungen (`visibleIf`) — sichere, deklarative Prädikate -----------------

export function evalPredicate(pred, ctx) {
  if (!pred) return true;
  if (pred.all) return pred.all.every((p) => evalPredicate(p, ctx));
  if (pred.any) return pred.any.some((p) => evalPredicate(p, ctx));
  if (pred.not) return !evalPredicate(pred.not, ctx);

  if ("point" in pred) {
    const ps = ctx.points[pred.point];
    if ("state" in pred) return ps ? ps.state === pred.state : false;
    if ("filled" in pred) return (ps ? ps.filled : false) === pred.filled;
    const subject = ps ? ps.value : undefined;
    return compare(subject, pred);
  }
  if ("var" in pred) {
    const subject = ctx.vars[pred.var];
    if ("filled" in pred) return (subject != null && subject !== "") === pred.filled;
    return compare(subject, pred);
  }
  return true;
}

function compare(subject, pred) {
  if ("eq" in pred) return subject === pred.eq;
  if ("in" in pred) return Array.isArray(pred.in) && pred.in.includes(subject);
  if ("truthy" in pred) return Boolean(subject) === pred.truthy;
  return true;
}

// --- Sichtbarkeit (für Renderer UND Eingabemaske) ------------------------------

/**
 * Ein Block ist sichtbar, wenn (nicht optional ODER aktiviert) UND sein
 * `visibleIf` (falls vorhanden) erfüllt ist.
 */
export function isBlockVisible(block, ctx) {
  const enabled = !block.optional || ctx.activeBlocks.has(block.id);
  return enabled && evalPredicate(block.visibleIf, ctx);
}

/** Ein Punkt ist sichtbar, wenn sein `visibleIf` (falls vorhanden) erfüllt ist. */
export function isPointVisible(point, ctx) {
  return evalPredicate(point.visibleIf, ctx);
}

export function getVisibleBlocks(protocol, ctx) {
  return (protocol.blocks ?? []).filter((b) => isBlockVisible(b, ctx));
}

export function getVisiblePoints(block, ctx) {
  return (block.points ?? []).filter((p) => isPointVisible(p, ctx));
}
