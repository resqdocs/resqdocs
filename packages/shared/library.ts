// Vorlagen-Bibliothek (Rework) - reine Ops ueber ein Array von Protokoll-Baeumen.
// Je Container = eine Vorlage; Wurzel-id = Vorlagen-id, root.title = Name. Immutable, node-getestet.
// Der stateful Teil (refs, aktive ids, id-Zaehler, Persistenz) lebt im Composable useProtocolTree.

import type { Container, Node } from './model.ts'
import { findNode } from './creator.ts'

/** Kollidiert id mit einem Knoten in IRGENDEINEM Baum? (baumuebergreifende Eindeutigkeit) */
export function collidesId(protocols: Container[], id: string): boolean {
  return protocols.some((p) => !!findNode(p, id))
}

/** Alle Knoten-IDs eines Teilbaums frisch vergeben (fuer Duplikate), via injizierten Generator. */
export function reId(node: Node, nextId: () => string): Node {
  const id = nextId()
  if (node.type === 'container') return { ...node, id, children: node.children.map((c) => reId(c, nextId)) }
  return { ...node, id }
}

/** Vorlage duplizieren: tiefe Kopie mit FRISCHEN IDs, „(Kopie)" im Titel, ans Ende. */
export function duplicateProtocol(
  protocols: Container[],
  id: string,
  nextId: () => string,
): { protocols: Container[]; copy: Container | null } {
  const src = protocols.find((p) => p.id === id)
  if (!src) return { protocols, copy: null }
  const copy: Container = { ...(reId(src, nextId) as Container), title: `${src.title ?? src.id} (Kopie)` }
  return { protocols: [...protocols, copy], copy }
}

/** Vorlage umbenennen (root.title). */
export function renameProtocol(protocols: Container[], id: string, title: string): Container[] {
  return protocols.map((p) => (p.id === id ? { ...p, title } : p))
}

/** Vorlage entfernen - aber nie die letzte (mind. eine Vorlage bleibt). */
export function removeProtocol(protocols: Container[], id: string): Container[] {
  return protocols.length <= 1 ? protocols : protocols.filter((p) => p.id !== id)
}

/** Initiale Einsatz-Vorlage (Vorrang): persoenlicher Standard -> zuletzt benutzt -> erste.
 *  Gibt nur eine in `ids` ENTHALTENE id zurueck (oder null bei leerer Bibliothek). */
export function resolveInitialProtocolId(ids: string[], defaultId: string | null, lastId: string | null): string | null {
  const set = new Set(ids)
  if (defaultId && set.has(defaultId)) return defaultId
  if (lastId && set.has(lastId)) return lastId
  return ids[0] ?? null
}

/** Vorlage um delta (+1/-1) im Bibliotheks-Array verschieben (an den Raendern geclamped). */
export function moveProtocol(protocols: Container[], id: string, delta: number): Container[] {
  const i = protocols.findIndex((p) => p.id === id)
  if (i < 0) return protocols
  const j = Math.max(0, Math.min(protocols.length - 1, i + delta))
  if (i === j) return protocols
  const next = [...protocols]
  const [moved] = next.splice(i, 1)
  next.splice(j, 0, moved)
  return next
}

/** Alle Knoten-ids eines Baums (fuer die Import-Kollisionspruefung). */
function collectIds(node: Node, acc: string[] = []): string[] {
  acc.push(node.id)
  if (node.type === 'container') node.children.forEach((c) => collectIds(c, acc))
  return acc
}

/** Existiert schon eine Vorlage mit dieser Wurzel-id? (Kennungs-Kollision beim Import.) */
export function protocolExists(protocols: Container[], id: string): boolean {
  return protocols.some((p) => p.id === id)
}

/** Erste Vorlage mit gleichem NAMEN (getrimmt, case-insensitiv) — fuer die Namens-Kollisionsabfrage beim
 *  Import/Empfang (z. B. eine geteilte Vorlage heisst wie eine vorhandene). Leerer Name -> kein Treffer. */
export function findProtocolByName(protocols: Container[], title: string | undefined): Container | undefined {
  const norm = (t: string | undefined): string => (t ?? '').trim().toLowerCase()
  const target = norm(title)
  if (!target) return undefined
  return protocols.find((p) => norm(p.title) === target)
}

/** Vorlage als NEUE Vorlage importieren. Kollidiert IRGENDEINE id mit der bestehenden Bibliothek,
 *  wird der Baum frisch ge-id-et (kollisionsfrei). `retitle` haengt „ (Import)" an den Titel
 *  (zum Unterscheiden bei gleicher Kennung). */
export function importProtocol(
  protocols: Container[],
  tree: Container,
  nextId: () => string,
  retitle = false,
): { protocols: Container[]; added: Container } {
  const collides = collectIds(tree).some((id) => protocols.some((p) => !!findNode(p, id)))
  const base = collides ? (reId(tree, nextId) as Container) : tree
  const added = retitle ? { ...base, title: `${tree.title ?? tree.id} (Import)` } : base
  return { protocols: [...protocols, added], added }
}

/** Ziel eines Vorlagen-Imports/-Empfangs bestimmen — DATENSICHER (bindend: nie fremde Protokolle zerstoeren).
 *  Identitaet ist der NAME (das, was der Nutzer sieht). Die interne id kollidiert geraeteuebergreifend
 *  ZUFAELLIG — die Default-Vorlage hat ueberall id 'protokoll', Zusatz-Vorlagen 'n1','n2',… — und darf
 *  deshalb NIE ein Ueberschreiben ausloesen: sonst wuerde eine anders benannte fremde Vorlage still
 *  zerstoert. Bei Namensgleichheit -> Ueberschreiben ANBIETEN, wobei `name` die LOKAL getroffene Vorlage
 *  benennt (nie der eingehende Name), damit der Dialog niemals in die Irre fuehrt. Kein Namens-Treffer ->
 *  als NEUE Vorlage importieren (importProtocol re-id-et bei id-Kollision) -> nie Datenverlust, hoechstens
 *  eine harmlose, loeschbare Dublette. */
export type ImportTarget = { mode: 'overwrite'; existingId: string; name: string } | { mode: 'new' }
export function resolveImportTarget(protocols: Container[], tree: Container): ImportTarget {
  const existing = findProtocolByName(protocols, tree.title)
  if (existing) return { mode: 'overwrite', existingId: existing.id, name: (existing.title ?? '').trim() || existing.id }
  return { mode: 'new' }
}

/** Eine per NAMEN gefundene Vorlage (existingId) durch den Import-Baum ersetzen — der EINZIGE Ueberschreib-Weg
 *  (id-basiertes TREFFEN gibt es bewusst nicht: geraeteuebergreifende id-Kollision wuerde die falsche Vorlage
 *  treffen). Die ersetzte Vorlage BEHAELT ihre lokale Kennung und ihren Platz in der Liste: daran haengen
 *  die persoenliche Standard-Vorlage, „zuletzt benutzt" und der laufende Einsatz. Uebernaehme sie die
 *  Kennung des Import-Baums (oder bei Kollision eine frische), zeigten diese Verweise ins Leere und der
 *  Einsatz fiele nach dem naechsten Start auf die ERSTE Vorlage der Liste zurueck — fuer den Nutzer sieht
 *  das aus, als haette das Ueberschreiben nicht gewirkt. Die Kennung der Import-Wurzel ist deshalb egal;
 *  nur die INNEREN Knoten duerfen weder mit dem Rest der Bibliothek noch mit der lokalen Kennung
 *  kollidieren, sonst wird der Baum frisch ge-id-et. Unbekannte existingId -> als neue Vorlage. */
export function overwriteProtocolById(
  protocols: Container[],
  existingId: string,
  tree: Container,
  nextId: () => string,
): { protocols: Container[]; added: Container } {
  const index = protocols.findIndex((p) => p.id === existingId)
  if (index < 0) return importProtocol(protocols, tree, nextId, false)
  const rest = protocols.filter((p) => p.id !== existingId)
  const innerIds = tree.children.flatMap((c) => collectIds(c))
  const collides = innerIds.some((id) => id === existingId || rest.some((p) => !!findNode(p, id)))
  const base = collides ? (reId(tree, nextId) as Container) : tree
  const added: Container = { ...base, id: existingId }
  return { protocols: [...rest.slice(0, index), added, ...rest.slice(index)], added }
}
