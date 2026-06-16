# App-Store-/TestFlight-Beschreibung & Review-Strategie

**Kernbotschaft:** ResQDocs ist ein **Effizienz-/Produktivitätswerkzeug für
Berufsrettungsdienst-Mitarbeitende** - es macht die tägliche Einsatz­dokumentation
schneller und sauberer. Es ist **kein Medizinprodukt, kein Diagnose-Tool, kein
Dosierungsrechner**. Die folgenden Texte und die Positionierung sind so gewählt,
dass die App die relevanten App-Review-Guidelines erfüllt (Belege unten).

## Zwei Risikopunkte und wie wir sie entschärfen

1. **Guideline 1.4.2 (Dosierungsrechner):** Dosierungsrechner müssen vom
   Hersteller/Klinik/Behörde stammen. → ResQDocs **berechnet keine Dosierungen**.
   Der BMP-Scan **transkribiert** die vom Arzt bereits verordnete Medikation aus
   dem amtlichen Medikationsplan-Code (Datenübernahme, keine Berechnung). Das in
   Beschreibung und UI **klar so benennen**, nie als "Dosierungsrechner".
2. **Guideline 1.4.1 (Genauigkeit/Diagnose):** Scores (NEWS2, LAMS, BMI,
   Pack-Years, EKG-Lagetyp) sind etablierte **Rechenhilfen nach publizierten
   Tabellen** - keine Messung über Gerätesensoren, keine Diagnose. → Methodik +
   Quellen offenlegen (im Code referenziert), Arzt-Hinweis anzeigen.

## Positionierung (ein Satz)

> ResQDocs ist ein quelloffenes **Hilfsmittel zur Einsatzdokumentation** im
> Rettungsdienst: Es hilft, strukturierten Text aus eigenen Vorlagen zu
> erstellen und per lokaler Hardware-Brücke in ein vorhandenes
> Dokumentationssystem zu übertragen. Es stellt keine Diagnosen, trifft keine
> Behandlungsentscheidungen und ist kein Medizinprodukt.

## Zielgruppe (im Review klar machen)

ResQDocs richtet sich **ausschließlich an medizinisches Fachpersonal im
Rettungsdienst** (Notfallsanitäter:innen, Notärzt:innen), das die enthaltenen
Scores **berufsalltäglich anwendet und kennt** (NEWS2, LAMS, BMI, Pack-Years,
EKG-Lagetyp). Die Tools reproduzieren etablierte, **publizierte** Scores als
Gedächtnis-/Rechenhilfe - sie führen keine neue Methodik ein, messen nichts über
Gerätesensoren und richten sich nicht an Laien zur Selbstdiagnose. Alle Scores
sind in `docs/medical-sources.md` mit **Primärliteratur und konkreten
Fundstellen** belegt (RCP, Llanes/Saver, WHO u. a.). Diesen Hinweis in die
Review-Notizen aufnehmen.

## App-Store-Beschreibung (Entwurf, deutsch)

```
ResQDocs - Einsatzdokumentation als Hilfsmittel

ResQDocs unterstützt Berufsrettungsdienst-Mitarbeitende dabei, ihre
tägliche Einsatzdokumentation effektiver und sauberer zu erledigen.
Aus selbst erstellten Vorlagen (Blöcke, Befunde, Felder) entsteht
strukturierter Text, der per lokaler USB-Tastatur-Brücke in ein bereits
vorhandenes Dokumentationssystem getippt werden kann - ohne mühsames
Abtippen über eine schlechte Bildschirmtastatur.

Für medizinisches Fachpersonal im Rettungsdienst. Die enthaltenen Scores
(NEWS2, LAMS, BMI, Pack-Years, EKG-Lagetyp) sind etablierte, berufsalltäglich
genutzte Rechenhilfen nach publizierten Quellen - keine Diagnose.

Funktionen
- Eigene Protokollvorlagen zusammenstellen (Editor)
- Befunde bestätigen, anpassen oder als nicht erhoben weglassen
- Rechenhilfen nach publizierten Tabellen (NEWS2, LAMS, BMI, Pack-Years,
  EKG-Lagetyp) - als Gedächtnisstütze, keine Diagnose
- Medikationsplan (BMP) scannen: übernimmt ausschließlich die vom Arzt
  verordneten Medikamente/Dosierungen aus dem amtlichen Code (Transkription,
  keine Berechnung)
- Unterschriftsfelder für Verweigerungs-/Einverständnistexte

Datenschutz
- Keine Patientendaten werden gespeichert oder in eine Cloud übertragen.
- Keine Analytics, kein Tracking, keine Werbung.
- Übertragung nur lokal im WLAN der Bridge.

Wichtig: ResQDocs ist ein Texteingabe-Hilfsmittel und KEIN Medizinprodukt.
Es ersetzt weder fachliche Beurteilung noch Dokumentationspflichten. Für
Vorgehen, Bewertung und Dokumentation bleibt die Anwenderin/der Anwender
verantwortlich. Im Zweifel ärztlichen Rat einholen.
```

## TestFlight Beta-Review-Angaben (externe Tester)

- **Beta-App-Beschreibung:** wie oben (Kurzfassung) + Disclaimer.
- **Was gibt's zu testen:**
  ```
  Bitte testen: Protokoll-Editor (Vorlagen erstellen/bearbeiten), Einsatz-
  ansicht (Befunde, Felder, Rechenhilfen, Medikationsplan-Scan), Übertragung
  an die ResQDocs-Bridge (optionale Hardware). Zielgruppe: Rettungsdienst-
  Personal. Es werden keine echten Patientendaten benötigt - bitte ausschließlich
  Test-/Beispieldaten verwenden.
  ```
- **Demo nötig?** Die Hardware-Brücke ist optional; alle Software-Funktionen
  (Editor, Scores, Scan, Export) sind ohne Hardware testbar. In den Review-Notizen
  vermerken, damit der Reviewer nicht an fehlender Hardware scheitert.
- **Kontakt + Datenschutz-URL** angeben (resqdocs.app, sobald Landing-Page live).

## App-Privacy-Label (App Store Connect)

- **Erhobene Daten: keine** ("Data Not Collected"). Begründung: kein Konto, keine
  Analytics, keine Server; Einsatzeingaben sind flüchtig (nur RAM), neutrale
  Vorlagen/Einstellungen liegen lokal. Das PZN-Wörterbuch lädt nur neutrale
  Referenzdaten (keine Nutzer-/Gesundheitsdaten).
- Konsistenz zu `SECURITY.md` und `docs/data-flow.md` ist wichtig (Apple prüft
  Widersprüche zwischen Label und App-Verhalten).

## Disclaimer-Konsistenz (Apple prüft das gesamte Material!)

Der "kein Medizinprodukt"-Disclaimer muss **überall gleich** stehen - App
(Info/Hilfe), Beschreibung, Landing-Page, README. Ein impliziter medizinischer
Claim irgendwo (z. B. "diagnostiziert", "empfiehlt Therapie") kann die Einstufung
als reguliertes Medizinprodukt auslösen, unabhängig vom Disclaimer.

## Quellen

### Medizinisch-wissenschaftlich (Scores) — Primärliteratur
Konkrete Fundstellen je Score in **`docs/medical-sources.md`**. Kurz:
- **NEWS2:** RCP, *NEWS 2*, London 2017 (Punktetabelle + Trigger-Schwellen).
- **LAMS:** Llanes et al., Prehosp Emerg Care 2004;8(1):46-50 (PMID 14691787);
  LVO-Cutoff ≥4: Nour/Saver et al., Stroke 2018;49(3):565-572.
- **BMI:** WHO Technical Report Series 894 (2000), Klassifikationstabelle.
- **EKG-Lagetyp:** DocCheck *Lagetyp* + Einthoven-Gesetz (II = I + III).

### App-Store-Review (konkrete Guideline-Stellen)
- **Guideline 1.4.1** — Medizin-Apps, Genauigkeit/Diagnose, Arzt-Hinweis;
  Verbot von Sensor-Vitalparametermessung ohne Validierung.
- **Guideline 1.4.2** — Dosierungsrechner nur von Hersteller/Klinik/Behörde
  (→ ResQDocs hat **keinen**; BMP = Transkription).
- **Guideline 5.1.1(vi)** — Gesundheitsdaten nicht für Werbung/Data-Mining.
  Alle drei: https://developer.apple.com/app-store/review/guidelines/
- Apple Developer News, Guideline-Updates 2026 (strengere Privacy-Disclosures):
  https://developer.apple.com/news/?id=3ozbk628
- App Store kennzeichnet als Medizinprodukt eingestufte Apps; allgemeiner
  Disclaimer exempt nicht automatisch (Gesamtmaterial maßgeblich):
  https://appleinsider.com/articles/26/03/27/apples-app-store-will-show-if-an-app-is-classified-as-a-regulated-medical-device
