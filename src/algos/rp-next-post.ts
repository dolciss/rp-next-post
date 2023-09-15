import { InvalidRequestError } from '@atproto/xrpc-server'
import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

// max 15 chars
export const shortname = 'rp-next-post'

export const handler = async (ctx: AppContext, params: QueryParams, requester: string) => {

  // 購読者のRepostを今後記録するために登録
  await ctx.db
    .insertInto('subscriber')
    .values({did: requester})
    .onConflict((oc) => oc.doNothing())
    .execute()

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

  const feed = res.map((row) => ({
    post: row.uri,
  }))
  
  console.log('getFeedSkeleton : subscription by', requester, 'cursor:', params.cursor ?? 'none', 'count:', feed.length)
  if (!params.cursor && feed.length <= 0) {
    return {
      // 0件のときは待っててねPostを返す
      feed: [{post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3k6x46j3lfy2f'}]
    }
  }

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = `${new Date(last.indexedAt).getTime()}::${last.cid}`
  }

  return {
    cursor,
    feed,
  }
}
