import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'


const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value)
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  getStore: (key) => ipcRenderer.invoke("store:get", key),
  setStore: (key, value) => ipcRenderer.invoke("store:set", key, value),
  minimizeWindow: () => ipcRenderer.send('window-control:minimize'),
  maximizeWindow: () => ipcRenderer.send('window-control:maximize'),
  closeWindow: () => ipcRenderer.send('window-control:close'),
  onWindowStateChange: (callback: (state: string) => void) => handler.on('window-state-changed', (state: unknown) => callback(state as string)),
}

contextBridge.exposeInMainWorld('ipc', handler)

export type IpcHandler = typeof handler
