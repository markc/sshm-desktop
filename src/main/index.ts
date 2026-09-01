import { app, shell, BrowserWindow, ipcMain, Notification, nativeImage } from 'electron'
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
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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

function registerIpcHandlers(): void {
  // Hosts
  ipcMain.handle('hosts:list', async () => listSshHosts())
  ipcMain.handle('hosts:save', async (_, input: SshHostInput) => saveHost(input))
  ipcMain.handle('hosts:delete', async (_, alias: string) => deleteHost(alias))
  ipcMain.handle('hosts:readFile', async (_, alias: string) => readHostFile(alias))
  ipcMain.handle('hosts:test', async (_, alias: string) => testHost(alias))
  ipcMain.handle('config:status', async () => configStatus())
  ipcMain.handle('config:ensureInclude', async () => ensureInclude())

  // Keys
  ipcMain.handle('keys:list', async () => listKeys())
  ipcMain.handle('keys:create', async (_, input: KeyCreateInput) => createKey(input))
  ipcMain.handle('keys:delete', async (_, name: string) => deleteKey(name))

  // Terminal
  ipcMain.handle('terminal:launch', async (_, options: TerminalLaunchOptions) => launchNativeTerminal(options))

  // System
  ipcMain.handle('system:notify', async (_, options: SystemNotificationOptions) => {
    if (Notification.isSupported()) new Notification({ title: options.title, body: options.body }).show()
  })
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    if (/^https?:\/\//.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('shell:openPath', async (_, p: string) => {
    await shell.openPath(expandPath(p))
  })
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
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
