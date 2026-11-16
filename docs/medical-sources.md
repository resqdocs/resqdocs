# Medizinische Quellen der Rechenhilfen

> **Zielgruppe:** ResQDocs richtet sich an Fachpersonal im Rettungsdienst
> (Notfallsanitäter:innen, Notärzt:innen), das diese Scores **im Alltag
> anwendet und kennt**. Die Tools sind Gedächtnis-/Rechenhilfen nach den
> jeweiligen Originalquellen - keine Diagnose, keine Behandlungsempfehlung.
> Alle Schwellenwerte sind **gegen die Primärliteratur** belegt; Stellen unten
> konkret zitiert. Implementierung: `packages/shared/tools/scores.mjs`.

## NEWS2 (National Early Warning Score 2)

- **Quelle:** Royal College of Physicians. *National Early Warning Score
  (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS.
  Updated report of a working party.* London: RCP, December 2017.
- **Konkrete Fundstellen:**
  - Parameter-Punktetabelle (0-3 je Atemfrequenz, SpO₂ Skala 1, SpO₂ Skala 2 bei
    hyperkapnischer respiratorischer Insuffizienz, O₂-Gabe, RR systolisch,
    Herzfrequenz, Temperatur, Bewusstsein ACVPU) → RCP-2017-Bericht, *NEWS2
    scoring system table*. Chart: <https://www.rcp.ac.uk/media/2acdezkd/news2-chart-2_news-thresholds-and-triggers_0.pdf>
  - **SpO₂-Skala 2 nur** bei ärztlich dokumentierter Ziel-Sättigung 88-92 %
    (z. B. COPD) → RCP-2017, Abschnitt *Scale 2*.
  - Risiko-/Trigger-Schwellen (RCP-2017, *Clinical response to NEWS triggers*):
    aggregiert **0-4 niedrig**, **5-6 mittel**, **≥7 hoch**. RCP kennt zusätzlich
    einen „red score": schöpft ein einzelner Vitalwert die vollen 3 Punkte aus
    (z. B. Atemfrequenz ≤ 8/min), stuft RCP auf **niedrig-mittel** hoch, auch wenn
    die Summe niedrig ist. **Bewusste App-Entscheidung (2026-07-03):** die
    NEWS2-Score-Ausgabe stuft NUR nach dem Gesamtscore ein — ein extrem
    entgleister Einzelwert ist im separat dokumentierten Vitalwert ohnehin
    sichtbar; die Score-Ausgabe soll nur zeigen, was der Gesamtscore ergibt
    (Score + Risiko niedrig/mittel/hoch).
- **Volltext:** <https://www.rcp.ac.uk/media/a4ibkkbf/news2-final-report_0_0.pdf>

## LAMS (Los Angeles Motor Scale)

- **Quelle:** Llanes JN, Kidwell CS, Starkman S, Leary MC, Eckstein M, Saver JL.
  *The Los Angeles Motor Scale (LAMS): a new measure to characterize stroke
  severity in the field.* Prehosp Emerg Care. 2004;8(1):46-50. PMID **14691787**.
- **Konkrete Fundstellen:**
  - Punktevergabe **Fazialisparese 0-1, Armhalteversuch 0-2, Händedruck 0-2**,
    Summe **0-5** → Llanes 2004, *Scale construction* (aus LAPSS-Items).
  - **LVO-Hinweis ab LAMS ≥ 4** → Nour M, Liebeskind DS, Saver JL et al.
    *Los Angeles Motor Scale to Identify Large Vessel Occlusion: Prehospital
    Validation and Comparison with Other Screens.* Stroke. 2018;49(3):565-572.
    DOI <https://doi.org/10.1161/STROKEAHA.117.019228>.
- **Ausgabe als Funktion:** eine Zeile mit Summe und den drei Befunden, ab
  4 Punkten mit dem Zusatz „V. a. proximalen Verschluss (LVO)", z. B.
  `LAMS 4/5 (Fazialisparese, Arm fällt sofort, Händedruck schwach) - V. a.
  proximalen Verschluss (LVO)`. Im Einsatz: grün bei 0, gelb bei 1-3, rot ab 4.

## FAST4D

- **Quelle:** Claudi C, Worm A, Schmohl D, Juenemann M, Alhaj Omar O, Loesche H,
  Huttner HB, Schramm P. *FAST4D - A New Score to Reduce Missed Strokes in
  Emergency Medical Service: A Prospective, Multicentric Observational
  Proof-of-Concept Trial.* J Clin Med. 2024;13(17):5033. PMID **39274246**,
  DOI <https://doi.org/10.3390/jcm13175033> (Open Access, CC BY 4.0).
- **Konkrete Fundstellen:**
  - **Zeichen:** FAST (Face, Arm, Speech, Time) plus vier Zeichen der hinteren
    Zirkulation: Doppelbilder, Gesichtsfelddefekt, Dreh-/Schwankschwindel,
    Dysmetrie/Ataxie → Claudi 2024, *Abstract* und *Methods*.
  - **Kein Punktescore, positiv ab einem auffälligen Zeichen** → Claudi 2024,
    *Methods*: „FAST4D was flagged as true if any one of the FAST4D score items
    was documented as positive".
  - **Aussagekraft** (1469 Patient:innen, davon 1035 mit Schlaganfall, Tabellen
    1 und 2): Sensitivität FAST 78,0 % (807/1035), FAST4D 93,3 % (966/1035).
    Schlaganfälle der hinteren Zirkulation: 175 von 314 mit FAST, 298 von 314
    mit FAST4D (*Results 3.3*).
  - **Grenzen laut Autoren:** Spezifität und positiver prädiktiver Wert waren
    methodisch nicht bestimmbar; die höhere Sensitivität geht mit mehr
    Übertriage einher (224 zusätzlich falsch positive Fälle gegenüber FAST) →
    *Discussion*, *Limitations*, *Conclusions*. Proof-of-Concept-Studie.
  - Im Fließtext nennt die Arbeit 259 zusätzlich erkannte Schlaganfälle; aus den
    Tabellen ergeben sich 159 (966 − 807). Zitiert sind hier die Tabellenwerte.
- **Bewusste App-Entscheidungen (2026-11-13):**
  - **Keine Schwelle, kein Zuweisungshinweis.** Die Studie nennt keinen Cut-off
    und wertet Gefäßverschlüsse nicht aus. Der Hinweis „FAST4D ≥ 4 ggf. direkt
    an ein endovaskuläres Zentrum" stammt aus einem regionalen Versorgungskonzept
    (*Präklinische Versorgung von Schlaganfallpatienten - Konsentiertes Konzept
    in Mittelhessen*, Version 2.3), nicht aus der Studie, und wird nicht
    ausgegeben. Die Anzahl auffälliger Befunde steht als Zählung in der Zeile
    („positiv (3/7)"), ohne Wertung.
  - **Time zählt nicht zum Ergebnis.** Symptombeginn oder „zuletzt gesund
    gesehen" wird mit Uhrzeit dokumentiert, alternativ „unklar".
  - **„nicht prüfbar" je Befund.** Ein nicht prüfbarer Befund zählt nicht als
    auffällig und wird in der Zeile benannt. Sind alle sieben nicht prüfbar,
    lautet die Ausgabe „nicht prüfbar".
  - **Seite** (rechts/links) optional bei Face und Arm, nur zur Dokumentation.
  - **Farbe im Einsatz:** grün nur, wenn alle sieben Zeichen unauffällig sind;
    gelb, sobald ein Zeichen auffällig ist; keine Farbe, wenn nichts auffällig
    ist, aber nicht alles prüfbar war. Kein Rot, weil es keine belegte Schwelle
    gibt. Die Farbe ist nur eine Anzeige in der App, der Text bleibt gleich.
  - **Hilfstexte im Eingabeblatt** sind eigene Formulierungen, keine Übernahme
    aus Taschenkarten.

## ZOPS

ZOPS ist eine Merkhilfe für die Orientierung: **Z**eit, **O**rt, **P**erson, **S**ituation (auch als
ZÖSP oder ZSOP geläufig). Es ist **kein Score**: Es gibt keinen Punktwert, keine Schwelle und keine
Einstufung, die sich belegen ließe. Die App erfasst je Punkt nur, was erhoben wurde.

**Fundstellen (Nachschlagewerke, keine Primärquelle; abgerufen 2026-11-15):**

- DocCheck Flexikon, „ZOPS-Schema": Einsatz im Rettungsdienst zur Beurteilung der zeitlichen,
  örtlichen, situativen und persönlichen Orientierung, mit Beispielfragen je Punkt
  (<https://flexikon.doccheck.com/de/ZOPS-Schema>).
- AMBOSS, SOP „Akute qualitative Bewusstseinsstörung": Orientierungsprüfung zeitlich, örtlich, zur
  Person und zur Situation
  (<https://www.amboss.com/de/wissen/akute-qualitative-bewusstseinsstorung-amboss-sop/>).

**Bewusste App-Entscheidungen (Maintainer, 2026-11-15):**

- Name und Reihenfolge: ZOPS (Zeit, Ort, Person, Situation).
- Drei Stufen je Punkt: orientiert / nicht orientiert / nicht prüfbar. Kein Punkt ist vorbelegt.
- Die Ausgabe nennt nur die Abweichung: „ZOPS orientiert." im Normalfall, sonst „ZOPS nicht orientiert
  zu: Zeit; nicht prüfbar: Situation." Ist nichts auffällig, aber nicht alles prüfbar, steht genau da,
  wozu die Orientierung feststeht („orientiert zu: Zeit, Ort, Person; nicht prüfbar: Situation.").
- Kein Zähler („3/4") und kein Hinweis auf Ursachen oder Maßnahmen.
- Hilfetexte im Eingabeblatt sind eigene Formulierungen (Beispielfragen), keine Zitate.
- Farbe nur in der App, wie bei FAST4D: Grün, wenn zu allen vier Punkten orientiert; Gelb bei mindestens
  einem „nicht orientiert"; ohne Farbe, wenn nichts auffällig, aber nicht alles prüfbar war. Kein Rot.


## Sgarbossa (modifiziert nach Smith)

EKG-Kriterien für einen akuten Infarkt bei Linksschenkelblock. Die App fragt die **modifizierte Fassung
nach Smith** ab: drei gleichwertige Kriterien, **positiv ab einem erfüllten**, kein Punktwert.

| Nr. | Kriterium | Quelle |
|---|---|---|
| 1 | Konkordante ST-Hebung von mindestens 1 mm | Sgarbossa 1996 |
| 2 | ST-Senkung von mindestens 1 mm in V1, V2 oder V3 | Sgarbossa 1996 |
| 3 | Diskordante ST-Hebung im Verhältnis zur S-Zacke, ST/S ≤ −0,25 (mindestens 25 % der S-Zacke, bei mindestens 1 mm diskordanter Abweichung) | Smith 2012 |

**Quellen (Zusammenfassungen über Europe PMC gelesen, 2026-11-15):**

- Sgarbossa EB, Pinski SL, Barbagelata A, et al. Electrocardiographic diagnosis of evolving acute
  myocardial infarction in the presence of left bundle-branch block. N Engl J Med 1996;334:481-487.
  PMID 8559200. Nennt die drei ursprünglichen Kriterien (drittes: diskordante ST-Hebung ab 5 mm) und
  ein Punktesystem von 0 bis 10. Die Gewichte (5/3/2, positiv ab 3) stehen im Volltext, den wir nicht
  einsehen konnten; die App nutzt sie nicht.
- Smith SW, Dodd KW, Henry TD, Dvorak DM, Pearce LA. Diagnosis of ST-elevation myocardial infarction in
  the presence of left bundle branch block with the ST-elevation to S-wave ratio in a modified Sgarbossa
  rule. Ann Emerg Med 2012;60:766-776. PMID 22939607. Ersetzt das dritte Kriterium durch das
  ST/S-Verhältnis, Grenzwert −0,25; „The revised rule is unweighted, requiring just 1 of 3 criteria."
  33 EKGs mit Verschluss, 129 Kontrollen.
- Meyers HP, Limkakeng AT, Jaffa EJ, et al. Validation of the modified Sgarbossa criteria for acute
  coronary occlusion in the setting of left bundle branch block. Am Heart J 2015;170:1255-1264.
  PMID 26678648. Sensitivität der modifizierten Kriterien 80 %, der ursprünglichen gewichteten 49 %.
- Dodd KW, Zvosec DL, Hart MA, et al. Electrocardiographic Diagnosis of Acute Coronary Occlusion
  Myocardial Infarction in Ventricular Paced Rhythm Using the Modified Sgarbossa Criteria. Ann Emerg Med
  2021;78:517-529. PMID 34172301. Grundlage für den Hinweis „oder Schrittmacher-Rhythmus" im Blatt
  (nur der Titel wurde geprüft, nicht die Ergebnisse).

**Bewusste App-Entscheidungen (Maintainer, 2026-11-15):**

- Fassung: modifiziert nach Smith. Die ursprünglichen Punkte gibt es in der App nicht.
- **Pflicht-Hinweis, nur im Eingabeblatt:** „Negative Sgarbossa-Kriterien schließen einen akuten
  Koronarverschluss nicht aus." Er steht unten bei der Auswertung, sobald das Ergebnis negativ ist;
  nicht im Einsatz und nie im Protokolltext (Maintainer, 2026-11-16). Sachlicher Hintergrund: Bei Meyers 2015 erfüllte jeder
  fünfte Verschluss kein Kriterium.
- Der Rhythmus (Linksschenkelblock, Schrittmacher) wird nicht erfasst; das Blatt nennt nur, wofür die
  Kriterien gelten. Wer es braucht, hängt die Funktion in der Vorlage per Abhängigkeit an ein Feld.
- Drei Stufen je Kriterium: erfüllt / nicht erfüllt / nicht beurteilbar. Kein Kriterium ist vorbelegt.
- Ausgabe: „Sgarbossa (mod. nach Smith) positiv: konkordante ST-Hebung." / „… negativ." Im Text steht
  „ST/S ab 0,25" statt „≥ 25 %", weil die Bridge die Zeichen ≥ und % nicht sicher tippen kann.
- Farbe nur in der App: Rot, sobald ein Kriterium erfüllt ist. Negativ hat **keine** Farbe und wird nie
  grün, weil es keine Entwarnung ist.
- Das Zeichen am Ende der Zeile ist frei wählbar (Standard „.“, leer = nichts; Maintainer, 2026-11-16).
- Hilfetexte im Eingabeblatt sind eigene Formulierungen.


## EGSYS

Punktwert aus der Anamnese für die Frage, ob eine Synkope kardial bedingt ist (Evaluation of
Guidelines in Syncope Study). Sechs Punkte, je Ja/Nein, Summe von −2 bis +12.

| Punkt | Wert |
|---|---|
| Palpitationen vor der Synkope | +4 |
| Herzerkrankung und/oder auffälliges EKG | +3 |
| Synkope bei Belastung | +3 |
| Synkope im Liegen | +2 |
| Auslöser oder begünstigende Umstände | −1 |
| Vegetative Prodromi | −1 |

**Schwelle:** ab 3 Punkten steht ein Text hinter dem Ergebnis, standardmäßig „- kardiale Synkope
wahrscheinlich". Der Text ist je Vorlage frei wählbar (Einstellung „Text ab 3 Punkten").

**Quellen (über Europe PMC gelesen, 2026-11-15):**

- Del Rosso A, Ungar A, Maggi R, et al. Clinical predictors of cardiac syncope at initial evaluation in
  patients referred urgently to a general hospital: the EGSYS score. Heart 2008;94:1620-1626.
  PMID 18519550. Zusammenfassung: 516 Patienten in 14 Notaufnahmen; „To each variable a score from +4 to
  -1 was assigned"; „A score >=3 identified cardiac syncope with a sensitivity of 95%/92% and a
  specificity of 61%/69% in the derivation and validation cohorts". Der Volltext war nicht einsehbar.
- Kariman H, Harati S, Safari S, Baratloo A, Pishgahi M. Validation of EGSYS Score in Prediction of
  Cardiogenic Syncope. Emerg Med Int 2015;2015:515370. PMID 26649200, frei zugänglich (PMC4663288).
  Tabelle 2 (EGSYS-M) nennt die **Punktwerte je Punkt**, wie oben; „Total score ≥3 indicates patients at
  risk for presence of cardiac cause." Dort bestätigt: Schwelle 3, Sensitivität 91,3 %.

**Bewusste App-Entscheidungen (Maintainer, 2026-11-15):**

- Eingabe Ja/Nein je Punkt, kein „nicht erhebbar". Kein Punkt ist vorbelegt.
- Ausgabe mit Punkten, Befunden und Einordnung: „EGSYS 7 Punkte (Palpitationen vor Synkope,
  Herzerkrankung/EKG auffällig) - kardiale Synkope wahrscheinlich." Unter 3 Punkten ohne Einordnung.
- Der Text ab 3 Punkten ist je Vorlage frei wählbar; leer heißt Standard (Maintainer, 2026-11-16).
- Das Zeichen am Ende der Zeile ist ebenfalls frei wählbar (Standard „.“, leer = nichts).
- **Hinweis nur im Eingabeblatt** unter 3 Punkten: „Ein EGSYS unter 3 Punkten schließt eine kardiale
  Synkope nicht aus." Unten bei der Auswertung, sobald das Ergebnis unter 3 Punkten liegt; nicht im
  Einsatz und nie im Protokolltext (Maintainer, 2026-11-16). Sachlicher
  Hintergrund: Die Sensitivität liegt bei 92 bis 95 %, nicht bei 100 %.
- Farbe nur in der App: Rot ab 3 Punkten. Darunter **keine** Farbe und nie Grün.
- Hilfetexte im Eingabeblatt sind eigene Formulierungen. Die Beispiele für Auslöser (warmer oder voller
  Raum, langes Stehen, Angst, Schmerz, starke Gefühle) und Prodromi (Übelkeit, Erbrechen) folgen der
  üblichen Wiedergabe der Originalarbeit; im Volltext geprüft sind sie nicht. Kariman 2015 nennt für
  seine Auswertung eine längere Liste.

## BMI (Body-Mass-Index)

- **Quelle:** WHO. *Obesity: preventing and managing the global epidemic.* WHO
  Technical Report Series 894. Geneva: WHO, 2000.
- **Konkrete Fundstellen (Erwachsene, Klassifikationstabelle):**
  Untergewicht < 18,5 · Normalgewicht 18,5-24,9 · Präadipositas (Übergewicht)
  25,0-29,9 · Adipositas Grad I 30,0-34,9 · Grad II 35,0-39,9 · Grad III ≥ 40,0.
  WHO TRS 894, *Classification of overweight in adults according to BMI*.
  Übersicht: <https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index>
- **In der App (Funktion „BMI", ab 1.12.0):** Gewicht in kg und Größe in cm, Ausgabe wie beim früheren
  Rechner „BMI 24,7 (Normalgewicht; 80 kg, 180 cm)". Die Klassen gelten für Erwachsene; das Eingabeblatt
  sagt das. Keine Farbe im Einsatz, die Klasse ist eine Einordnung, keine Warnstufe.

## Pack-Years

- **Definition:** (Zigaretten pro Tag ÷ 20) × Raucherjahre. Standarddefinition
  der Rauch-Expositionsdosis. NCI Dictionary of Cancer Terms, *pack year*:
  <https://www.cancer.gov/publications/dictionaries/cancer-terms/def/pack-year>

## EKG-Lagetyp

- **Tabelle (Hauptausschlag QRS in I/II/III → Lagetyp):** DocCheck Flexikon
  *Lagetyp* (6 Standardtypen mit Gradbereichen, Indifferenz vs. Steiltyp via
  R-Zacken-Vergleich I/III): <https://flexikon.doccheck.com/de/Lagetyp>
- **Sagittaltyp (S-I-S-II-S-III):** Wikibooks *Elektrokardiographie - Ableitungen
  der Frontalebene und Achsen*:
  <https://de.wikibooks.org/wiki/Elektrokardiographie:_Ableitungen_der_Frontalebene_und_Achsen>
- **Unmögliche Konstellationen** (`pos|neg|pos`, `neg|pos|neg`) folgen aus dem
  **Einthoven-Gesetz** (Ableitung II = I + III): Einthoven W. *Über die
  Richtung und die manifeste Größe der Potentialschwankungen im menschlichen
  Herzen.* Pflügers Arch. 1913;150:275-315. → bei uns: "Angaben kontrollieren".

## EKG-Referenz / Spickzettel

Nachschlage-Hilfe (Normzeiten + Erinnerungs-Kennzeichen), keine Diagnose. Werte
vom Maintainer kuratiert/freigegeben.

- **Normintervalle (P, PR, QRS, QT/QTc):** AHA/ACCF/HRS *Recommendations for the
  Standardization and Interpretation of the Electrocardiogram* (2009), Circulation.
  PR 120-200 ms; QRS < 120 ms; QTc obere Norm m < 450 / w < 460 ms, verlängert
  ≥ 470 (m) / ≥ 480 (w) ms (Teil IV: ST segment, T/U waves, QT interval).
  <https://www.ahajournals.org/doi/10.1161/circulationaha.108.191096>
- **Schenkelblock & Hemiblock (RBBB/LBBB, LAHB/LPHB; QRS ≥ 120 ms):** AHA/ACCF/HRS
  *Standardization … Part III: Intraventricular Conduction Disturbances* (2009),
  Circulation (PubMed 19228822).
  <https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.108.191095>
- **AV-Block (I°; II° Mobitz I/Wenckebach + Mobitz II; III°; höhergradig):**
  *2021 ESC Guidelines on cardiac pacing and cardiac resynchronization therapy*,
  Eur Heart J 2021;42(35):3427-3520.
  <https://academic.oup.com/eurheartj/article/42/35/3427/6358547>
- **STEMI-ST-Hebungskriterium** (neue ST-Hebung am J-Punkt, ≥ 2 zusammenhängende
  Ableitungen; ≥ 1 mm allgemein; V2-V3: ≥ 2 mm Männer ≥ 40 J, ≥ 2,5 mm Männer < 40 J,
  ≥ 1,5 mm Frauen): *Fourth Universal Definition of Myocardial Infarction* (2018),
  Thygesen et al., Circulation.
  <https://www.ahajournals.org/doi/10.1161/CIR.0000000000000617>

## Medikationsplan-Scan (BMP)

- **Format:** KBV *Spezifikation Bundeseinheitlicher Medikationsplan (BMP)*,
  Anlage 3 zum Bundesmantelvertrag-Ärzte; Data-Matrix mit XML-Ultrakurzformat.
  ResQDocs **transkribiert** ausschließlich die im Code enthaltenen,
  **ärztlich verordneten** Medikationszeilen - **keine Dosisberechnung**.
