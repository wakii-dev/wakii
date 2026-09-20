import { z } from 'zod'
import { requiredString, requiredStringAllowingEmpty } from './rpc-param-primitives'

// Params schemas cho superpowers.* RPC (FI-305) — dùng chung bởi host registry
// (methods/index) và rpc-params-catalog.generated. Đặt ở đây để generator
// index được (như các *-params.ts khác trong rpc-contract).

export const SuperpowersStoryDetailParams = z.object({
  storyId: requiredString('Missing storyId')
})

export const SuperpowersGateResolveParams = z.object({
  gateId: requiredStringAllowingEmpty('Missing gateId'),
  resolution: requiredStringAllowingEmpty('Missing resolution')
})
