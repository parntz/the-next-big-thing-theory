/**
 * Format a timestamp to ISO string
 * SQLite stores timestamps as strings in "YYYY-MM-DD HH:MM:SS" format
 * or as numeric seconds since epoch
 */
export function formatDate(timestamp: number | string | Date): string {
  // If it's already a valid Date object
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  
  // If it's a number, it's likely a Unix timestamp
  if (typeof timestamp === 'number') {
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    // If timestamp is in seconds, convert to milliseconds
    const dateWithMs = new Date(timestamp * 1000);
    if (!isNaN(dateWithMs.getTime())) {
      return dateWithMs.toISOString();
    }
  }
  
  // If it's a string, try to parse it
  if (typeof timestamp === 'string') {
    // Try parsing as ISO format first
    const isoDate = new Date(timestamp);
    if (!isNaN(isoDate.getTime())) {
      return isoDate.toISOString();
    }
    
    // Try parsing as SQLite format "YYYY-MM-DD HH:MM:SS"
    const sqliteDate = timestamp.replace(' ', 'T');
    const parsedDate = new Date(sqliteDate + 'Z');
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
  }
  
  // Fallback to current time
  return new Date().toISOString();
}