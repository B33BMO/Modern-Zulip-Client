import { app, BrowserWindow, protocol, ipcMain, session } from "electron";
import path from "node:path";
import { Buffer } from "node:buffer";
import keytar from "keytar";
import fetch, { Headers } from "node-fetch";

type State = {
  baseUrl: string;
  email: string;
  apiKey?: string;
  cookie?: string; // "sessionid=...; csrftoken=..."
};
const state: State = { baseUrl: "", email: "" };

const SERVICE_API = (base: string) => `zulip-glass:${base}`;
const SERVICE_COOKIE = (base: string) => `zulip-glass-cookie:${base}`;

function normBase(u: string) {
  let s = u.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  s = s.replace(/\/+$/, "");
  return s;
}

function basic(email: string, key: string) {
  const tok = Buffer.from(`${email}:${key}`).toString("base64");
  return `Basic ${tok}`;
}

function isAssetPath(p: string) {
  return (
    p.startsWith("/user_uploads/") ||
    p.startsWith("/user_avatars/") ||
    p.startsWith("/thumbnail/") ||
    p.startsWith("/avatar/") ||
    p.startsWith("/external_content/") ||
    p.startsWith("/static/")
  );
}

function toAbsolute(base: string, pathOrAbs: string) {
  if (/^https?:\/\//i.test(pathOrAbs)) return pathOrAbs;
  const p = pathOrAbs.startsWith("/") ? pathOrAbs : `/${pathOrAbs}`;
  return `${base}${p}`;
}

/* ------------- IPC: login flows --------------- */

// API key login – verifies and stores in keychain
ipcMain.handle("zulip:loginApiKey", async (_e, { email, apiKey, baseUrl }: { email: string; apiKey: string; baseUrl: string }) => {
  state.baseUrl = normBase(baseUrl);
  state.email = email;

  const res = await fetch(`${state.baseUrl}/api/v1/users/me`, {
    headers: { Authorization: basic(email, apiKey) },
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);

  await keytar.setPassword(SERVICE_API(state.baseUrl), email, apiKey);
  state.apiKey = apiKey;

  // try to load any saved cookie from keychain (if password login happened before)
  try {
    state.cookie = (await keytar.getPassword(SERVICE_COOKIE(state.baseUrl), "session")) || "";
  } catch {}
  return true;
});

// Password login – establish realm session cookie
ipcMain.handle("zulip:loginPassword", async (_e, { email, password, baseUrl }: { email: string; password: string; baseUrl: string }) => {
  state.baseUrl = normBase(baseUrl);
  state.email = email;

  // Step 1: GET login page to get csrftoken
  const loginPaths = ["/accounts/login/local/", "/accounts/login/"];
  let loginHtml = "", setCookies: string[] = [], loginPath = loginPaths[0];

  for (const p of loginPaths) {
    const r = await fetch(`${state.baseUrl}${p}`, { redirect: "manual" });
    if (r.ok) {
      loginHtml = await r.text();
      setCookies = r.headers.raw()["set-cookie"] || [];
      loginPath = p;
      break;
    }
  }
  if (!loginHtml) throw new Error("Unable to load login page");

  // Find csrftoken from Set-Cookie or hidden input
  const cookieStr = setCookies.find(c => c.toLowerCase().startsWith("csrftoken=")) ||
                    setCookies.find(c => c.toLowerCase().startsWith("csrf="));
  let csrftoken = "";
  if (cookieStr) csrftoken = cookieStr.split(";")[0].split("=")[1] || "";
  if (!csrftoken) {
    const m = loginHtml.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/i);
    if (m) csrftoken = m[1];
  }
  if (!csrftoken) throw new Error("Missing CSRF token");

  // Step 2: POST credentials
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);
  form.set("remember", "on");
  form.set("csrfmiddlewaretoken", csrftoken);

  const headers = new Headers();
  headers.set("content-type", "application/x-www-form-urlencoded");
  headers.set("referer", `${state.baseUrl}${loginPath}`);
  if (cookieStr) headers.set("cookie", cookieStr.split(";")[0]); // csrftoken=...

  const resp = await fetch(`${state.baseUrl}${loginPath}`, { method: "POST", body: form, headers, redirect: "manual" });

  const setCookies2 = resp.headers.raw()["set-cookie"] || [];
  const sessionCookie =
    (setCookies2.find(c => c.toLowerCase().startsWith("sessionid=")) ||
     setCookies2.find(c => c.toLowerCase().startsWith("sessionid_secure=")))?.split(";")[0];

  if (!sessionCookie) throw new Error("Login did not return a session cookie");

  state.cookie = `${sessionCookie}; csrftoken=${csrftoken}`;
  await keytar.setPassword(SERVICE_COOKIE(state.baseUrl), "session", state.cookie);

  return true;
});

ipcMain.handle("zulip:logout", async (_e, { baseUrl, email }: { baseUrl: string; email: string }) => {
  const b = normBase(baseUrl);
  try { await keytar.deletePassword(SERVICE_API(b), email); } catch {}
  try { await keytar.deletePassword(SERVICE_COOKIE(b), "session"); } catch {}
  if (state.baseUrl === b) Object.assign(state, { baseUrl: "", email: "", apiKey: "", cookie: "" });
  return true;
});

// Generic GET (returns JSON text)
ipcMain.handle("zulip:get", async (_e, pathAndQuery: string) => {
  if (!state.baseUrl || !state.email) throw new Error("Not logged in");
  const [pathOnly] = pathAndQuery.split("?");
  const isApi = !isAssetPath(pathOnly);

  const url = toAbsolute(state.baseUrl, pathAndQuery);
  const headers = new Headers();

  if (isApi) {
    if (!state.apiKey) {
      // try keychain
      const ak = await keytar.getPassword(SERVICE_API(state.baseUrl), state.email);
      if (!ak) throw new Error("Missing API key");
      state.apiKey = ak;
    }
    headers.set("Authorization", basic(state.email, state.apiKey));
  } else if (state.cookie) {
    headers.set("cookie", state.cookie);
  }

  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
});

// POST form (JSON text)
ipcMain.handle("zulip:postForm", async (_e, { path, form }: { path: string; form: Record<string,string> }) => {
  if (!state.baseUrl || !state.email) throw new Error("Not logged in");
  if (!state.apiKey) {
    const ak = await keytar.getPassword(SERVICE_API(state.baseUrl), state.email);
    if (!ak) throw new Error("Missing API key");
    state.apiKey = ak;
  }
  const url = toAbsolute(state.baseUrl, path);
  const body = new URLSearchParams(form);
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", Authorization: basic(state.email, state.apiKey) },
    body
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
});

/* ----------- custom protocol: app-proxy:// ---------- */

protocol.registerSchemesAsPrivileged([{ scheme: "app-proxy", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

async function registerAppProxy() {
  protocol.registerStreamProtocol("app-proxy", async (request, callback) => {
    try {
      if (!state.baseUrl || !state.email) return callback({ statusCode: 401, data: null as any });

      // request.url like "app-proxy:///user_uploads/..." or "app-proxy://user_uploads/..."
      const after = request.url.replace(/^app-proxy:\/\//, "");
      const path = after.startsWith("/") ? after : `/${after}`;
      const url = toAbsolute(state.baseUrl, path);

      const headers = new Headers();
      if (isAssetPath(path)) {
        if (state.cookie) headers.set("cookie", state.cookie);
      } else {
        if (!state.apiKey) {
          const ak = await keytar.getPassword(SERVICE_API(state.baseUrl), state.email);
          if (ak) state.apiKey = ak;
        }
        if (state.apiKey) headers.set("Authorization", basic(state.email, state.apiKey));
      }

      const r = await fetch(url, { headers });
      const ct = r.headers.get("content-type") || "application/octet-stream";
      const statusCode = r.status;
      const data = r.body as any; // ReadableStream

      callback({ statusCode, headers: { "Content-Type": ct }, data });
    } catch (e) {
      console.warn("app-proxy error", e);
      callback({ statusCode: 404, data: null as any });
    }
  });
}

/* ---------------- window/bootstrap ---------------- */

async function createWindow() {
  // ✅ one, correct path to the built preload
  const preloadPath = path.resolve(app.getAppPath(), ".electron", "dist", "preload.cjs");
  console.log("[electron] using preload:", preloadPath);

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = process.env.ELECTRON_START_URL || "http://localhost:3000";
  await win.loadURL(url);

  if (process.env.NODE_ENV === "development") {
    win.webContents.openDevTools({ mode: "detach" });
  }
}


app.whenReady().then(async () => {
  await registerAppProxy();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
