interface MetadataConfig {
  title: string;
  shortTitle: string;
  /** Appended to the site title (homepage + link previews). */
  tagline: string;
  description: string;
  keywords: string[];
  colors: {
    background: string;
    theme: string;
  };
}

// Static site metadata for the layout, manifest and robots.
export const metadataConfig: MetadataConfig = {
  title: 'DropTo',
  shortTitle: 'DropTo',
  tagline: 'Self-hosted file uploader',
  description:
    'Self-hosted file uploader that streams your uploads straight into your own storage — Google Drive or S3-compatible buckets — from a fast, Finder-like workspace.',
  keywords: [
    'DropTo',
    'self-hosted file uploader',
    'file uploader',
    'file manager',
    'file browser',
    'drag and drop upload',
    'folder upload',
    'upload to Google Drive',
    'Google Drive uploader',
    'S3 upload',
    'S3-compatible storage',
    'AWS S3',
    'MinIO',
    'Cloudflare R2',
    'cloud storage',
    'self-hosted',
    'open source',
  ],
  colors: {
    background: '#fafafa',
    theme: '#16a34a',
  },
};
