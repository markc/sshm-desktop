import React, { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { LocalSshKey } from '@shared/ipc-types'

const inputClass =
  'px-2 py-1.5 text-sm rounded border border-[#ced4da] dark:border-[#373b3e] bg-white dark:bg-[#212529] text-[#212529] dark:text-white focus:outline-none focus:border-[#017cb6] w-full'
const primaryBtn =
  'px-3 py-1.5 text-xs font-medium rounded border text-white bg-[#017cb6] border-[#017cb6] hover:bg-[#016594] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5'
const subtleBtn =
  'px-2.5 py-1 text-xs font-medium rounded border text-[#017cb6] bg-[#017cb6]/10 border-[#017cb6]/30 hover:bg-[#017cb6]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5'
const iconBtn = 'p-1.5 rounded text-[#6c757d] hover:text-[#017cb6] hover:bg-[#017cb6]/10 disabled:opacity-40'

export const KeysPage: React.FC = () => {
  const [keys, setKeys] = useState<LocalSshKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ name: string; comment: string; type: 'ed25519' | 'rsa' } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setKeys(await window.sshm.listKeys())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const copy = (text: string): void => {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form) return
    setCreating(true)
    setFormError(null)
    try {
      const r = await window.sshm.createKey({ name: form.name.trim(), comment: form.comment.trim(), type: form.type })
      if (!r.success) {
        setFormError(r.error || 'ssh-keygen failed.')
        return
      }
      setNotice(`Created ${r.file} and ${r.file}.pub`)
      setForm(null)
      await refresh()
    } finally {
      setCreating(false)
    }
  }

  const remove = async (k: LocalSshKey): Promise<void> => {
    if (!confirm(`Delete key "${k.name}"?\n\n${k.privateKeyPath}\n${k.publicKeyPath}\n\nAny host still using it will stop authenticating. This cannot be undone.`)) return
    const r = await window.sshm.deleteKey(k.name)
    if (!r.success) {
      alert(r.error)
      return
    }
    setNotice(`Deleted ${r.file}`)
    await refresh()
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2.5">
            <span>SSH Keys</span>
            <span className="text-xs font-normal text-[#6c757d] bg-[#e9ecef] dark:bg-[#2b3035] px-2 py-0.5 rounded-full border border-[#ced4da] dark:border-[#373b3e]">
              {keys.length}
            </span>
          </h1>
          <p className="text-xs text-[#6c757d] mt-1">
            Keys under <code>~/.ssh/keys/</code> are managed here (created with <code>ssh-keygen -o -a 100 -t ed25519</code>, as{' '}
            <code>sshm kc</code> does); <code>~/.ssh/id_*</code> keys are listed read-only.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className={subtleBtn} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button onClick={() => { setFormError(null); setForm({ name: '', comment: '', type: 'ed25519' }) }} className={primaryBtn}>
            <Plus className="w-3.5 h-3.5" /> New key
          </button>
        </div>
      </div>

      {notice && (
        <div role="status" className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs rounded flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Check className="w-4 h-4" /> {notice}</span>
          <button onClick={() => setNotice(null)} className="hover:underline">Dismiss</button>
        </div>
      )}

      <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden flex-shrink-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] text-[#495057] dark:text-[#ced4da] font-semibold">
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Fingerprint</th>
                <th className="py-2.5 px-4">Comment</th>
                <th className="py-2.5 px-4">Private key</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
              {keys.map((k) => (
                <tr key={k.publicKeyPath || k.name} className="hover:bg-[#f8f9fa] dark:hover:bg-[#262a2e]">
                  <td className="py-2 px-4 font-mono font-semibold text-[#017cb6] flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-[#f1ca00]" /> {k.name}
                    {k.managed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-[#017cb6]/10 text-[#017cb6] border border-[#017cb6]/30">managed</span>
                    )}
                  </td>
                  <td className="py-2 px-4 font-mono">{k.type ? `${k.type}${k.bits ? ` ${k.bits}` : ''}` : '—'}</td>
                  <td className="py-2 px-4 font-mono truncate max-w-[260px]" title={k.fingerprint}>{k.fingerprint || '—'}</td>
                  <td className="py-2 px-4 truncate max-w-[200px]" title={k.comment}>{k.comment || <span className="text-[#adb5bd]">—</span>}</td>
                  <td className="py-2 px-4 font-mono">
                    {k.privateKeyPath ? k.privateKeyPath.replace(/^\/home\/[^/]+/, '~') : <span className="text-amber-600">public only</span>}
                  </td>
                  <td className="py-2 px-4">
                    <div className="flex items-center justify-end gap-0.5">
                      {k.publicKey && (
                        <button onClick={() => copy(k.publicKey!)} className={iconBtn} title="Copy public key" aria-label="Copy public key">
                          {copied === k.publicKey ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                      )}
                      {k.managed && (
                        <button onClick={() => remove(k)} className={`${iconBtn} hover:text-rose-500`} title="Delete key pair" aria-label="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={6} className="py-8 px-4 text-center text-[#6c757d]">No keys found in ~/.ssh/keys/ or ~/.ssh/id_*.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => !creating && setForm(null)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-2xl overflow-hidden">
            <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] flex items-center justify-between">
              <h3 className="font-semibold text-sm">New key in ~/.ssh/keys/</h3>
              <button type="button" onClick={() => setForm(null)} className="text-[#6c757d] hover:text-rose-500" aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs text-[#6c757d]">Name (file name under ~/.ssh/keys/)</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="wan" className={`${inputClass} font-mono`} autoFocus required />
              </label>
              <label className="block">
                <span className="text-xs text-[#6c757d]">Comment</span>
                <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="markc@cachyos" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-xs text-[#6c757d]">Type</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'ed25519' | 'rsa' })} className={inputClass}>
                  <option value="ed25519">ed25519 (recommended)</option>
                  <option value="rsa">rsa 4096</option>
                </select>
              </label>
              <p className="text-[11px] text-[#6c757d]">Generated without a passphrase, as <code>sshm kc</code> does by default. Add one later with <code>ssh-keygen -p</code> if you want.</p>
              {formError && (
                <div className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> <span>{formError}</span></div>
              )}
            </div>
            <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-t border-[#ced4da] dark:border-[#373b3e] flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className={subtleBtn} disabled={creating}>Cancel</button>
              <button type="submit" className={primaryBtn} disabled={creating}>{creating && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Generate</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
