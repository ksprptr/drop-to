'use client';

import Icon from '@/components/common/Icon';

interface Props {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'primary';
}

/**
 * One row of a popup menu.
 **/
export default function MenuItem({ icon, label, onClick, tone = 'default' }: Props) {
  const toneClass =
    tone === 'danger'
      ? 'text-red-500 hover:bg-red-500/10'
      : tone === 'primary'
        ? 'text-primary-600 hover:bg-primary-600/10'
        : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700';

  return (
    <button
      type='button'
      role='menuitem'
      onClick={onClick}
      className={`flex items-center gap-x-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${toneClass}`}>
      <Icon icon={icon} className='h-4 w-4 shrink-0' />
      {label}
    </button>
  );
}
