import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  FolderOpen,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { HostTestResult, LocalSshKey, SshConfigStatus, SshHost, SshHostInput } from '@shared/ipc-types'
import { launchAlias } from '../../lib/launchSsh'

interface HostsPageProps {
  onOpenTerminal: (host: string) => void
}

const inputClass =
  'px-2 py-1.5 text-sm rounded border border-[#ced4da] dark:border-[#373b3e] bg-white dark:bg-[#212529] text-[#212529] dark:text-white focus:outline-none focus:border-[#017cb6] w-full'
const primaryBtn =
  'px-3 py-1.5 text-xs font-medium rounded border text-white bg-[#017cb6] border-[#017cb6] hover:bg-[#016594] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5'
const subtleBtn =
  'px-2.5 py-1 text-xs font-medium rounded border text-[#017cb6] bg-[#017cb6]/10 border-[#017cb6]/30 hover:bg-[#017cb6]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5'
const iconBtn = 'p-1.5 rounded text-[#6c757d] hover:text-[#017cb6] hover:bg-[#017cb6]/10 disabled:opacity-40'

type Form = { alias: string; hostName: string; port: string; user: string; identityFile: string; editing: boolean }
const emptyForm: Form = { alias: '', hostName: '', port: '22', user: 'root', identityFile: '~/.ssh/keys/default', editing: false }

export const HostsPage: React.FC<HostsPageProps> = ({ onOpenTerminal }) => {
  const [hosts, setHosts] = useState<SshHost[]>([])
  const [keys, setKeys] = useState<LocalSshKey[]>([])
  const [status, setStatus] = useState<SshConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tests, setTests] = useState<Record<string, HostTestResult | 'running'>>({})
  const [testingAll, setTestingAll] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [h, s, k] = await Promise.all([window.sshm.listHosts(), window.sshm.configStatus(), window.sshm.listKeys()])
      setHosts(h)
      setStatus(s)
      setKeys(k)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return hosts
    return hosts.filter(
      (h) =>
        h.alias.toLowerCase().includes(q) ||
        (h.hostName || '').toLowerCase().includes(q) ||
        (h.user || '').toLowerCase().includes(q) ||
        (h.identityFile || '').toLowerCase().includes(q)
    )
  }, [hosts, search])

  const openCreate = (): void => {
    setFormError(null)
    setForm({ ...emptyForm })
  }
  const openEdit = (h: SshHost): void => {
    setFormError(null)
    setForm({
      alias: h.alias,
      hostName: h.hostName || '',
      port: String(h.port ?? 22),
      user: h.user || 'root',
      identityFile: h.identityFile || '~/.ssh/keys/default',
      editing: true
    })
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form) return
    const port = Number(form.port)
    const input: SshHostInput = {
      alias: form.alias.trim(),
      hostName: form.hostName.trim(),
      port: Number.isInteger(port) ? port : undefined,
      user: form.user.trim() || undefined,
      identityFile: form.identityFile.trim() || undefined
    }
    if (!form.editing && hosts.some((h) => h.alias === input.alias)) {
      setFormError(`"${input.alias}" already exists (in ${hosts.find((h) => h.alias === input.alias)?.file}).`)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const r = await window.sshm.saveHost(input)
      if (!r.success) {
        setFormError(r.error || 'Save failed.')
        return
      }
      setNotice(`${form.editing ? 'Updated' : 'Created'} ${r.file}`)
      setForm(null)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: SshHost): Promise<void> => {
    if (!confirm(`Delete ${h.file}?\n\nThis removes the "${h.alias}" alias. The server and its key are untouched.`)) return
    const r = await window.sshm.deleteHost(h.alias)
    if (!r.success) {
      alert(r.error)
      return
    }
    setNotice(`Deleted ${r.file}`)
    await refresh()
  }

  const test = async (alias: string): Promise<void> => {
    setTests((t) => ({ ...t, [alias]: 'running' }))
    const r = await window.sshm.testHost(alias)
    setTests((t) => ({ ...t, [alias]: r }))
  }

  const testAll = async (): Promise<void> => {
    setTestingAll(true)
    const queue = [...filtered]
    const worker = async (): Promise<void> => {
      while (queue.length) {
        const h = queue.shift()
        if (h) await test(h.alias)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
    setTestingAll(false)
  }

  const fixInclude = async (): Promise<void> => {
    const r = await window.sshm.ensureInclude()
    if (!r.success) {
      alert(r.error)
      return
    }
    setNotice(r.changed ? `Added "Include ~/.ssh/hosts/*" to ${r.file}` : 'Include line already present.')
    await refresh()
  }

  const managedCount = hosts.filter((h) => h.managed).length

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5">
            <span>SSH Hosts</span>
            <span className="text-xs font-normal text-[#6c757d] bg-[#e9ecef] dark:bg-[#2b3035] px-2 py-0.5 rounded-full border border-[#ced4da] dark:border-[#373b3e]">
              {hosts.length} aliases · {managedCount} managed
            </span>
          </h1>
          <p className="text-xs text-[#6c757d] mt-1">
            Every <code>Host</code> alias ssh knows about, with the values it will actually use. Hosts you create here are written
            to <code>~/.ssh/hosts/&lt;alias&gt;</code>, exactly as <code>sshm create</code> does.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className={subtleBtn} disabled={loading} title="Re-read ~/.ssh/config">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={testAll} className={subtleBtn} disabled={testingAll || filtered.length === 0}>
            {testingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Test {search ? 'shown' : 'all'}
          </button>
          <button onClick={openCreate} className={primaryBtn}>
            <Plus className="w-3.5 h-3.5" /> Add host
          </button>
        </div>
      </div>

      {/* Strips */}
      {status && !status.includePresent && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs rounded flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              <code>{status.configPath}</code> does not include <code>~/.ssh/hosts/*</code> — hosts created here won't be seen by ssh
              until it does.
            </span>
          </div>
          <button onClick={fixInclude} className={subtleBtn}>
            Add Include line
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4" /> {notice}
          </span>
          <button onClick={() => setNotice(null)} className="hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6c757d]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by alias, hostname, user or key…"
          className={`${inputClass} pl-9`}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden flex-shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] text-[#495057] dark:text-[#ced4da] font-semibold">
                <th className="py-2.5 px-4">Alias</th>
                <th className="py-2.5 px-4">HostName</th>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Port</th>
                <th className="py-2.5 px-4">Identity file</th>
                <th className="py-2.5 px-4">Source</th>
                <th className="py-2.5 px-4">Test</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
              {filtered.map((h) => {
                const t = tests[h.alias]
                return (
                  <tr key={`${h.file}:${h.alias}`} className="hover:bg-[#f8f9fa] dark:hover:bg-[#262a2e]">
                    <td className="py-2 px-4 font-mono font-semibold text-[#017cb6]">{h.alias}</td>
                    <td className="py-2 px-4 font-mono">{h.hostName || <span className="text-[#adb5bd]">—</span>}</td>
                    <td className="py-2 px-4 font-mono">{h.user || <span className="text-[#adb5bd]">—</span>}</td>
                    <td className="py-2 px-4 font-mono">{h.port ?? <span className="text-[#adb5bd]">22</span>}</td>
                    <td className="py-2 px-4 font-mono truncate max-w-[220px]" title={h.identityFile}>
                      {h.identityFile || <span className="text-[#adb5bd]">—</span>}
                    </td>
                    <td className="py-2 px-4">
                      {h.managed ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[#017cb6]/10 text-[#017cb6] border border-[#017cb6]/30">
                          managed
                        </span>
                      ) : (
                        <span className="text-[#6c757d] truncate block max-w-[200px] font-mono" title={h.file}>
                          {h.file.replace(/^\/home\/[^/]+/, '~')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap">
                      {t === 'running' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6c757d]" />
                      ) : t ? (
                        t.ok ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">ok {t.ms} ms</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 truncate block max-w-[200px]" title={t.error}>
                            {t.error}
                          </span>
                        )
                      ) : (
                        <span className="text-[#adb5bd]">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => launchAlias(h.alias)} className={iconBtn} title={`ssh ${h.alias} in your terminal`} aria-label="Launch ssh">
                          <Play className="w-4 h-4" />
                        </button>
                        <button onClick={() => onOpenTerminal(h.alias)} className={iconBtn} title="Open in the Terminal tab" aria-label="Terminal tab">
                          <Terminal className="w-4 h-4" />
                        </button>
                        <button onClick={() => test(h.alias)} className={iconBtn} disabled={t === 'running'} title="Test connectivity" aria-label="Test">
                          <Zap className="w-4 h-4" />
                        </button>
                        {h.managed && (
                          <>
                            <button onClick={() => openEdit(h)} className={iconBtn} title="Edit" aria-label="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => window.sshm.openPath(h.file)} className={iconBtn} title="Open file" aria-label="Open file">
                              <FolderOpen className="w-4 h-4" />
                            </button>
                            <button onClick={() => remove(h)} className={`${iconBtn} hover:text-rose-500`} title="Delete" aria-label="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 px-4 text-center text-[#6c757d]">
                    {hosts.length === 0 ? 'No Host aliases found in ~/.ssh/config.' : 'No hosts match the filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / edit modal */}
      {form && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setForm(null)}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] flex items-center justify-between">
              <h3 className="font-semibold text-sm">{form.editing ? `Edit ~/.ssh/hosts/${form.alias}` : 'New host'}</h3>
              <button type="button" onClick={() => setForm(null)} className="text-[#6c757d] hover:text-rose-500" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-[#6c757d]">Alias</span>
                <input
                  value={form.alias}
                  onChange={(e) => setForm({ ...form, alias: e.target.value })}
                  disabled={form.editing}
                  placeholder="web1"
                  className={`${inputClass} font-mono disabled:opacity-60`}
                  autoFocus={!form.editing}
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-[#6c757d]">Hostname or IP</span>
                <input
                  value={form.hostName}
                  onChange={(e) => setForm({ ...form, hostName: e.target.value })}
                  placeholder="203.0.113.5"
                  className={`${inputClass} font-mono`}
                  autoFocus={form.editing}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-[#6c757d]">Port</span>
                  <input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className={`${inputClass} font-mono`} inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="text-xs text-[#6c757d]">User</span>
                  <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className={`${inputClass} font-mono`} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-[#6c757d]">Identity file</span>
                <input
                  value={form.identityFile}
                  onChange={(e) => setForm({ ...form, identityFile: e.target.value })}
                  list="sshm-key-paths"
                  className={`${inputClass} font-mono`}
                />
                <datalist id="sshm-key-paths">
                  {keys
                    .filter((k) => k.privateKeyPath)
                    .map((k) => (
                      <option key={k.name} value={k.privateKeyPath!.replace(/^\/home\/[^/]+/, '~')} />
                    ))}
                </datalist>
              </label>
              {formError && (
                <div className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> <span>{formError}</span>
                </div>
              )}
              <pre className="text-[11px] font-mono bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded p-2 text-[#6c757d] overflow-x-auto">
                {`Host ${form.alias || '<alias>'}\n  Hostname ${form.hostName || '<host>'}\n  Port ${form.port || 22}\n  User ${form.user || 'root'}\n  IdentityFile ${form.identityFile || '~/.ssh/keys/default'}`}
              </pre>
            </div>
            <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-t border-[#ced4da] dark:border-[#373b3e] flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={subtleBtn} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className={primaryBtn} disabled={saving}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {form.editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
