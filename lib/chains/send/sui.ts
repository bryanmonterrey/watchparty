// Sui transfers — native SUI and any coin type.

// @mysten/sui v2 renamed SuiClient → SuiJsonRpcClient and moved it to
// /jsonRpc; the method surface used here is unchanged.
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { isValidSuiAddress } from "@mysten/sui/utils";
import { SUI } from "../registry";
import { deriveSui } from "../derive";
import { SUI_NATIVE_COIN_TYPE } from "../assets/sui";
import type { FeeEstimate, SendRequest, SendResult } from "./types";

function keypairFromSeed(seed: Uint8Array): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(deriveSui(seed).privateKey);
}

export function validateSuiAddress(address: string): boolean {
  return isValidSuiAddress(address);
}

export async function estimateSuiFee(): Promise<FeeEstimate> {
  // Sui reference gas price is stable and tiny; a dry run per keystroke would
  // be wasteful, so quote the reference price against a typical transfer.
  const client = new SuiJsonRpcClient({ url: SUI.rpcUrl!, network: 'mainnet' });
  const gasPrice = BigInt(await client.getReferenceGasPrice());
  const fee = gasPrice * BigInt(2_000_000); // typical transfer gas budget
  return {
    fee: fee.toString(),
    feeFormatted: Number(fee) / 10 ** SUI.nativeCurrency.decimals,
    symbol: SUI.nativeCurrency.symbol,
  };
}

export async function sendSui(seed: Uint8Array, request: SendRequest): Promise<SendResult> {
  if (!isValidSuiAddress(request.to)) throw new Error("Invalid Sui address");

  const amount = BigInt(request.amount);
  if (amount <= BigInt(0)) throw new Error("Amount must be positive");

  const client = new SuiJsonRpcClient({ url: SUI.rpcUrl!, network: 'mainnet' });
  const keypair = keypairFromSeed(seed);
  const sender = keypair.getPublicKey().toSuiAddress();

  const tx = new Transaction();
  tx.setSender(sender);

  const coinType = request.contract ?? SUI_NATIVE_COIN_TYPE;

  if (coinType === SUI_NATIVE_COIN_TYPE) {
    // Native SUI pays gas from the same pool, so split off the gas coin.
    const [coin] = tx.splitCoins(tx.gas, [amount]);
    tx.transferObjects([coin], request.to);
  } else {
    // Other coins must be gathered from the owner's objects first.
    const { data: coins } = await client.getCoins({ owner: sender, coinType });
    if (coins.length === 0) throw new Error(`No ${coinType} coins held`);

    const primary = tx.object(coins[0].coinObjectId);
    if (coins.length > 1) {
      tx.mergeCoins(primary, coins.slice(1).map((c: { coinObjectId: string }) => tx.object(c.coinObjectId)));
    }
    const [coin] = tx.splitCoins(primary, [amount]);
    tx.transferObjects([coin], request.to);
  }

  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
  await client.waitForTransaction({ digest: result.digest });

  return { txId: result.digest, explorerUrl: `${SUI.explorer}/tx/${result.digest}` };
}
