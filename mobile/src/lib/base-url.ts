import Constants from 'expo-constants';

/**
 * Where the Next.js app (auth + tRPC API) lives.
 *
 * Dev: derive the host from the Expo dev server's hostUri so it works on
 * simulators AND physical devices on the same LAN, then point at the
 * Next.js dev server on :3001 (watchparty's dev port).
 * Prod builds (no hostUri): the deployed web origin.
 */
export function getBaseUrl(): string {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:3001`;
  return 'https://watchparty.xyz';
}
