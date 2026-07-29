/**
 * Formats a byte count like `1.4 MB` (em dash when unknown).
 **/
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
 * Formats an ISO date (em dash when unknown).
 **/
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
 * Formats an ISO date + time (em dash when unknown).
 **/
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
 * Formats a time-remaining like `12s left` / `2m 5s left` (empty when unknown).
 **/
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
