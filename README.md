# SSHM Desktop

A small desktop app for managing your **local** SSH setup — the hosts in
`~/.ssh/config`, the per-host files under `~/.ssh/hosts/`, and the keys under
`~/.ssh/keys/` — and for launching sessions in your real terminal.

It is the GUI counterpart of the [`sshm`](https://github.com/markc/sh) shell
tool: both read and write the same plain files, so you can use either at any
time. There is no database, no daemon and no cloud — the files under `~/.ssh`
*are* the state.

Inspired by Adam's [bldesk](https://github.com/termau/bldesk) (BinaryLane
desktop client), whose Electron + React + Tailwind foundation this project
borrows.

## What it does

- **Hosts** — lists every `Host` alias ssh knows about (following `Include`),
  with the HostName / User / Port / IdentityFile ssh will actually use, resolved
  with ssh's own first-match-wins rules. Create, edit and delete hosts as
  `~/.ssh/hosts/<alias>` files in exactly `sshm create`'s format. Test
  connectivity (`ssh -o BatchMode=yes -o ConnectTimeout=5 alias true`), one
  host or all of them.
- **Keys** — lists `~/.ssh/keys/*` and `~/.ssh/id_*` with type, fingerprint and
  comment; generates new ed25519 (or RSA 4096) pairs with
  `ssh-keygen -o -a 100`, as `sshm kc` does; copies public keys.
- **Launch** — opens `ssh <alias>` in your native terminal. On Linux it finds
  the terminal itself (`$TERMINAL`, then konsole, kitty, alacritty, wezterm,
  ghostty, foot, gnome-terminal, xfce4-terminal, x-terminal-emulator, xterm);
  macOS uses Terminal.app; Windows uses Windows Terminal or PowerShell. The
  window stays open after ssh exits so you can read any error. If a plain
  address is given and an alias already points at it, the alias is used so
  your config's key and port apply.

## Files it touches

| Path | Written? | Notes |
|---|---|---|
| `~/.ssh/config` | only to add `Include ~/.ssh/hosts/*` if missing, and only when you click the button | read for the hosts list |
| `~/.ssh/hosts/<alias>` | yes — create / edit / delete | one `Host` block per file, `sshm` format |
| `~/.ssh/keys/<name>`, `.pub` | yes — generate / delete | never touches `~/.ssh/id_*` |

Nothing else under `~/.ssh` is ever modified.

## Run from source

```bash
git clone https://github.com/markc/sshm-desktop
cd sshm-desktop
npm install          # npm ≥ 12: electron/esbuild install scripts are allowlisted in package.json
npm run dev          # hot-reloading dev build
npm run build        # production bundle into out/
npx electron .       # run the production bundle
npm run pack:linux   # release/sshm-desktop-linux-x64/ (also pack:mac, pack:win)
```

Requires Node 20+ and an `ssh` / `ssh-keygen` on `PATH`.

## License

MIT © Mark Constable
