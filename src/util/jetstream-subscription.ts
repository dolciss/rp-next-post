import { WebSocketKeepAlive } from "../xrpc-server/src/stream/websocket-keepalive"
import { Subscription } from "@atproto/xrpc-server";
import { isObj, hasProp, RepoRecord } from "@atproto/lexicon";
import { ids } from '../lexicon/lexicons'
import { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post'
import { Record as RepostRecord } from '../lexicon/types/app/bsky/feed/repost'
import { Database } from "../db"; // This is the standard DB class from bluesky-social/feed-generator

export abstract class JetstreamFirehoseSubscriptionBase {
  public sub: JetstreamSubscription;
  public db: Database;

  constructor(
    public service: string = "wss://jetstream1.us-west.bsky.network",
    public collections: string[] = ["app.bsky.feed.post", "app.bsky.feed.repost"],
    db: Database,
  ) {
    this.db = db;

    this.sub = new JetstreamSubscription({
      service: service,
      method: "subscribe",
      getParams: async () => ({
        cursor: await this.getCursor(),
        wantedCollections: collections,
      }),
      validate: (value: unknown) => {
        try {
          return value; // TODO validate??
        } catch (err) {
          console.error("repo subscription skipped invalid message", err);
        }
      },
    });
  }

  abstract handleEvent(evt: JetstreamEvent): Promise<void>;

  async run(subscriptionReconnectDelay: number) {
    let i = 0;
    try {
      for await (const evt of this.sub) {
        if (isJetstreamCommit(evt)) {
          this.handleEvent(evt as JetstreamEvent);
          i++;
          // update stored cursor every 10000 events or so
          if (i % 10000 === 0) {
            await this.updateCursor(evt.time_us);
            i = 0;
          }
        }
      }
    } catch (err) {
      console.error("repo subscription errored", err);
      setTimeout(
        () => this.run(subscriptionReconnectDelay),
        subscriptionReconnectDelay
      );
    }
  }

  async updateCursor(cursor: number) {
    await this.db
      .insertInto('sub_state')
      .values({ service: this.service, cursor })
      .onConflict((oc) => oc.column('service').doUpdateSet({ cursor }))
      .execute()
    console.log('[🔥Cursor]',cursor)
  }

  async getCursor(): Promise<number | undefined> {
    const res = await this.db
      .selectFrom("sub_state")
      .selectAll()
      .where("service", "=", this.service)
      .executeTakeFirst();
    if (res?.cursor) {
      return res?.cursor - (60 * 1_000_000) // 1min ago
    }
    return res?.cursor;
  }
}
export function isJetstreamCommit(v: unknown): v is JetstreamEvent {
  return isObj(v) && hasProp(v, "kind") && v.kind === "commit";
}

export interface JetstreamEvent {
  did: string;
  time_us: number;
  kind: string;
  commit: JetstreamCommit;
}

export interface JetstreamCommit {
  rev: string;
  operation: string;
  collection: string;
  rkey: string;
  record: any;
  cid: string;
}

export interface JetstreamSubject {
  cid: string;
  uri: string;
}

class JetstreamSubscription<T = unknown> extends Subscription {
  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    const ws = new WebSocketKeepAlive({
      ...this.opts,
      getUrl: async () => {
        const params = (await this.opts.getParams?.()) ?? {};
        const query = encodeQueryParams(params);
        //console.log(`${this.opts.service}/${this.opts.method}?${query}`);
        return `${this.opts.service}/${this.opts.method}?${query}`;
      },
    });
    for await (const chunk of ws) {
      try {
        const record = JSON.parse(Buffer.from(chunk).toString());
        yield record;
      } catch (e) {
        console.error(e);
      }
    }
  }
}

function encodeQueryParams(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    const encoded = encodeQueryParam(value);
    if (Array.isArray(encoded)) {
      encoded.forEach((enc) => params.append(key, enc));
    } else {
      params.set(key, encoded);
    }
  });
  return params.toString();
}

// Adapted from xrpc, but without any lex-specific knowledge
function encodeQueryParam(value: unknown): string | string[] {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "undefined") {
    return "";
  }
  if (typeof value === "object") {
    if (value instanceof Date) {
      return value.toISOString();
    } else if (Array.isArray(value)) {
      return value.flatMap(encodeQueryParam);
    } else if (!value) {
      return "";
    }
  }
  throw new Error(`Cannot encode ${typeof value}s into query params`);
}

export const getJetstreamOpsByType = (
  evt: JetstreamEvent
): OperationsByType => {
  const opsByType: OperationsByType = {
    posts: { creates: [], deletes: [] },
    reposts: { creates: [], deletes: [] },
  };
  const uri = `at://${evt?.did}/${evt?.commit?.collection}/${evt?.commit?.rkey}`

  if (evt?.commit?.operation === 'create') {
    const create = { uri, cid: evt?.commit?.cid, author: evt?.did }
    const record = evt?.commit?.record
    if (evt?.commit?.collection === ids.AppBskyFeedPost) {
      opsByType.posts.creates.push({ record, ...create })
    } else if (evt?.commit?.collection === ids.AppBskyFeedRepost) {
      opsByType.reposts.creates.push({ record, ...create })
    }
  }

  if (evt?.commit?.operation === 'delete') {
    if (evt?.commit?.collection === ids.AppBskyFeedPost) {
      opsByType.posts.deletes.push({ uri })
    } else if (evt?.commit?.collection === ids.AppBskyFeedRepost) {
      opsByType.reposts.deletes.push({ uri })
    }
  }

  return opsByType;
};

type OperationsByType = {
    posts: Operations<PostRecord>
    reposts: Operations<RepostRecord>
}

type Operations<T = Record<string, unknown>> = {
  creates: CreateOp<T>[]
  deletes: DeleteOp[]
}

type CreateOp<T> = {
  uri: string
  cid: string
  author: string
  record: T
}

type DeleteOp = {
  uri: string
}