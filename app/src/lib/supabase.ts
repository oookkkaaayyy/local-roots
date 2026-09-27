import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Supabase publishable keys are intentionally safe for browser/source-code use.
// Environment variables can override these defaults for forks or future migration.
const defaultUrl = 'https://wtymjxscneufjlkkywyg.supabase.co';
const defaultPublishableKey = 'sb_publishable_rimiZU1rSfq1nCEOUBw3ew_1j_GuZUx';
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? defaultUrl;
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? defaultPublishableKey;

export const configReady = Boolean(supabaseUrl && publishableKey);
export const functionsBase = `${supabaseUrl}/functions/v1`;
export const publicKey = publishableKey;

export const supabase: SupabaseClient = createClient(supabaseUrl, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type FunctionAuth = string | { accessToken?: string; deviceToken?: string };

export async function callFunction<T>(
  slug: string,
  body: Record<string, unknown>,
  auth?: FunctionAuth,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: publicKey,
  };
  if (typeof auth === 'string' && auth) headers.Authorization = `Bearer ${auth}`;
  if (typeof auth === 'object' && auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  if (typeof auth === 'object' && auth?.deviceToken) headers['x-du-device-token'] = auth.deviceToken;
  const response = await fetch(`${functionsBase}/${slug}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.detail === 'string' ? payload.detail : payload?.error ?? `Request failed (${response.status})`);
  }
  return payload as T;
}
