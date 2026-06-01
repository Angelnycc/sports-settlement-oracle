// Code generated — DO NOT EDIT.
import type { Address } from 'viem'
import { addContractMock, type ContractMock, type EvmMock } from '@chainlink/cre-sdk/test'

import { SportsMarketABI } from './SportsMarket'

export type SportsMarketMock = {
  games?: (arg0: bigint) => readonly [bigint, string, number, bigint]
  getExpectedAuthor?: () => `0x${string}`
  getExpectedWorkflowId?: () => `0x${string}`
  getExpectedWorkflowName?: () => `0x${string}`
  getForwarderAddress?: () => `0x${string}`
  getGame?: (gameId: bigint) => { gameId: bigint; description: string; outcome: number; settledAt: bigint }
  owner?: () => `0x${string}`
  supportsInterface?: (interfaceId: `0x${string}`) => boolean
} & Pick<ContractMock<typeof SportsMarketABI>, 'writeReport'>

export function newSportsMarketMock(address: Address, evmMock: EvmMock): SportsMarketMock {
  return addContractMock(evmMock, { address, abi: SportsMarketABI }) as SportsMarketMock
}

