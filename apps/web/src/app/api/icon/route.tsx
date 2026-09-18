import type { NextRequest } from 'next/server';

import { renderAppIcon } from '@/common/utils/app-icon.functions';

/** The sizes `manifest.ts` asks for; anything else falls back to the smaller one. */
const SIZES = [192, 512];

/**
 * Manifest icons (`GET /api/icon?size=192`) — maskable, so they stay full-bleed squares.
 **/
export function GET(request: NextRequest): Response {
  const requested = Number(request.nextUrl.searchParams.get('size'));
  const size = SIZES.includes(requested) ? requested : SIZES[0];

  return renderAppIcon(size);
}
