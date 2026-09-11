import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openSharedConnection, istBereitsVorhandenFehler, type SqliteLike } from './openSharedConnection.ts'

interface FakeDb {
  name: string
  offen: boolean
  isDBOpen: () => Promise<{ result: boolean }>
  open: () => Promise<void>
}

function fakeDb(name: string, offen = false): FakeDb {
  const db: FakeDb = {
    name,
    offen,
    isDBOpen: async () => ({ result: db.offen }),
    open: async () => {
      if (db.offen) throw new Error('open() auf bereits offener DB')
      db.offen = true
    },
  }
  return db
}

/** Bildet den nativen Verbindungs-Pool nach - der Punkt der ganzen Uebung. */
function fakeSqlite(pool: Map<string, FakeDb>, opts: { isConnectionKennt?: boolean; consistencyWirft?: boolean } = {}) {
  const ruf = { create: 0, retrieve: 0, consistency: 0 }
  const sqlite: SqliteLike<FakeDb> = {
    checkConnectionsConsistency: async () => {
      ruf.consistency++
      if (opts.consistencyWirft) throw new Error('nicht unterstuetzt')
      return { result: true }
    },
    isConnection: async (name) => ({
      result: opts.isConnectionKennt === false ? false : pool.has(name),
    }),
    retrieveConnection: async (name) => {
      ruf.retrieve++
      const db = pool.get(name)
      if (!db) throw new Error('Connection ' + name + ' does not exist')
      return db
    },
    createConnection: async (name) => {
      ruf.create++
      if (pool.has(name)) throw new Error('CreateConnection: Connection ' + name + ' already exists')
      const db = fakeDb(name)
      pool.set(name, db)
      return db
    },
  }
  return { sqlite, ruf }
}

test('bestehende Verbindung DERSELBEN Instanz wird wiederverwendet statt neu angelegt', async () => {
  // Deckt den Fall ab, dass dieselbe SQLiteConnection-Instanz die Verbindung schon kennt (z.B. ein
  // zweiter Aufruf ohne Kontext-Neuaufbau). NICHT der gemeldete Geraetefall - der steht weiter unten
  // unter „Die ECHTE Plugin-Situation", weil dort JS- und nativer Zustand auseinanderlaufen.
  const pool = new Map([['resqdocs-library', fakeDb('resqdocs-library', true)]])
  const { sqlite, ruf } = fakeSqlite(pool)

  const db = await openSharedConnection(sqlite, 'resqdocs-library')
  assert.equal(db.name, 'resqdocs-library')
  assert.equal(ruf.retrieve, 1, 'die bestehende Verbindung wird geholt')
  assert.equal(ruf.create, 0, 'und NICHT versucht, eine zweite anzulegen')
})

test('ohne bestehende Verbindung wird eine angelegt und geoeffnet', async () => {
  const pool = new Map<string, FakeDb>()
  const { sqlite, ruf } = fakeSqlite(pool)

  const db = await openSharedConnection(sqlite, 'resqdocs-library')
  assert.equal(ruf.create, 1)
  assert.equal(ruf.retrieve, 0)
  assert.equal(db.offen, true, 'frisch angelegte Verbindung wird geoeffnet')
})

test('Guertel und Hosentraeger: meldet isConnection die Verbindung NICHT, faengt der Fehler sie ab', async () => {
  // Deckt zwei reale Faelle ab: einen Wettlauf zwischen Abfrage und Anlegen, und Plugin-Staende,
  // deren isConnection den nativen Pool nicht zuverlaessig kennt.
  const pool = new Map([['resqdocs-library', fakeDb('resqdocs-library', true)]])
  const { sqlite, ruf } = fakeSqlite(pool, { isConnectionKennt: false })

  const db = await openSharedConnection(sqlite, 'resqdocs-library')
  assert.equal(db.name, 'resqdocs-library')
  assert.equal(ruf.create, 1, 'der Erzeugungsversuch lief und schlug fehl')
  assert.equal(ruf.retrieve, 1, 'danach wurde die bestehende Verbindung geholt')
})

test('eine bereits offene Datenbank wird nicht ein zweites Mal geoeffnet', async () => {
  // open() auf einer offenen Datenbank ist je nach Plattform ein Fehler - der Fake wirft deshalb.
  const bestehend = fakeDb('resqdocs-library', true)
  const { sqlite } = fakeSqlite(new Map([['resqdocs-library', bestehend]]))
  await openSharedConnection(sqlite, 'resqdocs-library') // darf nicht werfen
  assert.equal(bestehend.offen, true)
})

test('fehlendes oder werfendes checkConnectionsConsistency verhindert den Start nicht', async () => {
  const pool = new Map<string, FakeDb>()
  const { sqlite } = fakeSqlite(pool, { consistencyWirft: true })
  const db = await openSharedConnection(sqlite, 'resqdocs-library')
  assert.equal(db.name, 'resqdocs-library')

  const ohne = { ...fakeSqlite(new Map<string, FakeDb>()).sqlite }
  delete ohne.checkConnectionsConsistency
  const db2 = await openSharedConnection(ohne, 'resqdocs-library')
  assert.equal(db2.name, 'resqdocs-library')
})

test('ein ECHTER Fehler wird weitergereicht und nicht als „schon vorhanden" verschluckt', async () => {
  const sqlite: SqliteLike<FakeDb> = {
    isConnection: async () => ({ result: false }),
    retrieveConnection: async () => {
      throw new Error('darf hier nicht gerufen werden')
    },
    createConnection: async () => {
      throw new Error('disk I/O error')
    },
  }
  await assert.rejects(() => openSharedConnection(sqlite, 'resqdocs-library'), /disk I\/O error/)
})

test('die Fehlererkennung trifft den Wortlaut des Plugins', () => {
  assert.equal(istBereitsVorhandenFehler(new Error('CreateConnection: Connection resqdocs-library already exists')), true)
  assert.equal(istBereitsVorhandenFehler('Connection foo Already Exists'), true, 'Gross-/Kleinschreibung egal')
  assert.equal(istBereitsVorhandenFehler(new Error('disk I/O error')), false)
  assert.equal(istBereitsVorhandenFehler(undefined), false)
})

// --- Die ECHTE Plugin-Situation --------------------------------------------------------------------
// Die Fakes oben teilen sich EINE Map fuer Anlegen und Holen. Das Plugin hat zwei getrennte Zustaende:
// isConnection/retrieveConnection lesen die JS-Map DIESER Instanz, "already exists" kommt aus dem
// NATIVEN Pool. Nach einem Neuaufbau des JS-Kontexts ist die JS-Map leer, der native Pool nicht -
// genau die gemeldete Lage. Ohne diese Trennung war der Test gruen, ohne den Fall zu treffen.

function echtesPlugin(nativBelegt: boolean, opts: { consistencyRaeumt?: boolean } = {}) {
  const jsMap = new Map<string, FakeDb>() // pro Instanz, beim Kontext-Neuaufbau leer
  let nativ = nativBelegt
  const ruf = { consistency: 0, create: 0 }
  const sqlite: SqliteLike<FakeDb> = {
    checkConnectionsConsistency: async () => {
      ruf.consistency++
      // Nativ gilt: leere Namensliste -> closeAllConnections(). Genau das raeumt den Pool.
      if (opts.consistencyRaeumt !== false) nativ = false
      return { result: true }
    },
    isConnection: async (name) => ({ result: jsMap.has(name) }),
    retrieveConnection: async (name) => {
      const db = jsMap.get(name)
      if (!db) throw new Error('Connection ' + name + ' does not exist')
      return db
    },
    createConnection: async (name) => {
      ruf.create++
      if (nativ) throw new Error('CreateConnection: Connection ' + name + ' already exists')
      const db = fakeDb(name)
      jsMap.set(name, db)
      nativ = true
      return db
    },
  }
  return { sqlite, ruf }
}

test('nach Neuaufbau des JS-Kontexts loest die Pool-Bereinigung den Fall - nicht isConnection', () => {
  // Belegt zugleich, WARUM der Fix wirkt: isConnection meldet hier zwangslaeufig false, weil die
  // JS-Map dieser Instanz leer ist. Ohne checkConnectionsConsistency bliebe es bei "already exists".
  const { sqlite, ruf } = echtesPlugin(true)
  return openSharedConnection(sqlite, 'resqdocs-library').then((db) => {
    assert.equal(db.name, 'resqdocs-library')
    assert.equal(ruf.consistency, 1, 'die Pool-Bereinigung lief')
    assert.equal(ruf.create, 1, 'und danach gelang das Anlegen im ersten Versuch')
  })
})

test('raeumt die Bereinigung NICHT, bleibt der urspruengliche Fehler stehen - nicht ein Folgefehler', () => {
  // Aeltere Plugin-Staende oder ein fehlgeschlagenes closeAllConnections. Wichtig ist der WORTLAUT:
  // "already exists" beschreibt die Lage, "does not exist" wuerde die Diagnose in die Irre fuehren.
  const { sqlite } = echtesPlugin(true, { consistencyRaeumt: false })
  return assert.rejects(() => openSharedConnection(sqlite, 'resqdocs-library'), /already exists/)
})
