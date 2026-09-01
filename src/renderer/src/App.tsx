import React, { useState } from 'react'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar, ActiveTab } from './components/layout/Sidebar'
import { HostsPage } from './components/hosts/HostsPage'
import { KeysPage } from './components/keys/KeysPage'
import { EmbeddedTerminal } from './components/terminal/EmbeddedTerminal'
import { ThemeProvider } from './context/ThemeContext'

function Shell(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ActiveTab>('hosts')
  const [terminalHost, setTerminalHost] = useState<string | undefined>(undefined)

  const openTerminalFor = (host: string): void => {
    setTerminalHost(host)
    setActiveTab('terminal')
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa] overflow-hidden font-sans select-none">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
        <main className="flex-1 overflow-hidden bg-[#f8f9fa] dark:bg-[#212529] relative select-text">
          {activeTab === 'hosts' && <HostsPage onOpenTerminal={openTerminalFor} />}
          {activeTab === 'keys' && <KeysPage />}
          {activeTab === 'terminal' && <EmbeddedTerminal initialHost={terminalHost} />}
        </main>
      </div>
    </div>
  )
}

export const App: React.FC = () => (
  <ThemeProvider>
    <Shell />
  </ThemeProvider>
)
