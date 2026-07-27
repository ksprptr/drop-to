'use client';

import {
  Archive,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Cloud,
  CloudUpload,
  Columns2,
  Database,
  Download,
  EllipsisVertical,
  ExternalLink,
  File,
  FileText,
  Film,
  Folder,
  FolderDown,
  FolderOpen,
  FolderPlus,
  House,
  Image,
  Link,
  LogOut,
  type LucideIcon,
  Moon,
  MousePointerClick,
  Move,
  Music,
  Pencil,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';

import type { ExtendedProps } from '@/common/types/global.types';

interface Props extends ExtendedProps {
  icon: string;
  /** Ignored — lucide has a single style. */
  type?: 'solid' | 'outlined';
  onClick?: () => void;
}

/** App icon names (Heroicon-style) → lucide icons. */
const ICONS: Record<string, LucideIcon> = {
  ArchiveBox: Archive,
  ArrowDownTray: Download,
  ArrowRightStartOnRectangle: LogOut,
  ArrowTopRightOnSquare: ExternalLink,
  ArrowUpTray: Upload,
  ArrowsPointingIn: Move,
  Check: Check,
  CheckBadge: BadgeCheck,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronUpDown: ChevronsUpDown,
  CircleStack: Database,
  Cloud,
  CloudArrowUp: CloudUpload,
  CursorArrowRays: MousePointerClick,
  Document: File,
  DocumentText: FileText,
  EllipsisVertical,
  ExclamationTriangle: TriangleAlert,
  Film,
  Folder,
  FolderArrowDown: FolderDown,
  FolderOpen,
  FolderPlus,
  Home: House,
  LinkIcon: Link,
  Moon,
  MusicalNote: Music,
  Pencil,
  Photo: Image,
  Sun,
  Trash: Trash2,
  ViewColumns: Columns2,
  XMark: X,
};

export default function Icon({ icon, className, onClick }: Props) {
  const Component = ICONS[icon];

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
