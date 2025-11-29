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
migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('repost')
      .addColumn('originalUri', 'varchar')
      .execute()
    await db.schema.alterTable('post')
      .addColumn('prevRepostUri', 'varchar')
      .execute()
    await db.schema.alterTable('post')
      .addColumn('prevOriginalUri', 'varchar')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('repost').dropColumn('originalUri').execute()
    await db.schema.alterTable('post').dropColumn('prevRepostUri').execute()
    await db.schema.alterTable('post').dropColumn('prevOriginalUri').execute()
  },
}
migrations['003'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('repost')
      .addColumn('createdAt', 'varchar')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('repost').dropColumn('createdAt').execute()
  },
}
migrations['004'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('post')
      .addColumn('createdAt', 'varchar')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('post').dropColumn('createdAt').execute()
  },
}
migrations['005'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.createIndex('post_uri_idx')
      .on('post')
      .column('uri')
      .execute()
    await db.schema.createIndex('repost_uri_idx')
      .on('repost')
      .column('uri')
      .execute()
    await db.schema.createIndex('repost_reposterDid_idx')
      .on('repost')
      .column('reposterDid')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('post_uri_idx').execute()
    await db.schema.dropIndex('repost_uri_idx').execute()
    await db.schema.dropIndex('repost_reposterDid_idx').execute()
  },
}
migrations['006'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.createIndex('post_get_idx')
      .on('post')
      .columns(['prevRepostDid', 'indexedAt', 'cid'])
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('post_get_idx').execute()
  },
}
migrations['007'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('subscriber')
      .addColumn('seenAnnounce', 'integer', (col) => col.notNull().defaultTo(0))
      .execute()
    await db.schema.alterTable('subscriber')
      .addColumn('createdAt', 'varchar')
      .execute()
    await db.schema.createIndex('subscriber_did_idx')
      .on('subscriber')
      .column('did')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('subscriber')
      .dropColumn('seenAnnounce')
      .execute()
    await db.schema.alterTable('subscriber')
      .dropColumn('createdAt')
      .execute()
    await db.schema.dropIndex('subscriber_did_idx').execute()
  }
}
migrations['008'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('repost')
      .addColumn('via', 'varchar')
      .execute()
    await db.schema.alterTable('repost')
      .addColumn('viaDid', 'varchar')
      .execute()
    await db.schema.createIndex('repost_viaDid_idx')
      .on('repost')
      .column('viaDid')
      .execute()
    await db.schema.alterTable('post')
      .addColumn('prevViaDid', 'varchar')
      .execute()
    await db.schema.alterTable('post')
      .addColumn('prevViaUri', 'varchar')
      .execute()
    await db.schema.createIndex('post_prevViaDid_idx')
      .on('post')
      .column('prevViaDid')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('repost_viaDid_idx').execute()
    await db.schema.alterTable('repost')
      .dropColumn('via')
      .execute()
    await db.schema.alterTable('repost')
      .dropColumn('viaDid')
      .execute()
    await db.schema.dropIndex('post_prevViaDid_idx').execute()
    await db.schema.alterTable('post')
      .dropColumn('prevViaDid')
      .execute()
    await db.schema.alterTable('post')
      .dropColumn('prevViaUri')
      .execute()
  }
}
migrations['009'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('post')
      .addColumn('showLess', 'varchar')
      .execute()
    await db.schema.createIndex('post_showLess_idx')
      .on('post')
      .column('showLess')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropIndex('post_showLess_idx').execute()
    await db.schema.alterTable('post')
      .dropColumn('showLess')
      .execute()
  }
}
migrations['010'] = {
  async up(db: Kysely<unknown>) {
    await db.schema.alterTable('subscriber')
      .dropColumn('seenAnnounce')
      .execute()
    await db.schema.alterTable('subscriber')
      .addColumn('seenAnnounce', 'varchar')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.alterTable('subscriber')
      .dropColumn('seenAnnounce')
      .execute()
    await db.schema.alterTable('subscriber')
      .addColumn('seenAnnounce', 'integer', (col) => col.notNull().defaultTo(0))
      .execute()
  }
}
