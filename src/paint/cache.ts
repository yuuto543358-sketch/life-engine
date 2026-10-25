/**
 * 描いた絵を端末の中（Cache Storage）に保存して、次に開いたときにすぐ見せる。
 * 絵の描き方を変えたら ART_VERSION を上げる（古い絵は使われなくなり、消える）。
 * 保存できない環境では何もしない（毎回描くだけ）。
 */
export const ART_VERSION = 1;
const CACHE = `verdanth-paint-v${ART_VERSION}`;

export type Img = HTMLCanvasElement | OffscreenCanvas | ImageBitmap;

const ok = () => typeof caches !== 'undefined' && typeof createImageBitmap !== 'undefined';
const url = (key: string) => new URL(`./__paint/${encodeURIComponent(key)}`, location.href).toString();

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try {
    for (const name of await caches.keys()) if (name.startsWith('verdanth-paint-') && name !== CACHE) await caches.delete(name);
  } catch {
    // 消せなくても困らない
  }
}

export async function loadImage(key: string): Promise<{ img: ImageBitmap; meta: unknown } | null> {
  if (!ok()) return null;
  try {
    void cleanup();
    const cache = await caches.open(CACHE);
    const res = await cache.match(url(key));
    if (!res) return null;
    const meta = JSON.parse(decodeURIComponent(res.headers.get('x-meta') ?? 'null'));
    const img = await createImageBitmap(await res.blob());
    return { img, meta };
  } catch {
    return null;
  }
}

async function toBlob(c: Img): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined' && c instanceof OffscreenCanvas) return c.convertToBlob({ type: 'image/png' });
  if (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) return new Promise((r) => c.toBlob(r, 'image/png'));
  return null;
}

const queue: (() => Promise<void>)[] = [];
let busy = false;
async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    await job();
    // 画面の動きを邪魔しないよう、少しずつ
    await new Promise((r) => setTimeout(r, 60));
  }
  busy = false;
}

/** 描き終えた絵を、手のあいたときに保存する */
export function saveImage(key: string, img: Img, meta: unknown = null, keep: (key: string) => boolean = () => true) {
  if (!ok()) return;
  queue.push(async () => {
    if (!keep(key)) return;
    try {
      const blob = await toBlob(img);
      if (!blob) return;
      const cache = await caches.open(CACHE);
      await cache.put(url(key), new Response(blob, { headers: { 'content-type': 'image/png', 'x-meta': encodeURIComponent(JSON.stringify(meta)) } }));
    } catch {
      // 容量がいっぱいなどで保存できなくても、絵はその場で描ける
    }
  });
  setTimeout(drain, 1500);
}
