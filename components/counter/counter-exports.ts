import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import { IDL as CounterIDL } from './counter-idl'

// Re-export the IDL
export { CounterIDL }
export type Counter = DeepMutable<typeof CounterIDL>

type DeepMutable<T> = {
    -readonly [P in keyof T]: T[P] extends object ? DeepMutable<T[P]> : T[P]
}

// This is a placeholder for the actual program ID
export const COUNTER_PROGRAM_ID = new PublicKey('11111111111111111111111111111111')

export function getCounterProgramId(cluster: Cluster) {
    switch (cluster) {
        case 'devnet':
        case 'testnet':
        case 'mainnet-beta':
        default:
            return COUNTER_PROGRAM_ID
    }
}

export function getCounterProgram(provider: AnchorProvider, programId: PublicKey) {
    return new Program<Counter>(CounterIDL, provider)
}
