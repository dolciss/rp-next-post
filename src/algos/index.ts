import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as rpNextPost from './rp-next-post'

type AlgoHandler = (ctx: AppContext, params: QueryParams, requester: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [rpNextPost.shortname]: rpNextPost.handler,
}

export default algos
