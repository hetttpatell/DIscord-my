import React from 'react';
import { cn } from '../lib/utils';

export const Button = React.forwardRef(
  (
    {
      className,
      variant = 'primary',
      size = 'default',
      disabled = false,
      type = 'button',
      children,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary:
        'bg-[#FF9F1C] text-[#0B0B10] font-semibold hover:bg-[#ffb042] active:scale-[0.98] shadow-lg shadow-[#FF9F1C]/20',
      secondary:
        'bg-[#1C1C24] text-[#F4F1EA] hover:bg-[#252530] border border-white/10 active:scale-[0.98]',
      outline:
        'bg-transparent border border-white/20 text-[#F4F1EA] hover:bg-white/5 active:scale-[0.98]',
      ghost:
        'bg-transparent text-[#9A978F] hover:text-[#F4F1EA] hover:bg-white/5',
      destructive:
        'bg-[#FF5A5F] text-white font-semibold hover:bg-[#ff7074] active:scale-[0.98]',
    };

    const sizes = {
      default: 'h-11 px-5 py-2.5 text-sm min-h-[44px]',
      sm: 'h-9 px-3 text-xs min-h-[36px]',
      lg: 'h-13 px-8 text-base min-h-[48px]',
      icon: 'h-11 w-11 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-xl transition-all duration-150 select-none cursor-pointer disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF9F1C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B10]',
          variants[variant] || variants.primary,
          sizes[size] || sizes.default,
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;

