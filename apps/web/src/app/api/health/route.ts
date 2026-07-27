import { NextResponse } from 'next/server';

/**
 * Health endpoint (`GET /api/health`) for Coolify container healthchecks. Confirms
 * the Next.js server is up and serving — a lightweight, public, uncached 200 (no
 * auth, no upstream API call, so the app's own liveness is checked in isolation).
 */
export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
