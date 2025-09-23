import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("zulipDesktop", {
  loginWithApiKey: (email: string, apiKey: string, baseUrl: string) =>
    ipcRenderer.invoke("zulip:loginApiKey", { email, apiKey, baseUrl }),
  loginWithPassword: (email: string, password: string, baseUrl: string) =>
    ipcRenderer.invoke("zulip:loginPassword", { email, password, baseUrl }),
  logout: (baseUrl: string, email: string) => ipcRenderer.invoke("zulip:logout", { baseUrl, email }),
  get: (pathAndQuery: string) => ipcRenderer.invoke("zulip:get", pathAndQuery),
  postForm: (path: string, form: Record<string, string>) =>
    ipcRenderer.invoke("zulip:postForm", { path, form }),
});
