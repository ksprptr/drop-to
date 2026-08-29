import { appServerConfig } from '@/configs/app/app.server-config';

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

// Site metadata for the layout, manifest, robots and the OG image (name from the env).
export const metadataConfig: MetadataConfig = {
  title: appServerConfig.name,
  shortTitle: appServerConfig.name,
  tagline: 'Self-hosted file uploader',
  description:
    'Self-hosted file uploader that streams your uploads straight into your own storage — Google Drive or S3-compatible buckets — from a fast, Finder-like workspace.',
  keywords: [
    appServerConfig.name,
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
