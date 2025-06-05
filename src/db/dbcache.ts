import { Kysely } from "kysely";
import { DatabaseSchema } from "./schema";

let subscribersCache: Set<string> = new Set();
let postsCountCache: number = 0;

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

export function isSubscriber(did: string): boolean {
  return subscribersCache.has(did);
}

export function initPostsCountCache(db: Kysely<DatabaseSchema>, logIntervalMs: number = 10 * 1000, refreshIntervalMs: number = 60 * 60 * 1000) {
  refreshPostsCountCache(db);
  setInterval(() => console.log('[💬CountPost]', postsCountCache), logIntervalMs);
  setInterval(() => {
    refreshPostsCountCache(db).catch(err => {
      console.error('[Error] Failed to refresh posts count cache:', err);
    });
  }, refreshIntervalMs);
}

async function refreshPostsCountCache(db: Kysely<DatabaseSchema>) {
  const postCountResult = await db
    .selectFrom('post')
    .select((eb) => eb.fn.count<number>('uri').as('post_count'))
    .executeTakeFirstOrThrow();
  postsCountCache = postCountResult.post_count;
  console.log('[💬CountPost(refresh)]', postsCountCache);
}

export function addPostsCount(count: number) {
  postsCountCache += count;
}

export function subtractPostsCount(count: number) {
  postsCountCache -= count;
  if (postsCountCache < 0) {
    postsCountCache = 0; // Ensure count does not go negative
  }
}
