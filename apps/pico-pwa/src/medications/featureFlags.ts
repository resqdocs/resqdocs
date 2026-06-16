// featureFlags.ts — PZN-/Medikamenten-Funktions-Schalter.
//
// Das alte PZN→Name-Community-Wörterbuch (Netz-Download von resqdocs.app/pzn,
// lokaler Cache, automatische Auflösung gescannter PZN in Handelsnamen) ist
// DEAKTIVIERT. Rechtliche Gründe (belegbar, keine Rechtsberatung):
//  - IFA-Rohdatenrecht: PZN→Produkt-Stammdaten sind in DE lizenzpflichtig (IFA GmbH),
//    nicht CC0; das EU-sui-generis-Datenbankrecht (RL 96/9/EG Art. 7) schützt die
//    Entnahme wesentlicher Teile unabhängig von Veröffentlichung. → kein
//    mitgelieferter/öffentlicher Datenbestand, KEINE automatische Auflösung gegen
//    IFA-abgeleitete Quellen, kein Crawl.
//  - Art. 9 DSGVO: die dauerhafte, fallübergreifende Eigenhaltung von Medikations-
//    daten ist eine Zweckänderung ggü. der flüchtigen Einsatzverarbeitung (#173).
//
// Der Code des alten Pfades bleibt erhalten (hinter diesem Flag), wird aber nicht
// mehr angezeigt und macht KEINEN Netzzugriff. Ersatz: nutzergepflegte, lokale
// PZN-Bibliothek (pznLibrary*, Mengen-Semantik, kein externer Lookup).
export const PZN_DICTIONARY_ENABLED = false
