/** Raised when the API can't be reached at all (network outage vs. HTTP error). */
export class ApiUnavailableError extends Error {
  constructor() {
    super('API server is not available. Try again in a moment.');
    this.name = 'ApiUnavailableError';
  }
}
