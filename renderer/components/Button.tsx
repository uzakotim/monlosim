import React from 'react'

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'outline' | 'primary' | 'ghost';
  disabled?: boolean;
}

function Button({ onClick, children, className = '', variant = 'outline', disabled = false }: ButtonProps) {
  const baseClasses = 'cursor-pointer py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-150 inline-flex items-center justify-center';
  
  const variantClasses = {
    outline: 'bg-white border border-slate-700/80 hover:border-blue-600 hover:text-blue-600 text-slate-800 shadow-2xs hover:shadow-xs active:scale-[0.99]',
    primary: 'bg-slate-800 hover:bg-slate-900 text-white shadow-xs hover:shadow-sm active:scale-[0.99]',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 active:scale-[0.99]',
  }[variant];

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseClasses} ${variantClasses} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

export default Button;