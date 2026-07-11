/**
 * Function to format a byte count into a human-readable string.
 * @param bytes - The size in bytes (or null)
 * @returns A formatted size like `1.4 MB`, or an em dash when unknown
 */
export const formatBytes = (bytes: number | null): string => {
  if (bytes === null || Number.isNaN(bytes)) {
    return '—';
  }

  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);

  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
};

/**
 * Function to format an ISO date string for display.
 * @param iso - The ISO date string (or null)
 * @returns A localized date, or an em dash when unknown
 */
export const formatDate = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }

  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
};

/**
 * Function to format an ISO date string with the time for display.
 * @param iso - The ISO date string (or null)
 * @returns A localized date and time, or an em dash when unknown
 */
export const formatDateTime = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }

  return new Date(iso).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Function to format an estimated time remaining into a short string.
 * @param seconds - The seconds remaining (or null when unknown)
 * @returns A string like `12s left` or `2m 5s left`, or empty when unknown
 */
export const formatEta = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  if (seconds < 60) {
    return `${Math.ceil(seconds)}s left`;
  }

  const minutes = Math.floor(seconds / 60);
  const rest = Math.ceil(seconds % 60);

  return rest === 0 ? `${minutes}m left` : `${minutes}m ${rest}s left`;
};
