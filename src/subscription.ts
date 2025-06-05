import { DeleteResult } from 'kysely'
import {
  getJetstreamOpsByType,
  JetstreamEvent,
  JetstreamFirehoseSubscriptionBase,
} from "./util/jetstream-subscription";
import { AtUri } from '@atproto/syntax'
import { addPostsCount, isSubscriber, subtractPostsCount } from './db/dbcache';

export class FirehoseSubscription extends JetstreamFirehoseSubscriptionBase {
  async handleEvent(evt: JetstreamEvent) {

    const ops = await getJetstreamOpsByType(evt);

    if (!ops) return;

    if (ops.posts.creates.length == 0
        && ops.posts.deletes.length == 0
        && ops.reposts.creates.length == 0
        && ops.reposts.deletes.length == 0) {
      return;
    }

    // Repostの削除は素直に削除
    const repostsToDelete = ops.reposts.deletes.map((del) => del.uri)
    if (repostsToDelete.length > 0) {
      const res = await this.db
        .deleteFrom('repost')
        .where('uri', 'in', repostsToDelete)
        .execute()
      const deletedRows = this.totalDeleteRows(res)
      if (deletedRows > 0) {
        console.log('[DeleteRepost]', String(deletedRows))
      }
    }

    // Repostに元投稿者のDIDを添える
    const repostsToCreate = ops.reposts.creates
      .map((create) => {
        return {
          reposterDid: create.author,
          uri: create.uri,
          originalUri: create.record.subject.uri,
          originalDid: new AtUri(create.record.subject.uri).hostname,
          createdAt: create.record.createdAt
        }
      })

    // 購読者のRepostだけ拾う
    const nowTime = Date.now()
    // 元投稿者＝購読者のPostがRepostされてたらDBに突っ込んでおく
    const subscribersRepost = repostsToCreate.filter((create) => isSubscriber(create.originalDid))
    for (const repost of subscribersRepost) {
      console.log('[Repost]', repost.originalDid, '\'s Post by', repost.reposterDid)
      console.log('[Delay]', nowTime - Date.parse(repost.createdAt))
    }
    if (subscribersRepost.length > 0) {
      await this.db
        .insertInto('repost')
        .values(subscribersRepost)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }

    // 別の投稿者のPostが続けてRepostされたら削除する
    for (const repost of repostsToCreate) {
      const res = await this.db
        .deleteFrom('repost')
        .where('repost.reposterDid', '==', repost.reposterDid)
        .where('repost.originalDid', '!=', repost.originalDid)
        .execute()
      const deletedRows = this.totalDeleteRows(res)
      if (deletedRows > 0) {
        console.log('[DeletePrevRepost]', String(deletedRows))
      }
    }

    // Postの削除は素直に削除
    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    if (postsToDelete.length > 0) {
      const res = await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
      const deletedRows = this.totalDeleteRows(res)
      if (deletedRows > 0) {
        subtractPostsCount(Number(deletedRows))
        console.log('[DeletePost]', String(deletedRows))
      }
    }

    // 投稿者のRepostを取ってくる
    const postAuthors = ops.posts.creates.map(create => create.author)
    const authorRepostsDB = await this.db
      .selectFrom('repost')
      // .select(['repost.reposterDid', 'repost.originalDid'])
      .selectAll()
      .where('repost.reposterDid', 'in', postAuthors)
      .execute()
    const authorReposts = new Map(authorRepostsDB.map(author => [author.reposterDid, author]))

    for (const post of ops.posts.creates) {
      const prevRepost = authorReposts.get(post.author)
      if (!prevRepost) {
        // 前回Repostがあるものだけにする
        continue
      }
      const isNotReply = (post.record?.reply?.parent.uri ?? null) == null
      const repostDelayTime = Date.parse(post.record.createdAt ?? nowTime.toString())
                               - Date.parse(prevRepost?.createdAt ?? nowTime.toString())
      // DBに登録するのはReplyがなく、1時間以内のものだけ
      const isPush = isNotReply && repostDelayTime < 60 * 60 * 1000
      console.log('[Post]', prevRepost?.originalDid ?? 'none', '\'s NextPost by', post.author
        , isNotReply ? 'is Post' : 'is Reply'
        , 'delay:' + repostDelayTime + 'ms'
        , isPush ? '(Push)' : '(No Push)', post.record.text.replace(/\n/g,'<>'))
      console.log('[PostTime] post:', post.record.createdAt, 'prevRepost:', prevRepost?.createdAt)
      console.log('[Delay]', nowTime - Date.parse(post.record.createdAt))
      
      if (isPush) {
        const ins = await this.db
          .insertInto('post')
          .values({
            uri: post.uri,
            cid: post.cid,
            author: post.author,
            prevRepostDid: prevRepost?.originalDid ?? null,
            prevRepostUri: prevRepost?.uri ?? null,
            prevOriginalUri: prevRepost?.originalUri ?? null,
            replyParent: post.record?.reply?.parent.uri ?? null,
            replyRoot: post.record?.reply?.root.uri ?? null,
            createdAt: post.record.createdAt,
            indexedAt: new Date().toISOString(),
          })
          .onConflict((oc) => oc.doNothing())
          .execute()
        addPostsCount(ins.length)
        console.log('[InsertPost]', ins.length)
      }
      // Replyも含めて次のPostがあったらRepostの履歴を消す
      const del = await this.db
        .deleteFrom('repost')
        .where('reposterDid', '=', post.author)
        .execute()
      console.log('[DeleteUsedRepost]', String(this.totalDeleteRows(del)))
    }
  }

  totalDeleteRows(result: DeleteResult[]) {
    return result.reduce((prev, curr) => prev + curr.numDeletedRows, BigInt(0))
  }
}
