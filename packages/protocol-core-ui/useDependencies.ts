// Abhaengigkeiten im Einsatz anwenden (Logik: protocol-core/dependencies).
//
// EINE Stelle gleicht die Einsatz-Werte mit den Regeln der Vorlage ab, merkt sich, welche Elemente die
// Regel gerade ausblendet, und liefert die Vorlage mit den gerade geltenden Standardwerten. Formular
// und Ausgabe lesen danach Vorlage und Werte wie bisher.
import { ref, shallowRef, watch, type Ref } from 'vue'
import type { Container } from '@resqdocs/protocol-core/model'
import { syncDependencies, hiddenByDependency, resolveDefaults } from '@resqdocs/protocol-core/dependencies'
import { useCaseValues } from './useCaseValues.ts'

const hidden = ref<ReadonlySet<string>>(new Set())

/** Kennungen der Elemente, die eine Abhaengigkeit im Einsatz-Formular gerade ausblendet. */
export function useDependencyHidden(): Ref<ReadonlySet<string>> {
  return hidden
}

/**
 * Regeln der Vorlage laufend auf den Einsatz anwenden. Einmal je Einsatz-Ansicht aufrufen.
 *
 * Gibt die WIRKSAME Vorlage zurueck: dieselbe wie `root`, nur mit den Standardwerten, die wegen einer
 * Regel gerade gelten. Greift keine Regel, ist es dieselbe Referenz. Die Einsatz-Ansicht arbeitet mit
 * dieser Vorlage; die gespeicherte Vorlage bleibt unberuehrt.
 *
 * Schreibt nur in die Werte, wenn sich etwas aendert; der eigene Schreibvorgang loest den Abgleich
 * erneut aus und findet dann nichts mehr zu tun.
 */
export function useDependencySync(root: Ref<Container>): Ref<Container> {
  const caseValues = useCaseValues()
  const effective = shallowRef<Container>(root.value)
  watch(
    [root, caseValues.values],
    () => {
      const values = caseValues.values.value
      const resolved = resolveDefaults(root.value, values)
      const next = syncDependencies(resolved, values)
      if (next !== values) {
        caseValues.setAll(next) // loest diesen Abgleich erneut aus; der setzt dann den endgueltigen Stand
        return
      }
      hidden.value = hiddenByDependency(resolved, values)
      effective.value = resolved
    },
    { immediate: true },
  )
  return effective
}
