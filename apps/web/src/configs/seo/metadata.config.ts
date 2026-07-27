interface MetadataConfig {
  title: string;
  shortTitle: string;
  /** One-line descriptor appended to the site title (homepage + link previews). */
  tagline: string;
  description: string;
  keywords: string[];
  colors: {
    background: string;
    theme: string;
  };
}

/**
 * Static site metadata, consumed by the root layout, manifest and robots. DropTo
 * is a private, self-hosted app, so it is deliberately kept out of search indexes
 * (see `app/robots.ts`) — the description/keywords are for link previews and the
 * installed PWA, not for SEO ranking.
 */
export const metadataConfig: MetadataConfig = {
  title: 'DropTo',
  shortTitle: 'DropTo',
  tagline: 'Self-hosted file uploader',
  description:
    'Self-hosted file uploader that streams your uploads straight into your own storage — Google Drive or S3-compatible buckets — from a fast, Finder-like workspace.',
  keywords: [
    // Brand
    'DropTo',
    // Purpose
    'self-hosted file uploader',
    'file uploader',
    'file manager',
    'file browser',
    'drag and drop upload',
    'folder upload',
    // Storage backends
    'upload to Google Drive',
    'Google Drive uploader',
    'S3 upload',
    'S3-compatible storage',
    'AWS S3',
    'MinIO',
    'Cloudflare R2',
    'cloud storage',
    // Deployment
    'self-hosted',
    'open source',
  ],
  colors: {
    background: '#fafafa',
    theme: '#16a34a',
  },
};
