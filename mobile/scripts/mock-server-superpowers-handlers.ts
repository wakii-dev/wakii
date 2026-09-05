import type { WebSocket } from 'ws'
import type { RpcRequest, RpcResponse, RpcRespond } from './mock-server-rpc-handlers'

// Mock superpowers.* backend for FI-308 SF-3 device verify (T3 scaffolding): one
// story-linked gate WITH options, one 'khác' gate WITHOUT options, one timeout
// gate. Resolve mutates state so a second storyDetail shows it resolved, and
// mirrors the real dispatcher contract: taxonomy errors are result-field inside
// the success envelope ({ok:true, result:{error:code}}), never ok:false.
// Routing fields follow the desktop's both-or-neither rule — story-linked gates
// carry BOTH storyId+worktreeId, 'khác' gates carry NEITHER key.

type Success = (id: string, result: unknown, streaming?: boolean) => RpcResponse

const MOCK_STORY_ID = 'brackets/fi308-gate-resolve-ux.md'
const MOCK_WORKTREE_ID = 'wt-fi308-orca'
// Stable epoch so device screenshots across restarts stay comparable.
const GATE_EPOCH_MS = 1788566400000

type MockGateStatus = 'pending' | 'resolved' | 'timeout'

type MockGate = {
  gateId: string
  title: string
  status: MockGateStatus
  resolution: string | null
  options: string[]
  worktreeId: string | null
  createdAt: number
  storyLinked: boolean
}

const mockGates: MockGate[] = [
  {
    gateId: 'gate-fi308-approve',
    title: 'Approve SF-3 resolve flow',
    status: 'pending',
    resolution: null,
    options: ['approve', 'request-changes'],
    worktreeId: MOCK_WORKTREE_ID,
    createdAt: GATE_EPOCH_MS,
    storyLinked: true
  },
  {
    gateId: 'gate-fi308-khac-window',
    title: 'Pick deploy window for story sync',
    status: 'pending',
    resolution: null,
    options: [],
    worktreeId: null,
    createdAt: GATE_EPOCH_MS + 1,
    storyLinked: false
  },
  {
    gateId: 'gate-fi308-timeout-forcepush',
    title: 'Confirm force-push to destination',
    status: 'timeout',
    resolution: null,
    options: ['allow', 'deny'],
    worktreeId: MOCK_WORKTREE_ID,
    createdAt: GATE_EPOCH_MS + 2,
    storyLinked: true
  }
]

// --- notifications gate-open/gate-closed push path (desktop parity for T5) ---

type GateEventSubscriber = { requestId: string; respond: RpcRespond; isOpen: () => boolean }
const gateEventSubscribers = new Map<string, GateEventSubscriber>()
let gateEventSeq = 0

function pushGateEvent(kind: 'gate-open' | 'gate-closed', gate: MockGate, success: Success): void {
  const storyRouted = gate.storyLinked && gate.worktreeId !== null
  const event = {
    type: 'notification',
    source: kind,
    title: gate.title,
    body: kind === 'gate-closed' ? (gate.resolution ?? '') : '',
    gateId: gate.gateId,
    // Both-or-neither (plan D1): a story-routed gate carries both keys, a
    // 'khác' gate carries neither — a lone key would misroute T5's reducer.
    ...(storyRouted ? { worktreeId: gate.worktreeId, storyId: MOCK_STORY_ID } : {}),
    notificationSeq: ++gateEventSeq,
    notificationEpoch: 'mock'
  }
  for (const subscriber of gateEventSubscribers.values()) {
    subscriber.respond(success(subscriber.requestId, event, true), subscriber.isOpen)
  }
}

// Trigger (armed on first subscribe so piping stdin stays inert otherwise):
// type `gate-open <gateId>` / `gate-closed <gateId>` + Enter in the server terminal.
let triggerArmed = false
function armGateEventTrigger(success: Success): void {
  if (triggerArmed) {
    return
  }
  triggerArmed = true
  console.log(
    '[mock] Gate events — type + Enter: `gate-open <gateId>` or `gate-closed <gateId>` (ids: gate-fi308-approve, gate-fi308-khac-window, gate-fi308-timeout-forcepush)'
  )
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      const match = /^(gate-open|gate-closed)\s+(\S+)\s*$/.exec(line.trim())
      if (!match) {
        continue
      }
      const kind = match[1] as 'gate-open' | 'gate-closed'
      const gate = mockGates.find((candidate) => candidate.gateId === match[2])
      if (!gate) {
        console.log(`[mock] no mock gate '${match[2]}'`)
        continue
      }
      pushGateEvent(kind, gate, success)
      console.log(`[mock] pushed ${kind} for ${gate.gateId}`)
    }
  })
}

// --- handlers ---

/** superpowers.* + notifications subscribe/unsubscribe backend. Returns false for
 *  methods it does not own (unknown superpowers.* falls through to method_not_found,
 *  matching the pre-SF-1 desktop probe shape). */
export function handleMockSuperpowersRequest(
  request: RpcRequest,
  respond: RpcRespond,
  success: (id: string, result: unknown, streaming?: boolean) => RpcResponse,
  ws: WebSocket
): boolean {
  switch (request.method) {
    case 'superpowers.storyList': {
      const pendingGates = mockGates.filter(
        (gate) => gate.status === 'pending' && gate.worktreeId === MOCK_WORKTREE_ID
      ).length
      respond(
        success(request.id, {
          stories: [
            {
              storyId: MOCK_STORY_ID,
              title: 'FI-308 gate resolve UX',
              epicId: 'FI-308',
              worktreeId: MOCK_WORKTREE_ID,
              workspaceName: 'orca',
              sfTotal: 7,
              sfDone: 3,
              pendingGates,
              updatedAt: Date.now(),
              parseError: false
            }
          ]
        })
      )
      return true
    }

    case 'superpowers.storyDetail': {
      const storyId = String(request.params?.storyId ?? '')
      if (storyId !== MOCK_STORY_ID) {
        respond(success(request.id, { error: 'story_not_found' }))
        return true
      }
      // Membership rule (plan D1): this story's gates + worktreeId-null 'khác' gates.
      respond(
        success(request.id, {
          story: {
            storyId,
            title: 'FI-308 gate resolve UX',
            epicId: 'FI-308',
            destination: 'story/fi305-superpowers-android',
            worktreeId: MOCK_WORKTREE_ID,
            workspaceName: 'orca',
            parseError: false,
            sfs: []
          },
          gates: mockGates
            .filter((gate) => gate.storyLinked || gate.worktreeId === null)
            .map((gate) => ({ ...gate }))
        })
      )
      return true
    }

    case 'superpowers.gateResolve': {
      const gateId = String(request.params?.gateId ?? '')
      const resolution = String(request.params?.resolution ?? '')
      const gate = mockGates.find((candidate) => candidate.gateId === gateId)
      if (!gateId.trim() || !gate) {
        respond(success(request.id, { error: 'gate_not_found' }))
        return true
      }
      if (!resolution.trim()) {
        respond(success(request.id, { error: 'invalid_resolution' }))
        return true
      }
      if (gate.status !== 'pending') {
        respond(success(request.id, { error: 'gate_not_pending' }))
        return true
      }
      gate.status = 'resolved'
      gate.resolution = resolution
      respond(success(request.id, { gateId, status: 'resolved', resolution }))
      // The real desktop's db transition listener fans this out to every client
      // (including the resolving phone) — keep the mock honest for T5 checks.
      pushGateEvent('gate-closed', gate, success)
      return true
    }

    case 'notifications.subscribe': {
      const subscriptionId = `notifications-mock-${request.id}`
      gateEventSubscribers.set(subscriptionId, {
        requestId: request.id,
        respond,
        isOpen: () => ws.readyState === ws.OPEN
      })
      ws.once('close', () => {
        gateEventSubscribers.delete(subscriptionId)
      })
      respond(success(request.id, { type: 'ready', subscriptionId, epoch: 'mock' }, true))
      armGateEventTrigger(success)
      return true
    }

    case 'notifications.unsubscribe': {
      const subscriptionId = String(request.params?.subscriptionId ?? '')
      gateEventSubscribers.delete(subscriptionId)
      respond(success(request.id, { unsubscribed: true }))
      return true
    }

    default:
      return false
  }
}
