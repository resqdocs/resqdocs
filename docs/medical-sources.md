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
  - Risiko-/Trigger-Schwellen: aggregiert **0-4 niedrig**, **3 in einem
    Einzelparameter → niedrig-mittel**, **5-6 mittel**, **≥7 hoch** →
    RCP-2017, *Clinical response to NEWS triggers*.
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

## BMI (Body-Mass-Index)

- **Quelle:** WHO. *Obesity: preventing and managing the global epidemic.* WHO
  Technical Report Series 894. Geneva: WHO, 2000.
- **Konkrete Fundstellen (Erwachsene, Klassifikationstabelle):**
  Untergewicht < 18,5 · Normalgewicht 18,5-24,9 · Präadipositas (Übergewicht)
  25,0-29,9 · Adipositas Grad I 30,0-34,9 · Grad II 35,0-39,9 · Grad III ≥ 40,0.
  WHO TRS 894, *Classification of overweight in adults according to BMI*.
  Übersicht: <https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index>

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

## EKG-Referenz / Spickzettel (#86)

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
