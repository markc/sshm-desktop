import React, { useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Zap } from 'lucide-react'
import { useStore } from '@/state/store'
import { Spinner, iconBtn, inputClass } from '@/components/ui'
import { tildify } from '@/lib/format'

/** Left sidebar L1: every Host alias, filterable; click selects it for the main pane. */
export default function HostsPanel(): React.JSX.Element {
  const { hosts, loading, tests, testingAll, testAll, refresh, selection, select } = useStore()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return hosts
    return hosts.filter((h) => [h.alias, h.hostName, h.user, h.identityFile].some((v) => (v || '').toLowerCase().includes(q)))
  }, [hosts, search])

  const managed = hosts.filter((h) => h.managed).length

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-line">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter hosts…" className={`${inputClass} pl-8 py-1`} />
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
          <span className="truncate" title={`${hosts.length} aliases, ${managed} managed in ~/.ssh/hosts/`}>
            {hosts.length} hosts · {managed} managed
          </span>
          <span className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => void refresh()} className={iconBtn} disabled={loading} title="Re-read ~/.ssh/config" aria-label="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => void testAll(filtered.map((h) => h.alias))}
              className={iconBtn}
              disabled={testingAll || filtered.length === 0}
              title={`Test ${search ? 'shown' : 'all'} hosts`}
              aria-label="Test all"
            >
              {testingAll ? <Spinner /> : <Zap className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => select({ kind: 'new-host' })}
              className={`${iconBtn} ${selection.kind === 'new-host' ? 'text-accent bg-accent/10' : ''}`}
              title="Add host"
              aria-label="Add host"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {filtered.map((h) => {
          const active = selection.kind === 'host' && selection.alias === h.alias
          const t = tests[h.alias]
          return (
            <li key={`${h.file}:${h.alias}`}>
              <button
                onClick={() => select({ kind: 'host', alias: h.alias })}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2.5 transition-colors ${
                  active ? 'bg-accent-subtle text-accent' : 'text-fg-2 hover:bg-surface-3/60 hover:text-fg'
                }`}
                title={h.managed ? `~/.ssh/hosts/${h.alias}` : tildify(h.file)}
              >
                <TestDot state={t} />
                <span className="min-w-0 flex-1">
                  <span className={`block font-mono text-sm truncate ${active ? 'font-semibold' : ''}`}>{h.alias}</span>
                  <span className="block text-[11px] text-muted truncate font-mono">
                    {h.user ? `${h.user}@` : ''}
                    {h.hostName || h.alias}
                    {h.port && h.port !== 22 ? `:${h.port}` : ''}
                  </span>
                </span>
                {!h.managed && <span className="text-[9px] uppercase tracking-wide text-muted">config</span>}
              </button>
            </li>
          )
        })}
        {!loading && filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-muted">{hosts.length === 0 ? 'No Host aliases in ~/.ssh/config.' : 'No hosts match.'}</li>
        )}
      </ul>
    </div>
  )
}

const TestDot: React.FC<{ state?: import('@/state/store').TestState }> = ({ state }) => {
  if (state === 'running') return <Spinner className="w-2.5 h-2.5 text-muted" />
  const cls = !state ? 'bg-line' : state.ok ? 'bg-ok' : 'bg-danger'
  const title = !state ? 'Not tested' : state.ok ? `ok ${state.ms} ms` : state.error
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} title={title} />
}
