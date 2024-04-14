export type DatabaseSchema = {
  subscriber: Subscriber
  repost: Repost
  post: Post
  sub_state: SubState
}

export type Subscriber = {
  did: string
}

export type Repost = {
  reposterDid: string
  uri: string
  originalDid: string
  originalUri: string
  createdAt: string | null
}

export type Post = {
  uri: string
  cid: string
  author: string
  prevRepostDid: string | null
  prevRepostUri: string | null
  prevOriginalUri: string | null
  replyParent: string | null
  replyRoot: string | null
  indexedAt: string
}

export type SubState = {
  service: string
  cursor: number
}
