import { renderAppIcon } from '@/common/utils/app-icon.functions';

/** The accent color comes from the runtime env, so this must not be baked at build time. */
export const dynamic = 'force-dynamic';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/**
 * Apple touch icon — full-bleed, since iOS rounds and masks it itself.
 **/
export default function AppleIcon() {
  return renderAppIcon(size.width);
}
