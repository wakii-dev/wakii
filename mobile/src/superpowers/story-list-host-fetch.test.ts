import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { fetchStoryList } from './story-list-host-fetch'
import { storyListHappyPath } from './story-rpc-fixtures'

const cache = vi.hoisted(() => ({ saveStoryListSnapshot: vi.fn() }))
vi.mock('./story-screen-cache', () => ({ saveStoryListSnapshot: cache.saveStoryListSnapshot }))

const CUTOVER_MESSAGE = 'RPC interrupted by connection migration'

function fakeClient(sendRequest: RpcClient['sendRequest']): RpcClient {
  return { sendRequest } as unknown as RpcClient
}

function okResponse(stories: unknown): Awaited<ReturnType<RpcClient['sendRequest']>> {
  return { ok: true, result: { stories } } as Awaited<ReturnType<RpcClient['sendRequest']>>
}

function errorResponse(): Awaited<ReturnType<RpcClient['sendRequest']>> {
  return { ok: false, error: 'boom' } as Awaited<ReturnType<RpcClient['sendRequest']>>
}

describe('fetchStoryList', () => {
  beforeEach(() => {
    cache.saveStoryListSnapshot.mockReset()
  })

  it('returns the stories and writes through to the snapshot cache on ok', async () => {
    const sendRequest = vi.fn().mockResolvedValue(okResponse(storyListHappyPath.stories))

    const outcome = await fetchStoryList(fakeClient(sendRequest), 'host-1', () => false)

    expect(sendRequest).toHaveBeenCalledWith('superpowers.storyList', {})
    expect(outcome).toEqual({ kind: 'ok', stories: storyListHappyPath.stories })
    expect(cache.saveStoryListSnapshot).toHaveBeenCalledWith('host-1', storyListHappyPath.stories)
  })

  it('never touches the cache when the response is not ok', async () => {
    const sendRequest = vi.fn().mockResolvedValue(errorResponse())

    const outcome = await fetchStoryList(fakeClient(sendRequest), 'host-1', () => false)

    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryListSnapshot).not.toHaveBeenCalled()
  })

  it('does not retry an ordinary failure and never touches the cache', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new Error('socket died'))

    const outcome = await fetchStoryList(fakeClient(sendRequest), 'host-1', () => false)

    expect(sendRequest).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryListSnapshot).not.toHaveBeenCalled()
  })

  it('retries a cutover interruption on the replacement session', async () => {
    const sendRequest = vi
      .fn()
      .mockRejectedValueOnce(new Error(CUTOVER_MESSAGE))
      .mockResolvedValue(okResponse(storyListHappyPath.stories))

    const outcome = await fetchStoryList(fakeClient(sendRequest), 'host-1', () => false)

    expect(sendRequest).toHaveBeenCalledTimes(2)
    expect(outcome).toEqual({ kind: 'ok', stories: storyListHappyPath.stories })
  })

  it('caps cutover retries at 2', async () => {
    const sendRequest = vi.fn().mockRejectedValue(new Error(CUTOVER_MESSAGE))

    const outcome = await fetchStoryList(fakeClient(sendRequest), 'host-1', () => false)

    expect(sendRequest).toHaveBeenCalledTimes(3)
    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryListSnapshot).not.toHaveBeenCalled()
  })

  it('skips the cache write once the caller is disposed', async () => {
    const sendRequest = vi.fn().mockResolvedValue(okResponse(storyListHappyPath.stories))

    const outcome = await fetchStoryList(fakeClient(sendRequest), 'host-1', () => true)

    expect(outcome).toEqual({ kind: 'unavailable' })
    expect(cache.saveStoryListSnapshot).not.toHaveBeenCalled()
  })
})
