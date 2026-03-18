'use client';

import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarSectionProps {
  id: string;
  name: string;
  icon?: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}

export function SidebarSection({
  name,
  icon,
  collapsed,
  onToggle,
  children,
  actions,
  dragHandleProps,
  isDragging,
}: SidebarSectionProps) {
  return (
    <div className={cn('mb-1', isDragging && 'opacity-50')}>
      <div className="mb-1 flex w-full items-center justify-between px-1 py-2 hover:bg-sidebar-hover rounded-md transition-colors group">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center gap-1 px-2"
        >
          {dragHandleProps && (
            <span
              {...dragHandleProps}
              className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity mr-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="size-3 text-sidebar-section-text" />
            </span>
          )}
          {collapsed ? (
            <ChevronRight className="size-3 text-sidebar-section-text" />
          ) : (
            <ChevronDown className="size-3 text-sidebar-section-text" />
          )}
          {icon}
          <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-section-text">
            {name}
          </span>
        </button>
        {actions && (
          <div className="flex items-center gap-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {actions}
          </div>
        )}
      </div>
      {!collapsed && children}
    </div>
  );
}
