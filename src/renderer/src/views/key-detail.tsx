import React, { useState } from 'react'
import { AlertTriangle, Check, Copy, FolderOpen, Trash2 } from 'lucide-react'
import { LocalSshKey } from '@shared/ipc-types'
import { useStore } from '@/state/store'
import { errorMessage, tildify } from '@/lib/format'
import { Badge, Code, Field, Spinner, iconBtn, inputClass, primaryBtn } from '@/components/ui'

/** Main pane for a selected key, or the new-key form. */
export const KeyDetail: React.FC<{ keyInfo: LocalSshKey | null }> = ({ keyInfo }) => (keyInfo ? <ExistingKey k={keyInfo} /> : <NewKey />)

const ExistingKey: React.FC<{ k: LocalSshKey }> = ({ k }) => {
  const { deleteKey, openFile } = useStore()
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    if (!k.publicKey) return
    await navigator.clipboard.writeText(k.publicKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const Row: React.FC<{ label: string; value?: string; mono?: boolean; path?: string }> = ({ label, value, mono = true, path }) => (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 border-b border-line-muted last:border-0 text-sm">
      <span className="text-xs text-muted pt-0.5">{label}</span>
      <span className={`min-w-0 break-all flex items-start gap-2 ${mono ? 'font-mono text-fg-2' : 'text-fg'}`}>
        <span className="min-w-0 flex-1">{value || <span className="text-muted">—</span>}</span>
        {path && (
          <button onClick={() => void openFile(path)} className={`${iconBtn} -my-1.5`} title={`Open ${tildify(path)}`} aria-label="Open file">
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold font-mono truncate flex items-center gap-2.5">
            {k.name}
            {k.managed ? <Badge>managed</Badge> : <Badge tone="muted">~/.ssh/id_*</Badge>}
            {!k.privateKeyPath && <Badge tone="warn">public only</Badge>}
          </h1>
          <p className="text-xs text-muted mt-1 font-mono truncate">{tildify(k.privateKeyPath || k.publicKeyPath || '')}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {k.publicKey && (
            <button onClick={() => void copy()} className={primaryBtn} title="Copy the public key">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy public key'}
            </button>
          )}
          {k.managed && (
            <button onClick={() => void deleteKey(k)} className={`${iconBtn} hover:text-danger hover:bg-danger/10`} title="Delete key pair" aria-label="Delete">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      <div className="rounded-md border border-line bg-surface-2 px-4">
        <Row label="Type" value={k.type ? `${k.type}${k.bits ? ` ${k.bits}` : ''}` : undefined} />
        <Row label="Fingerprint" value={k.fingerprint} />
        <Row label="Comment" value={k.comment} mono={false} />
        <Row label="Private key" value={k.privateKeyPath ? tildify(k.privateKeyPath) : undefined} path={k.privateKeyPath} />
        <Row label="Public key" value={k.publicKeyPath ? tildify(k.publicKeyPath) : undefined} path={k.publicKeyPath} />
      </div>

      {k.publicKey && (
        <div>
          <span className="block text-xs text-muted mb-1">Public key — paste into a server's authorized_keys</span>
          <pre className="text-[11px] font-mono bg-surface-2 border border-line rounded-md p-3 text-fg-2 whitespace-pre-wrap break-all select-text">{k.publicKey}</pre>
        </div>
      )}

      {!k.managed && (
        <p className="text-xs text-muted">
          Keys outside <Code>~/.ssh/keys/</Code> are listed for reference only. Manage them with <Code>ssh-keygen</Code> directly.
        </p>
      )}
    </div>
  )
}

const NewKey: React.FC = () => {
  const { createKey } = useStore()
  const [form, setForm] = useState<{ name: string; comment: string; type: 'ed25519' | 'rsa' }>({ name: '', comment: '', type: 'ed25519' })
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    setError(null)
    try {
      const r = await createKey({ name: form.name.trim(), comment: form.comment.trim(), type: form.type })
      if (!r.success) setError(r.error || 'ssh-keygen failed.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto p-6 space-y-5">
      <header>
        <h1 className="text-xl font-bold">New key</h1>
        <p className="text-xs text-muted mt-1">
          <Code>ssh-keygen -o -a 100 -t ed25519 -f ~/.ssh/keys/&lt;name&gt;</Code> — as <Code>sshm kc</Code> does. Generated without a passphrase; add one later with{' '}
          <Code>ssh-keygen -p</Code> if you want.
        </p>
      </header>
      <fieldset disabled={creating} className="space-y-3">
        <Field label="Name" hint="file name under ~/.ssh/keys/">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="wan" className={`${inputClass} font-mono`} autoFocus required />
        </Field>
        <Field label="Comment">
          <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="markc@cachyos" className={inputClass} />
        </Field>
        <Field label="Type">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'ed25519' | 'rsa' })} className={inputClass}>
            <option value="ed25519">ed25519 (recommended)</option>
            <option value="rsa">rsa 4096</option>
          </select>
        </Field>
      </fieldset>
      {error && (
        <div className="text-xs text-danger flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      <div className="flex justify-end">
        <button type="submit" className={primaryBtn} disabled={creating}>
          {creating && <Spinner />} Generate
        </button>
      </div>
    </form>
  )
}
