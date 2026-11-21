// editorParity.ts — Fähigkeiten der Vorlagen-Bearbeitung: App (pico-pwa) und Online-Editor (protocol-editor).
//
// Gemeinsam sind nur Modell, Renderer und das Eigenschaften-Panel; alles drumherum ist je Anwendung gebaut und lief
// unbemerkt auseinander. Diese Liste hält fest, was wo geht, und editorParity.test.ts prüft jede Angabe am Code
// (Anker = Muster im Quelltext). Kommt eine Fähigkeit nur auf einer Seite dazu, wird der Test rot, bis sie auch auf
// der anderen Seite ankommt oder hier mit Begründung als Unterschied steht.
//
// Pflege: Neue Fähigkeit -> Eintrag mit Ankern für BEIDE Seiten. Ein Unterschied braucht `reason`.

export interface Capability {
  id: string
  label: string
  app: boolean
  online: boolean
  /** Muster, das im Code der App bzw. des Online-Editors genau dann vorkommt, wenn die Fähigkeit da ist. */
  appAnchor: RegExp
  onlineAnchor: RegExp
  /** Pflicht, wenn app !== online: warum (noch) verschieden. */
  reason?: string
}

export const CAPABILITIES: Capability[] = [
  // --- Vorlagen-Ebene ---
  { id: 'vorlage-neu', label: 'Neue Vorlage', app: true, online: true, appAnchor: /tree\.addProtocol\(/, onlineAnchor: /tree\.addProtocol\(/ },
  { id: 'vorlage-duplizieren', label: 'Vorlage duplizieren', app: true, online: true, appAnchor: /tree\.duplicate\(/, onlineAnchor: /tree\.duplicate\(/ },
  { id: 'vorlage-umbenennen', label: 'Vorlage umbenennen', app: true, online: true, appAnchor: /tree\.rename\(/, onlineAnchor: /tree\.rename\(/ },
  { id: 'vorlage-loeschen', label: 'Vorlage löschen', app: true, online: true, appAnchor: /tree\.removeProtocol\(/, onlineAnchor: /tree\.removeProtocol\(/ },
  { id: 'vorlage-reihenfolge', label: 'Reihenfolge der Vorlagen', app: true, online: true, appAnchor: /tree\.moveProtocol\(/, onlineAnchor: /tree\.moveProtocol\(/ },
  { id: 'export-mehrere', label: 'Eine oder mehrere Vorlagen exportieren', app: true, online: true, appAnchor: /exportTemplates\(/, onlineAnchor: /exportTemplates\(/ },
  { id: 'teilen-link', label: 'Teilen per verschlüsseltem Link', app: true, online: true, appAnchor: /shareTransfer\(/, onlineAnchor: /shareTransfer\(/ },
  { id: 'teilen-qr', label: 'QR-Code zum Link anzeigen', app: true, online: true, appAnchor: /<QrCode\b/, onlineAnchor: /<QrCode\b/ },
  { id: 'empfangen-link', label: 'Empfangen per Link', app: true, online: true, appAnchor: /openTransfer\(/, onlineAnchor: /openTransfer\(/ },
  {
    id: 'empfangen-qr-scan', label: 'QR-Code mit der Kamera scannen', app: true, online: false,
    appAnchor: /qrScanOpen/, onlineAnchor: /qrScanOpen|CodeScanOverlay/,
    reason: 'Kamera-Scan gibt es nur in der App; im Browser wird der Link eingefügt.',
  },
  { id: 'import-auswahl', label: 'Import mit Auswahl, Name und Überschreiben/neu (auch Abschnitte und Textbausteine einer Sammlung)', app: true, online: true, appAnchor: /<ImportCollectionPick\b/, onlineAnchor: /<ImportCollectionPick\b/ },
  { id: 'teilen-mit-bausteinen', label: 'Teilen und Exportieren mit gespeicherten Abschnitten und Textbausteinen', app: true, online: true, appAnchor: /<ShareExtrasPick\b/, onlineAnchor: /<ShareExtrasPick\b/ },
  // Optionen-Editor (OptionsDialog in den gemeinsamen Eigenschaften): Übernehmen braucht die Ein-Schritt-Änderung des Hosts.
  { id: 'optionen-bearbeiten', label: 'Optionen einer Auswahl bearbeiten (Tabelle bzw. Vollbild-Liste), Umbenennen zieht Verweise nach', app: true, online: true, appAnchor: /transform\(fn\) \{/, onlineAnchor: /transform\(fn\) \{/ },
  {
    id: 'versionspruefung', label: 'Prüfung gegen eine gewählte App-Version', app: false, online: true,
    appAnchor: /validateTree\(/, onlineAnchor: /validateTree\(/,
    reason: 'Die App kennt ihre eigene Version und bietet nur an, was sie kann.',
  },
  {
    id: 'ki-assistent', label: 'KI-Assistent eingebaut', app: false, online: true,
    appAnchor: /AiAssist/, onlineAnchor: /AiAssist/,
    reason: 'Die App verlinkt die KI-Seite (ai.resqdocs.app) statt sie einzubauen.',
  },

  // --- Bauen ---
  { id: 'eigenschaften', label: 'Eigenschaften-Panel (gemeinsame Komponente)', app: true, online: true, appAnchor: /<ContainerProperties\b/, onlineAnchor: /<ContainerProperties\b/ },
  { id: 'funktionen-einfuegen', label: 'Alle Funktionen einfügen (eine Liste)', app: true, online: true, appAnchor: /FUNCTION_KINDS/, onlineAnchor: /FUNCTION_KINDS/ },
  { id: 'abschnitt-gespeichert', label: 'Gespeicherten Abschnitt einfügen', app: true, online: true, appAnchor: /insertBlock\(/, onlineAnchor: /insertBlock\(/ },
  { id: 'textbaustein-einfuegen', label: 'Textbaustein einfügen (gemeinsame Auswahl)', app: true, online: true, appAnchor: /provide\(snippetPickerKey/, onlineAnchor: /provide\(snippetPickerKey/ },
  { id: 'textbausteine-verwalten', label: 'Textbausteine anlegen, bearbeiten, teilen, löschen', app: true, online: true, appAnchor: /<SnippetLibrarySection\b/, onlineAnchor: /<SnippetLibraryPanel\b/ },
  { id: 'textbaustein-import', label: 'Textbaustein importieren', app: true, online: true, appAnchor: /addSnippetFrom\(/, onlineAnchor: /snippets\.add\(r\.snippet/ },
  { id: 'element-duplizieren', label: 'Element duplizieren', app: true, online: true, appAnchor: /duplicateNode\(/, onlineAnchor: /duplicateNode\(/ },
  { id: 'rueckgaengig', label: 'Rückgängig / Wiederholen beim Bauen (gemeinsamer Verlauf)', app: true, online: true, appAnchor: /useTreeHistory\(/, onlineAnchor: /useTreeHistory\(/ },
  {
    id: 'einklappen-bauen', label: 'Abschnitte beim Bauen einklappen', app: false, online: true,
    appAnchor: /toggleFold\(/, onlineAnchor: /toggleFold\(/,
    reason: 'Arbeitsfläche für große Bildschirme; die App arbeitet mit Baum und Panel. Offen, ob nötig.',
  },

  {
    id: 'listen-scan', label: 'Scan und PZN-Vorschläge bei Medikationsplan und Kontakten', app: true, online: false,
    appAnchor: /provide\(listCaptureKey/, onlineAnchor: /provide\(listCaptureKey/,
    reason: 'Kamera, PZN-Bibliothek und Medikamenten-Suche gibt es nur in der App; im Browser wird von Hand erfasst.',
  },

  // --- Ausprobieren ---
  { id: 'ausprobieren-rechner', label: 'Rechner beim Ausprobieren wie im Einsatz ausfüllen', app: true, online: true, appAnchor: /<ScoreFunction\b/, onlineAnchor: /<ScoreFunction\b/ },
  { id: 'ausprobieren-medplan', label: 'Medikationsplan beim Ausprobieren wie im Einsatz ausfüllen', app: true, online: true, appAnchor: /<MedplanFunction\b/, onlineAnchor: /<MedplanFunction\b/ },
  { id: 'ausprobieren-kontakte', label: 'Kontakte/Ärzte beim Ausprobieren wie im Einsatz ausfüllen', app: true, online: true, appAnchor: /<AerzteFunction\b/, onlineAnchor: /<AerzteFunction\b/ },
]
