import { ImageResponse } from 'next/og';

import { metadataConfig } from '@/configs/seo/metadata.config';

const wordmark = metadataConfig.title;
const subtitle = metadataConfig.tagline;

/**
 * Loads a Poppins weight from Google Fonts as TTF/OTF data for Satori (`text` subsets it).
 **/
async function loadPoppins(weight: number, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Poppins:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await fetch(url).then((res) => res.text());
  const resource = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);

  if (!resource) {
    throw new Error('Failed to resolve the Poppins font.');
  }

  return fetch(resource[1]).then((res) => res.arrayBuffer());
}

/**
 * OG image (`GET /api/og`) — the badge, the wordmark and the tagline on a light zinc background.
 **/
export async function GET() {
  const poppins = await loadPoppins(600, `${wordmark}${subtitle}`);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Poppins',
        backgroundColor: '#fafafa',
      }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            width: 168,
            height: 168,
            borderRadius: 42,
            backgroundColor: '#16a34a',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 24px 70px rgba(22,163,74,0.4)',
          }}>
          <svg
            width='96'
            height='96'
            viewBox='0 0 24 24'
            fill='none'
            stroke='white'
            strokeWidth={2}
            strokeLinecap='round'
            strokeLinejoin='round'>
            <path d='M12 13v8' />
            <path d='m8 17 4-4 4 4' />
            <path d='M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29' />
          </svg>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 96,
            fontWeight: 600,
            letterSpacing: -2,
            color: '#18181b',
          }}>
          {wordmark}
        </div>

        <div style={{ display: 'flex', marginTop: 12, fontSize: 34, color: '#52525b' }}>
          {subtitle}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [{ name: 'Poppins', data: poppins, weight: 600, style: 'normal' }],
      headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
    },
  );
}
