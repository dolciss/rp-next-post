import { Server } from '../lexicon'
import { AppContext, announce } from '../config'
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
                console.log('[Interaction]', interaction.item, 'Event:', interaction.event);
                const postUri = new AtUri(interaction.item)
                switch (interaction.event) {
                    case 'app.bsky.feed.defs#requestLess':
                        if (announce.length > 0 && announce.includes(interaction.item)) {
                            // seenAnnounceに1日前を入れて非表示にする
                            console.log('[SeenAnnounce]', requesterDid)
                            await ctx.db
                                .updateTable('subscriber')
                                .set({
                                    seenAnnounce: new Date(Date.now() - (1000 * 60 * 60 * 24)).toISOString(),
                                })
                                .where('did', '=', requesterDid)
                                .execute()
                            break
                        } else {
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
                        }
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
                            console.log('[DeleteShowLess]', lastShowLess.uri, 'ShowLess:', lastShowLess.showLess)
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
