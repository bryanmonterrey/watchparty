import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function ellipsify(str = '', len = 4) {
  if (str.length > 30) {
    return str.substring(0, len) + '..' + str.substring(str.length - len, str.length)
  }
  return str
}

export const shortenWalletAddress = (walletAddress: string | null | undefined, len = 5) => {
  if (!walletAddress) return "";
  return walletAddress.slice(0, len) + "...." + walletAddress.slice(-len);
};

export const formatNumber = (
  num: number,
  options: Intl.NumberFormatOptions = {},
): string => {
  if (num === null || num === undefined) return "0";

  const absNum = Math.abs(num);
  let decimals = 2;

  if (absNum < 1) {
    decimals = Math.max(2, Math.min(20, Math.ceil(-Math.log10(absNum)) + 2));
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
    ...options,
  }).format(num);
};

export const formatUsd = (num: number): string => {
  return formatNumber(num, { style: "currency", currency: "USD" });
};

export const formatNumberGrouped = (
  value: number,
  expThreshold: number = 0.0001,
  expPrecision: number = 1,
) => {
  if (value === 0) return "0";

  if (Math.abs(value) < expThreshold) {
    return value.toExponential(expPrecision);
  }

  if (Number.isInteger(value)) {
    return new Intl.NumberFormat("en-US", { useGrouping: true }).format(value);
  }

  const valueParts = value.toString().split(".");
  const decimalPart = valueParts[1] ?? "";
  const leadingZeros = decimalPart.match(/^0*/)?.[0].length ?? 0;
  const minimumFractionDigits = leadingZeros > 0 ? leadingZeros + 1 : 2;

  return new Intl.NumberFormat("en-US", {
    useGrouping: true,
    minimumFractionDigits: minimumFractionDigits,
    maximumFractionDigits: Math.max(2, minimumFractionDigits),
  }).format(value);
};

// PublicKey helpers (toPublicKey) moved to lib/solana/pubkey.ts so this
// universally-imported module never pulls in @solana/web3.js.