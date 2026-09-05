import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { fetchStoryDetail } from './story-detail-host-fetch'
import { storyDetailHappyPath, storyDetailNotFound } from './story-rpc-fixtures'

const cache = vi.hoisted(() => ({ saveStoryDetailSnapshot: vi.fn() }))
vi.mock('./story-screen-cache', () => ({ saveStoryDetailSnapshot: cache.saveStoryDetailSnapshot }))

const CUTOVER_MESSAGE = 'RPC interrupted by connection migration'
const HOST = 'host-1'
const STORY_ID = 'brackets/fi307-sf2-mobile-story.md'

function fakeClient(sendRequest: RpcClient['sendRequest']): RpcClient {
  return { sendRequest } as unknown as RpcClient
}

function okResponse(result: unknown): Awaited<ReturnType<RpcClient['sendRequest']>> {
  return { ok: true, result } as Awaited<ReturnType<RpcClient['sendRequest']>>
}

function errorResponse(): Awaited<ReturnType<RpcClient['sendRequest']>> {
  return { ok: false, error: 'boom' } as Awaited<ReturnType<RpcClient['sendRequest']>>
}

describe('fetchStoryDetail', () => {
  beforeEach(() => {
    cache.saveStoryDetailSnapshot.mockReset()
  })

  it('returns the detail and writes through to the snapshot cache on ok', async () => {
    const sendRequest = vi.fn().mockResolvedValue(okResponse(storyDetailHappyPath))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(sendRequest).toHaveBeenCalledWith('superpowers.storyDetail', { storyId: STORY_ID })
    expect(outcome).toEqual({ kind: 'ok', detail: storyDetailHappyPath })
    expect(cache.saveStoryDetailSnapshot).toHaveBeenCalledWith(HOST, STORY_ID, storyDetailHappyPath)
  })

  it('returns a distinct not-found outcome and never touches the cache', async () => {
    // The desktop method answers story_not_found inside an ok response (never throws).
    const sendRequest = vi.fn().mockResolvedValue(okResponse(storyDetailNotFound))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(outcome).toEqual({ kind: 'not-found' })
    expect(cache.saveStoryDetailSnapshot).not.toHaveBeenCalled()
  })

  it('keeps parseError stories as normal ok data (the data layer does not filter)', async () => {
    const parseErrorDetail = {
      ...storyDetailHappyPath,
      story: { ...storyDetailHappyPath.story, parseError: true, sfs: [] }
    }
    const sendRequest = vi.fn().mockResolvedValue(okResponse(parseErrorDetail))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(outcome).toEqual({ kind: 'ok', detail: parseErrorDetail })
    expect(cache.saveStoryDetailSnapshot).toHaveBeenCalledWith(HOST, STORY_ID, parseErrorDetail)
  })

  it('never touches the cache when the response is not ok', async () => {
    const sendRequest = vi.fn().mockResolvedValue(errorResponse())

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryDetailSnapshot).not.toHaveBeenCalled()
  })

  it('does not retry an ordinary failure and never touches the cache', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new Error('socket died'))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryDetailSnapshot).not.toHaveBeenCalled()
  })

  it('retries a cutover interruption on the replacement session', async () => {
    const sendRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error(CUTOVER_MESSAGE))
      .mockResolvedValue(okResponse(storyDetailHappyPath))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(sendRequest).toHaveBeenCalledTimes(2)
    expect(outcome).toEqual({ kind: 'ok', detail: storyDetailHappyPath })
  })

  it('caps cutover retries at 2', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new Error(CUTOVER_MESSAGE))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => false)

    expect(sendRequest).toHaveBeenCalledTimes(3)
    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryDetailSnapshot).not.toHaveBeenCalled()
  })

  it('skips the cache write once the caller is disposed', async () => {
    const sendRequest = vi.fn().mockResolvedValue(okResponse(storyDetailHappyPath))

    const outcome = await fetchStoryDetail(fakeClient(sendRequest), HOST, STORY_ID, () => true)

    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryDetailSnapshot).not.toHaveBeenCalled()
  })
})
