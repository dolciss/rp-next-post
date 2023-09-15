import { DeleteResult } from 'kysely'
import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { AtUri } from '@atproto/uri'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // Repostの削除は素直に削除
    const repostsToDelete = ops.reposts.deletes.map((del) => del.uri)
    if (repostsToDelete.length > 0) {
      const res = await this.db
        .deleteFrom('repost')
        .where('uri', 'in', repostsToDelete)
        .execute()
      const deletedRows = this.totalDeleteRows(res)
      if (deletedRows > 0) {
        console.log('Delete repost:', deletedRows)
      }
    }

    // Repostに元投稿者のDIDを添える
    const repostsToCreate = ops.reposts.creates
      .map((create) => {
        return {
          reposterDid: create.author,
          uri: create.uri,
          originalDid: new AtUri(create.record.subject.uri).hostname,
        }
      })

    // 購読者のRepostだけ拾う
    const subscribersDB = await this.db
      .selectFrom('subscriber')
      .selectAll()
      .execute()
    const subscribers = subscribersDB.map((subsc) => subsc.did)
    
    // 元投稿者＝購読者のPostがRepostされてたらDBに突っ込んでおく
    const subscribersRepost = repostsToCreate.filter((create) => subscribers.includes(create.originalDid))
    for (const repost of subscribersRepost) {
      console.log('Repost', repost.originalDid, '\'s Post by', repost.reposterDid)
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
        console.log('Delete prev repost:', deletedRows)
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
        console.log('Delete post:', deletedRows)
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
    const authorReposts = new Map(authorRepostsDB.map(author => [author.reposterDid, author.originalDid]))

    const postsToCreate = ops.posts.creates
      .map((create) => {
        // 投稿者の前回RepostがあればRepostされた人のDIDを含めて入れる
        return {
          uri: create.uri,
          cid: create.cid,
          author: create.author,
          prevRepostDid: authorReposts.get(create.author) ?? null,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
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
      console.log('post', post.record.text, 'by', post.author, 'prevPostAuthor:', authorReposts.get(post.author) ?? 'none'
        , (post.record?.reply?.parent.uri ?? null) != null ? 'is Reply (No Push)' : 'is Post (Push)')
    }

    if (postsToCreate.length > 0) {
      // DBに登録するのはReplyがないものだけ
      const insertPost = postsToCreate.filter((create) => {return create.replyParent == null})
      if (insertPost.length > 0) {
        const ins = await this.db
          .insertInto('post')
          .values(insertPost)
          .onConflict((oc) => oc.doNothing())
          .execute()
        console.log('Insert post:', ins.length)
      }
      // Replyも含めて次のPostがあったらRepostの履歴を消す
      const del = await this.db
        .deleteFrom('repost')
        .where('reposterDid', 'in', postsToCreate.map(create => create.author))
        .execute()
      console.log('Delete repost:', this.totalDeleteRows(del))
    }
  }

  totalDeleteRows(result: DeleteResult[]) {
    return result.reduce((prev, curr) => prev + curr.numDeletedRows, BigInt(0))
  }
}
