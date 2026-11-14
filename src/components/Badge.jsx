import React from 'react';
import { cn } from '../lib/utils';

export function Badge({ className, variant = 'default', children, ...props }) {
  const variants = {
    default: 'bg-[#1C1C24] text-[#F4F1EA] border border-white/10',
    primary: 'bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]/30',
    success: 'bg-[#2EC4B6]/20 text-[#2EC4B6] border border-[#2EC4B6]/30',
    destructive: 'bg-[#FF5A5F]/20 text-[#FF5A5F] border border-[#FF5A5F]/30',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;

