import React from 'react'
import { AlertTriangle, Check, FileText, FolderOpen } from 'lucide-react'
import { useStore } from '@/state/store'
import { subtleBtn } from '@/components/ui'
import { tildify } from '@/lib/format'

/** Left sidebar L3: the state of ~/.ssh/config and the managed directories. */
export default function ConfigPanel(): React.JSX.Element {
  const { status, loadError, fixInclude, openFile } = useStore()

  const Row: React.FC<{ label: string; path: string; ok?: boolean }> = ({ label, path, ok }) => (
    <button onClick={() => void openFile(path)} className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-3/60 flex items-start gap-2.5 group" title={`Open ${tildify(path)}`}>
      {ok === undefined ? <FolderOpen className="w-3.5 h-3.5 mt-0.5 text-muted shrink-0" /> : ok ? <Check className="w-3.5 h-3.5 mt-0.5 text-ok shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-warn shrink-0" />}
      <span className="min-w-0">
        <span className="block text-xs text-muted">{label}</span>
        <span className="block font-mono text-xs text-fg-2 group-hover:text-fg truncate">{tildify(path)}</span>
      </span>
    </button>
  )

  return (
    <div className="p-2 space-y-2 text-sm">
      {loadError && (
        <div className="mx-1 p-2 rounded-md border border-danger/40 bg-danger/10 text-danger text-xs flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Couldn't read your SSH config: {loadError}</span>
        </div>
      )}
      {status && (
        <>
          <Row label={status.configExists ? 'ssh config' : 'ssh config (missing)'} path={status.configPath} ok={status.configExists} />
          <Row label={`hosts directory · ${status.managedHostCount} managed`} path={status.hostsDir} />
          <Row label="keys directory" path={status.hostsDir.replace(/hosts\/?$/, 'keys')} />
          <div className="sidebar-divider" />
          <div className="px-3 py-1 space-y-2">
            <div className="flex items-start gap-2 text-xs">
              {status.includePresent ? <Check className="w-3.5 h-3.5 mt-0.5 text-ok shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-warn shrink-0" />}
              <span className="text-fg-2">
                <code className="font-mono">Include ~/.ssh/hosts/*</code> {status.includePresent ? 'is present.' : 'is missing — hosts created here are invisible to ssh until it is added.'}
              </span>
            </div>
            {!status.includePresent && (
              <button onClick={() => void fixInclude()} className={subtleBtn}>
                <FileText className="w-3.5 h-3.5" /> Add Include line
              </button>
            )}
          </div>
        </>
      )}
      <div className="sidebar-divider" />
      <p className="px-3 pb-2 text-[11px] leading-relaxed text-muted">
        The files are the contract: this app reads and writes the same <code className="font-mono">~/.ssh/hosts/&lt;alias&gt;</code> and{' '}
        <code className="font-mono">~/.ssh/keys/&lt;name&gt;</code> files as the <code className="font-mono">sshm</code> shell tool, byte for byte.
      </p>
    </div>
  )
}
