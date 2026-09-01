import React from 'react'
import { KeyRound, Plus, Server } from 'lucide-react'
import { useStore } from '@/state/store'
import { Code, primaryBtn, subtleBtn } from '@/components/ui'

/** Main pane when nothing is selected. */
export const EmptyView: React.FC = () => {
  const { hosts, keys, status, select } = useStore()
  const managed = hosts.filter((h) => h.managed).length
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-xl bg-accent-subtle text-accent flex items-center justify-center">
          <Server className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Your local SSH setup</h1>
          <p className="text-sm text-muted mt-1">
            {hosts.length} host {hosts.length === 1 ? 'alias' : 'aliases'} ({managed} managed) · {keys.length} {keys.length === 1 ? 'key' : 'keys'}
            {status && !status.includePresent && (
              <>
                {' '}
                · <span className="text-warn">Include line missing</span>
              </>
            )}
          </p>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          Pick a host or key in the left sidebar, or create one. Everything here is written to <Code>~/.ssh/hosts/</Code> and <Code>~/.ssh/keys/</Code> in the exact format the{' '}
          <Code>sshm</Code> shell tool uses, so the two stay interchangeable.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => select({ kind: 'new-host' })} className={primaryBtn}>
            <Plus className="w-3.5 h-3.5" /> Add host
          </button>
          <button onClick={() => select({ kind: 'new-key' })} className={subtleBtn}>
            <KeyRound className="w-3.5 h-3.5" /> New key
          </button>
        </div>
      </div>
    </div>
  )
}
