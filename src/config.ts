import { Database } from './db'
import { DidResolver } from '@atproto/identity'

export type AppContext = {
  db: Database
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  serviceDid: string
  publisherDid: string
}

export type IndexerConfig = {
  sqliteLocation: string
  subscriptionEndpoint: string
  subscriptionCollections: string[]
  subscriptionReconnectDelay: number
  subscribersCacheIntervalMs: number
  postCountCacheIntervalMs: number
}

export const announce = ['at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3mavhf7ohss2v'] as string[]