import { contextBridge, ipcRenderer } from 'electron'
import { SshmApi } from '../shared/ipc-types'

const api: SshmApi = {
  // Hosts
  listHosts: () => ipcRenderer.invoke('hosts:list'),
  saveHost: (input) => ipcRenderer.invoke('hosts:save', input),
  deleteHost: (alias) => ipcRenderer.invoke('hosts:delete', alias),
  readHostFile: (alias) => ipcRenderer.invoke('hosts:readFile', alias),
  testHost: (alias) => ipcRenderer.invoke('hosts:test', alias),
  configStatus: () => ipcRenderer.invoke('config:status'),
  ensureInclude: () => ipcRenderer.invoke('config:ensureInclude'),

  // Keys
  listKeys: () => ipcRenderer.invoke('keys:list'),
  createKey: (input) => ipcRenderer.invoke('keys:create', input),
  deleteKey: (name) => ipcRenderer.invoke('keys:delete', name),

  // Terminal
  launchSsh: (options) => ipcRenderer.invoke('terminal:launch', options),

  // System
  sendNotification: (options) => ipcRenderer.invoke('system:notify', options),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized')
}

contextBridge.exposeInMainWorld('sshm', api)
