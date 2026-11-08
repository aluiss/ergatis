export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body === undefined ? 'GET' : 'POST'),
    headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = Array.isArray(data?.issues) && data.issues.length
      ? data.issues.map((i: { message: string }) => i.message).join('; ')
      : data?.message ?? 'Não foi possível concluir a operação.';
    throw new ApiError(message, res.status, data?.code);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function uploadFile(kind: string, file: File, caption?: string) {
  const form = new FormData();
  form.set('kind', kind);
  if (caption) form.set('caption', caption);
  form.set('file', file);
  const res = await fetch('/api/files', { method: 'POST', body: form, credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status === 413 ? 'O arquivo é grande demais.' : data?.message ?? 'Não foi possível enviar o arquivo.', res.status);
  }
  return res.json() as Promise<{ id: string }>;
}
