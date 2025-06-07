import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

// max 15 chars
export const shortname = 'rp-next-post-p'

export const handler = async (ctx: AppContext, params: QueryParams, requester: string) => {

  // 購読者のRepostを今後記録するために登録
  const subscriberExist = await ctx.db
    .selectFrom('subscriber')
    .selectAll()
    .where('did', '==', requester)
    .execute()
  const isNewSubscriber = subscriberExist.length === 0
  const isFirstSeenAnnounce = subscriberExist.length > 0 && !subscriberExist[0].seenAnnounce

  if (isNewSubscriber) {
    await ctx.db
      .insertInto('subscriber')
      .values({
        did: requester,
        seenAnnounce: 0,
        createdAt: new Date().toISOString(),
       })
      .onConflict((oc) => oc.doNothing())
      .execute()
  } else if (isFirstSeenAnnounce) {
    await ctx.db
      .updateTable('subscriber')
      .set({
        seenAnnounce: 1,
      })
      .where('did', '=', requester)
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
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
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
  if (requester !== 'did:plc:6zpjzzdzet62go7lnaoq4xog' && requester !== 'did:plc:xt2h3ltab6sagq4lbpbd37m2') {
    return {
      // メンテナンス(´･ω･`)
      feed: [{ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3lqp6gnthjk25' }]
    }
  }
  */
  if (isFirstSeenAnnounce) {
    feed.splice(1, 0, {post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3lqyqrwtobs2g'})
    feed.splice(2, 0, {post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3lqyqrxh4e22g'})
    feed.splice(-2, 2)
  }

  if (!params.cursor && feed.length <= 0) {
    // 0件のときは待っててねPostを返す
    let initialFeed : any[] = new Array()
    initialFeed.push({ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3kmibzyoks62s' })
    initialFeed.push({ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3kmicro3yhg2q' })
    if (isNewSubscriber) {
      initialFeed.push({ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3kmida2r5bn2e' })
    } else {
      initialFeed.push({ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3kmiddqhbu52w' })
    }
    initialFeed.push({ post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3kmidteiltp2k' })
    return {
      feed: initialFeed
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
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return {
    cursor,
    feed,
  }
}
