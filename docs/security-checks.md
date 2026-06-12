# Sicherheits-/Hygiene-Checks

Dieses Repository enthält ein automatisches Gate gegen versehentlich
versionierte sensible Inhalte (Zugangsdaten, Schlüssel, private Adressen,
personenbezogene Daten, interne Konfigurationswerte).

## Lokal ausführen

```bash
node scripts/security-check.mjs            # kompletter Arbeitsbaum
node scripts/security-check.mjs --staged   # nur gestagte Dateien
```

Exit-Code 0 = sauber; bei Befunden listet das Skript jede Fundstelle einzeln.

## Git-Hooks aktivieren (empfohlen)

Einmalig pro Klon:

```bash
git config core.hooksPath hooks
```

Danach läuft der Check automatisch:

- **pre-commit**: prüft die gestagten Dateien (`--staged`)
- **pre-push**: prüft den kompletten Arbeitsbaum

## CI

`.github/workflows/security.yml` führt denselben Check bei jedem Push auf
`main`/`dev` und bei jedem Pull Request aus. Ein Pull Request mit Befunden
schlägt fehl.

## Was geprüft wird

1. **Verbotene Dateiarten**: echte `.env`-Dateien, Keystores/Zertifikate
   (`.jks`, `.p12`, `.p8`, `.pem`, `.mobileprovision`, …), SSH-Schlüssel,
   `google-services.json`/`GoogleService-Info.plist`, Core-Dumps, Logs.
   (`.env.example` ist erlaubt.)
2. **Kritische Inhalts-Muster** (alle Dateien): private Schlüsselblöcke,
   private IP-Bereiche (außer der dokumentierten Bridge-Adresse 10.10.10.x),
   E-Mail-Adressen außerhalb der Allowlist sowie weitere gesperrte Begriffe.
3. **Risiko-Begriffe** (Workflows, Doku, Changelog, `cliff.toml`, `.env*`,
   `json/yaml/properties/plist/gradle/toml`, `fastlane/`, Fixtures, Logs):
   z. B. `token`, `secret`, `password`, `keystore`, `provisioning`,
   `service_account`, `team_id`, `bundle_id`, … Jeder legitime Treffer braucht
   einen begründeten Eintrag in `scripts/security-allowlist.json`.
4. **Changelog/git-cliff**: `cliff.toml` und `CHANGELOG*` fallen unter die
   geprüften Dateiklassen — private Verweise oder interne Begriffe schlagen
   dort genauso fehl.

## Allowlist

Legitime Treffer (z. B. `secrets.GITHUB_TOKEN` in Workflows oder das Wort
„Keystore" in einer generischen Build-Anleitung) werden in
`scripts/security-allowlist.json` mit **Begründung** eingetragen. Einträge
ohne nachvollziehbare Begründung werden im Review abgelehnt.

## Zusätzliche eigene Muster

Organisationen können eigene, nicht versionierte Zusatzmuster in
`.security-patterns.local.json` hinterlegen (Format:
`{ "patterns": ["regex1", "regex2"] }`). Die Datei ist gitignored und wird,
falls vorhanden, automatisch mitgeprüft.
