import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * PUT a local file to a Supabase signed upload URL (what supabase-js
 * uploadToSignedUrl does, without the SDK). Pair with
 * upload.getPresignedUrl on the server.
 */
export async function putToSignedUrl(signedUrl: string, uri: string, mime: string): Promise<void> {
  const res = await FileSystem.uploadAsync(signedUrl, uri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': mime, 'x-upsert': 'false' },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (${res.status}).`);
  }
}

export function storagePublicUrl(bucket: string, path: string): string {
  const supabaseUrl = (Constants.expoConfig?.extra as { supabaseUrl?: string })?.supabaseUrl;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
