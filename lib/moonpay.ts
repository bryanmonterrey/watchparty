import crypto from 'crypto';

/**
 * Signs a MoonPay Buy URL to prevent tampering and enable pre-filled parameters.
 * @param url The base Buy URL with all query parameters
 * @param secretKey Your MoonPay Secret API Key
 * @returns The signed URL with the signature appended
 */
export function signMoonPayUrl(url: string, secretKey: string): string {
    const urlObj = new URL(url);
    const trimmedSecret = secretKey.trim();

    // MoonPay standard: sign the FULL search string including the leading '?'
    // and DO NOT sort unless explicitly required (standard examples don't sort)
    const signingMessage = urlObj.search;

    console.log(`[MoonPay] Signing string: "${signingMessage}"`);

    const hmac = crypto.createHmac('sha256', trimmedSecret);
    hmac.update(signingMessage);
    const signature = hmac.digest('base64');

    // Append signature (manually handle to ensure perfect matching with common patterns)
    return `${url}&signature=${encodeURIComponent(signature)}`;
}

/**
 * Constructs a base MoonPay Buy URL for Solana.
 */
export function constructMoonPayBuyUrl(
    apiKey: string,
    walletAddress: string,
    baseCurrencyAmount?: number
): string {
    // Note: We use a fixed order here just in case the server is sensitive to it
    const params = [
        `apiKey=${encodeURIComponent(apiKey.trim())}`,
        `baseCurrencyCode=usd`,
        `currencyCode=sol`,
        `walletAddress=${encodeURIComponent(walletAddress.trim())}`
    ];

    if (baseCurrencyAmount) {
        params.push(`baseCurrencyAmount=${baseCurrencyAmount}`);
    }

    return `https://buy.moonpay.com?${params.join('&')}`;
}
