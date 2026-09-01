import { createHash } from 'crypto'
import { readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, dirname, isAbsolute, join, resolve } from 'path'
import { normaliseSshHost } from '../shared/ssh'
import { SshHost } from '../shared/ipc-types'

/**
 * ~/.ssh/config reader: enough to list the user's aliases with the values ssh
 * would actually use for them, and to answer "which alias already points at
 * this address?" so a launch can run `ssh <alias>` and let the user's own key /
 * port / user settings apply.
 *
 * Semantics kept from ssh_config(5): blocks are matched in file order with
 * `*` / `?` globs and `!` negation; the FIRST value obtained for an option wins;
 * `Include` is textual (included lines belong to the enclosing block); `Match`
 * blocks are not evaluated and are skipped entirely; `%h` / `%%` in HostName
 * are expanded, any other `%` token makes that alias's HostName unknown.
 * Known limitation: only the last path segment of an Include may contain a glob.
 */

export interface ConfigBlock {
  /** Raw patterns from the Host line, in order (negated ones keep their `!`). */
  patterns: string[]
  /** Source file of the Host line. */
  file: string
  hostName?: string
  user?: string
  port?: number
  identityFile?: string
}

interface ParseState {
  blocks: ConfigBlock[]
  current: ConfigBlock | null
  inMatch: boolean
  stack: string[] // files currently being parsed, for cycle detection
}

const MAX_INCLUDE_DEPTH = 8
/**
 * A literal alias we can list and pass to ssh as one argv word (after `--`):
 * anything ssh itself accepts except glob/negation patterns, whitespace, a
 * leading `-`, and control characters. Shell safety is handled at argv/quoting
 * time, not here — `db+prod` is a perfectly good alias.
 */
export const SAFE_ALIAS_RE = /^[^-\s*?!\x00-\x1f\x7f][^\s*?!\x00-\x1f\x7f]*$/

export const sshDir = (): string => join(homedir(), '.ssh')
export const sshConfigPath = (): string => join(sshDir(), 'config')
export const hostsDir = (): string => join(sshDir(), 'hosts')

export function expandTilde(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

/** Expand a single Include pattern; only the last path segment may contain `*` / `?`. */
function expandIncludePattern(pattern: string, baseDir: string): string[] {
  let p = expandTilde(pattern)
  if (!isAbsolute(p)) p = resolve(baseDir, p)
  const dir = dirname(p)
  const namePattern = basename(p)
  if (!/[*?]/.test(namePattern)) return isFile(p) ? [p] : []
  const re = globToRegExp(namePattern, false)
  return safeReaddir(dir)
    .filter((f) => !f.startsWith('.') && re.test(f)) // POSIX globs don't match dotfiles
    .map((f) => join(dir, f))
    .filter(isFile)
    .sort()
}

/** ssh-style glob → RegExp: `*` any run, `?` one char, everything else literal. */
function globToRegExp(glob: string, ignoreCase: boolean): RegExp {
  const src = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${src}$`, ignoreCase ? 'i' : '')
}

/**
 * Tokenise one ssh_config line: strips a comment only at line start or after
 * whitespace (ssh does not honour `#` glued to a token), handles the optional
 * `=` after the keyword, and strips double quotes around tokens.
 */
function tokenise(rawLine: string): { keyword: string; args: string[] } | null {
  const line = rawLine.replace(/^﻿/, '').replace(/(^|\s)#.*$/, '').trim()
  if (!line) return null
  const kw = /^([A-Za-z][A-Za-z0-9]*)\s*(?:=\s*|\s+)(.*)$/.exec(line)
  if (!kw) return null
  const keyword = kw[1].toLowerCase()
  const args: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(kw[2])) !== null) args.push(m[1] !== undefined ? m[1] : m[2])
  return { keyword, args }
}

function parseFile(file: string, state: ParseState, depth: number): void {
  if (depth > MAX_INCLUDE_DEPTH || state.stack.includes(file)) return
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  state.stack.push(file)
  try {
    for (const rawLine of text.split(/\r?\n/)) {
      const tok = tokenise(rawLine)
      if (!tok) continue
      const { keyword, args } = tok

      if (keyword === 'match') {
        // `Match all` is unconditional — treat its contents like top level. Any other
        // Match expression is not evaluated, so its contents (Includes too) are skipped.
        state.inMatch = !(args.length === 1 && args[0].toLowerCase() === 'all')
        state.current = null
        continue
      }
      if (keyword === 'host') {
        state.inMatch = false
        state.current = { patterns: args.filter(Boolean), file }
        state.blocks.push(state.current)
        continue
      }
      if (state.inMatch) continue // contents of Match blocks are not evaluated — including Includes

      if (keyword === 'include') {
        for (const pat of args) {
          for (const f of expandIncludePattern(pat, sshDir())) parseFile(f, state, depth + 1)
        }
        continue
      }

      const value = args[0]
      if (value === undefined) continue
      if (!['hostname', 'user', 'port', 'identityfile'].includes(keyword)) continue
      if (!state.current) {
        // Top-level (before any Host line) applies to everything: model as `Host *`.
        state.current = { patterns: ['*'], file }
        state.blocks.push(state.current)
      }
      const b = state.current
      // First value wins within a block; across blocks it's resolved at lookup time.
      if (keyword === 'hostname' && b.hostName === undefined) b.hostName = value
      else if (keyword === 'user' && b.user === undefined) b.user = value
      else if (keyword === 'port' && b.port === undefined && /^\d+$/.test(value)) b.port = Number(value)
      else if (keyword === 'identityfile' && b.identityFile === undefined) b.identityFile = value
    }
  } finally {
    state.stack.pop()
  }
}

/** Parse the user's ssh config (default ~/.ssh/config) into ordered blocks. */
export function readSshConfigBlocks(configPath = sshConfigPath()): ConfigBlock[] {
  const state: ParseState = { blocks: [], current: null, inMatch: false, stack: [] }
  parseFile(configPath, state, 0)
  return state.blocks
}

/**
 * Does a Host block apply to `alias`? Any positive pattern matches and no negated
 * one does. ssh lowercases the destination before matching, so this is
 * case-insensitive.
 */
function blockMatches(block: ConfigBlock, alias: string): boolean {
  let positive = false
  for (const p of block.patterns) {
    if (p.startsWith('!')) {
      if (globToRegExp(p.slice(1), true).test(alias)) return false
    } else if (globToRegExp(p, true).test(alias)) {
      positive = true
    }
  }
  return positive
}

/**
 * Does ~/.ssh/config pull in ~/.ssh/hosts/* unconditionally? Reads the top-level
 * file only (an Include inside a Match block doesn't count), accepting any of
 * the spellings ssh accepts for that path.
 */
export function configIncludesHostsDir(configPath = sshConfigPath()): boolean {
  let text: string
  try {
    text = readFileSync(configPath, 'utf8')
  } catch {
    return false
  }
  const wanted = join(hostsDir(), '*')
  // An Include only counts when it applies to every destination: before any block,
  // or inside a `Host *`-style block with no negations. Inside `Host bastion` or a
  // Match block it is conditional.
  let global = true
  for (const rawLine of text.split(/\r?\n/)) {
    const tok = tokenise(rawLine)
    if (!tok) continue
    if (tok.keyword === 'match') global = tok.args.length === 1 && tok.args[0].toLowerCase() === 'all' // `Match all` is unconditional
    else if (tok.keyword === 'host') global = tok.args.includes('*') && !tok.args.some((a) => a.startsWith('!'))
    else if (tok.keyword === 'include' && global) {
      for (const arg of tok.args) {
        let p = expandTilde(arg.replace(/^\$\{?HOME\}?/, '~'))
        if (!isAbsolute(p)) p = resolve(sshDir(), p)
        if (p === wanted) return true
      }
    }
  }
  return false
}

/** First value of `key` among blocks that apply to `alias`, as ssh resolves it. */
function effective<K extends 'hostName' | 'user' | 'port' | 'identityFile'>(
  alias: string,
  blocks: ConfigBlock[],
  key: K
): ConfigBlock[K] | undefined {
  for (const b of blocks) {
    if (b[key] === undefined || !blockMatches(b, alias)) continue
    if (key === 'hostName') {
      const expanded = (b.hostName as string).replace(/%%/g, '\0').replace(/%h/g, alias)
      if (expanded.includes('%')) return undefined // %-token we don't expand — don't guess
      return expanded.replace(/\0/g, '%') as ConfigBlock[K]
    }
    return b[key]
  }
  return undefined
}

/** Every literal, shell-safe alias in definition order (first definition wins). */
function literalAliases(blocks: ConfigBlock[]): Array<{ alias: string; file: string }> {
  const out: Array<{ alias: string; file: string }> = []
  const seen = new Set<string>()
  for (const b of blocks) {
    for (const p of b.patterns) {
      if (!SAFE_ALIAS_RE.test(p) || p.includes('*') || p.includes('?')) continue
      const key = p.toLowerCase() // ssh matches case-insensitively, so `Prod` and `prod` are one alias
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ alias: p, file: b.file })
    }
  }
  return out
}

/**
 * All aliases with the values ssh resolves for them from Host blocks (Match blocks
 * are not evaluated; multiple IdentityFile lines collapse to the first).
 */
export function listSshHosts(blocks: ConfigBlock[] = readSshConfigBlocks()): SshHost[] {
  const managedDir = hostsDir()
  return literalAliases(blocks).map(({ alias, file }) => {
    const managed = dirname(file) === managedDir && basename(file) === alias
    let contentHash: string | undefined
    if (managed) {
      try {
        contentHash = createHash('sha256').update(readFileSync(file)).digest('hex')
      } catch {
        contentHash = undefined
      }
    }
    return {
      alias,
      hostName: effective(alias, blocks, 'hostName'),
      user: effective(alias, blocks, 'user'),
      port: effective(alias, blocks, 'port'),
      identityFile: effective(alias, blocks, 'identityFile'),
      file,
      managed,
      contentHash
    }
  })
}

/**
 * Find an alias the user already has for a server, or null.
 *
 * Preference: a literal `Host <serverName>` block whose effective HostName is
 * absent or agrees with the address, then any alias whose effective HostName
 * is the address or the name. An alias identical to the address itself is
 * never returned — it renames nothing, and `ssh <ip>` would drop the `root@`
 * the caller asked for while ssh applies that block anyway.
 */
export function findSshAlias(
  target: { host: string; serverName?: string },
  blocks: ConfigBlock[] = readSshConfigBlocks()
): string | null {
  const host = (normaliseSshHost(target.host) ?? target.host.trim()).toLowerCase()
  const name = target.serverName?.trim().toLowerCase()
  const aliases = literalAliases(blocks).filter((a) => a.alias.toLowerCase() !== host)
  const agrees = (hn: string | undefined): boolean =>
    hn === undefined || hn.toLowerCase() === host || (name !== undefined && hn.toLowerCase() === name)

  if (name) {
    const exact = aliases.find((a) => a.alias.toLowerCase() === name)
    if (exact && agrees(effective(exact.alias, blocks, 'hostName'))) return exact.alias
  }
  for (const a of aliases) {
    const hn = effective(a.alias, blocks, 'hostName')?.toLowerCase()
    if (hn !== undefined && (hn === host || (name !== undefined && hn === name))) return a.alias
  }
  return null
}
