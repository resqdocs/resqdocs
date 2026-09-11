// Das Oeffnen der geteilten SQLite-Verbindung - herausgeloest aus capacitorSqlClient.ts, damit es
// OHNE Geraet testbar ist. Der Rest der Datei bleibt Plugin-Anbindung.
//
// ANLASS (Nutzermeldung, Datenverlust): auf dem Geraet erschien
//   „Lokale Datenbank nicht erreichbar: CreateConnection: Connection resqdocs-library already exists"
// und danach war ein Einsatz verloren. Die Kette dahinter:
//
//  1. Es wurde ausschliesslich createConnection() gerufen. Der Verbindungs-Pool liegt aber NATIV im
//     Plugin und ueberlebt einen Neuaufbau des JavaScript-Kontexts (WKWebView kann den Kontext bei
//     Speicherdruck neu laden, ohne dass die App neu startet). Danach ist der JS-Zustand leer, der
//     native Pool aber nicht - und createConnection wirft „already exists".
//  2. Der Fehler war damit fuer den restlichen App-Lauf endgueltig: das Ergebnis wurde memoisiert,
//     und zwar AUCH im Fehlerfall. Jeder weitere Aufruf - auch „Neu pruefen" in den Einstellungen -
//     bekam dieselbe abgelehnte Zusage zurueck.
//  3. protocolPersistence schaltet bei libraryError den Auto-Save ab (:49, :69). Das ist RICHTIG so -
//     es soll nicht in eine defekte Datenbank schreiben und moeglicherweise rettbare Zeilen
//     ueberschreiben. Nur: der Nutzer dokumentiert weiter, und nichts davon wird gespeichert.
//
// Der Fehler lag also nicht im Schutzmechanismus, sondern davor: die Verbindung haette gar nicht
// unerreichbar werden duerfen. WELCHER Plugin-Aufruf das loest, steht bei openSharedConnection -
// es ist nicht der naheliegende.

/** Nur der Teil des Plugins, den wir hier brauchen - so laesst sich das Verhalten ohne Geraet pruefen. */
export interface SqliteLike<DB> {
  checkConnectionsConsistency?: () => Promise<{ result?: boolean }>
  isConnection: (database: string, readonly: boolean) => Promise<{ result?: boolean }>
  retrieveConnection: (database: string, readonly: boolean) => Promise<DB>
  createConnection: (
    database: string,
    encrypted: boolean,
    mode: string,
    version: number,
    readonly: boolean,
  ) => Promise<DB>
}

export interface DbLike {
  isDBOpen?: () => Promise<{ result?: boolean }>
  open: () => Promise<void>
}

/**
 * Die geteilte Verbindung oeffnen - und eine bereits bestehende WIEDERVERWENDEN statt an ihr zu
 * scheitern.
 *
 * WICHTIG - Schritt 1 ist der tragende, nicht die Wiederverwendung:
 * isConnection() und retrieveConnection() lesen AUSSCHLIESSLICH die JS-seitige Map _connectionDict
 * der jeweiligen SQLiteConnection-Instanz (siehe definitions.js: `this._connectionDict = new Map()`
 * im Konstruktor). capacitorSqlClient legt bei jedem Aufruf eine NEUE Instanz an - nach einem
 * Neuaufbau des JS-Kontexts ist diese Map also immer leer, und isConnection meldet zwangslaeufig
 * false. Die Meldung „already exists" stammt dagegen aus dem NATIVEN Pool.
 *
 * Was den gemeldeten Fall tatsaechlich aufloest, ist checkConnectionsConsistency() mit LEERER
 * Namensliste: nativ gilt dann „keine erwarteten Verbindungen -> closeAllConnections()". Der native
 * Pool wird geraeumt, und das anschliessende createConnection gelingt.
 *
 * Daraus folgt: Schritt 1 darf NICHT als Beiwerk behandelt werden. Sein Fehlschlag wird zwar
 * weiterhin nicht zum Startabbruch (eine unvollstaendige Bereinigung ist besser als gar kein
 * Versuch), aber er wird gemeldet statt verschluckt - sonst entfernt ihn spaeter jemand als
 * vermeintlich ueberfluessig und nimmt damit unbemerkt die Wirkung heraus.
 *
 * Reihenfolge:
 *  1. checkConnectionsConsistency() - raeumt nativ auf. DER wirksame Schritt.
 *  2. isConnection() - greift nur, wenn dieselbe Instanz die Verbindung selbst angelegt hat.
 *  3. Ja -> retrieveConnection(), nein -> createConnection().
 *  4. Rueckfall: wirft createConnection dennoch „already exists", wird retrieveConnection versucht.
 *     Das schlaegt bei fremder Instanz seinerseits fehl („does not exist") - deshalb wird dann der
 *     URSPRUENGLICHE Fehler geworfen, nicht der Folgefehler, damit die Diagnose nicht irrefuehrt.
 *  5. open() nur, wenn die Datenbank nicht ohnehin offen ist.
 */
export async function openSharedConnection<DB extends DbLike>(
  sqlite: SqliteLike<DB>,
  dbName: string,
): Promise<DB> {
  // DER wirksame Schritt (siehe Kopfkommentar). Ein Fehlschlag bricht den Start nicht ab, wird aber
  // sichtbar gemacht - er ist der wahrscheinlichste Grund, falls die Verbindung doch scheitert.
  try {
    await sqlite.checkConnectionsConsistency?.()
  } catch (err) {
    console.warn('SQLite: Pool-Bereinigung fehlgeschlagen - Verbindungsaufbau kann scheitern:', err)
  }

  let vorhanden = false
  try {
    vorhanden = (await sqlite.isConnection(dbName, false)).result === true
  } catch {
    vorhanden = false // im Zweifel den Erzeugungsweg gehen; Schritt 4 faengt den Rest ab
  }

  let db: DB
  if (vorhanden) {
    db = await sqlite.retrieveConnection(dbName, false)
  } else {
    try {
      db = await sqlite.createConnection(dbName, false, 'no-encryption', 1, false)
    } catch (err) {
      if (!istBereitsVorhandenFehler(err)) throw err
      try {
        db = await sqlite.retrieveConnection(dbName, false)
      } catch {
        // Fremde Instanz haelt die Verbindung: retrieveConnection kann sie nicht kennen. Den
        // URSPRUENGLICHEN Fehler weiterreichen - „already exists" beschreibt die Lage richtig,
        // „does not exist" wuerde die Diagnose in die Irre fuehren.
        throw err
      }
    }
  }

  // open() auf einer bereits offenen Datenbank ist je nach Plattform ein Fehler - erst fragen.
  let offen = false
  try {
    offen = (await db.isDBOpen?.())?.result === true
  } catch {
    offen = false
  }
  if (!offen) await db.open()

  return db
}

/** Erkennt die Plugin-Meldung „Connection <name> already exists" - plattform- und wortlautrobust. */
export function istBereitsVorhandenFehler(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? '')
  return /already exists/i.test(text)
}
