import React, { useEffect, useState } from 'react'
import { AlertTriangle, FolderOpen, Play, Trash2, Zap } from 'lucide-react'
import { SshHost, SshHostInput } from '@shared/ipc-types'
import { useStore } from '@/state/store'
import { launchAlias } from '@/lib/launchSsh'
import { errorMessage, tildify } from '@/lib/format'
import { Badge, Code, Field, Spinner, dangerBtn, iconBtn, inputClass, primaryBtn, subtleBtn } from '@/components/ui'

interface Form {
  alias: string
  hostName: string
  port: string
  user: string
  identityFile: string
  /** contentHash of the managed file when the form was opened — the version an update is based on. */
  expectedHash: string | null
  /** contentHash from a "non-canonical" refusal: the exact file the user agreed to overwrite. */
  forceHash: string | null
}

const fromHost = (h: SshHost): Form => ({
  alias: h.alias,
  hostName: h.hostName || '',
  port: String(h.port ?? 22),
  user: h.user || 'root',
  identityFile: h.identityFile || '~/.ssh/keys/default',
  expectedHash: h.contentHash ?? null,
  forceHash: null
})

const emptyForm: Form = { alias: '', hostName: '', port: '22', user: 'root', identityFile: '~/.ssh/keys/default', expectedHash: null, forceHash: null }

/**
 * One place turns the form into the payload; preview, client-side validation and the file
 * all derive from it. The payload is always returned so the preview keeps describing what
 * would be written even while a field is invalid.
 */
function toInput(form: Form, editing: boolean): { input: SshHostInput; error: string | null } {
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
      mode: editing ? 'update' : 'create',
      expectedHash: form.expectedHash ?? undefined,
      force: form.forceHash ?? undefined
    },
    error
  }
}

const preview = (i: SshHostInput): string =>
  `Host ${i.alias || '<alias>'}\n  Hostname ${i.hostName || '<host>'}\n  Port ${i.port ?? 22}\n  User ${i.user || 'root'}\n  IdentityFile ${i.identityFile || '~/.ssh/keys/default'}`

/** Main pane for a selected host (managed → editable, from config → read-only) or a new one. */
export const HostDetail: React.FC<{ host: SshHost | null }> = ({ host }) => {
  const { keys, tests, testHost, saveHost, deleteHost, openFile, refresh, setNotice, select } = useStore()
  const editing = host !== null
  const editable = host === null || host.managed
  const [form, setForm] = useState<Form>(host ? fromHost(host) : emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Re-seed when the selection (or the file's hash) changes under us.
  useEffect(() => {
    setForm(host ? fromHost(host) : emptyForm)
    setFormError(null)
  }, [host?.alias, host?.contentHash, host?.file]) // eslint-disable-line react-hooks/exhaustive-deps

  const derived = toInput(form, editing)
  const test = host ? tests[host.alias] : undefined
  const dirty = host ? JSON.stringify(fromHost(host)) !== JSON.stringify({ ...form, forceHash: null }) : true

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (saving || !editable) return
    if (derived.error) {
      setFormError(derived.error)
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const r = await saveHost(derived.input)
      if (r.success) return
      setFormError(r.error || 'Save failed.')
      if (r.code === 'non-canonical' && r.contentHash) {
        // The next submit may force-overwrite exactly the content the server just hashed.
        setForm((f) => ({ ...f, forceHash: r.contentHash! }))
      } else if (r.code === 'changed') {
        // Someone else wrote the file: reload the form from the new version so the user sees
        // (and edits) what is there now — never just re-point the stale fields at it.
        await refresh()
        const fresh = (await window.sshm.listHosts()).find((h) => h.alias === form.alias && h.managed && h.contentHash)
        if (fresh) {
          setForm(fromHost(fresh))
          setFormError(`${r.error} The form now shows the current file; re-apply your change.`)
        } else {
          setNotice(`~/.ssh/hosts/${form.alias} is gone — nothing saved.`)
          select({ kind: 'none' })
        }
      } else {
        setForm((f) => ({ ...f, forceHash: null }))
      }
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto p-6 space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-mono truncate flex items-center gap-2.5">
            {host ? host.alias : 'New host'}
            {host && (host.managed ? <Badge>managed</Badge> : <Badge tone="muted">from config</Badge>)}
          </h1>
          <p className="text-xs text-muted mt-1 font-mono truncate">{host ? tildify(host.file) : '~/.ssh/hosts/<alias> — exactly what sshm create writes'}</p>
        </div>
        {host && (
          <div className="flex items-center gap-1 shrink-0">
            <button type="button" onClick={() => void launchAlias(host.alias)} className={primaryBtn} title={`ssh ${host.alias} in your terminal`}>
              <Play className="w-3.5 h-3.5" /> Connect
            </button>
            <button type="button" onClick={() => void testHost(host.alias)} className={subtleBtn} disabled={test === 'running'} title="ssh -o BatchMode=yes … true">
              {test === 'running' ? <Spinner /> : <Zap className="w-3.5 h-3.5" />} Test
            </button>
            <button type="button" onClick={() => void openFile(host.file)} className={iconBtn} title={`Open ${tildify(host.file)}`} aria-label="Open file">
              <FolderOpen className="w-4 h-4" />
            </button>
            {host.managed && (
              <button type="button" onClick={() => void deleteHost(host)} className={`${iconBtn} hover:text-danger hover:bg-danger/10`} title="Delete" aria-label="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </header>

      {test && test !== 'running' && (
        <div className={`text-xs font-mono px-3 py-2 rounded-md border ${test.ok ? 'border-ok/40 bg-ok/10 text-ok' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {test.ok ? `ok — ${test.ms} ms` : test.error}
        </div>
      )}

      {!editable && (
        <p className="text-xs text-muted">
          This alias is defined in <Code>{tildify(host!.file)}</Code>, not in <Code>~/.ssh/hosts/</Code>, so it is shown read-only. Edit the file directly, or create a managed host with a
          different alias.
        </p>
      )}

      <fieldset disabled={!editable || saving} className="space-y-3">
        <Field label="Alias">
          <input
            value={form.alias}
            onChange={(e) => setForm({ ...form, alias: e.target.value })}
            disabled={editing}
            placeholder="web1"
            className={`${inputClass} font-mono`}
            autoFocus={!editing}
            required
          />
        </Field>
        <Field label="Hostname or IP">
          <input value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} placeholder="203.0.113.5" className={`${inputClass} font-mono`} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port" hint="blank = 22">
            <input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className={`${inputClass} font-mono`} inputMode="numeric" />
          </Field>
          <Field label="User" hint="blank = root">
            <input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className={`${inputClass} font-mono`} />
          </Field>
        </div>
        <Field label="Identity file" hint="blank = ~/.ssh/keys/default">
          <input value={form.identityFile} onChange={(e) => setForm({ ...form, identityFile: e.target.value })} list="sshm-key-paths" className={`${inputClass} font-mono`} />
          <datalist id="sshm-key-paths">
            {keys.filter((k) => k.privateKeyPath).map((k) => <option key={k.privateKeyPath} value={tildify(k.privateKeyPath!)} />)}
          </datalist>
        </Field>
      </fieldset>

      {formError && (
        <div className="text-xs text-danger flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{formError}</span>
        </div>
      )}
      {derived.error && !formError && <div className="text-xs text-warn">{derived.error}</div>}

      <div>
        <span className="block text-xs text-muted mb-1">{editable ? 'File that will be written' : 'Resolved values'}</span>
        <pre className="text-[11px] font-mono bg-surface-2 border border-line rounded-md p-3 text-fg-2 overflow-x-auto">{preview(derived.input)}</pre>
      </div>

      {editable && (
        <div className="flex justify-end gap-2">
          {editing && dirty && (
            <button type="button" onClick={() => setForm(fromHost(host!))} className={subtleBtn} disabled={saving}>
              Revert
            </button>
          )}
          <button type="submit" className={form.forceHash ? dangerBtn : primaryBtn} disabled={saving || !!derived.error || (editing && !dirty)}>
            {saving && <Spinner />} {form.forceHash ? 'Force overwrite' : editing ? 'Save' : 'Create'}
          </button>
        </div>
      )}
    </form>
  )
}
