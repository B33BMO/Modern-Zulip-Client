// lib/desktop.ts
export const isTauri = typeof (window as any).__TAURI__ !== "undefined";

let invoke: (<T=any>(cmd: string, args?: any)=>Promise<T>) | undefined;
if (isTauri) {
  // dynamic import to avoid bundler complaints in web
  // @ts-ignore
  invoke = (await import('@tauri-apps/api/tauri')).invoke;
}

export async function tauriStatus() {
  if (!isTauri || !invoke) return { configured: false };
  return invoke('status');
}

export async function tauriSetCredentials(email: string, apiKey: string, base: string) {
  if (!invoke) throw new Error('No Tauri');
  return invoke('set_credentials', { email, apiKey, base });
}

export async function tauriClearCredentials() {
  if (!invoke) throw new Error('No Tauri');
  return invoke('clear_credentials_cmd');
}

export async function tGet(pathAndQuery: string) {
  if (!invoke) throw new Error('No Tauri');
  return invoke<string>('zulip_get', { pathAndQuery });
}

export async function tPostForm(path: string, form: Record<string,string>) {
  if (!invoke) throw new Error('No Tauri');
  return invoke<string>('zulip_post_form', { path, form });
}
