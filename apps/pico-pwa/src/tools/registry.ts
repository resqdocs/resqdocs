// registry.ts - Feld-Tool-Registry (#54).
//
// Ein field-Punkt kann im Protokoll ein `tool: '<id>'` tragen; die
// Einsatzansicht rendert dann unter dem Feld die zugehoerige Komponente.
// Vertrag der Tool-Komponenten: emit('apply', text) - der Text wird an den
// Feldinhalt angehaengt. Tools persistieren NICHTS (fluechtig wie caseState)
// und telefonieren nirgendwohin (Netzwerk-Policy, SECURITY.md).
//
// Neue Tools: Komponente bauen, hier registrieren - keine Schema-Aenderung
// noetig (Schema laesst beliebige Registry-ids zu; unbekannte ids werden im
// Einsatz schlicht nicht gerendert).
import type { Component } from 'vue'
import MedplanScanSection from '@/components/MedplanScanSection.vue'
import PackYearsTool from './PackYearsTool.vue'
import BmiTool from './BmiTool.vue'
import LamsTool from './LamsTool.vue'
import News2Tool from './News2Tool.vue'
import EkgAxisTool from './EkgAxisTool.vue'
import EkgReferenceTool from './EkgReferenceTool.vue'
import SignatureTool from './SignatureTool.vue'

/** id -> Einsatz-Komponente. */
export const TOOL_COMPONENTS: Record<string, Component> = {
  medplanScan: MedplanScanSection,
  packYears: PackYearsTool,
  bmi: BmiTool,
  lams: LamsTool,
  news2: News2Tool,
  ekgAxis: EkgAxisTool,
  ekgReferenz: EkgReferenceTool,
  signature: SignatureTool,
}

/** id -> Anzeigename im Editor-Dropdown. */
export const TOOL_LABELS: Record<string, string> = {
  medplanScan: 'Medikationsplan-Scanner (BMP)',
  packYears: 'Pack-Years-Rechner',
  bmi: 'BMI-Rechner',
  lams: 'LAMS (Schlaganfall-Motorik)',
  news2: 'NEWS2-Score',
  ekgAxis: 'EKG-Lagetyp',
  ekgReferenz: 'EKG-Referenz (Spickzettel)',
  signature: 'Unterschriftsfeld',
}
