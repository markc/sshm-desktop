import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { Terminal as TermIcon, Play, RefreshCw, Key } from 'lucide-react'
import { LocalSshKey } from '@shared/ipc-types'
import { launchSsh } from '../../lib/launchSsh'

interface EmbeddedTerminalProps {
  initialHost?: string
}

/**
 * A scratch xterm plus a "launch in my real terminal" bar. The xterm is a
 * notepad, not a PTY: real sessions open in the native terminal via launchSsh.
 */
export const EmbeddedTerminal: React.FC<EmbeddedTerminalProps> = ({ initialHost = '' }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermInstance = useRef<XTerm | null>(null)
  const [hostInput, setHostInput] = useState(initialHost)
  const [username, setUsername] = useState('')
  const [selectedKeyPath, setSelectedKeyPath] = useState<string>('')
  const [localKeys, setLocalKeys] = useState<LocalSshKey[]>([])

  useEffect(() => setHostInput(initialHost), [initialHost])

  useEffect(() => {
    window.sshm.listKeys().then(setLocalKeys).catch(console.error)
    if (!terminalRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Consolas, "Courier New", monospace',
      fontSize: 13,
      theme: { background: '#212529', foreground: '#f8f9fa', cursor: '#f1ca00', selectionBackground: '#017cb6' }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()
    term.writeln('\x1b[1;33mSSHM Desktop\x1b[0m — launches ssh in your native terminal.')
    term.writeln('\x1b[90mEnter an alias from ~/.ssh/config or a user/host/key, then Launch.\x1b[0m\r\n')
    xtermInstance.current = term

    const handleResize = (): void => fitAddon.fit()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      term.dispose()
    }
  }, [])

  const handleLaunch = async (): Promise<void> => {
    if (!hostInput) return
    const r = await launchSsh({
      host: hostInput,
      username: username || undefined,
      privateKeyPath: selectedKeyPath || undefined,
      // Typed here, so they must survive an alias match.
      userSpecified: Boolean(username || selectedKeyPath)
    })
    xtermInstance.current?.writeln(
      r.success ? `\x1b[32m✓\x1b[0m ${r.command} \x1b[90m(${r.terminal}${r.alias ? `, alias ${r.alias}` : ''})\x1b[0m` : `\x1b[31m✗\x1b[0m ${r.error}`
    )
  }

  return (
    <div className="h-full flex flex-col bg-[#212529] text-[#f8f9fa] overflow-hidden">
      <div className="p-3 bg-white dark:bg-[#2b3035] border-b border-panel-border-light dark:border-panel-border-dark flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <TermIcon className="w-4 h-4 text-brand" />
          <span className="font-bold text-[#212529] dark:text-white">SSH Session</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-[#f8f9fa] dark:bg-[#212529] border border-panel-border-light dark:border-panel-border-dark px-2 py-1 rounded-sm">
            <span className="text-panel-muted-light">User:</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="(config)" className="bg-transparent text-[#212529] dark:text-white w-16 focus:outline-hidden font-mono" />
          </div>
          <div className="flex items-center gap-1 bg-[#f8f9fa] dark:bg-[#212529] border border-panel-border-light dark:border-panel-border-dark px-2 py-1 rounded-sm">
            <span className="text-panel-muted-light">Host:</span>
            <input value={hostInput} onChange={(e) => setHostInput(e.target.value)} placeholder="alias or host" className="bg-transparent text-[#212529] dark:text-white w-32 sm:w-44 focus:outline-hidden font-mono" />
          </div>
          <div className="flex items-center gap-1 bg-[#f8f9fa] dark:bg-[#212529] border border-panel-border-light dark:border-panel-border-dark px-2 py-1 rounded-sm">
            <Key className="w-3.5 h-3.5 text-[#f1ca00]" />
            <select value={selectedKeyPath} onChange={(e) => setSelectedKeyPath(e.target.value)} className="bg-transparent text-[#212529] dark:text-white focus:outline-hidden cursor-pointer max-w-[160px]">
              <option value="" className="bg-white dark:bg-[#2b3035]">Key from config</option>
              {localKeys.filter((k) => k.privateKeyPath).map((k) => (
                <option key={k.privateKeyPath} value={k.privateKeyPath} className="bg-white dark:bg-[#2b3035]">{k.name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleLaunch} disabled={!hostInput} className="flex items-center gap-1.5 px-3 py-1 bg-brand hover:bg-brand-hover text-white rounded-sm font-medium transition shadow-xs disabled:opacity-50">
            <Play className="w-3 h-3 fill-current" /> <span>Launch</span>
          </button>
          <button onClick={() => xtermInstance.current?.clear()} className="p-1 text-panel-muted-light hover:text-[#212529] dark:hover:text-white rounded-sm" title="Clear" aria-label="Clear">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 p-3 bg-[#212529] overflow-hidden">
        <div ref={terminalRef} className="h-full w-full" />
      </div>
    </div>
  )
}
