// @ts-nocheck
// Code generated — DO NOT EDIT.
import {
  decodeEventLog,
  decodeFunctionResult,
  encodeEventTopics,
  encodeFunctionData,
  zeroAddress,
} from 'viem'
import type { Address, Hex } from 'viem'
import {
  bytesToHex,
  encodeCallMsg,
  EVMClient,
  hexToBase64,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  type EVMLog,
  type Runtime,
} from '@chainlink/cre-sdk'

export interface DecodedLog<T> extends Omit<EVMLog, 'data'> { data: T }

const encodeTopicValue = (t: Hex | Hex[] | null): string[] => {
  if (t == null) return []
  if (Array.isArray(t)) return t.map(hexToBase64)
  return [hexToBase64(t)]
}





/**
 * Filter params for ExpectedAuthorUpdated. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type ExpectedAuthorUpdatedTopics = {
  previousAuthor?: `0x${string}`
  newAuthor?: `0x${string}`
}

/**
 * Decoded ExpectedAuthorUpdated event data.
 */
export type ExpectedAuthorUpdatedDecoded = {
  previousAuthor: `0x${string}`
  newAuthor: `0x${string}`
}


/**
 * Filter params for ExpectedWorkflowIdUpdated. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type ExpectedWorkflowIdUpdatedTopics = {
  previousId?: `0x${string}`
  newId?: `0x${string}`
}

/**
 * Decoded ExpectedWorkflowIdUpdated event data.
 */
export type ExpectedWorkflowIdUpdatedDecoded = {
  previousId: `0x${string}`
  newId: `0x${string}`
}


/**
 * Filter params for ExpectedWorkflowNameUpdated. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type ExpectedWorkflowNameUpdatedTopics = {
  previousName?: `0x${string}`
  newName?: `0x${string}`
}

/**
 * Decoded ExpectedWorkflowNameUpdated event data.
 */
export type ExpectedWorkflowNameUpdatedDecoded = {
  previousName: `0x${string}`
  newName: `0x${string}`
}


/**
 * Filter params for ForwarderAddressUpdated. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type ForwarderAddressUpdatedTopics = {
  previousForwarder?: `0x${string}`
  newForwarder?: `0x${string}`
}

/**
 * Decoded ForwarderAddressUpdated event data.
 */
export type ForwarderAddressUpdatedDecoded = {
  previousForwarder: `0x${string}`
  newForwarder: `0x${string}`
}


/**
 * Filter params for GameSettled. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type GameSettledTopics = {
  gameId?: bigint
}

/**
 * Decoded GameSettled event data.
 */
export type GameSettledDecoded = {
  gameId: bigint
  outcome: number
  settledAt: bigint
}


/**
 * Filter params for OwnershipTransferred. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type OwnershipTransferredTopics = {
  previousOwner?: `0x${string}`
  newOwner?: `0x${string}`
}

/**
 * Decoded OwnershipTransferred event data.
 */
export type OwnershipTransferredDecoded = {
  previousOwner: `0x${string}`
  newOwner: `0x${string}`
}


/**
 * Filter params for SecurityWarning. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type SecurityWarningTopics = {
}

/**
 * Decoded SecurityWarning event data.
 */
export type SecurityWarningDecoded = {
  message: string
}


/**
 * Filter params for SettlementRequested. Only indexed fields can be used for filtering.
 * Indexed string/bytes must be passed as keccak256 hash (Hex).
 */
export type SettlementRequestedTopics = {
  gameId?: bigint
}

/**
 * Decoded SettlementRequested event data.
 */
export type SettlementRequestedDecoded = {
  gameId: bigint
  description: string
}


export const SportsMarketABI = [{"type":"constructor","inputs":[{"name":"forwarder","type":"address","internalType":"address"}],"stateMutability":"nonpayable"},{"type":"function","name":"requestSettlement","inputs":[{"name":"gameId","type":"uint256","internalType":"uint256"},{"name":"description","type":"string","internalType":"string"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"getGame","inputs":[{"name":"gameId","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"","type":"tuple","internalType":"structSportsMarket.Game","components":[{"name":"gameId","type":"uint256","internalType":"uint256"},{"name":"description","type":"string","internalType":"string"},{"name":"outcome","type":"uint8","internalType":"enumSportsMarket.Outcome"},{"name":"settledAt","type":"uint256","internalType":"uint256"}]}],"stateMutability":"view"},{"type":"function","name":"games","inputs":[{"name":"","type":"uint256","internalType":"uint256"}],"outputs":[{"name":"gameId","type":"uint256","internalType":"uint256"},{"name":"description","type":"string","internalType":"string"},{"name":"outcome","type":"uint8","internalType":"enumSportsMarket.Outcome"},{"name":"settledAt","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"onReport","inputs":[{"name":"metadata","type":"bytes","internalType":"bytes"},{"name":"report","type":"bytes","internalType":"bytes"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"getForwarderAddress","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},{"type":"function","name":"getExpectedAuthor","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},{"type":"function","name":"getExpectedWorkflowId","inputs":[],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"getExpectedWorkflowName","inputs":[],"outputs":[{"name":"","type":"bytes10","internalType":"bytes10"}],"stateMutability":"view"},{"type":"function","name":"setForwarderAddress","inputs":[{"name":"_forwarder","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"setExpectedAuthor","inputs":[{"name":"_author","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"setExpectedWorkflowName","inputs":[{"name":"_name","type":"string","internalType":"string"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"setExpectedWorkflowId","inputs":[{"name":"_id","type":"bytes32","internalType":"bytes32"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"supportsInterface","inputs":[{"name":"interfaceId","type":"bytes4","internalType":"bytes4"}],"outputs":[{"name":"","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"owner","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},{"type":"function","name":"transferOwnership","inputs":[{"name":"newOwner","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"renounceOwnership","inputs":[],"outputs":[],"stateMutability":"nonpayable"},{"type":"event","name":"SettlementRequested","inputs":[{"name":"gameId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"description","type":"string","indexed":false,"internalType":"string"}],"anonymous":false},{"type":"event","name":"GameSettled","inputs":[{"name":"gameId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"outcome","type":"uint8","indexed":false,"internalType":"enumSportsMarket.Outcome"},{"name":"settledAt","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"event","name":"ForwarderAddressUpdated","inputs":[{"name":"previousForwarder","type":"address","indexed":true,"internalType":"address"},{"name":"newForwarder","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"event","name":"ExpectedAuthorUpdated","inputs":[{"name":"previousAuthor","type":"address","indexed":true,"internalType":"address"},{"name":"newAuthor","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"event","name":"ExpectedWorkflowNameUpdated","inputs":[{"name":"previousName","type":"bytes10","indexed":true,"internalType":"bytes10"},{"name":"newName","type":"bytes10","indexed":true,"internalType":"bytes10"}],"anonymous":false},{"type":"event","name":"ExpectedWorkflowIdUpdated","inputs":[{"name":"previousId","type":"bytes32","indexed":true,"internalType":"bytes32"},{"name":"newId","type":"bytes32","indexed":true,"internalType":"bytes32"}],"anonymous":false},{"type":"event","name":"SecurityWarning","inputs":[{"name":"message","type":"string","indexed":false,"internalType":"string"}],"anonymous":false},{"type":"event","name":"OwnershipTransferred","inputs":[{"name":"previousOwner","type":"address","indexed":true,"internalType":"address"},{"name":"newOwner","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"error","name":"AlreadySettled","inputs":[{"name":"gameId","type":"uint256","internalType":"uint256"}]},{"type":"error","name":"InvalidOutcome","inputs":[{"name":"outcome","type":"uint8","internalType":"uint8"}]},{"type":"error","name":"InvalidForwarderAddress","inputs":[]},{"type":"error","name":"InvalidSender","inputs":[{"name":"sender","type":"address","internalType":"address"},{"name":"expected","type":"address","internalType":"address"}]},{"type":"error","name":"InvalidAuthor","inputs":[{"name":"received","type":"address","internalType":"address"},{"name":"expected","type":"address","internalType":"address"}]},{"type":"error","name":"InvalidWorkflowName","inputs":[{"name":"received","type":"bytes10","internalType":"bytes10"},{"name":"expected","type":"bytes10","internalType":"bytes10"}]},{"type":"error","name":"InvalidWorkflowId","inputs":[{"name":"received","type":"bytes32","internalType":"bytes32"},{"name":"expected","type":"bytes32","internalType":"bytes32"}]},{"type":"error","name":"WorkflowNameRequiresAuthorValidation","inputs":[]},{"type":"error","name":"OwnableInvalidOwner","inputs":[{"name":"owner","type":"address","internalType":"address"}]},{"type":"error","name":"OwnableUnauthorizedAccount","inputs":[{"name":"account","type":"address","internalType":"address"}]}] as const

export class SportsMarket {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  games(
    runtime: Runtime<unknown>,
    arg0: bigint,
  ): readonly [bigint, string, number, bigint] {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'games' as const,
      args: [arg0],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'games' as const,
      data: bytesToHex(result.data),
    }) as readonly [bigint, string, number, bigint]
  }

  getExpectedAuthor(
    runtime: Runtime<unknown>,
  ): `0x${string}` {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'getExpectedAuthor' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'getExpectedAuthor' as const,
      data: bytesToHex(result.data),
    }) as `0x${string}`
  }

  getExpectedWorkflowId(
    runtime: Runtime<unknown>,
  ): `0x${string}` {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'getExpectedWorkflowId' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'getExpectedWorkflowId' as const,
      data: bytesToHex(result.data),
    }) as `0x${string}`
  }

  getExpectedWorkflowName(
    runtime: Runtime<unknown>,
  ): `0x${string}` {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'getExpectedWorkflowName' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'getExpectedWorkflowName' as const,
      data: bytesToHex(result.data),
    }) as `0x${string}`
  }

  getForwarderAddress(
    runtime: Runtime<unknown>,
  ): `0x${string}` {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'getForwarderAddress' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'getForwarderAddress' as const,
      data: bytesToHex(result.data),
    }) as `0x${string}`
  }

  getGame(
    runtime: Runtime<unknown>,
    gameId: bigint,
  ): { gameId: bigint; description: string; outcome: number; settledAt: bigint } {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'getGame' as const,
      args: [gameId],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'getGame' as const,
      data: bytesToHex(result.data),
    }) as { gameId: bigint; description: string; outcome: number; settledAt: bigint }
  }

  owner(
    runtime: Runtime<unknown>,
  ): `0x${string}` {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'owner' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'owner' as const,
      data: bytesToHex(result.data),
    }) as `0x${string}`
  }

  supportsInterface(
    runtime: Runtime<unknown>,
    interfaceId: `0x${string}`,
  ): boolean {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'supportsInterface' as const,
      args: [interfaceId],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: SportsMarketABI,
      functionName: 'supportsInterface' as const,
      data: bytesToHex(result.data),
    }) as boolean
  }

  writeReportFromOnReport(
    runtime: Runtime<unknown>,
    metadata: `0x${string}`,
    report: `0x${string}`,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'onReport' as const,
      args: [metadata, report],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromRequestSettlement(
    runtime: Runtime<unknown>,
    gameId: bigint,
    description: string,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'requestSettlement' as const,
      args: [gameId, description],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromSetExpectedAuthor(
    runtime: Runtime<unknown>,
    author: `0x${string}`,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'setExpectedAuthor' as const,
      args: [author],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromSetExpectedWorkflowId(
    runtime: Runtime<unknown>,
    id: `0x${string}`,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'setExpectedWorkflowId' as const,
      args: [id],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromSetExpectedWorkflowName(
    runtime: Runtime<unknown>,
    name: string,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'setExpectedWorkflowName' as const,
      args: [name],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromSetForwarderAddress(
    runtime: Runtime<unknown>,
    forwarder: `0x${string}`,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'setForwarderAddress' as const,
      args: [forwarder],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromTransferOwnership(
    runtime: Runtime<unknown>,
    newOwner: `0x${string}`,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: SportsMarketABI,
      functionName: 'transferOwnership' as const,
      args: [newOwner],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReport(
    runtime: Runtime<unknown>,
    callData: Hex,
    gasConfig?: { gasLimit?: string },
  ) {
    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  /**
   * Creates a log trigger for ExpectedAuthorUpdated events.
   * The returned trigger's adapt method decodes the raw log into ExpectedAuthorUpdatedDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerExpectedAuthorUpdated(
    filters?: ExpectedAuthorUpdatedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ExpectedAuthorUpdated' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        previousAuthor: f.previousAuthor,
        newAuthor: f.newAuthor,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ExpectedAuthorUpdated' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          previousAuthor: f.previousAuthor,
          newAuthor: f.newAuthor,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'ExpectedAuthorUpdated' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<ExpectedAuthorUpdatedDecoded> => contract.decodeExpectedAuthorUpdated(rawOutput),
    }
  }

  /**
   * Decodes a log into ExpectedAuthorUpdated data, preserving all log metadata.
   */
  decodeExpectedAuthorUpdated(log: EVMLog): DecodedLog<ExpectedAuthorUpdatedDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as ExpectedAuthorUpdatedDecoded }
  }

  /**
   * Creates a log trigger for ExpectedWorkflowIdUpdated events.
   * The returned trigger's adapt method decodes the raw log into ExpectedWorkflowIdUpdatedDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerExpectedWorkflowIdUpdated(
    filters?: ExpectedWorkflowIdUpdatedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ExpectedWorkflowIdUpdated' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        previousId: f.previousId,
        newId: f.newId,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ExpectedWorkflowIdUpdated' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          previousId: f.previousId,
          newId: f.newId,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'ExpectedWorkflowIdUpdated' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<ExpectedWorkflowIdUpdatedDecoded> => contract.decodeExpectedWorkflowIdUpdated(rawOutput),
    }
  }

  /**
   * Decodes a log into ExpectedWorkflowIdUpdated data, preserving all log metadata.
   */
  decodeExpectedWorkflowIdUpdated(log: EVMLog): DecodedLog<ExpectedWorkflowIdUpdatedDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as ExpectedWorkflowIdUpdatedDecoded }
  }

  /**
   * Creates a log trigger for ExpectedWorkflowNameUpdated events.
   * The returned trigger's adapt method decodes the raw log into ExpectedWorkflowNameUpdatedDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerExpectedWorkflowNameUpdated(
    filters?: ExpectedWorkflowNameUpdatedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ExpectedWorkflowNameUpdated' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        previousName: f.previousName,
        newName: f.newName,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ExpectedWorkflowNameUpdated' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          previousName: f.previousName,
          newName: f.newName,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'ExpectedWorkflowNameUpdated' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<ExpectedWorkflowNameUpdatedDecoded> => contract.decodeExpectedWorkflowNameUpdated(rawOutput),
    }
  }

  /**
   * Decodes a log into ExpectedWorkflowNameUpdated data, preserving all log metadata.
   */
  decodeExpectedWorkflowNameUpdated(log: EVMLog): DecodedLog<ExpectedWorkflowNameUpdatedDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as ExpectedWorkflowNameUpdatedDecoded }
  }

  /**
   * Creates a log trigger for ForwarderAddressUpdated events.
   * The returned trigger's adapt method decodes the raw log into ForwarderAddressUpdatedDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerForwarderAddressUpdated(
    filters?: ForwarderAddressUpdatedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ForwarderAddressUpdated' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        previousForwarder: f.previousForwarder,
        newForwarder: f.newForwarder,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'ForwarderAddressUpdated' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          previousForwarder: f.previousForwarder,
          newForwarder: f.newForwarder,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'ForwarderAddressUpdated' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<ForwarderAddressUpdatedDecoded> => contract.decodeForwarderAddressUpdated(rawOutput),
    }
  }

  /**
   * Decodes a log into ForwarderAddressUpdated data, preserving all log metadata.
   */
  decodeForwarderAddressUpdated(log: EVMLog): DecodedLog<ForwarderAddressUpdatedDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as ForwarderAddressUpdatedDecoded }
  }

  /**
   * Creates a log trigger for GameSettled events.
   * The returned trigger's adapt method decodes the raw log into GameSettledDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerGameSettled(
    filters?: GameSettledTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'GameSettled' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        gameId: f.gameId,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'GameSettled' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          gameId: f.gameId,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'GameSettled' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<GameSettledDecoded> => contract.decodeGameSettled(rawOutput),
    }
  }

  /**
   * Decodes a log into GameSettled data, preserving all log metadata.
   */
  decodeGameSettled(log: EVMLog): DecodedLog<GameSettledDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as GameSettledDecoded }
  }

  /**
   * Creates a log trigger for OwnershipTransferred events.
   * The returned trigger's adapt method decodes the raw log into OwnershipTransferredDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerOwnershipTransferred(
    filters?: OwnershipTransferredTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'OwnershipTransferred' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        previousOwner: f.previousOwner,
        newOwner: f.newOwner,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'OwnershipTransferred' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          previousOwner: f.previousOwner,
          newOwner: f.newOwner,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'OwnershipTransferred' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<OwnershipTransferredDecoded> => contract.decodeOwnershipTransferred(rawOutput),
    }
  }

  /**
   * Decodes a log into OwnershipTransferred data, preserving all log metadata.
   */
  decodeOwnershipTransferred(log: EVMLog): DecodedLog<OwnershipTransferredDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as OwnershipTransferredDecoded }
  }

  /**
   * Creates a log trigger for SecurityWarning events.
   * The returned trigger's adapt method decodes the raw log into SecurityWarningDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerSecurityWarning(
    filters?: SecurityWarningTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'SecurityWarning' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'SecurityWarning' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'SecurityWarning' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<SecurityWarningDecoded> => contract.decodeSecurityWarning(rawOutput),
    }
  }

  /**
   * Decodes a log into SecurityWarning data, preserving all log metadata.
   */
  decodeSecurityWarning(log: EVMLog): DecodedLog<SecurityWarningDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as SecurityWarningDecoded }
  }

  /**
   * Creates a log trigger for SettlementRequested events.
   * The returned trigger's adapt method decodes the raw log into SettlementRequestedDecoded,
   * so the handler receives typed event data directly.
   * When multiple filters are provided, topic values are merged with OR semantics (match any).
   */
  logTriggerSettlementRequested(
    filters?: SettlementRequestedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'SettlementRequested' as const,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = {
        gameId: f.gameId,
      }
      const encoded = encodeEventTopics({
        abi: SportsMarketABI,
        eventName: 'SettlementRequested' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: encodeTopicValue(t) }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = {
          gameId: f.gameId,
        }
        return encodeEventTopics({
          abi: SportsMarketABI,
          eventName: 'SettlementRequested' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.flatMap((row) => encodeTopicValue(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<SettlementRequestedDecoded> => contract.decodeSettlementRequested(rawOutput),
    }
  }

  /**
   * Decodes a log into SettlementRequested data, preserving all log metadata.
   */
  decodeSettlementRequested(log: EVMLog): DecodedLog<SettlementRequestedDecoded> {
    const decoded = decodeEventLog({
      abi: SportsMarketABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as SettlementRequestedDecoded }
  }
}

