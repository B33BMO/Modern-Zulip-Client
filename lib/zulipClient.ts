export async function zGet<T>(path: string, params?: Record<string, string | number | boolean>) {
    const url = new URL(`/api/zulip/${path}`, typeof window === "undefined" ? "http://localhost" : window.location.origin);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }
  
  export async function zPost<T>(path: string, body: any) {
    const res = await fetch(`/api/zulip/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }
  