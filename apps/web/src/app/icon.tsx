import { renderAppIcon } from '@/common/utils/app-icon.functions';

/** The accent color comes from the runtime env, so this must not be baked at build time. */
export const dynamic = 'force-dynamic';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

/**
 * Browser-tab favicon, drawn in the instance's accent color.
 **/
export default function Icon() {
  return renderAppIcon(size.width, { radius: 14 });
}
