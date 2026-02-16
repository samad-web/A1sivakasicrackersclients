import { cn } from '@/lib/utils';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface StatusBadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  muted: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ variant, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
