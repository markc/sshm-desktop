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
  'px-2 py-1.5 text-sm rounded-sm border border-panel-border-light dark:border-panel-border-dark bg-white dark:bg-[#212529] text-[#212529] dark:text-white focus:outline-hidden focus:border-brand w-full'
const primaryBtn =
  'px-3 py-1.5 text-xs font-medium rounded-sm border text-white bg-brand border-brand hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap'
const subtleBtn =
  'px-2.5 py-1 text-xs font-medium rounded-sm border text-brand bg-brand/10 border-brand/30 hover:bg-brand/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap'
const iconBtn = 'p-1.5 rounded-sm text-panel-muted-light hover:text-brand hover:bg-brand/10 disabled:opacity-40'

const tildify = (p: string): string => p.replace(/^\/home\/[^/]+/, '~').replace(/^\/Users\/[^/]+/, '~')

interface Form {
  alias: string
  hostName: string
  port: string
  user: string
  identityFile: string
  editing: boolean
  /** contentHash of the managed file when the form was opened — the version an update is based on. */
  expectedHash: string | null
  /** contentHash from a "non-canonical" refusal: the exact file the user agreed to overwrite. */
  forceHash: string | null
}
const emptyForm: Form = {
  alias: '',
  hostName: '',
  port: '22',
  user: 'root',
  identityFile: '~/.ssh/keys/default',
  editing: false,
  expectedHash: null,
  forceHash: null
}

/**
 * One place turns the form into the payload; preview, client-side validation and the
 * file all derive from it. The payload is always returned so the preview keeps
 * describing what would be written even while a field is invalid.
 */
function toInput(form: Form): { input: SshHostInput; error: string | null } {
  const portText = form.port.trim()
  let port: number | undefined
  let error: string | null = null
  if (portText !== '') {
    if (!/^\d+$/.test(portText)) error = 'Port must be a whole number.'
    else {
      port = Number(portText)
      if (port < 1 || port > 65535) error = 'Port must be between 1 and 65535.'
    }
  }
  return {
    input: {
      alias: form.alias.trim(),
      hostName: form.hostName.trim(),
      port,
      user: form.user.trim() || undefined,
      identityFile: form.identityFile.trim() || undefined,
      mode: form.editing ? 'update' : 'create',
      expectedHash: form.expectedHash ?? undefined,
      force: form.forceHash ?? undefined
    },
    error
  }
}

function preview(input: SshHostInput): string {
  return `Host ${input.alias || '<alias>'}\n  Hostname ${input.hostName || '<host>'}\n  Port ${input.port ?? 22}\n  User ${input.user || 'root'}\n  IdentityFile ${input.identityFile || '~/.ssh/keys/default'}`
}

export const HostsPage: React.FC<HostsPageProps> = ({ onOpenTerminal }) => {
  const [hosts, setHosts] = useState<SshHost[]>([])
  const [keys, setKeys] = useState<LocalSshKey[]>([])
  const [status, setStatus] = useState<SshConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tests, setTests] = useState<Record<string, HostTestResult | 'running'>>({})
  const [testingAll, setTestingAll] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [h, s, k] = await Promise.all([window.sshm.listHosts(), window.sshm.configStatus(), window.sshm.listKeys()])
      setHosts(Array.isArray(h) ? h : [])
      setStatus(s)
      setKeys(Array.isArray(k) ? k : [])
    } catch (err: any) {
      setLoadError(err?.message || String(err))
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
    return hosts.filter((h) =>
      [h.alias, h.hostName, h.user, h.identityFile].some((v) => (v || '').toLowerCase().includes(q))
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
      editing: true,
      expectedHash: h.contentHash ?? null,
      forceHash: null
    })
  }
  const closeForm = (): void => {
    if (!saving) setForm(null)
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form || saving) return
    const { input, error } = toInput(form)
    if (error) {
      setFormError(error)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const r = await window.sshm.saveHost(input)
      if (!r.success) {
        setFormError(r.error || 'Save failed.')
        if (r.code === 'non-canonical' && r.contentHash) {
          // The next submit may force-overwrite exactly the content the server just hashed.
          setForm({ ...form, forceHash: r.contentHash })
        } else if (r.code === 'changed') {
          // Someone else wrote the file: reload the form from the new version so the user
          // sees (and edits) what is there now — never just re-point the stale fields at it.
          await refresh()
          const fresh = (await window.sshm.listHosts()).find((h) => h.alias === form.alias && h.managed && h.contentHash)
          if (fresh) {
            setForm({
              alias: fresh.alias,
              hostName: fresh.hostName || '',
              port: String(fresh.port ?? 22),
              user: fresh.user || 'root',
              identityFile: fresh.identityFile || '~/.ssh/keys/default',
              editing: true,
              expectedHash: fresh.contentHash ?? null,
              forceHash: null
            })
            setFormError(`${r.error} The form now shows the current file; re-apply your change.`)
          } else {
            setForm(null)
            setNotice(`~/.ssh/hosts/${form.alias} is gone — nothing saved.`)
          }
        } else {
          setForm({ ...form, forceHash: null })
        }
        return
      }
      setNotice(`${form.editing ? 'Updated' : 'Created'} ${tildify(r.file || '')}`)
      setForm(null)
      await refresh()
    } catch (err: any) {
      setFormError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (h: SshHost): Promise<void> => {
    if (!confirm(`Delete ${tildify(h.file)}?\n\nThis removes the "${h.alias}" alias. The server and its key are untouched.`)) return
    try {
      const r = await window.sshm.deleteHost(h.alias)
      if (!r.success) {
        alert(r.error)
        return
      }
      setNotice(`Deleted ${tildify(r.file || '')}`)
      await refresh()
    } catch (err: any) {
      alert(err?.message || String(err))
    }
  }

  const test = async (alias: string): Promise<void> => {
    setTests((t) => ({ ...t, [alias]: 'running' }))
    let r: HostTestResult
    try {
      r = await window.sshm.testHost(alias)
    } catch (err: any) {
      r = { alias, ok: false, ms: 0, error: err?.message || String(err) }
    }
    setTests((t) => ({ ...t, [alias]: r }))
  }

  const testAll = async (): Promise<void> => {
    setTestingAll(true)
    try {
      const queue = filtered.map((h) => h.alias)
      const worker = async (): Promise<void> => {
        for (let alias = queue.shift(); alias !== undefined; alias = queue.shift()) await test(alias)
      }
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
    } finally {
      setTestingAll(false)
    }
  }

  const fixInclude = async (): Promise<void> => {
    try {
      const r = await window.sshm.ensureInclude()
      if (!r.success) {
        alert(r.error)
        return
      }
      setNotice(r.changed ? `Added "Include ~/.ssh/hosts/*" to ${tildify(r.file || '')}` : 'Include line already present.')
      await refresh()
    } catch (err: any) {
      alert(err?.message || String(err))
    }
  }

  const openFile = async (p: string): Promise<void> => {
    const r = await window.sshm.openPath(p).catch((err) => ({ success: false, error: String(err) }))
    if (!r.success) alert(r.error)
  }

  const managedCount = hosts.filter((h) => h.managed).length
  const formDerived = form ? toInput(form) : null

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5">
            <span>SSH Hosts</span>
            <span className="text-xs font-normal text-panel-muted-light bg-[#e9ecef] dark:bg-[#2b3035] px-2 py-0.5 rounded-full border border-panel-border-light dark:border-panel-border-dark whitespace-nowrap">
              {hosts.length} aliases · {managedCount} managed
            </span>
          </h1>
          <p className="text-xs text-panel-muted-light mt-1">
            The literal <code>Host</code> aliases in <code>~/.ssh/config</code> (following <code>Include</code>; patterns, negations and
            aliases starting with <code>-</code> are skipped), with the HostName / User / Port / IdentityFile resolved from Host blocks —{' '}
            conditional <code>Match</code> blocks are not evaluated and only the first IdentityFile is shown. Hosts created here are written to{' '}
            <code>~/.ssh/hosts/&lt;alias&gt;</code>, exactly as <code>sshm create</code> does.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
      {loadError && (
        <div role="alert" className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> <span>Couldn't read your SSH config: {loadError}</span>
        </div>
      )}
      {status && !status.includePresent && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs rounded-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <code>{tildify(status.configPath)}</code> does not include <code>~/.ssh/hosts/*</code> — hosts created here won't be seen
              by ssh until it does.
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
          className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded-sm flex items-center justify-between gap-3"
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
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-panel-muted-light" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by alias, hostname, user or key…"
          className={`${inputClass} pl-9`}
        />
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-panel-border-light dark:border-panel-border-dark shadow-xs overflow-hidden shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-panel-subnav-light dark:bg-[#262a2e] border-b border-panel-border-light dark:border-panel-border-dark text-[#495057] dark:text-panel-border-light font-semibold">
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
            <tbody className="divide-y divide-panel-border-light/60 dark:divide-panel-border-dark">
              {filtered.map((h) => {
                const t = tests[h.alias]
                return (
                  <tr key={`${h.file}:${h.alias}`} className="hover:bg-[#f8f9fa] dark:hover:bg-[#262a2e]">
                    <td className="py-2 px-4 font-mono font-semibold text-brand">{h.alias}</td>
                    <td className="py-2 px-4 font-mono">
                      {h.hostName || <span className="text-panel-muted-dark" title="No HostName: ssh connects to the alias itself">{h.alias}</span>}
                    </td>
                    <td className="py-2 px-4 font-mono">{h.user || <span className="text-panel-muted-dark" title="No User: your login name">—</span>}</td>
                    <td className="py-2 px-4 font-mono">{h.port ?? <span className="text-panel-muted-dark">22</span>}</td>
                    <td className="py-2 px-4 font-mono truncate max-w-[220px]" title={h.identityFile}>
                      {h.identityFile || <span className="text-panel-muted-dark" title="No IdentityFile: ssh's default identities">default</span>}
                    </td>
                    <td className="py-2 px-4">
                      {h.managed ? (
                        <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase bg-brand/10 text-brand border border-brand/30">
                          managed
                        </span>
                      ) : (
                        <span className="text-panel-muted-light truncate block max-w-[200px] font-mono" title={h.file}>
                          {tildify(h.file)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap">
                      {t === 'running' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-panel-muted-light" />
                      ) : t ? (
                        t.ok ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-mono">ok {t.ms} ms</span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400 truncate block max-w-[200px]" title={t.error}>
                            {t.error}
                          </span>
                        )
                      ) : (
                        <span className="text-panel-muted-dark">—</span>
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
                        <button onClick={() => openFile(h.file)} className={iconBtn} title={`Open ${tildify(h.file)}`} aria-label="Open file">
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        {h.managed && (
                          <>
                            <button onClick={() => openEdit(h)} className={iconBtn} title="Edit" aria-label="Edit">
                              <Pencil className="w-4 h-4" />
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
                  <td colSpan={8} className="py-8 px-4 text-center text-panel-muted-light">
                    {hosts.length === 0 ? 'No Host aliases found in ~/.ssh/config.' : 'No hosts match the filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / edit modal */}
      {form && formDerived && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={closeForm}>
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white dark:bg-[#2b3035] rounded-lg border border-panel-border-light dark:border-panel-border-dark shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-3 bg-panel-subnav-light dark:bg-[#262a2e] border-b border-panel-border-light dark:border-panel-border-dark flex items-center justify-between">
              <h3 className="font-semibold text-sm">{form.editing ? `Edit ~/.ssh/hosts/${form.alias}` : 'New host'}</h3>
              <button type="button" onClick={closeForm} disabled={saving} className="text-panel-muted-light hover:text-rose-500 disabled:opacity-40" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-panel-muted-light">Alias</span>
                <input
                  value={form.alias}
                  onChange={(e) => setForm({ ...form, alias: e.target.value })}
                  disabled={form.editing || saving}
                  placeholder="web1"
                  className={`${inputClass} font-mono disabled:opacity-60`}
                  autoFocus={!form.editing}
                  required
                />
              </label>
              <label className="block">
                <span className="text-xs text-panel-muted-light">Hostname or IP</span>
                <input
                  value={form.hostName}
                  onChange={(e) => setForm({ ...form, hostName: e.target.value })}
                  disabled={saving}
                  placeholder="203.0.113.5"
                  className={`${inputClass} font-mono`}
                  autoFocus={form.editing}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-panel-muted-light">Port (blank = 22)</span>
                  <input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} disabled={saving} className={`${inputClass} font-mono`} inputMode="numeric" />
                </label>
                <label className="block">
                  <span className="text-xs text-panel-muted-light">User (blank = root)</span>
                  <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} disabled={saving} className={`${inputClass} font-mono`} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-panel-muted-light">Identity file (blank = ~/.ssh/keys/default)</span>
                <input
                  value={form.identityFile}
                  onChange={(e) => setForm({ ...form, identityFile: e.target.value })}
                  disabled={saving}
                  list="sshm-key-paths"
                  className={`${inputClass} font-mono`}
                />
                <datalist id="sshm-key-paths">
                  {keys
                    .filter((k) => k.privateKeyPath)
                    .map((k) => (
                      <option key={k.privateKeyPath} value={tildify(k.privateKeyPath!)} />
                    ))}
                </datalist>
              </label>
              {formError && (
                <div className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{formError}</span>
                </div>
              )}
              {formDerived.error && !formError && (
                <div className="text-xs text-amber-600 dark:text-amber-400">{formDerived.error}</div>
              )}
              <pre className="text-[11px] font-mono bg-[#f8f9fa] dark:bg-[#212529] border border-panel-border-light dark:border-panel-border-dark rounded-sm p-2 text-panel-muted-light overflow-x-auto">
                {preview(formDerived.input)}
              </pre>
            </div>
            <div className="px-4 py-3 bg-panel-subnav-light dark:bg-[#262a2e] border-t border-panel-border-light dark:border-panel-border-dark flex justify-end gap-2">
              {form.editing && (
                <button type="button" onClick={() => openFile(`~/.ssh/hosts/${form.alias}`)} className={subtleBtn} disabled={saving}>
                  <FolderOpen className="w-3.5 h-3.5" /> Open file
                </button>
              )}
              <button type="button" onClick={closeForm} className={subtleBtn} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className={form.forceHash ? `${primaryBtn} bg-rose-600 border-rose-600 hover:bg-rose-700` : primaryBtn} disabled={saving || !!formDerived.error}>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {form.forceHash ? 'Force overwrite' : form.editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
