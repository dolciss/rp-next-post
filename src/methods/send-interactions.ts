import { Server } from '../lexicon'
import { AppContext } from '../config'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/syntax'

export default function (server: Server, ctx: AppContext) {
    server.app.bsky.feed.sendInteractions(async ({ input, req }) => {
        const requesterDid = await validateAuth(
            req,
            ctx.cfg.serviceDid,
            ctx.didResolver,
        )
        input.body.interactions.forEach(async (interaction) => {
            if (interaction.item !== undefined) {
                console.log('Processing interaction:', interaction.item, 'Event:', interaction.event);
                const postUri = new AtUri(interaction.item)
                switch (interaction.event) {
                    case 'app.bsky.feed.defs#requestLess':
                        // showLessに日時を入れる
                        console.log('[ShowLess]', postUri.toString())
                        await ctx.db
                            .updateTable('post')
                            .set({
                                showLess: new Date().toISOString(),
                            })
                            .where('prevRepostDid', '=', requesterDid)
                            .where('uri', '=', postUri.toString())
                            .execute()
                        break
                    case 'app.bsky.feed.defs#requestMore':
                        // 最終のshowLessを削除
                        const lastShowLess = await ctx.db
                            .selectFrom('post')
                            .select('uri')
                            .select('showLess')
                            .where('prevRepostDid', '=', requesterDid)
                            .where('showLess', 'is not', null)
                            .orderBy('showLess', 'desc')
                            .executeTakeFirst()
                        if (lastShowLess?.uri) {
                            console.log('[DeleteShowLess]', lastShowLess.showLess, lastShowLess.uri)
                            await ctx.db
                                .updateTable('post')
                                .set({
                                    showLess: null,
                                })
                                .where('uri', '=', lastShowLess.uri)
                                .execute()
                        }
                        break
                }
            }
        })
        return {
            encoding: 'application/json',
            body: {},
        }
    })
}
