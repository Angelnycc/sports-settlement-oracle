// Code generated — DO NOT EDIT.
import type { Address } from 'viem'
import { addContractMock, type ContractMock, type EvmMock } from '@chainlink/cre-sdk/test'

import { SportsMarketV2ABI } from './SportsMarketV2'

export type SportsMarketV2Mock = {
  games?: (arg0: `0x${string}`) => readonly [string, bigint, string, number, bigint]
  getAllowedSports?: () => readonly string[]
  getExpectedAuthor?: () => `0x${string}`
  getExpectedWorkflowId?: () => `0x${string}`
  getExpectedWorkflowName?: () => `0x${string}`
  getForwarderAddress?: () => `0x${string}`
  getGame?: (sport: string, espnId: bigint) => { sport: string; espnId: bigint; description: string; outcome: number; settledAt: bigint }
  owner?: () => `0x${string}`
  sportAllowed?: (arg0: string) => boolean
  supportsInterface?: (interfaceId: `0x${string}`) => boolean
} & Pick<ContractMock<typeof SportsMarketV2ABI>, 'writeReport'>

export function newSportsMarketV2Mock(address: Address, evmMock: EvmMock): SportsMarketV2Mock {
  return addContractMock(evmMock, { address, abi: SportsMarketV2ABI }) as SportsMarketV2Mock
}

