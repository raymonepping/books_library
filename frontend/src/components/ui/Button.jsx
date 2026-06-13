const VARIANTS = {
  primary:  'bg-amber text-noir hover:bg-amber-dim font-semibold',
  danger:   'bg-blood text-ice hover:bg-blood-dim',
  ghost:    'bg-transparent text-ice/70 hover:text-ice hover:bg-smoke-light',
  outline:  'border border-smoke-light text-ice/80 hover:border-amber hover:text-amber',
  steel:    'bg-steel text-ice hover:bg-steel-dim',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      disabled={disabled}
      className={[
        'inline-flex items-center gap-2 rounded transition-colors duration-150 cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}
