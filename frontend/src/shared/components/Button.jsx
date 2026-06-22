// src/shared/components/Button.jsx
import React from 'react';
import { RefreshCw } from 'lucide-react';

export default function Button({
  children,
  variant = 'primary', // 'primary' (mint), 'secondary' (yellow), 'outline' (white/cream), 'danger' (red), 'ghost' (flat/hover), 'purple' (brand purple)
  size = 'md', // 'sm', 'md', 'lg'
  type = 'button',
  disabled = false,
  loading = false,
  onClick,
  icon: Icon,
  className = '',
  ...props
}) {
  // Base classes for consistent neobrutalist animations and feel
  const baseClasses = 'inline-flex items-center justify-center font-bold tracking-wide transition-all select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

  // Variant mappings to support the brand palette cleanly
  const variants = {
    // Primary brand mint button with black border and offset drop shadow
    primary: 'bg-brand-mint text-brand-plum border-2 border-slate-950 shadow-[3px_3px_0_#151214] hover:bg-brand-mint-hover focus:ring-brand-mint/50',
    
    // Secondary brand yellow button with black border and offset drop shadow
    secondary: 'bg-brand-yellow text-brand-plum border-2 border-slate-950 shadow-[3px_3px_0_#151214] hover:bg-brand-yellow-hover focus:ring-brand-yellow/50',
    
    // Outline button (warm white/cream) with border and drop shadow
    outline: 'bg-white text-brand-plum border-2 border-slate-950 shadow-[3px_3px_0_#151214] hover:bg-slate-50 focus:ring-slate-950/20',
    
    // Destructive actions (peach-red transparent pill or outline red)
    danger: 'bg-red-500/10 text-red-500 border-2 border-red-500/30 hover:bg-red-500/20 focus:ring-red-500/30 active:border-red-500',
    
    // Brand purple button
    purple: 'bg-brand-purple/10 text-brand-purple border border-brand-purple/35 hover:bg-brand-purple/20 focus:ring-brand-purple/30',
    
    // Flat / Inactive tab styles
    ghost: 'text-slate-400 hover:text-slate-800 hover:bg-slate-950/5 focus:ring-slate-400/20 border border-transparent',
  };

  // Size styling matching dynamic viewports
  const sizes = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 rounded-full',
    md: 'text-xs md:text-sm px-4 py-2.5 gap-2 rounded-full',
    lg: 'text-sm md:text-base px-5 py-3 gap-2 rounded-full',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
      {!loading && Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      {children}
    </button>
  );
}
