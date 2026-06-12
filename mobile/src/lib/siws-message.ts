// SIWS (Sign-In With Solana) message builder — EIP-4361 style. Ported
// verbatim from lib/chains/solana/message.ts: the better-auth-siws plugin
// verifies the signature over this EXACT string, so the two must not drift.

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
    resources.forEach((resource) => {
      message += `\n- ${resource}`;
    });
  }

  return message;
}
