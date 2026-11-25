// listCapture.ts — was nur die App für Medikationsplan und Kontakte/Ärzte beisteuert (listCaptureKey):
// Kamera-Scan (Packung, BMP), Vorschläge aus der eigenen PZN-Bibliothek und die Namens-Auflösung. App.vue stellt
// es an der Wurzel bereit; der Online-Editor stellt nichts bereit und erfasst von Hand.
import type { ListCapture } from '@resqdocs/protocol-core-ui/injection'
import { usePznLibrary } from '@/medications/usePznLibrary'
import { useMedicationLookup } from '@/medications/useMedicationLookup'
import { extractPznFromPackageCode, packageScanRow, type PackageBarcodeFormat } from '@/medications/packageScan'
import { savePznEntry, shownName } from '@/medications/pznLibrarySave'
import PackageScanOverlay from './PackageScanOverlay.vue'
import MedplanReviewSheet from './MedplanReviewSheet.vue'
import AerzteReviewSheet from './AerzteReviewSheet.vue'

export const appListCapture: ListCapture = {
  suggestMedication: (query, limit) => usePznLibrary().suggest(query, limit),
  medplanScan: {
    packageScanner: PackageScanOverlay,
    pznFromPackage(result) {
      const r = result as { text: string; format: PackageBarcodeFormat }
      return extractPznFromPackageCode(r.text, r.format)
    },
    async rowForPzn(pzn) {
      const entry = await usePznLibrary().entry(pzn)
      return packageScanRow(pzn, entry, () => useMedicationLookup().resolve(pzn))
    },
    planSheet: MedplanReviewSheet,
    async libraryEntry(pzn) {
      const e = await usePznLibrary().entry(pzn)
      return e ? { name: shownName(e), staerke: e.staerke } : null
    },
    saveToLibrary: (pzn, name, staerke) => savePznEntry(usePznLibrary(), pzn, name, staerke),
  },
  aerzteScanSheet: AerzteReviewSheet,
}
