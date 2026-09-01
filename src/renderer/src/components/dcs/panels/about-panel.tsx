import React from 'react'
import { BookOpen, Globe, SquareTerminal } from 'lucide-react'

type Link = { label: string; href: string; icon: React.ComponentType<{ className?: string }>; note?: string }

/** lucide 1.x dropped brand icons; GitHub's mark inlined (same approach as laradcs). */
const GithubIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.05.78 2.12v3.15c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
  </svg>
)

const links: Link[] = [
  { label: 'sshm-desktop', href: 'https://github.com/markc/sshm-desktop', icon: GithubIcon, note: 'this app' },
  { label: 'sshm', href: 'https://github.com/markc/sshm', icon: SquareTerminal, note: 'the shell twin' },
  { label: 'dcs.spa', href: 'https://dcs.spa', icon: Globe, note: 'Dual Carousel Sidebars — the UI pattern' },
  { label: 'laradcs', href: 'https://github.com/markc/laradcs', icon: BookOpen, note: 'DCS React upstream (vendored here)' }
]

/** Right sidebar R2. External links open in the system browser via the main process. */
export default function AboutPanel(): React.JSX.Element {
  return (
    <nav className="p-3 space-y-1">
      {links.map(({ label, href, icon: Icon, note }) => (
        <button
          key={href}
          onClick={() => void window.sshm.openExternal(href)}
          className="w-full text-left flex items-start gap-3 rounded-md px-3 py-2 text-sm text-fg-2 hover:bg-surface-3/60 hover:text-fg transition-colors"
        >
          <Icon className="w-4 h-4 mt-0.5 shrink-0 text-muted" />
          <span className="min-w-0">
            <span className="block">{label}</span>
            {note && <span className="block text-[11px] text-muted">{note}</span>}
          </span>
        </button>
      ))}
      <div className="sidebar-divider" />
      <p className="px-3 text-[11px] leading-relaxed text-muted">
        SSHM Desktop manages your local <code className="font-mono">~/.ssh</code> only. Sessions open in your native terminal; nothing runs in the app.
      </p>
    </nav>
  )
}
