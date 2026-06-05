// lib/solana/message.ts
// 📊 SIWS (Sign-In With Solana) Message Builder - EIP-4361 Standard
// 🔧 Modular | Type-Safe | Server/Client Compatible

export interface SiwsMessageParams {
    domain: string;
    address: string;
    uri: string;
    statement?: string;
    nonce: string;
    issuedAt: string;
    expirationTime?: string;
    resources?: string[];
}

/**
 * Build SIWS (Sign-In With Solana) message according to EIP-4361 spec
 * @param params - Message parameters from SIWS nonce response
 * @returns Formatted SIWS message string ready for signing
 */
export function buildSiwsMessage(params: SiwsMessageParams): string {
    const { domain, address, uri, statement, nonce, issuedAt, expirationTime, resources } = params;

    let message = `${domain} wants you to sign in with your Solana account:\n`;
    message += `${address}\n\n`;

    if (statement) {
        message += `${statement}\n\n`;
    }

    message += `URI: ${uri}\n`;
    message += `Nonce: ${nonce}\n`;
    message += `Issued At: ${issuedAt}`;

    if (expirationTime) {
        message += `\nExpiration Time: ${expirationTime}`;
    }

    if (resources && resources.length > 0) {
        message += `\nResources:`;
        resources.forEach(resource => {
            message += `\n- ${resource}`;
        });
    }

    return message;
}
