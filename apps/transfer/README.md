# @resqdocs/transfer

Minimaler Ende-zu-Ende-Ephemeral-Blob-Dienst für den ResQDocs-Vorlagen-Transfer. Der Dienst speichert
**ausschließlich verschlüsselte Blobs** (AES-GCM, Schlüssel im URL-Fragment beim Client) — er sieht nie
Klartext, nie den Schlüssel, nie den Vorlagentyp. Node + eingebautes `node:sqlite`, keine Framework-Abhängigkeit.

## Datenschutz / Datensparsamkeit
- **Keine Personendaten in der DB** — eine Tabelle `blobs(id, ciphertext, expires_at, burn, delete_token)`,
  keine IP-Spalte.
- **Spurlose Löschung:** `PRAGMA secure_delete = ON` (gelöschte Inhalte werden mit Null überschrieben) +
  `auto_vacuum = FULL` (freigegebene Seiten gehen sofort ans OS zurück) + `wal_checkpoint(PASSIVE)` direkt
  nach **jedem** Löschen (Burn, Ablauf, Token-Löschung) — so bleibt kein genullter Frame bis zum nächsten
  Sweep im WAL liegen. Selbst physische Restspuren wären nutzlos, weil der Dienst nur Chiffrat hält und den
  Schlüssel nie kennt.
- **Keine Logs:** Container läuft mit `logging: none`; der Dienst schreibt kein Request-/Datenlog.
  Am externen Proxy zusätzlich `access_log off` (bzw. IP-Anonymisierung).
- **Ablauf serverseitig erzwungen:** TTL-Stufen 1 h / 24 h / 7 d, „1× lesen" (Burn) löscht atomar nach dem
  ersten Abruf. Lazy-Delete beim GET + Sweep alle 60 s.

## API
- `POST /v1/blob` — Body = `RQD1‖IV‖Chiffrat`; Header `X-Expire` (Sek., auf Stufe geclampt), `X-Burn: 1`.
  → `201 {id, code, deleteToken, expiresAt}`. `413` > 512 KB, `415` ohne RQD1-Kennung, `429` Rate-Limit.
- `GET /v1/blob/{idOrCode}` — Body = Blob; bei Burn danach atomar gelöscht. `404` abgelaufen/verbrannt.
- `GET /v1/blob/{id}/info` — nur `{burn, expiresIn}` für die Empfangsseite; liefert, reserviert und verbraucht den Inhalt nicht. `404` abgelaufen/verbraucht.
- `GET /og-transfer.png` — festes Vorschaubild (1200 × 630) für Link-Vorschauen. Empfangsseite und Seite „Link abgelaufen“ tragen allgemeine Open-Graph-Angaben, nie Titel oder Art des Inhalts (Messenger speichern Vorschauen auf ihren Servern). Vorschau-Dienste führen kein JavaScript aus und rufen den Inhalt nie ab.
- `DELETE /v1/blob/{id}` mit `X-Delete-Token`.
- `GET /healthz`.
- `GET /.well-known/apple-app-site-association` und `GET /.well-known/assetlinks.json` — App-Zuordnung, damit
  ein angetippter Transfer-Link direkt die App öffnet (iOS Universal Links, Android App Links). Nur
  vorhanden, wenn konfiguriert (siehe unten), sonst `404`.

## Link direkt in der App öffnen
Zugeordnet wird nur die Wurzel mit Fragment (`/#<id>.<key>`), also genau die Form eines Transfer-Links.
Die App ruft den Inhalt erst nach einer Bestätigung ab; ein Link mit „1× lesen" wird durch das Öffnen
nicht verbraucht. Die Werte sind Deploy-Konfiguration und stehen nicht im Code:

- `APPLINKS_IOS_APP_IDS` — kommagetrennt, je `<Team-ID>.<Bundle-ID>`.
- `APPLINKS_ANDROID` — kommagetrennt, je `<Paketname>=<SHA-256-Fingerabdruck des Signaturzertifikats>`
  (mehrere Zertifikate je Paket: Eintrag wiederholen).

Ungültige Einträge werden verworfen. Der Reverse Proxy muss beide Pfade ohne Umleitung und unverändert
durchreichen. Die Empfänger-Seite bietet auf Mobilgeräten zusätzlich „In der ResQDocs-App öffnen" an
(eigenes Schema `resqdocs://receive#<id>.<key>`), weil ein Tipp innerhalb derselben Seite keine
Zuordnung auslöst.

## Sicherheit
- **Injection:** ausschließlich parametrisierte Prepared Statements; `id`/`code` per Regex `[A-Za-z0-9]+`
  validiert; Blobs werden nie interpretiert/reflektiert; Fehlermeldungen sind statisch.
- **Empfänger-Seite (`GET /`):** self-contained, entschlüsselt nur clientseitig aus dem URL-Fragment;
  Inhalt wird via `textContent` gesetzt (kein XSS), strenge CSP inkl. `frame-ancestors 'none'` +
  `X-Frame-Options: DENY` (kein Clickjacking), `Referrer-Policy: no-referrer`. Der Schlüssel erreicht den
  Server nie. Blob-Antworten tragen `Cache-Control: no-store` (kein Proxy-Cache über die Löschung hinaus).
- **DoS-Härtung:** Token-Vergleich konstantzeitig; `server.maxConnections` (Default 128, `MAX_CONNECTIONS`)
  deckelt gleichzeitige Verbindungen gegen Body-Puffer-OOM; harte Gesamt-Byte-Obergrenze
  (`TRANSFER_MAX_TOTAL_BYTES`, Default 512 MB) begrenzt das DB-File unabhängig von der Blob-Anzahl.
- **Nur ResQDocs-Umschläge:** Blobs ohne die 4-Byte-Kennung `RQD1` werden mit `415` abgewiesen. Das ist eine
  **Form-Prüfung**, kein Inhalts-Beweis — bei echter E2E kann der Server den entschlüsselten Inhalt
  prinzipbedingt nicht prüfen. Missbrauch als Datei-Ablage wird über 512-KB-Limit + kurze TTL + Rate-Limit
  strukturell unattraktiv gemacht.

## Lokal testen
```
npm test        # node --test (Krypto-Round-Trip, TTL, Burn, 413/415, DELETE-Token)
```

## Deploy
Der Dienst läuft als eigener Container auf einem freien Port hinter einem Reverse Proxy (TLS dort).
**Bindende Proxy-Voraussetzungen** (Missbrauchsresistenz hängt teils daran): `access_log off` (bzw.
IP-Anonymisierung), `client_max_body_size 1m`, **`limit_req_zone` UND `limit_conn` pro IP** (der In-App-
Limiter zählt Requests/Minute, nicht Gleichzeitigkeit — `limit_conn` schließt die Lücke am Proxy). **Der
In-App-Rate-Limiter greift PER-IP** auf die echte Client-IP: `TRUSTED_PROXY` = Socket-Adresse des
Reverse-Proxys setzen — dann wird `X-Real-IP` (bevorzugt) bzw. der letzte `X-Forwarded-For`-Hop als
Client-IP geglaubt, von jedem anderen Peer NIE (Spoofing-Schutz). Setze am Proxy `X-Real-IP $remote_addr`
(oder `X-Forwarded-For $proxy_add_x_forwarded_for` — nicht das Client-XFF verbatim durchreichen). Ohne
`TRUSTED_PROXY` limitiert er pro Verbindungs-Peer (hinter Proxy = Proxy-IP = global). Abschaltbar mit `RATE_LIMIT=off`. Der Dienst
beendet langsame/hängende Requests selbst (headers/request-Timeout gegen Slowloris) und deckelt Speicher/PIDs/
CPU im Container — Missbrauchsresistenz hängt NICHT allein an der Proxy-Konfig. Kapazität via
`TRANSFER_MAX_BLOBS` (507 bei Voll). Abgelaufene Blobs werden beim Start + alle 60 s rigoros gelöscht
(`secure_delete` + `auto_vacuum` + `wal_checkpoint(TRUNCATE)` → keine Restspur, Datei wächst nicht). Für lokale Builds eigene Konfigurationswerte in `.env` hinterlegen
(siehe `.env.example`). Produktive Deploy-Skripte und Compose-Konfiguration liegen als eigene,
nicht-öffentliche Infrastruktur bei.

## Kurzlinks (resq.li)

Auf ausdrücklichen Wunsch beim Teilen legt der Dienst einen Kurzlink an: `POST /v1/short` mit `{"link": "<langer Link>"}`
liefert `{code, url, expiresAt}`; angenommen werden nur lange Links auf `PUBLIC_BASE` (Standard
`https://transfer.resqdocs.app`) zu einem vorhandenen Inhalt. `GET /v1/short/<code>` löst auf (200 `{link}`, 410
abgelaufen/übernommen, 404 unbekannt). Anfragen mit Host `SHORT_HOST` (Standard `resq.li`) bekommen auf `/<code>` eine
Weiterleitung (302) auf den langen Link, auf `/`, `/editor`, `/ai` die Weiterleitungen zur Webseite, sonst die Seite
„Link abgelaufen“. Ausnahme vom Ende-zu-Ende-Prinzip: Der Dienst speichert dafür den langen Link MIT Schlüssel. Er wird
gelöscht, sobald der Inhalt abgelaufen, übernommen oder gelöscht ist; der Code bleibt danach 30 Tage gesperrt
(`SHORT_LOCK_SECONDS`) und wird erst dann wieder vergeben. Der QR-Code in App und Editor ist immer der lange Link.
`DELETE /v1/blob/<id>/short` mit `X-Delete-Token` nimmt den Kurzlink zurück (Haken beim Teilen wieder entfernt): das
Ziel wird sofort gelöscht, der Inhalt bleibt. Grenzen je Anschluss (IPv6 je /64): 20 Auflösungen und 5 Fehlversuche
pro Minute, 10 neue Kurzlinks pro Minute. Ist die Tabelle voll, werden die ältesten nur noch gesperrten Codes
vorzeitig freigegeben.
