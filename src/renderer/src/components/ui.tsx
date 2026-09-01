import React from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'

/** Shared class strings — every colour is a scheme token (see index.css @theme). */
export const inputClass =
  'w-full px-2 py-1.5 text-sm rounded-md border border-line bg-surface text-fg placeholder:text-muted focus:outline-hidden focus:border-accent disabled:opacity-60'
export const primaryBtn =
  'inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
export const subtleBtn =
  'inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium rounded-md border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
export const dangerBtn =
  'inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium rounded-md border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
export const iconBtn = 'p-1.5 rounded-md text-muted hover:text-accent hover:bg-accent/10 disabled:opacity-40 transition-colors'

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-xs text-muted mb-1">
      {label}
      {hint && <span className="ml-1 text-muted/70">({hint})</span>}
    </span>
    {children}
  </label>
)

export const Spinner: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => <Loader2 className={`${className} animate-spin`} />

export const Badge: React.FC<{ children: React.ReactNode; tone?: 'accent' | 'muted' | 'warn' }> = ({ children, tone = 'accent' }) => {
  const tones = {
    accent: 'bg-accent/10 text-accent border-accent/30',
    muted: 'bg-surface-3 text-muted border-line',
    warn: 'bg-warn/10 text-warn border-warn/30'
  }
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${tones[tone]}`}>{children}</span>
}

export const Strip: React.FC<{
  tone: 'ok' | 'warn' | 'danger'
  children: React.ReactNode
  action?: React.ReactNode
  onDismiss?: () => void
}> = ({ tone, children, action, onDismiss }) => {
  const tones = {
    ok: 'border-ok/40 bg-ok/10 text-ok',
    warn: 'border-warn/40 bg-warn/10 text-warn',
    danger: 'border-danger/40 bg-danger/10 text-danger'
  }
  const Icon = tone === 'ok' ? Check : AlertTriangle
  return (
    <div role={tone === 'ok' ? 'status' : 'alert'} className={`p-3 border text-xs rounded-md flex items-center justify-between gap-3 ${tones[tone]}`}>
      <span className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="min-w-0">{children}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        {action}
        {onDismiss && (
          <button onClick={onDismiss} className="p-0.5 rounded hover:bg-surface-3/60" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    </div>
  )
}

/** `<code>` that inherits the scheme instead of Tailwind's default. */
export const Code: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <code className={`font-mono text-[0.92em] px-1 py-px rounded bg-surface-3 text-fg-2 ${className}`}>{children}</code>
)
