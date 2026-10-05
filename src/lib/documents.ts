// Matches the check constraint on documents.url in the baseline migration in supabase/migrations --
// kept in sync so the form can reject a bad link before hitting the database.
const GOOGLE_DRIVE_URL = /^https:\/\/(drive|docs)\.google\.com\//i;

export function isGoogleDriveUrl(url: string): boolean {
  return GOOGLE_DRIVE_URL.test(url.trim());
}
