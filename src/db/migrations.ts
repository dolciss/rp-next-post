import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('subscriber')
      .addColumn('did', 'varchar', (col) => col.primaryKey())
      .execute()
    await db.schema
      .createTable('repost')
      .addColumn('reposterDid', 'varchar', (col) => col.primaryKey())
      .addColumn('uri', 'varchar', (col) => col.notNull())
      .addColumn('originalDid', 'varchar', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('author', 'varchar', (col) => col.notNull())
      .addColumn('prevRepostDid', 'varchar')
      .addColumn('replyParent', 'varchar')
      .addColumn('replyRoot', 'varchar')
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('subscriber').execute()
    await db.schema.dropTable('repost').execute()
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}
