import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(url, key);

export function isSupabaseConfigured() {
  return (
    !!import.meta.env.VITE_SUPABASE_URL &&
    !!import.meta.env.VITE_SUPABASE_ANON_KEY &&
    !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')
  );
}

// Bucket is private — reads require a signed URL (60 min).
export async function signedThumbUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('thumbnails')
    .createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

// NOTE: photo retention is now a server-side pg_cron job (30 days).
// The old client-side runStoragePurge() is gone on purpose.
