export class ApiFail extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFail(res.status, (data as { error?: string }).error ?? "Request failed");
  return data as T;
}

/** Downscale an image file to a JPEG data URL small enough to ship in a message. */
export async function imageToDataUrl(file: File, maxSide = 1100): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.82, 0.65, 0.5]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length < 900_000) return url;
  }
  throw new Error("That image is too large");
}
