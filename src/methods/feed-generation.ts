import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/uri'

export default function (server: Server, ctx: AppContext) {
  const oldPublisherDid = 'did:plc:xt2h3ltab6sagq4lbpbd37m2' // l-tan.bsky.social
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const feedUri = new AtUri(params.feed)
    const algo = algos[feedUri.rkey]
    if (
      (feedUri.hostname !== ctx.cfg.publisherDid && feedUri.hostname !== oldPublisherDid) ||
      feedUri.collection !== 'app.bsky.feed.generator' ||
      !algo
    ) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm',
      )
    }
    /**
     * Example of how to check auth if giving user-specific results:
     */
    const requesterDid = await validateAuth(
      req,
      ctx.cfg.serviceDid,
      ctx.didResolver,
    )
    // 旧アカウントの場合は移設した案内Postを返す
    if (feedUri.hostname == oldPublisherDid) {
      return {
        encoding: 'application/json',
        body: {
          feed: [{post: 'at://did:plc:xt2h3ltab6sagq4lbpbd37m2/app.bsky.feed.post/3k7edbmixid2g'}]
        }
      }
    }

    const body = await algo(ctx, params, requesterDid)
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
