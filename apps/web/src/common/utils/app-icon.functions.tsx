import { ImageResponse } from 'next/og';

import { appServerConfig } from '@/configs/app/app.server-config';

/** The lucide `cloud-upload` glyph — the same mark the sidebar and the login card wear. */
const GLYPH = ['M12 13v8', 'm8 17 4-4 4 4', 'M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29'];

interface AppIconOptions {
  /** Corner radius in px. Omit for the full-bleed square a maskable icon needs. */
  radius?: number;
}

/**
 * Renders the app badge (cloud-upload glyph on the accent) at `size` px — favicon, apple icon and manifest share it.
 **/
export function renderAppIcon(size: number, { radius }: AppIconOptions = {}): ImageResponse {
  const glyphSize = Math.round(size * 0.62);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius ?? 0,
        backgroundColor: appServerConfig.primaryColor.hex,
      }}>
      <svg
        width={glyphSize}
        height={glyphSize}
        viewBox='0 0 24 24'
        fill='none'
        stroke={appServerConfig.primaryColor.foreground}
        strokeWidth={2}
        strokeLinecap='round'
        strokeLinejoin='round'>
        {GLYPH.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>,
    { width: size, height: size },
  );
}
