import React from 'react'
import { Server, KeyRound, Terminal } from 'lucide-react'
import { DarkModeToggle } from './DarkModeToggle'

export type ActiveTab = 'hosts' | 'keys' | 'terminal'

interface SidebarProps {
  activeTab: ActiveTab
  onSelectTab: (tab: ActiveTab) => void
}

const NAV: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'hosts', label: 'Hosts', icon: Server },
  { id: 'keys', label: 'Keys', icon: KeyRound },
  { id: 'terminal', label: 'Terminal', icon: Terminal }
]

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => (
  <aside className="w-56 shrink-0 flex flex-col bg-panel-sidebar text-[#f8f9fa] border-r border-[#2b3035]">
    <nav className="flex-1 p-2 space-y-1">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onSelectTab(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm transition ${
              active ? 'bg-[#2b3035] text-[#f1ca00] font-semibold' : 'hover:bg-white/10 text-[#f8f9fa]'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
    <div className="p-3 border-t border-[#2b3035] flex items-center justify-between text-[11px] text-panel-muted-dark">
      <span className="font-mono">~/.ssh</span>
      <DarkModeToggle />
    </div>
  </aside>
)
