// A document is a link to a file kept wherever the committee already stores
// its files (Google Drive, OneDrive, SharePoint, Dropbox...), never the file
// itself. Any secure web address is accepted; this matches the check on
// documents.url and library_items.url, so the form can reject a bad link
// before it reaches the database.
const FILE_LINK = /^https:\/\/[^\s/]+\.[^\s/]+/i;

export function isFileLink(url: string): boolean {
  return FILE_LINK.test(url.trim());
}
