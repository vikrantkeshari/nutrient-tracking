import { createClient } from '@supabase/supabase-js';

// Retrieve keys from environment variables.
// Fallback placeholders prevent build-time crashes if keys are not defined yet.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder-url-please-replace.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key-please-replace';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Checks if Supabase connection credentials have been properly configured by the user.
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return (
    import.meta.env.VITE_SUPABASE_URL && 
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')
  );
}

/**
 * Cleanup task that automatically purges local images older than 90 days.
 * Keeps text macro logs intact while cleaning up storage space.
 * 
 * @param {string} userId - The authenticated user's ID
 */
export async function runStoragePurge(userId) {
  if (!isSupabaseConfigured()) return;
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dateLimitIso = ninetyDaysAgo.toISOString();

    // Query logs older than 90 days that still have an image thumbnail path
    const { data: logsToPurge, error } = await supabase
      .from('macro_logs')
      .select('id, thumbnail_path')
      .eq('user_id', userId)
      .lt('created_at', dateLimitIso)
      .not('thumbnail_path', 'is', null);

    if (error) throw error;
    if (!logsToPurge || logsToPurge.length === 0) {
      console.log("Image retention cleanup: No older thumbnails found to purge.");
      return;
    }

    console.log(`Image retention cleanup: Purging ${logsToPurge.length} thumbnails older than 90 days...`);

    for (const log of logsToPurge) {
      // 1. Delete physical file from Supabase Storage
      const { error: storageErr } = await supabase.storage
        .from('thumbnails')
        .remove([log.thumbnail_path]);

      if (storageErr) {
        console.error(`Failed to delete storage file ${log.thumbnail_path}:`, storageErr);
      }

      // 2. Update database record to clear the thumbnail_path reference
      const { error: dbErr } = await supabase
        .from('macro_logs')
        .update({ thumbnail_path: null })
        .eq('id', log.id);

      if (dbErr) {
        console.error(`Failed to clear thumbnail reference in database for log ${log.id}:`, dbErr);
      }
    }
    console.log("Image retention cleanup: Complete.");
  } catch (err) {
    console.error("Storage purge runner failed:", err);
  }
}
