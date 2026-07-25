import { atomWithStorage } from "jotai/utils";

// Types
export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "CNY" | "KRW" | "RUB" | "INR" | "BRL";
export type LanguageCode = "en" | "es" | "fr" | "de" | "zh" | "ja" | "ko" | "ru";

// Atoms with localStorage persistence
export const currencyAtom = atomWithStorage<CurrencyCode>("wallet-currency", "USD");
export const languageAtom = atomWithStorage<LanguageCode>("wallet-language", "en");

// Balance Settings
export const hideSmallBalancesAtom = atomWithStorage("wallet-hide-small-balances", true);
export const hideUnknownTokensAtom = atomWithStorage("wallet-hide-unknown-tokens", true);
export const hideReportedActivityAtom = atomWithStorage("wallet-hide-reported-activity", true);

// Analytics
export const allowAnalyticsAtom = atomWithStorage("wallet-allow-analytics", true);

