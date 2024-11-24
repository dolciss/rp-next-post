import SqliteDb from 'better-sqlite3'
import { CompiledQuery, Kysely, Migrator, SqliteDialect } from 'kysely'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

export const createDb = (location: string): Database => {
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: new SqliteDb(location),
      onCreateConnection: async connnection => {
         await connnection.executeQuery(CompiledQuery.raw(`PRAGMA journal_mode = WAL;`))
         await connnection.executeQuery(CompiledQuery.raw(`PRAGMA synchronous = normal;`))
         await connnection.executeQuery(CompiledQuery.raw(`PRAGMA cache_size = 1000000000;`));
      },
    }),
    log(event) {
      if (event.level === "error") {
        console.error("Query failed : ", {
          durationMs: event.queryDurationMillis,
          error: event.error,
          sql: event.query.sql,
        });
      }
    },
  })
}

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

export type Database = Kysely<DatabaseSchema>
