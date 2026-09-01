# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SSHM Desktop — an Electron + React desktop manager for the user's **local** SSH setup: `~/.ssh/config` (+ `Include`), one-file-per-host under `~/.ssh/hosts/`, keys under `~/.ssh/keys/`, and launching `ssh` in the native terminal. It is the GUI twin of the `sshm` shell tool (`~/.sh/sshm`, Mix port in `~/.rc/_bin/sshm`): **the files are the contract** — the app never shells out to `sshm`, it reads and writes the same files in the same format so both stay interchangeable. Foundation borrowed from termau/bldesk (MIT); no BinaryLane code remains.

## Commands

```bash
npm install            # npm 12 blocks install scripts; electron/esbuild are allowlisted in package.json
npm run dev            # electron-vite dev server with HMR
npm run build          # electron-vite build → out/{main,preload,renderer}
npm run typecheck      # tsc for node (main/preload/shared) AND web (renderer)
npx electron .         # run the production bundle
npm run pack:linux     # @electron/packager → release/sshm-desktop-linux-x64
```

No test suite yet. Gates are `typecheck` + `build` + launching the built app. Main-process code (`out/main`) is loaded at startup only — F5 reloads the renderer, not the launcher/parsers. Filesystem behaviour is checked with esbuild-bundled harnesses run under a throwaway `HOME` (`HOME=/tmp/x node …` — `os.homedir()` follows `$HOME`): create/update/force rules, symlink and hard-link refusal, modes, Include detection, keygen conflicts. Turn those into a real test suite before adding features.

### Local gotchas (cachyos, npm 12, Node 26)
- `node_modules/electron/install.js` silently fails under Node 26 (exit 0, `dist/` has only `locales/`). Fix: `unzip -q ~/.cache/electron/*/electron-v<ver>-linux-x64.zip -d node_modules/electron/dist && printf electron > node_modules/electron/path.txt`.
- Smoke-testing with `timeout N electron .` needs `--foreground`, else the whole process group is signalled and Chromium ends with a bogus GPU FATAL.
- Drive the built app over CDP for tests: `electron . --remote-debugging-port=9222` with a throwaway `XDG_CONFIG_HOME`, then `Runtime.evaluate` on `window.sshm.*` (see git history of bldesk's scratch scripts for the pattern). For terminal-launch tests set `TERMINAL=<fake script>` that records its argv — never let a test open a real ssh session.

## Architecture

electron-vite, three targets from `electron.vite.config.ts` into `out/`: `src/main` (Node), `src/preload` (context bridge), `src/renderer` (React 18 + Tailwind, `base: './'`). Aliases `@shared/*` (all targets) and `@renderer/*`. Both tsconfigs are `strict`; the web one adds `noUnusedLocals/Parameters`.

**`window.sshm`** (`src/shared/ipc-types.ts` → `SshmApi`) is the whole renderer↔main contract; `src/preload/index.ts` maps each method to an `ipcRenderer.invoke` channel, `src/main/index.ts` `registerIpcHandlers()` handles them. Adding a capability = type + preload + handler.

Main-process modules:
- `sshConfig.ts` — the ssh_config reader. Ordered blocks, `*`/`?`/`!` matching, first-value-wins, textual `Include` (enclosing block stays open; `Match` skipped), `%h`/`%%` expansion. `listSshHosts()` = every literal alias with effective HostName/User/Port/IdentityFile and whether it's "managed" (`~/.ssh/hosts/<alias>`). `findSshAlias()` = which alias already points at an address (never returns an alias equal to the address).
- `hosts.ts` — the only writer. Every install = random `O_EXCL|O_NOFOLLOW` temp (fd held open) → `link` (create) / `rename` (update) → lstat the destination and require the inode we wrote; on mismatch it **throws and leaves the file alone** (could be another writer's save); rollbacks only unlink an inode we proved we created. An lstat walk refuses symlinks at the leaf and every ancestor up to `~/.ssh`; filesystems without hard links fall back to exclusive creation at the destination (`SSHM_TEST_NO_HARDLINKS=1` forces that branch for tests). `saveHost` is create|update: create refuses an existing file (any case) or an alias defined outside `hosts/`; update is compare-and-swap — must carry `expectedHash` (the `contentHash` `listHosts` reported, sha256 of the bytes the parser consumed), refused with `code:'changed'` if the file moved on, and refuses a non-canonical file (`code:'non-canonical'`) unless `force` equals the current hash. `renderHostFile` is exactly `sshm create`'s five lines. Keys: `ssh-keygen` under a private temp name, each file installed exclusively. `ensureInclude` is temp+rename; `testHost` = BatchMode ssh, 5 s timeout.
- `terminal.ts` — native terminal launcher. ssh is always an argv array; Linux resolves the emulator on PATH (`$TERMINAL` first, then a table with each emulator's exec syntax) and runs `sh -c 'trap : INT; <quoted ssh>; exec "$SHELL"'`; macOS AppleScript with escaping; Windows `wt.exe` or PowerShell via `cmd /c start ""` + `-EncodedCommand`. Resolves on the `spawn` event, rejects on `error`; every path returns `TerminalLaunchResult` — nothing throws to the main process.
- `src/shared/ssh.ts` — validator (hostname / IPv4 / IPv6 incl. brackets and zones / user / port / key path) and per-shell quoting (`shQuote`, `psQuote`, `formatArgv`). IPv6 is bare in ssh argv (OpenSSH rejects `root@[::1]`), bracketed with `%25` only in `ssh://` URIs.

Renderer: `App.tsx` holds the active tab; pages are `components/hosts/HostsPage.tsx`, `components/keys/KeysPage.tsx`, `components/terminal/EmbeddedTerminal.tsx` (xterm is a notepad, not a PTY — real sessions go through `lib/launchSsh.ts`, which turns any failure into a clipboard copy + explanation). Theme via `ThemeContext` (`dark` class, `localStorage.sshm_theme`).

## Conventions
- Never write anywhere under `~/.ssh` except `hosts/<alias>`, `keys/<name>{,.pub}`, and the one Include line in `config`.
- Keep `renderHostFile` byte-identical to `sshm create`'s output (`Host` / `Hostname` / `Port` / `User` / `IdentityFile`, two-space indent, defaults 22 / root / `~/.ssh/keys/default`).
- Every destructive action confirms first with text naming the file.
