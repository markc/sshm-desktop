import { execFile } from 'child_process'
import { createHash, randomBytes } from 'crypto'
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync
} from 'fs'
import { basename, dirname, join } from 'path'
import {
  HostTestResult,
  KeyCreateInput,
  LocalSshKey,
  OpResult,
  SshConfigStatus,
  SshHostInput
} from '../shared/ipc-types'
import { normaliseSshHost } from '../shared/ssh'
import { configIncludesHostsDir, expandTilde, hostsDir, listSshHosts, sshConfigPath, sshDir } from './sshConfig'

/**
 * The files this app manages, in exactly the layout `sshm` uses:
 *   ~/.ssh/config          — must contain `Include ~/.ssh/hosts/*`
 *   ~/.ssh/hosts/<alias>   — one plain ssh_config block per host
 *   ~/.ssh/keys/<name>(.pub)
 * Nothing else under ~/.ssh is ever written. Every write goes through
 * `writeManaged()`, which refuses symlinks at every level and never follows one.
 */

const FILE_ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/ // a filename too, so no `:` here
const USER_RE = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,63}$/
const CONTROL_RE = /[\x00-\x1f\x7f]/
const KEY_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$|\.$/i // reserved names, or a trailing dot
const TEST_TIMEOUT_S = 5

export const keysDir = (): string => join(sshDir(), 'keys')

// ---------------------------------------------------------------------------
// Filesystem guards
// ---------------------------------------------------------------------------

class UnsafePathError extends Error {}

/** Throw if `p` or any of its ancestors up to (and including) ~/.ssh is a symlink. */
function assertNoSymlinks(p: string): void {
  const stop = dirname(sshDir())
  let cur = p
  while (cur !== stop && cur !== dirname(cur)) {
    try {
      if (lstatSync(cur).isSymbolicLink()) throw new UnsafePathError(`${cur} is a symbolic link — refusing to touch it.`)
    } catch (err) {
      if (err instanceof UnsafePathError) throw err
      // ENOENT is fine: the path doesn't exist yet.
    }
    cur = dirname(cur)
  }
}

function ensureDir(dir: string): void {
  assertNoSymlinks(dir)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  else if (process.platform !== 'win32' && (statSync(dir).mode & 0o777) !== 0o700) chmodSync(dir, 0o700)
}

/**
 * Write `content` to a brand-new, exclusively created, randomly named temp file in
 * `dir`. Exclusive creation means no existing inode — symlink, hard link or
 * otherwise — can ever be truncated or written through. The descriptor stays open so
 * the caller can prove the installed destination is this very inode.
 */
function writeExclusive(path: string, mode: number, content: string): { fd: number; ino: bigint | number } {
  const O = fsConstants
  const fd = openSync(path, O.O_WRONLY | O.O_CREAT | O.O_EXCL | (O.O_NOFOLLOW ?? 0), mode)
  try {
    const st = fstatSync(fd)
    if (!st.isFile() || st.nlink !== 1) throw new UnsafePathError(`${path} is not a fresh regular file.`)
    fchmodSync(fd, mode)
    const buf = Buffer.from(content, 'utf8')
    let off = 0
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off)
    fsyncSync(fd)
    return { fd, ino: st.ino }
  } catch (err) {
    closeSync(fd)
    try {
      unlinkSync(path)
    } catch {
      /* ignore */
    }
    throw err
  }
}

const tempName = (dir: string): string => join(dir, `.sshm-${randomBytes(8).toString('hex')}.tmp`)

function fsyncDir(dir: string): void {
  if (process.platform === 'win32') return
  try {
    const fd = openSync(dir, 'r')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  } catch {
    /* best effort */
  }
}

const NO_HARDLINKS = new Set(['ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'EXDEV', 'EMLINK', 'ENOSYS'])

/**
 * Atomically install `content` at `file`. `exclusive` (create) links a temp into
 * place — EEXIST if anything appeared there since we checked — while replace renames
 * over the old entry. Neither ever opens the destination path, so hard links
 * elsewhere keep their own bytes; only the directory entry changes. After install,
 * the destination's inode must be the one we wrote, or the install is undone.
 * Filesystems without hard links fall back to exclusive creation at the destination.
 */
function installManaged(file: string, content: string, mode: number, exclusive: boolean): void {
  assertNoSymlinks(file)
  const dir = dirname(file)

  if (exclusive) {
    const tmp = tempName(dir)
    const { fd, ino } = writeExclusive(tmp, mode, content)
    try {
      try {
        linkSync(tmp, file)
      } catch (err: any) {
        if (!NO_HARDLINKS.has(err?.code)) throw err
        // No hard links here: create the destination itself exclusively instead.
        unlinkSync(tmp)
        const direct = writeExclusive(file, mode, content)
        closeSync(direct.fd)
        fsyncDir(dir)
        return
      }
      unlinkSync(tmp)
    } catch (err) {
      try {
        unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      throw err
    } finally {
      closeSync(fd)
    }
    verifyInstalled(file, ino)
  } else {
    const tmp = tempName(dir)
    const { fd, ino } = writeExclusive(tmp, mode, content)
    try {
      renameSync(tmp, file)
    } catch (err) {
      try {
        unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      throw err
    } finally {
      closeSync(fd)
    }
    verifyInstalled(file, ino)
  }
  fsyncDir(dir)
}

/** The directory entry we just installed must point at the inode we wrote; otherwise undo it. */
function verifyInstalled(file: string, ino: bigint | number): void {
  let st
  try {
    st = lstatSync(file)
  } catch {
    throw new UnsafePathError(`${file} vanished during install.`)
  }
  if (!st.isFile() || st.ino !== ino) {
    try {
      unlinkSync(file)
    } catch {
      /* ignore */
    }
    throw new UnsafePathError(`${file} was replaced during install — removed, nothing written.`)
  }
}

const replaceAtomic = (file: string, content: string, mode: number): void => installManaged(file, content, mode, false)

function isRegularFileNoFollow(p: string): boolean {
  try {
    return lstatSync(p).isFile()
  } catch {
    return false
  }
}

function fail(err: unknown): OpResult {
  return { success: false, error: err instanceof Error ? err.message : String(err) }
}

function run(file: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string }) | null
      const timedOut = Boolean(e?.killed || e?.signal === 'SIGTERM')
      const code = e ? (typeof e.code === 'number' ? e.code : 1) : 0
      resolve({ code, stdout: String(stdout), stderr: String(stderr), timedOut })
    })
  })
}

// ---------------------------------------------------------------------------
// ~/.ssh/config status
// ---------------------------------------------------------------------------

export function configStatus(): SshConfigStatus {
  const configPath = sshConfigPath()
  return {
    configPath,
    configExists: existsSync(configPath),
    hostsDir: hostsDir(),
    includePresent: configIncludesHostsDir(),
    managedHostCount: listSshHosts().filter((h) => h.managed).length
  }
}

/** Add `Include ~/.ssh/hosts/*` as the first line of ~/.ssh/config if it's missing. Atomic. */
export function ensureInclude(): OpResult & { changed?: boolean } {
  try {
    ensureDir(sshDir())
    ensureDir(hostsDir())
    const configPath = sshConfigPath()
    if (configIncludesHostsDir()) return { success: true, changed: false, file: configPath }
    const text = isRegularFileNoFollow(configPath) ? readFileSync(configPath, 'utf8') : ''
    replaceAtomic(configPath, `Include ~/.ssh/hosts/*\n\n${text}`, 0o600)
    return { success: true, changed: true, file: configPath }
  } catch (err) {
    return fail(err)
  }
}

// ---------------------------------------------------------------------------
// Managed host files
// ---------------------------------------------------------------------------

export function validateHostInput(input: SshHostInput): string | null {
  const alias = input.alias.trim()
  if (!FILE_ALIAS_RE.test(alias) || WINDOWS_RESERVED_RE.test(alias)) {
    return 'Alias must start with a letter or digit and contain only letters, digits, ".", "_" or "-".'
  }
  if (normaliseSshHost(input.hostName) === null) return `"${input.hostName}" is not a valid hostname or IP address.`
  if (input.port !== undefined && (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535)) {
    return `Port ${input.port} is out of range (1–65535).`
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

const CANONICAL_RE = /^Host (\S+)\n  Hostname \S+\n  Port \d+\n  User \S+\n  IdentityFile \S+\n?$/

/**
 * True when a managed file is exactly the five-line block this app writes for
 * `alias` (so rewriting loses nothing). A file whose Host line names a different
 * alias than its filename is someone's hand-made arrangement — not canonical.
 */
export function isCanonicalHostFile(text: string, alias?: string): boolean {
  const m = CANONICAL_RE.exec(text)
  if (!m) return false
  return alias === undefined || m[1] === alias
}

export const contentHash = (text: string): string => createHash('sha256').update(text).digest('hex')

/** Name of an existing file in ~/.ssh/hosts that equals `alias` ignoring case (case-insensitive FS safety). */
function existingCaseVariant(alias: string): string | null {
  let names: string[]
  try {
    names = readdirSync(hostsDir())
  } catch {
    return null
  }
  const lower = alias.toLowerCase()
  return names.find((n) => n.toLowerCase() === lower) ?? null
}

/**
 * Create or update ~/.ssh/hosts/<alias>.
 * - create: refuses if the file exists (any case) or the alias is already defined
 *   in a file we don't manage (we'd silently shadow it — `Include` comes first).
 * - update: refuses if the file is missing, and refuses to rewrite a file that
 *   isn't the canonical five lines unless `force` — a hand-edited ProxyJump etc.
 *   must not vanish on Save.
 */
export function saveHost(input: SshHostInput): OpResult {
  const invalid = validateHostInput(input)
  if (invalid) return { success: false, error: invalid }
  const alias = input.alias.trim()
  const mode = input.mode ?? 'create'
  try {
    ensureDir(sshDir())
    ensureDir(hostsDir())
    const file = join(hostsDir(), alias)
    const variant = existingCaseVariant(alias)

    if (mode === 'create') {
      if (variant !== null) {
        return { success: false, error: `~/.ssh/hosts/${variant} already exists${variant !== alias ? ' (differs only in case)' : ''}.` }
      }
      const elsewhere = listSshHosts().find((h) => h.alias.toLowerCase() === alias.toLowerCase())
      if (elsewhere) {
        return {
          success: false,
          error: `"${elsewhere.alias}" is already defined in ${elsewhere.file}. Creating ~/.ssh/hosts/${alias} would silently shadow it — edit that file instead.`
        }
      }
    } else {
      if (variant === null || !isRegularFileNoFollow(file)) return { success: false, error: `~/.ssh/hosts/${alias} does not exist.` }
      const current = readFileSync(file, 'utf8')
      const hash = contentHash(current)
      // Compare-and-swap: a force must name exactly the content on disk now, and a plain
      // update must still be looking at the version it loaded.
      if (input.force !== undefined && input.force !== hash) {
        return {
          success: false,
          code: 'changed',
          contentHash: hash,
          error: `~/.ssh/hosts/${alias} changed on disk since you saw it. Check the file and try again.`,
          file
        }
      }
      if (input.force === undefined && input.expectedHash !== undefined && input.expectedHash !== hash) {
        return { success: false, code: 'changed', contentHash: hash, error: `~/.ssh/hosts/${alias} changed on disk since you opened it. Refresh and edit again.`, file }
      }
      if (input.force === undefined && !isCanonicalHostFile(current, alias)) {
        return {
          success: false,
          code: 'non-canonical',
          contentHash: hash,
          error: `~/.ssh/hosts/${alias} contains directives beyond the standard five lines; saving would discard them. Open the file to edit it by hand, or Force overwrite.`,
          file
        }
      }
    }

    installManaged(file, renderHostFile(input), 0o600, mode === 'create')
    return { success: true, file }
  } catch (err) {
    return fail(err)
  }
}

export function deleteHost(alias: string): OpResult {
  if (!FILE_ALIAS_RE.test(alias)) return { success: false, error: 'Invalid alias.' }
  const file = join(hostsDir(), alias)
  if (!isRegularFileNoFollow(file)) {
    return { success: false, error: `${file} is not a regular file under ~/.ssh/hosts/ — only hosts there can be deleted here.` }
  }
  try {
    assertNoSymlinks(dirname(file))
    unlinkSync(file)
    return { success: true, file }
  } catch (err) {
    return fail(err)
  }
}

export function readHostFile(alias: string): string | null {
  if (!FILE_ALIAS_RE.test(alias)) return null
  const file = join(hostsDir(), alias)
  if (!isRegularFileNoFollow(file)) return null
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** `ssh -o BatchMode=yes -o ConnectTimeout=5 -- <alias> true`, timed — what `sshm test` does. */
export async function testHost(alias: string): Promise<HostTestResult> {
  if (/^-|\s/.test(alias) || CONTROL_RE.test(alias)) return { alias, ok: false, ms: 0, error: 'Invalid alias.' }
  const started = Date.now()
  const r = await run(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', `ConnectTimeout=${TEST_TIMEOUT_S}`, '-o', 'LogLevel=ERROR', '--', alias, 'true'],
    (TEST_TIMEOUT_S + 5) * 1000
  )
  const ms = Date.now() - started
  if (r.code === 0) return { alias, ok: true, ms }
  if (r.timedOut) return { alias, ok: false, ms, error: `timed out after ${Math.round(ms / 1000)}s` }
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
      out.push({ name, managed, publicKeyPath: pubPath, privateKeyPath: hasPriv ? privPath : undefined, publicKey: readPub(pubPath) })
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
  if (!KEY_NAME_RE.test(name) || WINDOWS_RESERVED_RE.test(name)) return { success: false, error: 'Key name must be letters, digits, ".", "_" or "-".' }
  const comment = (input.comment ?? '').trim()
  if (CONTROL_RE.test(comment)) return { success: false, error: 'Comment contains control characters.' }
  const type = input.type === 'rsa' ? 'rsa' : 'ed25519'
  const file = join(keysDir(), name)
  const pub = `${file}.pub`
  try {
    ensureDir(sshDir())
    ensureDir(keysDir())
    assertNoSymlinks(file)
    assertNoSymlinks(pub)
  } catch (err) {
    return fail(err)
  }
  const existed = (p: string): boolean => {
    try {
      lstatSync(p)
      return true
    } catch {
      return false
    }
  }
  if (existed(file) || existed(pub)) return { success: false, error: `${file} already exists.` }

  // Generate under a name only we know, then link the finished pair into place
  // exclusively — so a failure can only ever clean up our own files, and a key that
  // appeared concurrently under the real name is never touched.
  const tmp = tempName(keysDir())
  const tmpPub = `${tmp}.pub`
  const cleanupTemps = (): void => {
    for (const p of [tmp, tmpPub]) {
      try {
        if (isRegularFileNoFollow(p)) unlinkSync(p)
      } catch {
        /* best effort */
      }
    }
  }
  const args = ['-o', '-a', '100', '-t', type, ...(type === 'rsa' ? ['-b', '4096'] : []), '-f', tmp, '-C', comment, '-N', '']
  const r = await run('ssh-keygen', args, 60_000)
  if (r.code !== 0 || !isRegularFileNoFollow(tmp) || !isRegularFileNoFollow(tmpPub)) {
    cleanupTemps()
    return { success: false, error: r.timedOut ? 'ssh-keygen timed out.' : r.stderr.trim() || `ssh-keygen exited with code ${r.code}` }
  }
  try {
    chmodSync(tmp, 0o600)
    linkSync(tmp, file)
    try {
      linkSync(tmpPub, pub)
    } catch (err) {
      unlinkSync(file)
      throw err
    }
  } catch (err: any) {
    cleanupTemps()
    if (err?.code === 'EEXIST') return { success: false, error: `${file} appeared while generating — not overwritten.` }
    if (NO_HARDLINKS.has(err?.code)) {
      // No hard links: fall back to exclusive rename-free moves via rename (best available).
      try {
        renameSync(tmp, file)
        renameSync(tmpPub, pub)
        return { success: true, file }
      } catch (err2) {
        cleanupTemps()
        return fail(err2)
      }
    }
    return fail(err)
  }
  cleanupTemps()
  fsyncDir(keysDir())
  return { success: true, file }
}

export function deleteKey(name: string): OpResult {
  if (!KEY_NAME_RE.test(name)) return { success: false, error: 'Invalid key name.' }
  const file = join(keysDir(), name)
  const pub = `${file}.pub`
  const havePriv = isRegularFileNoFollow(file)
  const havePub = isRegularFileNoFollow(pub)
  if (!havePriv && !havePub) {
    return { success: false, error: `${file} is not a regular file under ~/.ssh/keys/ — only keys there can be deleted here.` }
  }
  try {
    assertNoSymlinks(dirname(file))
    if (havePriv) unlinkSync(file)
    if (havePub) unlinkSync(pub)
    return { success: true, file }
  } catch (err) {
    return fail(err)
  }
}

/** Paths the renderer may ask the OS to open: our managed files and ~/.ssh/config only. */
export function isOpenablePath(p: string): boolean {
  const abs = expandTilde(p)
  const allowedDirs = [hostsDir(), keysDir()]
  return abs === sshConfigPath() || allowedDirs.some((d) => dirname(abs) === d && basename(abs) === basename(p.replace(/\/+$/, '')))
}

export const expandPath = expandTilde
