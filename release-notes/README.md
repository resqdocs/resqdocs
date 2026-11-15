# Release-Notes

Je Version eine Datei unter `de/<version>.md`. Das ist die **eine Quelle** für:

- den Versionsverlauf in der App (Einstellungen → Versionsverlauf),
- die GitHub-Release-Seite,
- die Versionsübersicht auf der Webseite.

Aufbau: Überschrift `# ResQDocs <version>`, ein Satz Zusammenfassung, dann die Abschnitte `## Added`,
`## Changed`, `## Fixed` mit je einer Liste. Die App zeigt die Abschnitte als „Neu“, „Verbessert“ und
„Behoben“. Die Datei für eine neue Version entsteht **vor** dem Release-Commit, damit sie im App-Paket steckt;
ein Test bricht ab, wenn sie für die aktuelle App-Version fehlt.
