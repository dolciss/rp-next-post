import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

// max 15 chars
export const shortname = 'rp-next-post-p'

export const handler = async (ctx: AppContext, params: QueryParams, requester: string) => {

  // 購読者のRepostを今後記録するために登録
  const subscriberExist = await ctx.db
    .selectFrom('subscriber')
    .select(qb => qb.fn.count<number>('did').as('count'))
    .where('did', '==', requester)
    .execute()
  const isNewSubscriber = subscriberExist.flatMap((row) => row.count)[0] === 0

  if (isNewSubscriber) {
    await ctx.db
      .insertInto('subscriber')
      .values({ did: requester })
      .onConflict((oc) => oc.doNothing())
      .execute()
  }

  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('post.prevRepostDid', '=', requester) // 購読者がRepostされたものだけ返す
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const [indexedAt, cid] = params.cursor.split('::')
    if (!indexedAt || !cid) {
      throw new InvalidRequestError('malformed cursor')
    }
    const timeStr = new Date(parseInt(indexedAt, 10)).toISOString()
    builder = builder
      .where('post.indexedAt', '<', timeStr)
      .orWhere((qb) => qb.where('post.indexedAt', '=', timeStr))
      .where('post.cid', '<', cid)
  }
  const res = await builder.execute()

  const feed = res.flatMap((row) => {
    if (row.prevOriginalUri) {
      return [{
        post: row.uri,
      }, {
        post: row.prevOriginalUri,
        reason: {
          $type: 'app.bsky.feed.defs#skeletonReasonRepost',
          repost: row.prevRepostUri,
        }
      }]
    } else {
      return [{
        post: row.uri,
      }]
    }
  }).slice(0, params.limit)

  console.log('getFeedSkeleton+ : subscription by', requester, isNewSubscriber ? '(new!)' : '', 'cursor:', params.cursor ?? 'none', 'limit:', params.limit, 'count:', feed.length)

  /*
  if (requester !== 'did:plc:6zpjzzdzet62go7lnaoq4xog') {
    return {
      // メンテナンス(´･ω･`)
      feed: [{ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3kktmo5xrhq22' }]
    }
  }
  */

  if (!params.cursor && feed.length <= 0) {
    return {
      // 0件のときは待っててねPostを返す
      feed: [{ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3k6x46j3lfy2f' }]
    }
  }

  let cursor: string | undefined
  let lastFeed = feed.at(-1)
  // 最後がRepostの時はもう一つ前にする
  if (lastFeed?.reason) {
    lastFeed = feed.at(-2)
  }
  const last = res.find((row) => (row.uri == lastFeed?.post))
  if (last) {
    cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`
  }

  return {
    cursor,
    feed,
  }
}
