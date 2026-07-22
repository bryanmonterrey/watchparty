
import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { toPublicKey } from '@/lib/solana/pubkey';
import { trpc } from '@/lib/trpc/client';
import { useAuthSession } from '@/hooks/use-auth-session';
import { SplitShare } from '@/components/app-ui/create-dialog/token-launch-section';
import { getBoostTreasuryOwner } from '@/lib/premium/boosts';
import {
    DynamicFeeSharingClient,
    deriveFeeVaultPdaAddress,
} from '@meteora-ag/dynamic-fee-sharing-sdk';
import {
    DynamicBondingCurveClient,
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    MigrationOption,
    MigrationFeeOption,
    DammV2DynamicFeeMode,
    DammV2BaseFeeMode,
    TokenType,
    TokenAuthorityOption,
    TokenDecimal,
    createSqrtPrices,
    buildCurveWithCustomSqrtPrices,
    ConfigParameters,
    MAX_FEE_BPS,
    deriveDbcPoolAddress
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { useWalletSigning } from '@/hooks/use-wallet-signing';
import { toast } from 'sonner';
import BN from 'bn.js';

export interface TokenLaunchState {
    earningsEnabled: boolean;
    ticker: string;
    creatorFee: number;
    splits: SplitShare[];
    buyAmount: number | undefined; // In SOL
}

// Standard Curve Configuration (Similar to test defaults)
const STANDARD_CURVE_CONFIG_PARAMS = {
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
            feeSchedulerParam: {
                startingFeeBps: 9000, // 90% starting fee
                endingFeeBps: 120, // 1.2% ending fee
                numberOfPeriod: 60,
                totalDuration: 60,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0, // Will be overridden by user input
        poolCreationFee: 0.001, // 0.001 SOL
        enableFirstSwapWithMinFee: false,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.FixedBps100, // 1%
        migrationFee: {
            feePercentage: 0,
            creatorFeePercentage: 0, // Adjusted based on strategy
        },
        migratedPoolFee: {
            collectFeeMode: CollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 100, // 1%
            baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 100,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
};

export function useTokenLaunch() {
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction, signAllTransactions } = useWallet();
    const { data: session } = useAuthSession();
    const custodialWalletAddress = session?.user?.wallet_address;

    // Resolve active public key
    const activePublicKeyStr = adapterPublicKey?.toBase58() || custodialWalletAddress;
    // Safe ctor: a non-wallet user's stored address may not be base58 — a thrown
    // `new PublicKey()` here (render path) would take down the whole page.
    const publicKey = toPublicKey(activePublicKeyStr);

    const [isLaunching, setIsLaunching] = useState(false);
    const resolveSplitsMutation = trpc.escrow.resolveSplits.useMutation();
    const { signAndSubmit: signAndSendCustodialTx } = useWalletSigning();

    const launchToken = async (
        metadata: { name: string; symbol: string; image: string; description: string },
        launchState: TokenLaunchState,
        // First-buy on someone ELSE'S draft: the connected wallet pays and
        // buys, but the pool identity + fees + leftover belong to the token's
        // creator. Omitted = self-launch (creator == buyer), the original flow.
        opts?: { creatorWallet?: PublicKey }
    ) => {
        console.log("[launchToken] called with:", {
            earningsEnabled: launchState.earningsEnabled,
            buyAmount: launchState.buyAmount,
            ticker: launchState.ticker,
            publicKey: publicKey?.toBase58(),
            adapterPublicKey: adapterPublicKey?.toBase58(),
            custodialWalletAddress,
        });

        // 0. Base checks
        if (!launchState.earningsEnabled) {
            console.log("[launchToken] early exit: earningsEnabled is false");
            return { success: true };
        }

        // 1. DRAFT MODE (No initial buy) - Database only Record
        if (!launchState.buyAmount || launchState.buyAmount <= 0) {
            console.log("[launchToken] early exit: no buyAmount, returning draft");
            return { success: true, status: 'draft' };
        }

        // 2. LIVE MODE (On-chain Launch)
        if (!publicKey) {
            toast.error("Wallet not connected");
            return { success: false, error: "Wallet not connected" };
        }

        setIsLaunching(true);

        // Determine which wallet actually has funds.
        // Custodial wallets are often unfunded — check balance and prefer adapter if available.
        let useCustodial = !!custodialWalletAddress;
        if (custodialWalletAddress && adapterPublicKey) {
            const custodialBalance = await connection.getBalance(new PublicKey(custodialWalletAddress));
            const requiredLamports = (launchState.buyAmount + 0.03) * 1_000_000_000; // buy + ~0.03 SOL for fees/rent
            useCustodial = custodialBalance >= requiredLamports;
            console.log("[launchToken] custodial balance:", custodialBalance / 1e9, "SOL, required:", (launchState.buyAmount + 0.03), "SOL, useCustodial:", useCustodial);
        } else if (custodialWalletAddress && !adapterPublicKey) {
            // Only custodial available — check it has funds
            const custodialBalance = await connection.getBalance(new PublicKey(custodialWalletAddress));
            const requiredLamports = (launchState.buyAmount + 0.03) * 1_000_000_000;
            if (custodialBalance < requiredLamports) {
                const needed = ((requiredLamports - custodialBalance) / 1e9).toFixed(4);
                toast.error(`Custodial wallet needs ~${needed} more SOL to launch.`);
                return { success: false, error: "Insufficient custodial balance" };
            }
        }
        try {
            const dbcClient = new DynamicBondingCurveClient(connection, 'confirmed');

            // Generate Keys
            const configKeypair = Keypair.generate();
            const baseMintKeypair = Keypair.generate();

            // Prepare Curve Params
            // Define sqrtPrices array for each curve segment checkpoint (Standard Linear/Exponential curve)
            const customPrices = [0.000000001, 0.00000000105, 0.000000002, 0.000001];
            const tokenBaseDecimal = TokenDecimal.SIX;
            const tokenQuoteDecimal = TokenDecimal.NINE;
            const sqrtPrices = createSqrtPrices(customPrices, tokenBaseDecimal, tokenQuoteDecimal);
            const liquidityWeights = [1, 1, 1]; // One less than segment count

            // 1 Billion Supply total, but 1% is sent to creator wallet on launch
            const totalTokenSupply = 1_000_000_000;
            const leftover = Math.floor(totalTokenSupply * 0.01);

            // 3. Dynamic Fee Calculation (1% Platform + X% Creator)
            // Example: If creator wants 5%, total fee should be 6% (600 bps).
            // Then the creator's share of THAT 6% is exactly (5/6) = 83.33%
            const platformFeeBps = 100; // 1%
            const creatorFeeBps = launchState.creatorFee * 100;
            const totalFeeBps = platformFeeBps + creatorFeeBps;

            // creatorTradingFeePercentage in Meteora SDK is a u16 of the percentage of the TOTAL fee pool they take (0-100).
            // With splits, it's 0: ALL fees route to the partner pot → the DFS
            // vault, which pays platform + collaborators + creator by share.
            // Without splits, the creator keeps their portion via the creator
            // pot and the treasury (feeClaimer) keeps the platform's.
            const hasSplits = !!(launchState.splits && launchState.splits.length > 0);
            const creatorTradingFeePercentage = hasSplits
                ? 0
                : totalFeeBps > 0 ? Math.floor((creatorFeeBps / totalFeeBps) * 100) : 0;

            const dynamicFeeConfigParams = {
                ...STANDARD_CURVE_CONFIG_PARAMS,
                fee: {
                    ...STANDARD_CURVE_CONFIG_PARAMS.fee,
                    dynamicFeeEnabled: false, // Prevents U24 overflow on variableFeeControl for fees > 2.7%
                    baseFeeParams: {
                        ...STANDARD_CURVE_CONFIG_PARAMS.fee.baseFeeParams,
                        feeSchedulerParam: {
                            ...STANDARD_CURVE_CONFIG_PARAMS.fee.baseFeeParams.feeSchedulerParam,
                            endingFeeBps: totalFeeBps // End at the exact combined fee (1% platform + creator choice)
                        }
                    },
                    creatorTradingFeePercentage: creatorTradingFeePercentage,
                },
                migration: {
                    ...STANDARD_CURVE_CONFIG_PARAMS.migration,
                    migrationFeeOption: MigrationFeeOption.Customizable,
                    migratedPoolFee: {
                        ...STANDARD_CURVE_CONFIG_PARAMS.migration.migratedPoolFee,
                        poolFeeBps: totalFeeBps
                    }
                }
            };

            // Initialize Curve Client
            const curveConfig = buildCurveWithCustomSqrtPrices({
                token: {
                    tokenType: TokenType.SPLToken,
                    tokenBaseDecimal: tokenBaseDecimal,
                    tokenQuoteDecimal: tokenQuoteDecimal,
                    tokenUpdateAuthority: TokenAuthorityOption.Immutable,
                    totalTokenSupply,
                    leftover,
                },
                ...dynamicFeeConfigParams,
                sqrtPrices,
                liquidityWeights,
            } as any);

            // Economic principal: the creator when buying someone's draft,
            // the connected wallet when self-launching.
            const creatorPubkey = opts?.creatorWallet ?? publicKey;

            // The platform's 1% claims through the PARTNER pot (feeClaimer).
            // Historically this was set to the creator, which routed the
            // platform fee to creators — the treasury is the partner.
            const treasuryPubkey = new PublicKey(getBoostTreasuryOwner());

            const preInstructions: TransactionInstruction[] = [];
            let feeClaimerPubkey = treasuryPubkey;

            if (launchState.splits && launchState.splits.length > 0) {
                const dfsClient = new DynamicFeeSharingClient(connection, 'confirmed');

                // 1. Resolve splits (DB check + Treasury fallback)
                const resolvedSplits = await resolveSplitsMutation.mutateAsync(launchState.splits);

                // 2. With splits, ALL fees flow into one DFS vault
                // (creatorTradingFeePercentage is forced to 0 below, so the
                // partner pot = 100% of fees) and every party — platform,
                // collaborators, creator — is a proportional vault share on a
                // 10,000 basis. platform = platformFeeBps/totalFeeBps; the
                // creator-fee portion divides among collabs + creator residual.
                const platformShare10k = Math.round((platformFeeBps / totalFeeBps) * 10_000);
                const creatorPortion10k = 10_000 - platformShare10k;
                const userShares = resolvedSplits.map(s => ({
                    address: new PublicKey(s.resolvedAddress),
                    share: Math.floor((s.percentage / 100) * creatorPortion10k)
                }));

                // Creator residual share of the creator portion
                const totalSplit = launchState.splits.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
                const creatorResidual = Math.max(0, 100 - totalSplit);
                if (creatorResidual > 0) {
                    userShares.push({
                        address: creatorPubkey,
                        share: Math.floor((creatorResidual / 100) * creatorPortion10k)
                    });
                }
                // Platform share — absorb rounding dust so shares sum to 10,000
                const assigned = userShares.reduce((acc, s) => acc + s.share, 0);
                userShares.unshift({
                    address: treasuryPubkey,
                    share: 10_000 - assigned
                });

                // 3. Generate create PDA instructions
                const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');

                const createVaultTx = await dfsClient.createFeeVaultPda({
                    base: baseMintKeypair.publicKey,
                    tokenMint: NATIVE_MINT,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    owner: creatorPubkey,
                    payer: publicKey,
                    userShare: userShares
                });

                preInstructions.push(...createVaultTx.instructions);

                // The fee vault PDA itself receives the fees
                feeClaimerPubkey = deriveFeeVaultPdaAddress(baseMintKeypair.publicKey, NATIVE_MINT);
            }

            // Calculate Buy Amount in Lamports
            const buyAmountLamports = new BN(launchState.buyAmount * 1_000_000_000);

            // Construct Transaction
            // We use `createConfigAndPoolWithFirstBuy` to get the instructions
            const { createConfigTx, createPoolWithFirstBuyTx } = await dbcClient.partner.createConfigAndPoolWithFirstBuy({
                config: configKeypair.publicKey,
                feeClaimer: feeClaimerPubkey,
                leftoverReceiver: creatorPubkey,
                payer: publicKey,
                quoteMint: NATIVE_MINT,
                ...curveConfig,
                preCreatePoolParam: {
                    name: metadata.name,
                    symbol: metadata.symbol,
                    uri: metadata.image, // Using image URL as URI for now, ideally upload full metadata JSON
                    poolCreator: creatorPubkey,
                    baseMint: baseMintKeypair.publicKey,
                },
                firstBuyParam: {
                    buyer: publicKey,
                    buyAmount: buyAmountLamports,
                    minimumAmountOut: new BN(0), // No slippage protection for first buy (lazy)
                    referralTokenAccount: null,
                }
            });

            // Split into two transactions due to Solana's 1232 byte transaction size limit
            const setupTx = new Transaction();
            if (preInstructions.length > 0) {
                setupTx.add(...preInstructions);
            }
            setupTx.add(createConfigTx);

            const launchTx = new Transaction();
            launchTx.add(createPoolWithFirstBuyTx);

            let finalSignature: string;

            // Use whichever wallet has sufficient funds (determined above).
            if (useCustodial) {
                // Custodial Wallet — fetch fresh blockhash per tx to avoid expiry
                toast.loading("Setting up Token Config (1/2)...", { id: "custodial-tx" });
                const { blockhash: bh1, lastValidBlockHeight: lbh1 } = await connection.getLatestBlockhash();
                setupTx.recentBlockhash = bh1;
                setupTx.feePayer = publicKey!;
                setupTx.partialSign(configKeypair);
                const base64Tx1 = setupTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
                const result1 = await signAndSendCustodialTx({ transaction: base64Tx1 });
                const confirm1 = await connection.confirmTransaction({ signature: result1.signature, blockhash: bh1, lastValidBlockHeight: lbh1 }, "confirmed");
                if (confirm1.value.err) throw new Error(`Config tx failed: ${JSON.stringify(confirm1.value.err)}`);
                console.log("[launchToken] config tx confirmed:", result1.signature);

                // Fresh blockhash for second tx — first confirmation may take ~5-10s
                toast.loading("Deploying Token Pool (2/2)...", { id: "custodial-tx" });
                const { blockhash: bh2, lastValidBlockHeight: lbh2 } = await connection.getLatestBlockhash();
                launchTx.recentBlockhash = bh2;
                launchTx.feePayer = publicKey!;
                launchTx.partialSign(baseMintKeypair);
                const base64Tx2 = launchTx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
                const result2 = await signAndSendCustodialTx({ transaction: base64Tx2 });
                const confirm2 = await connection.confirmTransaction({ signature: result2.signature, blockhash: bh2, lastValidBlockHeight: lbh2 }, "confirmed");
                if (confirm2.value.err) throw new Error(`Pool tx failed: ${JSON.stringify(confirm2.value.err)}`);

                finalSignature = result2.signature;
                toast.dismiss("custodial-tx");
            } else if (adapterPublicKey) {
                // Non-Custodial Wallet (Phantom, Solflare, WalletConnect)
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                setupTx.recentBlockhash = blockhash;
                setupTx.feePayer = publicKey!;
                launchTx.recentBlockhash = blockhash;
                launchTx.feePayer = publicKey!;

                if (signAllTransactions) {
                    toast.loading("Please approve transactions...", { id: "tx-status" });
                    setupTx.partialSign(configKeypair);
                    launchTx.partialSign(baseMintKeypair);
                    const signedTxs = await signAllTransactions([setupTx, launchTx]);

                    toast.loading("Confirming Token Setup (1/2)...", { id: "tx-status" });
                    const sig1 = await connection.sendRawTransaction(signedTxs[0].serialize());
                    const conf1 = await connection.confirmTransaction({ signature: sig1, blockhash, lastValidBlockHeight }, "confirmed");
                    if (conf1.value.err) throw new Error(`Config tx failed: ${JSON.stringify(conf1.value.err)}`);

                    toast.loading("Deploying Token Pool (2/2)...", { id: "tx-status" });
                    const sig2 = await connection.sendRawTransaction(signedTxs[1].serialize());
                    const conf2 = await connection.confirmTransaction({ signature: sig2, blockhash, lastValidBlockHeight }, "confirmed");
                    if (conf2.value.err) throw new Error(`Pool tx failed: ${JSON.stringify(conf2.value.err)}`);

                    finalSignature = sig2;
                    toast.dismiss("tx-status");
                } else {
                    // Fallback to sequential prompts
                    toast.loading("Sign Setup Transaction (1/2)...", { id: "tx-status" });
                    const sig1 = await sendTransaction(setupTx, connection, { signers: [configKeypair] });
                    toast.loading("Confirming Setup...", { id: "tx-status" });
                    await connection.confirmTransaction({ signature: sig1, blockhash, lastValidBlockHeight }, "confirmed");

                    toast.loading("Sign Launch Transaction (2/2)...", { id: "tx-status" });
                    const sig2 = await sendTransaction(launchTx, connection, { signers: [baseMintKeypair] });
                    toast.loading("Confirming Launch...", { id: "tx-status" });
                    await connection.confirmTransaction({ signature: sig2, blockhash, lastValidBlockHeight }, "confirmed");
                    finalSignature = sig2;
                    toast.dismiss("tx-status");
                }
            } else {
                throw new Error("No wallet connected");
            }

            // Derive Pool Address
            const poolAddress = deriveDbcPoolAddress(
                NATIVE_MINT,
                baseMintKeypair.publicKey,
                configKeypair.publicKey
            );

            console.log("Token Launch TX:", finalSignature);
            toast.success("Token launched successfully!");

            return {
                success: true,
                status: 'live',
                tokenAddress: baseMintKeypair.publicKey.toBase58(),
                poolAddress: poolAddress.toBase58(), // Using correct pool address
            };

        } catch (error) {
            console.error("Token launch failed:", error);
            toast.error("Failed to launch token. See console.");
            return { success: false, error };
        } finally {
            setIsLaunching(false);
            toast.dismiss("tx-status");
            toast.dismiss("custodial-tx");
        }
    };

    return {
        launchToken,
        isLaunching
    };
}
