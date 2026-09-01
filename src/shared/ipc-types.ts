/**
 * The contract between the renderer and the main process, exposed by the
 * preload as `window.sshm`. Everything here is plain data: the main process
 * owns the filesystem and child processes, the renderer only asks.
 */

// ---------------------------------------------------------------------------
// Launching ssh in a native terminal
// ---------------------------------------------------------------------------

export interface TerminalLaunchOptions {
  /** Destination: a hostname/IP, or (when `alias` is set) ignored in favour of the alias. */
  host: string
  /**
   * Launch this ~/.ssh/config alias verbatim — `ssh -- <alias>` — so its User / Port /
   * IdentityFile apply. No host validation or alias lookup happens; the alias only has
   * to be a single argv word. Set by the Hosts page.
   */
  alias?: string
  username?: string
  port?: number
  privateKeyPath?: string
  /** The server's display name, so a `Host <name>` alias in ~/.ssh/config can match too. */
  serverName?: string
  /**
   * username / port / privateKeyPath were typed or chosen deliberately by the user (not
   * app defaults). When a ~/.ssh/config alias matches, they are then passed alongside
   * the alias (`ssh -l user -p port -i key alias`) instead of being dropped in its favour.
   */
  userSpecified?: boolean
}

export interface TerminalLaunchResult {
  success: boolean
  /** Why the launch failed — already human-readable. */
  error?: string
  /** Which emulator was used (e.g. "konsole", "Terminal.app"). */
  terminal?: string
  /** The ssh command line that was (or would have been) run — for clipboard fallback. */
  command?: string
  /** The ~/.ssh/config alias that was used instead of user@host, if one matched. */
  alias?: string
}

// ---------------------------------------------------------------------------
// Hosts (~/.ssh/config + Include ~/.ssh/hosts/*)
// ---------------------------------------------------------------------------

/** One literal `Host` alias with the values ssh would actually use for it. */
export interface SshHost {
  alias: string
  hostName?: string
  user?: string
  port?: number
  identityFile?: string
  /** File the `Host` line was read from. */
  file: string
  /** True when the file is ~/.ssh/hosts/<alias> — the layout this app (and sshm) writes. */
  managed: boolean
}

/** What the app writes; mirrors `sshm create NAME IP [PORT] [USER] [KEYFILE]`. */
export interface SshHostInput {
  alias: string
  hostName: string
  port?: number
  user?: string
  identityFile?: string
  /** create (default) refuses to overwrite or shadow; update refuses a missing file. */
  mode?: 'create' | 'update'
  /**
   * update only: overwrite a managed file that has directives beyond the standard five
   * lines. Must be the `contentHash` from the refusal, so a file that changed in between
   * is never blindly overwritten.
   */
  force?: string
}

export interface HostTestResult {
  alias: string
  ok: boolean
  /** Round-trip time of `ssh … true` in milliseconds. */
  ms: number
  error?: string
}

export interface SshConfigStatus {
  configPath: string
  configExists: boolean
  hostsDir: string
  /** Whether ~/.ssh/config contains `Include ~/.ssh/hosts/*` (any spelling ssh accepts). */
  includePresent: boolean
  managedHostCount: number
}

// ---------------------------------------------------------------------------
// Keys (~/.ssh/keys/* and ~/.ssh/id_*)
// ---------------------------------------------------------------------------

export interface LocalSshKey {
  name: string
  privateKeyPath?: string
  publicKeyPath?: string
  publicKey?: string
  /** e.g. "ED25519", "RSA" — from ssh-keygen -l. */
  type?: string
  bits?: number
  fingerprint?: string
  comment?: string
  /** True when it lives in ~/.ssh/keys/ — the layout this app (and sshm) manages. */
  managed: boolean
}

export interface KeyCreateInput {
  name: string
  comment?: string
  type?: 'ed25519' | 'rsa'
}

// ---------------------------------------------------------------------------
// Generic results
// ---------------------------------------------------------------------------

export interface OpResult {
  success: boolean
  error?: string
  /** Path written / removed, when relevant. */
  file?: string
  /** Machine-readable reason for a refusal, when the UI can offer a way forward. */
  code?: 'non-canonical'
  /** With code 'non-canonical': sha256 of the file as it is now — pass back as `force` to overwrite exactly that. */
  contentHash?: string
}

export interface SystemNotificationOptions {
  title: string
  body: string
}

// ---------------------------------------------------------------------------
// The API surface
// ---------------------------------------------------------------------------

export interface SshmApi {
  // Hosts
  listHosts: () => Promise<SshHost[]>
  saveHost: (input: SshHostInput) => Promise<OpResult>
  deleteHost: (alias: string) => Promise<OpResult>
  readHostFile: (alias: string) => Promise<string | null>
  testHost: (alias: string) => Promise<HostTestResult>
  configStatus: () => Promise<SshConfigStatus>
  ensureInclude: () => Promise<OpResult & { changed?: boolean }>

  // Keys
  listKeys: () => Promise<LocalSshKey[]>
  createKey: (input: KeyCreateInput) => Promise<OpResult>
  deleteKey: (name: string) => Promise<OpResult>

  // Terminal
  launchSsh: (options: TerminalLaunchOptions) => Promise<TerminalLaunchResult>

  // System
  sendNotification: (options: SystemNotificationOptions) => Promise<void>
  openExternal: (url: string) => Promise<void>
  /** Only ~/.ssh/config, ~/.ssh/hosts/* and ~/.ssh/keys/* are allowed. */
  openPath: (path: string) => Promise<OpResult>
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  isMaximized: () => Promise<boolean>
}

declare global {
  interface Window {
    sshm: SshmApi
  }
}
