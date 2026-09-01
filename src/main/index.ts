import { app, shell, BrowserWindow, ipcMain, Notification, nativeImage, IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { launchNativeTerminal } from './terminal'
import { listSshHosts } from './sshConfig'
import {
  configStatus,
  createKey,
  deleteHost,
  deleteKey,
  ensureInclude,
  expandPath,
  isOpenablePath,
  listKeys,
  readHostFile,
  saveHost,
  testHost
} from './hosts'
import { KeyCreateInput, SshHostInput, SystemNotificationOptions, TerminalLaunchOptions } from '../shared/ipc-types'

let mainWindow: BrowserWindow | null = null

function resourcePath(file: string): string {
  const candidates = [
    join(process.resourcesPath, 'resources', file),
    join(process.resourcesPath, file),
    join(__dirname, '../../resources', file),
    join(app.getAppPath(), 'resources', file)
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

function createWindow(): void {
  const iconPath = resourcePath('icon.png')
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'SSHM Desktop',
    icon: existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#212529',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    console.log(`[Renderer] [${level}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show')
    mainWindow?.show()
  })
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow?.webContents.toggleDevTools()
      event.preventDefault()
    } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      mainWindow?.webContents.reload()
      event.preventDefault()
    }
  })
  // The renderer is a local file with a privileged bridge: it must never navigate away
  // (the preload would still be attached to whatever it navigated to), and popups only
  // ever go to the system browser, and only for http(s).
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:\/\//i.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ---------------------------------------------------------------------------
// IPC — every handler validates its payload shape and never lets an exception
// reach the renderer as an opaque rejection.
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'
const optStr = (v: unknown): v is string | undefined => v === undefined || typeof v === 'string'
const optNum = (v: unknown): v is number | undefined => v === undefined || typeof v === 'number'
const optBool = (v: unknown): v is boolean | undefined => v === undefined || typeof v === 'boolean'

function isHostInput(v: unknown): v is SshHostInput {
  return (
    isObj(v) &&
    isStr(v.alias) &&
    isStr(v.hostName) &&
    optNum(v.port) &&
    optStr(v.user) &&
    optStr(v.identityFile) &&
    (v.mode === undefined || v.mode === 'create' || v.mode === 'update') &&
    optBool(v.force)
  )
}
function isKeyInput(v: unknown): v is KeyCreateInput {
  return isObj(v) && isStr(v.name) && optStr(v.comment) && (v.type === undefined || v.type === 'ed25519' || v.type === 'rsa')
}
function isLaunchOptions(v: unknown): v is TerminalLaunchOptions {
  return (
    isObj(v) &&
    isStr(v.host) &&
    optStr(v.alias) &&
    optStr(v.username) &&
    optNum(v.port) &&
    optStr(v.privateKeyPath) &&
    optStr(v.serverName) &&
    optBool(v.userSpecified)
  )
}
function isNotification(v: unknown): v is SystemNotificationOptions {
  return isObj(v) && isStr(v.title) && isStr(v.body)
}

/** Register a handler that only accepts calls from our own window and turns throws into `{success:false}`. */
function handle<T>(channel: string, guard: (v: unknown) => boolean, fn: (arg: T) => Promise<unknown> | unknown): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, arg: unknown) => {
    if (mainWindow && event.sender !== mainWindow.webContents) return { success: false, error: 'Unexpected sender.' }
    if (!guard(arg)) return { success: false, error: `Bad payload for ${channel}.` }
    try {
      return await fn(arg as T)
    } catch (err: any) {
      console.error(`[IPC] ${channel} failed:`, err)
      return { success: false, error: err?.message || String(err) }
    }
  })
}

function registerIpcHandlers(): void {
  const none = (v: unknown): boolean => v === undefined
  // Hosts
  handle('hosts:list', none, () => listSshHosts())
  handle<SshHostInput>('hosts:save', isHostInput, (input) => saveHost(input))
  handle<string>('hosts:delete', isStr, (alias) => deleteHost(alias))
  handle<string>('hosts:readFile', isStr, (alias) => readHostFile(alias))
  handle<string>('hosts:test', isStr, (alias) => testHost(alias))
  handle('config:status', none, () => configStatus())
  handle('config:ensureInclude', none, () => ensureInclude())

  // Keys
  handle('keys:list', none, () => listKeys())
  handle<KeyCreateInput>('keys:create', isKeyInput, (input) => createKey(input))
  handle<string>('keys:delete', isStr, (name) => deleteKey(name))

  // Terminal
  handle<TerminalLaunchOptions>('terminal:launch', isLaunchOptions, (options) => launchNativeTerminal(options))

  // System
  handle<SystemNotificationOptions>('system:notify', isNotification, (options) => {
    if (Notification.isSupported()) new Notification({ title: options.title, body: options.body }).show()
  })
  handle<string>('shell:openExternal', isStr, async (url) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url)
  })
  handle<string>('shell:openPath', isStr, async (p) => {
    if (!isOpenablePath(p)) return { success: false, error: 'Only ~/.ssh/config, ~/.ssh/hosts/* and ~/.ssh/keys/* can be opened.' }
    const err = await shell.openPath(expandPath(p))
    return err ? { success: false, error: err } : { success: true }
  })
  handle('window:minimize', none, () => mainWindow?.minimize())
  handle('window:maximize', none, () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  handle('window:close', none, () => mainWindow?.close())
  handle('window:isMaximized', none, () => mainWindow?.isMaximized() ?? false)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('net.renta.sshm-desktop')
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
    registerIpcHandlers()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  app.on('window-all-closed', () => app.quit())
}
