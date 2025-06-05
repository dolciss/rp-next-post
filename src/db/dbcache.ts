import { Kysely } from "kysely";
import { DatabaseSchema } from "./schema";

let subscribersCache: Set<string> = new Set();

export function initSubscribersCache(db: Kysely<DatabaseSchema>, intervalMs: number = 10 * 1000) {
  refreshSubscribersCache(db);
  setInterval(() => {
    refreshSubscribersCache(db).catch(err => {
      console.error('[Error] Failed to refresh subscribers cache:', err);
    });
  }, intervalMs);
}

async function refreshSubscribersCache(db: Kysely<DatabaseSchema>) {
  const subscribers = await db
    .selectFrom('subscriber')
    .select('did')
    .execute();
  subscribersCache = new Set(subscribers.map(sub => sub.did));
  console.log('[⌛GetSubscriber]', subscribersCache.size);
}

export function isSubscriber(db: Kysely<DatabaseSchema>, did: string): boolean {
  return subscribersCache.has(did);
}
