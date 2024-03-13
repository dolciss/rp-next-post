import dotenv from 'dotenv'
import { AtpAgent, BlobRef } from '@atproto/api'
import fs from 'fs/promises'
import { ids } from '../src/lexicon/lexicons'

const run = async () => {
  dotenv.config()

  // YOUR bluesky handle
  // Ex: user.bsky.social
  //const handle = 'l-tan.dolciss.net'
  const handle = 'l-tan.bsky.social'

  // YOUR bluesky password, or preferably an App Password (found in your client settings)
  // Ex: abcd-1234-efgh-5678
  if (!process.env.FEEDGEN_PUBLISH_APP_PASSWORD) {
    throw new Error('Please provide an app password in the .env file')
  }
  const password = process.env.FEEDGEN_PUBLISH_APP_PASSWORD

  // A short name for the record that will show in urls
  // Lowercase with no spaces.
  // Ex: whats-hot
  const recordName = 'rp-next-post'
  //const recordName = 'rp-next-post-p'

  // A display name for your feed
  // Ex: What's Hot
  const displayName = 'RepostNextPost'
  //const displayName = 'RepostNextPost+'

  // (Optional) A description of your feed
  // Ex: Top trending content from the whole network
  //const description = '「リツイート直後のツイートを表示するやつ」にインスパイアされた「リポスト直後のポストが流れてくるフィード」です（個人運営のため突然のエラー等ご容赦ください）\nThis feed displays the Post immediately after the Repost (under private management)\nリポストも含めた「RepostNextPost＋」もあります'
  //const description = '「リポスト直後のポスト（とリポスト）が流れてくるフィード」です\n㊟同じポストのリポストが省略されないクライアントでご利用ください\n（個人運営のため突然のエラー等ご容赦ください）\nThis feed displays the Post immediately after the Repost (and repost) (under private management)'
  const description = 'RepostNextPostのテストです'

  // (Optional) A description facets
  /*
  const descriptionFacets = [
    {
      index: {
        byteStart: 3,
        byteEnd: 60,
      },
      features: [{
        $type: 'app.bsky.richtext.facet#link',
        "uri": "https://legacy-retweets.pronama.jp/",
      }],
    },
    {
      index: {
        byteStart: 346,
        byteEnd: 363,
      },
      features: [{
        $type: 'app.bsky.richtext.facet#link',
        "uri": "https://bsky.app/profile/did:plc:6zpjzzdzet62go7lnaoq4xog/feed/rp-next-post-p",
      }],
    },
  ]
  */
  const descriptionFacets = undefined

  // (Optional) The path to an image to be used as your feed's avatar
  // Ex: ~/path/to/avatar.jpeg
  //const avatar: string = './scripts/repost.png'
  //const avatar: string = './scripts/repost-p.png'
  const avatar: string = ''

  // -------------------------------------
  // NO NEED TO TOUCH ANYTHING BELOW HERE
  // -------------------------------------

  if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
    throw new Error('Please provide a hostname in the .env file')
  }
  const feedGenDid =
    process.env.FEEDGEN_SERVICE_DID ?? `did:web:${process.env.FEEDGEN_HOSTNAME}`

  // only update this if in a test environment
  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  let avatarRef: BlobRef | undefined
  if (avatar) {
    let encoding: string
    if (avatar.endsWith('png')) {
      encoding = 'image/png'
    } else if (avatar.endsWith('jpg') || avatar.endsWith('jpeg')) {
      encoding = 'image/jpeg'
    } else {
      throw new Error('expected png or jpeg')
    }
    const img = await fs.readFile(avatar)
    const blobRes = await agent.api.com.atproto.repo.uploadBlob(img, {
      encoding,
    })
    avatarRef = blobRes.data.blob
  }

  await agent.api.com.atproto.repo.putRecord({
    repo: agent.session?.did ?? '',
    collection: ids.AppBskyFeedGenerator,
    rkey: recordName,
    record: {
      did: feedGenDid,
      displayName: displayName,
      description: description,
      avatar: avatarRef,
      createdAt: new Date().toISOString(),
      descriptionFacets: descriptionFacets,
    },
  })

  console.log('All done 🎉')
}

run()
