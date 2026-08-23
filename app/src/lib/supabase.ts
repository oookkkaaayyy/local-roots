import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const configReady = Boolean(supabaseUrl && publishableKey);
export const functionsBase = supabaseUrl ? `${supabaseUrl}/functions/v1` : '';
export const publicKey = publishableKey ?? '';

export const supabase: SupabaseClient | null = configReady
  ? createClient(supabaseUrl!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export async function callFunction<T>(
  slug: string,
  body: Record<string, unknown>,
  accessToken?: string,
): Promise<T> {
  if (!functionsBase) throw new Error('Supabase configuration is missing.');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: publicKey,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
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
