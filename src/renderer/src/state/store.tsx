import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { HostTestResult, KeyCreateInput, LocalSshKey, OpResult, SshConfigStatus, SshHost, SshHostInput } from '@shared/ipc-types'
import { errorMessage, tildify } from '@/lib/format'

/** What the main pane shows. Lists live in the left carousel; this is the one selected thing. */
export type Selection =
  | { kind: 'none' }
  | { kind: 'host'; alias: string }
  | { kind: 'new-host' }
  | { kind: 'key'; name: string }
  | { kind: 'new-key' }

export type TestState = HostTestResult | 'running'

interface Store {
  hosts: SshHost[]
  keys: LocalSshKey[]
  status: SshConfigStatus | null
  loading: boolean
  loadError: string | null
  tests: Record<string, TestState>
  notice: string | null
  setNotice: (n: string | null) => void
  selection: Selection
  select: (s: Selection) => void
  refresh: () => Promise<void>
  testHost: (alias: string) => Promise<void>
  testAll: (aliases: string[]) => Promise<void>
  testingAll: boolean
  saveHost: (input: SshHostInput) => Promise<OpResult>
  deleteHost: (host: SshHost) => Promise<boolean>
  createKey: (input: KeyCreateInput) => Promise<OpResult>
  deleteKey: (key: LocalSshKey) => Promise<boolean>
  fixInclude: () => Promise<void>
  openFile: (path: string) => Promise<void>
}

const StoreContext = createContext<Store | null>(null)

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hosts, setHosts] = useState<SshHost[]>([])
  const [keys, setKeys] = useState<LocalSshKey[]>([])
  const [status, setStatus] = useState<SshConfigStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, TestState>>({})
  const [testingAll, setTestingAll] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selection, select] = useState<Selection>({ kind: 'none' })

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [h, s, k] = await Promise.all([window.sshm.listHosts(), window.sshm.configStatus(), window.sshm.listKeys()])
      setHosts(Array.isArray(h) ? h : [])
      setStatus(s)
      setKeys(Array.isArray(k) ? k : [])
    } catch (err) {
      setLoadError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A selection that no longer exists (deleted, or the file vanished) falls back to nothing.
  useEffect(() => {
    if (loading) return
    if (selection.kind === 'host' && !hosts.some((h) => h.alias === selection.alias)) select({ kind: 'none' })
    if (selection.kind === 'key' && !keys.some((k) => k.name === selection.name)) select({ kind: 'none' })
  }, [hosts, keys, loading, selection])

  const testHost = useCallback(async (alias: string) => {
    setTests((t) => ({ ...t, [alias]: 'running' }))
    let r: HostTestResult
    try {
      r = await window.sshm.testHost(alias)
    } catch (err) {
      r = { alias, ok: false, ms: 0, error: errorMessage(err) }
    }
    setTests((t) => ({ ...t, [alias]: r }))
  }, [])

  const testAll = useCallback(
    async (aliases: string[]) => {
      setTestingAll(true)
      try {
        const queue = [...aliases]
        const worker = async (): Promise<void> => {
          for (let alias = queue.shift(); alias !== undefined; alias = queue.shift()) await testHost(alias)
        }
        await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
      } finally {
        setTestingAll(false)
      }
    },
    [testHost]
  )

  const saveHost = useCallback(
    async (input: SshHostInput): Promise<OpResult> => {
      const r = await window.sshm.saveHost(input)
      if (r.success) {
        setNotice(`${input.mode === 'update' ? 'Updated' : 'Created'} ${tildify(r.file || '')}`)
        await refresh()
        select({ kind: 'host', alias: input.alias })
      }
      return r
    },
    [refresh]
  )

  const deleteHost = useCallback(
    async (h: SshHost): Promise<boolean> => {
      if (!confirm(`Delete ${tildify(h.file)}?\n\nThis removes the "${h.alias}" alias. The server and its key are untouched.`)) return false
      try {
        const r = await window.sshm.deleteHost(h.alias)
        if (!r.success) {
          alert(r.error)
          return false
        }
        setNotice(`Deleted ${tildify(r.file || '')}`)
        select({ kind: 'none' })
        await refresh()
        return true
      } catch (err) {
        alert(errorMessage(err))
        return false
      }
    },
    [refresh]
  )

  const createKey = useCallback(
    async (input: KeyCreateInput): Promise<OpResult> => {
      const r = await window.sshm.createKey(input)
      if (r.success) {
        setNotice(`Created ${tildify(r.file || '')} and ${tildify(r.file || '')}.pub`)
        await refresh()
        select({ kind: 'key', name: input.name })
      }
      return r
    },
    [refresh]
  )

  const deleteKey = useCallback(
    async (k: LocalSshKey): Promise<boolean> => {
      if (!confirm(`Delete key "${k.name}"?\n\n${k.privateKeyPath}\n${k.publicKeyPath}\n\nAny host still using it will stop authenticating. This cannot be undone.`)) return false
      try {
        const r = await window.sshm.deleteKey(k.name)
        if (!r.success) {
          alert(r.error)
          return false
        }
        setNotice(`Deleted ${tildify(r.file || '')}`)
        select({ kind: 'none' })
        await refresh()
        return true
      } catch (err) {
        alert(errorMessage(err))
        return false
      }
    },
    [refresh]
  )

  const fixInclude = useCallback(async () => {
    try {
      const r = await window.sshm.ensureInclude()
      if (!r.success) {
        alert(r.error)
        return
      }
      setNotice(r.changed ? `Added "Include ~/.ssh/hosts/*" to ${tildify(r.file || '')}` : 'Include line already present.')
      await refresh()
    } catch (err) {
      alert(errorMessage(err))
    }
  }, [refresh])

  const openFile = useCallback(async (p: string) => {
    const r = await window.sshm.openPath(p).catch((err) => ({ success: false, error: errorMessage(err) }))
    if (!r.success) alert(r.error)
  }, [])

  const value = useMemo<Store>(
    () => ({
      hosts,
      keys,
      status,
      loading,
      loadError,
      tests,
      notice,
      setNotice,
      selection,
      select,
      refresh,
      testHost,
      testAll,
      testingAll,
      saveHost,
      deleteHost,
      createKey,
      deleteKey,
      fixInclude,
      openFile
    }),
    [hosts, keys, status, loading, loadError, tests, notice, selection, refresh, testHost, testAll, testingAll, saveHost, deleteHost, createKey, deleteKey, fixInclude, openFile]
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
