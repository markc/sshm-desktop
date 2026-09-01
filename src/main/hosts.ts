import { execFile } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import {
  HostTestResult,
  KeyCreateInput,
  LocalSshKey,
  OpResult,
  SshConfigStatus,
  SshHostInput
} from '../shared/ipc-types'
import { normaliseSshHost } from '../shared/ssh'
import { SAFE_ALIAS_RE, expandTilde, hostsDir, listSshHosts, sshConfigPath, sshDir } from './sshConfig'

/**
 * The files this app manages, in exactly the layout `sshm` uses:
 *   ~/.ssh/config          — must contain `Include ~/.ssh/hosts/*`
 *   ~/.ssh/hosts/<alias>   — one plain ssh_config block per host
 *   ~/.ssh/keys/<name>(.pub)
 * Nothing else under ~/.ssh is ever written.
 */

const FILE_ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/ // a filename too, so no `:` here
const USER_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,63}$/
const CONTROL_RE = /[\x00-\x1f\x7f]/
const KEY_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const TEST_TIMEOUT_S = 5

export const keysDir = (): string => join(sshDir(), 'keys')

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
}

function run(file: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      const code = err && typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number'
        ? ((err as unknown as { code: number }).code)
        : err
          ? 1
          : 0
      resolve({ code, stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

// ---------------------------------------------------------------------------
// ~/.ssh/config status
// ---------------------------------------------------------------------------

const INCLUDE_RE = /^\s*include\s+(?:"?~\/\.ssh\/hosts\/\*"?|"?\$HOME\/\.ssh\/hosts\/\*"?|hosts\/\*)\s*$/im

export function configStatus(): SshConfigStatus {
  const configPath = sshConfigPath()
  const configExists = existsSync(configPath)
  const text = configExists ? readFileSync(configPath, 'utf8') : ''
  return {
    configPath,
    configExists,
    hostsDir: hostsDir(),
    includePresent: INCLUDE_RE.test(text),
    managedHostCount: listSshHosts().filter((h) => h.managed).length
  }
}

/** Add `Include ~/.ssh/hosts/*` as the first line of ~/.ssh/config if it's missing. */
export function ensureInclude(): OpResult & { changed?: boolean } {
  try {
    ensureDir(sshDir())
    ensureDir(hostsDir())
    const configPath = sshConfigPath()
    const text = existsSync(configPath) ? readFileSync(configPath, 'utf8') : ''
    if (INCLUDE_RE.test(text)) return { success: true, changed: false, file: configPath }
    writeFileSync(configPath, `Include ~/.ssh/hosts/*\n\n${text}`, { mode: 0o600 })
    return { success: true, changed: true, file: configPath }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}

// ---------------------------------------------------------------------------
// Managed host files
// ---------------------------------------------------------------------------

export function validateHostInput(input: SshHostInput): string | null {
  const alias = input.alias.trim()
  if (!FILE_ALIAS_RE.test(alias) || !SAFE_ALIAS_RE.test(alias)) {
    return 'Alias must start with a letter or digit and contain only letters, digits, ".", "_" or "-".'
  }
  if (normaliseSshHost(input.hostName) === null) return `"${input.hostName}" is not a valid hostname or IP address.`
  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    return `Port ${input.port} is out of range.`
  }
  if (input.user !== undefined && input.user !== '' && !USER_RE.test(input.user)) return `"${input.user}" is not a valid username.`
  if (input.identityFile !== undefined && input.identityFile !== '') {
    if (CONTROL_RE.test(input.identityFile) || /\s/.test(input.identityFile)) {
      return 'The identity file path must not contain whitespace or control characters.'
    }
  }
  return null
}

/** The exact text `sshm create` writes. */
export function renderHostFile(input: SshHostInput): string {
  const host = normaliseSshHost(input.hostName) ?? input.hostName.trim()
  const port = input.port ?? 22
  const user = input.user?.trim() || 'root'
  const key = input.identityFile?.trim() || '~/.ssh/keys/default'
  return `Host ${input.alias.trim()}\n  Hostname ${host}\n  Port ${port}\n  User ${user}\n  IdentityFile ${key}\n`
}

export function saveHost(input: SshHostInput): OpResult {
  const invalid = validateHostInput(input)
  if (invalid) return { success: false, error: invalid }
  try {
    ensureDir(sshDir())
    ensureDir(hostsDir())
    const file = join(hostsDir(), input.alias.trim())
    writeFileSync(file, renderHostFile(input), { mode: 0o600 })
    return { success: true, file }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}

export function deleteHost(alias: string): OpResult {
  if (!FILE_ALIAS_RE.test(alias)) return { success: false, error: 'Invalid alias.' }
  const file = join(hostsDir(), alias)
  if (!existsSync(file)) return { success: false, error: `${file} does not exist — only hosts under ~/.ssh/hosts/ can be deleted here.` }
  try {
    unlinkSync(file)
    return { success: true, file }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}

export function readHostFile(alias: string): string | null {
  if (!FILE_ALIAS_RE.test(alias)) return null
  const file = join(hostsDir(), alias)
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** `ssh -o BatchMode=yes -o ConnectTimeout=5 <alias> true`, timed — what `sshm test` does. */
export async function testHost(alias: string): Promise<HostTestResult> {
  if (!SAFE_ALIAS_RE.test(alias)) return { alias, ok: false, ms: 0, error: 'Invalid alias.' }
  const started = Date.now()
  const r = await run(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${TEST_TIMEOUT_S}`, '-o', 'LogLevel=ERROR', '--', alias, 'true'],
    (TEST_TIMEOUT_S + 5) * 1000
  )
  const ms = Date.now() - started
  if (r.code === 0) return { alias, ok: true, ms }
  const lastLine = r.stderr.trim().split('\n').filter(Boolean).pop() || `ssh exited with code ${r.code}`
  return { alias, ok: false, ms, error: lastLine.replace(/^ssh: /, '') }
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

async function keyInfo(pubPath: string): Promise<Pick<LocalSshKey, 'type' | 'bits' | 'fingerprint' | 'comment'>> {
  const r = await run('ssh-keygen', ['-l', '-f', pubPath], 5000)
  if (r.code !== 0) return {}
  // "256 SHA256:xxxx comment (ED25519)"
  const m = /^(\d+)\s+(\S+)\s+(.*?)\s+\((\w+)\)\s*$/.exec(r.stdout.trim())
  if (!m) return {}
  return { bits: Number(m[1]), fingerprint: m[2], comment: m[3] === 'no comment' ? '' : m[3], type: m[4] }
}

function readPub(pubPath: string): string | undefined {
  try {
    return readFileSync(pubPath, 'utf8').trim()
  } catch {
    return undefined
  }
}

export async function listKeys(): Promise<LocalSshKey[]> {
  const out: LocalSshKey[] = []
  const scan = (dir: string, managed: boolean, accept: (name: string) => boolean): void => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const f of names) {
      if (!f.endsWith('.pub')) continue
      const name = f.slice(0, -4)
      if (!accept(name)) continue
      const pubPath = join(dir, f)
      const privPath = join(dir, name)
      let hasPriv = false
      try {
        hasPriv = statSync(privPath).isFile()
      } catch {
        hasPriv = false
      }
      out.push({
        name,
        managed,
        publicKeyPath: pubPath,
        privateKeyPath: hasPriv ? privPath : undefined,
        publicKey: readPub(pubPath)
      })
    }
  }
  scan(keysDir(), true, () => true)
  scan(sshDir(), false, (name) => name.startsWith('id_'))
  await Promise.all(
    out.map(async (k) => {
      if (k.publicKeyPath) Object.assign(k, await keyInfo(k.publicKeyPath))
    })
  )
  return out.sort((a, b) => Number(b.managed) - Number(a.managed) || a.name.localeCompare(b.name))
}

/** `ssh-keygen -o -a 100 -t ed25519 -f ~/.ssh/keys/NAME -C comment -N ''` — as `sshm kc`, minus the passphrase prompt. */
export async function createKey(input: KeyCreateInput): Promise<OpResult> {
  const name = input.name.trim()
  if (!KEY_NAME_RE.test(name)) return { success: false, error: 'Key name must be letters, digits, ".", "_" or "-".' }
  const comment = (input.comment ?? '').trim()
  if (CONTROL_RE.test(comment)) return { success: false, error: 'Comment contains control characters.' }
  const type = input.type === 'rsa' ? 'rsa' : 'ed25519'
  try {
    ensureDir(sshDir())
    ensureDir(keysDir())
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
  const file = join(keysDir(), name)
  if (existsSync(file) || existsSync(`${file}.pub`)) return { success: false, error: `${file} already exists.` }
  const args = ['-o', '-a', '100', '-t', type, ...(type === 'rsa' ? ['-b', '4096'] : []), '-f', file, '-C', comment, '-N', '']
  const r = await run('ssh-keygen', args, 60_000)
  if (r.code !== 0) return { success: false, error: r.stderr.trim() || `ssh-keygen exited with code ${r.code}` }
  return { success: true, file }
}

export function deleteKey(name: string): OpResult {
  if (!KEY_NAME_RE.test(name)) return { success: false, error: 'Invalid key name.' }
  const file = join(keysDir(), name)
  if (basename(file) !== name) return { success: false, error: 'Invalid key name.' }
  if (!existsSync(file) && !existsSync(`${file}.pub`)) {
    return { success: false, error: `${file} does not exist — only keys under ~/.ssh/keys/ can be deleted here.` }
  }
  try {
    if (existsSync(file)) unlinkSync(file)
    if (existsSync(`${file}.pub`)) unlinkSync(`${file}.pub`)
    return { success: true, file }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) }
  }
}

/** Resolve `~/...` for display / opening. */
export const expandPath = expandTilde
