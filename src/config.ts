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
}
