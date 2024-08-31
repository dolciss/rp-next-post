import { DeleteResult } from 'kysely'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { AtUri } from '@atproto/syntax'

// 購読者をキャッシュする
const cache = {}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)
    
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
    if (!cache['db'] || !cache['time'] || (nowTime - cache['time']) > 10 * 1000) {
      cache['time'] = nowTime
      cache['db'] = await this.db
        .selectFrom('subscriber')
        .selectAll()
        .execute()
      console.log('[⌛GetSubscriber]', cache['db'].length)
      const post = await this.db
        .selectFrom('post')
        .select((eb) => eb.fn.count<number>('cid').as('post_count'))
        .executeTakeFirstOrThrow()
      console.log('[💬CountPost]', post.post_count)
    }
    const subscribers = cache['db'].map((subsc) => subsc.did)

    // 元投稿者＝購読者のPostがRepostされてたらDBに突っ込んでおく
    const subscribersRepost = repostsToCreate.filter((create) => subscribers.includes(create.originalDid))
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

    const postsToCreate = ops.posts.creates
      .map((create) => {
        // 投稿者の前回RepostがあればRepostされた人のDIDを含めて入れる
        return {
          uri: create.uri,
          cid: create.cid,
          author: create.author,
          prevRepostDid: authorReposts.get(create.author)?.originalDid ?? null,
          prevRepostUri: authorReposts.get(create.author)?.uri ?? null,
          prevOriginalUri: authorReposts.get(create.author)?.originalUri ?? null,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          createdAt: create.record.createdAt,
          indexedAt: new Date().toISOString(),
        }
      })
      .filter((create) => {
        // 前回Repostがあるものだけにする
        return create.prevRepostDid != null
      })

    for (const post of ops.posts.creates) {
      if (!authorReposts.get(post.author)) {
        continue
      }
      const isNotReply = (post.record?.reply?.parent.uri ?? null) == null
      const repostDelayTime = Date.parse(post.record.createdAt ?? nowTime.toString())
                               - Date.parse(authorReposts.get(post.author)?.createdAt ?? nowTime.toString())
      console.log('[Post]', authorReposts.get(post.author)?.originalDid ?? 'none', '\'s NextPost by', post.author
        , isNotReply ? 'is Post' : 'is Reply'
        , 'delay:' + repostDelayTime + 'ms'
        , isNotReply && repostDelayTime < 60 * 60 * 1000 ? '(Push)' : '(No Push)', post.record.text)
      console.log('[Delay]', nowTime - Date.parse(post.record.createdAt))
    }

    if (postsToCreate.length > 0) {
      // DBに登録するのはReplyがなく、1時間以内のものだけ
      const insertPost = postsToCreate.filter((create) => {
        const repostDelayTime = Date.parse(create.createdAt ?? nowTime.toString())
                                - Date.parse(authorReposts.get(create.author)?.createdAt ?? nowTime.toString())
        return create.replyParent == null && repostDelayTime < 60 * 60 * 1000
      })
      if (insertPost.length > 0) {
        const ins = await this.db
          .insertInto('post')
          .values(insertPost)
          .onConflict((oc) => oc.doNothing())
          .execute()
        console.log('[InsertPost]', ins.length)
      }
      // Replyも含めて次のPostがあったらRepostの履歴を消す
      const del = await this.db
        .deleteFrom('repost')
        .where('reposterDid', 'in', postsToCreate.map(create => create.author))
        .execute()
      console.log('[DeleteUsedRepost]', String(this.totalDeleteRows(del)))
    }
  }

  totalDeleteRows(result: DeleteResult[]) {
    return result.reduce((prev, curr) => prev + curr.numDeletedRows, BigInt(0))
  }
}
