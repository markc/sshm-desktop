import React from 'react'
import { KeyRound, Plus, RefreshCw } from 'lucide-react'
import { useStore } from '@/state/store'
import { iconBtn } from '@/components/ui'
import { tildify } from '@/lib/format'

/** Left sidebar L2: keys under ~/.ssh/keys (managed) and ~/.ssh/id_* (read-only). */
export default function KeysPanel(): React.JSX.Element {
  const { keys, loading, refresh, selection, select } = useStore()

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-line flex items-center justify-between text-[11px] text-muted">
        <span>
          {keys.length} keys · {keys.filter((k) => k.managed).length} managed
        </span>
        <span className="flex items-center gap-0.5">
          <button onClick={() => void refresh()} className={iconBtn} disabled={loading} title="Re-read ~/.ssh" aria-label="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => select({ kind: 'new-key' })}
            className={`${iconBtn} ${selection.kind === 'new-key' ? 'text-accent bg-accent/10' : ''}`}
            title="New key"
            aria-label="New key"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {keys.map((k) => {
          const active = selection.kind === 'key' && selection.name === k.name
          return (
            <li key={k.publicKeyPath || k.name}>
              <button
                onClick={() => select({ kind: 'key', name: k.name })}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors ${
                  active ? 'bg-accent-subtle text-accent' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg'
                }`}
                title={tildify(k.privateKeyPath || k.publicKeyPath || '')}
              >
                <KeyRound className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-accent' : 'text-muted'}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block font-mono text-sm truncate ${active ? 'font-semibold' : ''}`}>{k.name}</span>
                  <span className="block text-[11px] text-muted truncate">
                    {k.type ? `${k.type}${k.bits ? ` ${k.bits}` : ''}` : 'unknown type'}
                    {!k.privateKeyPath && ' · public only'}
                  </span>
                </span>
                {!k.managed && <span className="text-[9px] uppercase tracking-wide text-muted">id_*</span>}
              </button>
            </li>
          )
        })}
        {!loading && keys.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted">No keys in ~/.ssh/keys/ or ~/.ssh/id_*.</li>}
      </ul>
    </div>
  )
}
