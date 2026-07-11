'use client';

import * as iconsOutlined from '@heroicons/react/24/outline';
import * as iconsSolid from '@heroicons/react/24/solid';
import type { ComponentType, SVGProps } from 'react';

import type { ExtendedProps } from '@/common/types/global.types';

interface Props extends ExtendedProps {
  icon: string;
  type?: 'solid' | 'outlined';
  onClick?: () => void;
}

type HeroIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Component rendering a Heroicon by name (e.g. `Folder`, `ArrowDownTray`).
 */
export default function Icon({ icon, className, onClick, type = 'outlined' }: Props) {
  const iconSet = type === 'outlined' ? iconsOutlined : iconsSolid;
  const Component = (iconSet as Record<string, HeroIcon>)[`${icon}Icon`];

  if (!Component) {
    return null;
  }

  return (
    <Component
      {...(onClick ? { onClick } : {})}
      className={`h-4 w-4 ${className ?? ''} ${onClick ? 'cursor-pointer' : ''}`}
    />
  );
}
