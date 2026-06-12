// fakeSqlClient.ts — In-Memory-Fake des SqlClient für node:test.
//
// Emuliert NUR die Statements, die Migration + Library-Repository ausführen
// (CREATE TABLE IF NOT EXISTS / INSERT OR REPLACE / SELECT / DELETE). Kein
// SQL-Parser, keine Dependency. Nicht für Produktion.
import type { SqlClient, SqlRow } from './sqlClient'

export interface FakeSqlClient extends SqlClient {
  /** Nur für Tests: Zeilen einer Tabelle. */
  rows(table?: string): SqlRow[]
  hasTable(table: string): boolean
}

export function createFakeSqlClient(): FakeSqlClient {
  const tables = new Map<string, Map<string, SqlRow>>()
  let userVersion = 0
  const ensure = (name: string): Map<string, SqlRow> => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name) as Map<string, SqlRow>
  }

  return {
    async execute(statement) {
      const pragma = statement.match(/pragma\s+user_version\s*=\s*(\d+)/i)
      if (pragma) {
        userVersion = Number(pragma[1])
        return
      }
      const m = statement.match(/create table if not exists (\w+)/i)
      if (m) ensure(m[1])
    },
    async run(statement, values = []) {
      // INSERT OR REPLACE INTO <table> (col1, col2, ...) VALUES (?, ?, ...)
      const ins = statement.match(/insert or replace into (\w+)\s*\(([^)]+)\)/i)
      if (ins) {
        const table = ins[1]
        const cols = ins[2].split(',').map((c) => c.trim())
        const row: SqlRow = {}
        cols.forEach((c, i) => { row[c] = values[i] })
        ensure(table).set(String(values[0]), row)
        return
      }
      const delById = statement.match(/delete from (\w+)\s+where\s+id/i)
      if (delById) {
        ensure(delById[1]).delete(String(values[0]))
        return
      }
      const delAll = statement.match(/delete from (\w+)/i)
      if (delAll) {
        ensure(delAll[1]).clear()
        return
      }
      const create = statement.match(/create table if not exists (\w+)/i)
      if (create) ensure(create[1])
    },
    async query(statement, values = []) {
      if (/pragma\s+user_version/i.test(statement)) {
        return [{ user_version: userVersion }]
      }
      const from = statement.match(/from (\w+)/i)
      if (from) {
        let rows = [...ensure(from[1]).values()]
        if (/where\s+id\s*=\s*\?/i.test(statement) && values.length) {
          rows = rows.filter((r) => String(r.id) === String(values[0]))
        }
        return rows.map((r) => ({ ...r }))
      }
      return []
    },
    rows(table = 'library_protocols') {
      return [...ensure(table).values()]
    },
    hasTable(table) {
      return tables.has(table)
    },
  }
}
