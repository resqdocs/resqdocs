// tabGuideHints.ts — Kennung der Onboarding-Tour (TabGuide) und Inhalt ihrer Seite „Neu“.
//
// Beides kommt aus den mitgelieferten Release-Notes: die Kennung ist „tab-guide-<neueste Version>“, also
// erscheint die Tour nach jedem Update mit eigenen Notes von selbst wieder (bisherige Nutzer zuerst mit „Neu“).
// Frühere, von Hand gezählte Kennungen: 'v3' (1.8.0) … 'v6' (1.11.0); sie zählen weiter als „kannte die App“.
import { RELEASE_HISTORY } from '@/releaseNotes/notesAsset'
import { tourHintId, whatsNewNotes } from '@/releaseNotes/whatsNew'

// Version dieses Builds (dieselbe Quelle wie die mitgelieferten Notes), synchron - kein Flackern beim Start.
const INSTALLED = __APP_BUILD_ID__.split('+')[0]

/** Seite „Neu“: die letzten drei Versionen, neueste zuerst (Darstellung: ReleaseTimeline, neueste aufgeklappt). */
export const WHATS_NEW = whatsNewNotes(RELEASE_HISTORY, INSTALLED)

export const TAB_GUIDE_HINT_ID = tourHintId(WHATS_NEW, 'tab-guide-v6')
