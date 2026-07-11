/**
 * Class representing an API-unavailable error.
 *
 * Raised by the axios interceptor when the API cannot be reached at all, so the
 * UI can distinguish a network outage from a regular HTTP error response.
 */
export class ApiUnavailableError extends Error {
  constructor() {
    super('API server is not available. Try again in a moment.');
    this.name = 'ApiUnavailableError';
  }
}
