import React from 'react'
import { Menu, SquareTerminal } from 'lucide-react'
import Sidebar from '@/components/dcs/sidebar'
import TopNav from '@/components/dcs/top-nav'
import ThemePanel from '@/components/dcs/panels/theme-panel'
import { ThemeProvider, useTheme } from '@/contexts/theme-context'
import HostsPanel from '@/components/dcs/panels/hosts-panel'
import KeysPanel from '@/components/dcs/panels/keys-panel'
import ConfigPanel from '@/components/dcs/panels/config-panel'
import AboutPanel from '@/components/dcs/panels/about-panel'
import { StoreProvider, useStore } from '@/state/store'
import { HostDetail } from '@/views/host-detail'
import { KeyDetail } from '@/views/key-detail'
import { EmptyView } from '@/views/empty-view'
import { Strip, subtleBtn } from '@/components/ui'
import { tildify } from '@/lib/format'

/*
 * DCS (Dual Carousel Sidebars) shell — the vendored laradcs implementation under
 * components/dcs, contexts/ and css/dcs (see CLAUDE.md "DCS upstream"). This file is the
 * wiring: which panels go where, plus the app's own topnav contents and hamburgers.
 * STORAGE_KEY / TOPNAV_HEIGHT must match src/renderer/public/prepaint.js.
 */
const STORAGE_KEY = 'sshm-state'
const TOPNAV_HEIGHT = '2.75rem'

const leftPanels = [
  { label: 'L1: Hosts', content: <HostsPanel /> },
  { label: 'L2: Keys', content: <KeysPanel /> },
  { label: 'L3: Config', content: <ConfigPanel /> }
]

const rightPanels = [
  { label: 'R1: Appearance', content: <ThemePanel /> },
  { label: 'R2: About', content: <AboutPanel /> }
]

const hamburger =
  'fixed top-[0.375rem] z-50 p-1.5 rounded-md border border-line bg-surface-2/80 text-fg-2 hover:text-accent transition-colors backdrop-blur titlebar-no-drag'

function Shell(): React.JSX.Element {
  const { left, right, toggleSidebar } = useTheme()
  const { hosts, keys, selection, notice, setNotice, status, fixInclude, loadError } = useStore()

  const host = selection.kind === 'host' ? (hosts.find((h) => h.alias === selection.alias) ?? null) : null
  const key = selection.kind === 'key' ? (keys.find((k) => k.name === selection.name) ?? null) : null

  return (
    <div className="relative h-full text-fg">
      <button onClick={() => toggleSidebar('left')} className={`${hamburger} left-2`} aria-label="Toggle left sidebar" title="Hosts, keys, config">
        <Menu className="w-4 h-4" />
      </button>
      <button onClick={() => toggleSidebar('right')} className={`${hamburger} right-2`} aria-label="Toggle right sidebar" title="Appearance, about">
        <Menu className="w-4 h-4" />
      </button>

      <Sidebar side="left" panels={leftPanels} />
      <Sidebar side="right" panels={rightPanels} />

      <TopNav>
        <span className="flex items-center gap-2 text-base">
          <SquareTerminal className="w-4 h-4" />
          <span className="font-bold tracking-tight">SSHM</span>
          <span className="font-normal text-muted">Desktop</span>
        </span>
      </TopNav>

      <div
        className={`sidebar-slide h-full pt-[var(--topnav-height)] flex flex-col ${left.pinned ? 'pin:ml-[var(--sw-l)]' : ''} ${right.pinned ? 'pin:mr-[var(--sw-r)]' : ''}`}
      >
        {(notice || loadError || (status && !status.includePresent)) && (
          <div className="px-4 pt-3 space-y-2 shrink-0">
            {loadError && <Strip tone="danger">Couldn't read your SSH config: {loadError}</Strip>}
            {status && !status.includePresent && (
              <Strip
                tone="warn"
                action={
                  <button onClick={() => void fixInclude()} className={subtleBtn}>
                    Add Include line
                  </button>
                }
              >
                <code className="font-mono">{tildify(status.configPath)}</code> does not include <code className="font-mono">~/.ssh/hosts/*</code> — hosts created here won't be seen by ssh
                until it does.
              </Strip>
            )}
            {notice && (
              <Strip tone="ok" onDismiss={() => setNotice(null)}>
                {notice}
              </Strip>
            )}
          </div>
        )}
        <main key={selectionKey(selection)} className="page-fade-in flex-1 min-h-0 overflow-y-auto select-text">
          {selection.kind === 'host' && host && <HostDetail host={host} />}
          {selection.kind === 'new-host' && <HostDetail host={null} />}
          {selection.kind === 'key' && key && <KeyDetail keyInfo={key} />}
          {selection.kind === 'new-key' && <KeyDetail keyInfo={null} />}
          {(selection.kind === 'none' || (selection.kind === 'host' && !host) || (selection.kind === 'key' && !key)) && <EmptyView />}
        </main>
      </div>
    </div>
  )
}

const selectionKey = (s: ReturnType<typeof useStore>['selection']): string =>
  s.kind === 'host' ? `host:${s.alias}` : s.kind === 'key' ? `key:${s.name}` : s.kind

export const App: React.FC = () => (
  <ThemeProvider storageKey={STORAGE_KEY} topnavHeight={TOPNAV_HEIGHT}>
    <StoreProvider>
      <Shell />
    </StoreProvider>
  </ThemeProvider>
)
