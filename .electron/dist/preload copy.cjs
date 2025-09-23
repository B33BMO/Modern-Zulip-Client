"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("zulipDesktop", {
  loginWithApiKey: (email, apiKey, baseUrl) => import_electron.ipcRenderer.invoke("zulip:loginApiKey", { email, apiKey, baseUrl }),
  loginWithPassword: (email, password, baseUrl) => import_electron.ipcRenderer.invoke("zulip:loginPassword", { email, password, baseUrl }),
  logout: (baseUrl, email) => import_electron.ipcRenderer.invoke("zulip:logout", { baseUrl, email }),
  get: (pathAndQuery) => import_electron.ipcRenderer.invoke("zulip:get", pathAndQuery),
  postForm: (path, form) => import_electron.ipcRenderer.invoke("zulip:postForm", { path, form })
});
//# sourceMappingURL=preload.cjs.map
