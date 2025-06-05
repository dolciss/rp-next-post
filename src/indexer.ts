import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'
import { IndexerConfig } from './config'
import { initPostsCountCache, initSubscribersCache } from './db/dbcache'

export class Indexer {
  public db: Database
  public firehose: FirehoseSubscription
  public cfg: IndexerConfig

  constructor(
   db: Database,
    firehose: FirehoseSubscription,
    cfg: IndexerConfig,
  ) {
    this.db = db
    this.firehose = firehose
    this.cfg = cfg
  }

  static create(cfg: IndexerConfig) {
    const db = createDb(cfg.sqliteLocation)
    const firehose = new FirehoseSubscription(cfg.subscriptionEndpoint, cfg.subscriptionCollections, db)

    return new Indexer(db, firehose, cfg)
  }

  async start(): Promise<FirehoseSubscription> {
    await migrateToLatest(this.db)
    initSubscribersCache(this.db, this.cfg.subscribersCacheIntervalMs)
    initPostsCountCache(this.db, this.cfg.subscribersCacheIntervalMs, this.cfg.postCountCacheIntervalMs)
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    return this.firehose;
  }
}

export default Indexer
