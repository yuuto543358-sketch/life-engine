/**
 * IndexedDB への保存処理。すべての画面はこのモジュールだけを通して保存する。
 * データは端末（ブラウザ）の中だけに保存され、外部には送信しない。
 */
import type { AppData } from './types';

const DB_NAME = 'life-engine';
/** 2: 年代記のストアを追加。古い版を開くと onupgradeneeded で足りないストアを作る（既存データはそのまま） */
const DB_VERSION = 2;

export const STORES = ['meta', 'domains', 'goals', 'scenarios', 'actuals', 'dependencies', 'chronicle'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
  }
}

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('このブラウザでは端末内への保存が使えません'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(new StorageError('保存領域を開けませんでした', req.error));
    req.onblocked = () => reject(new StorageError('ほかのタブで LIFE ENGINE が開かれているため、保存領域を開けません'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run(stores: StoreName[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => void): Promise<void> {
  return open().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(stores, mode);
        } catch (e) {
          reject(new StorageError('保存処理を開始できませんでした', e));
          return;
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(toStorageError(tx.error));
        tx.onabort = () => reject(toStorageError(tx.error));
        try {
          body(tx);
        } catch (e) {
          tx.abort();
          reject(toStorageError(e));
        }
      }),
  );
}

function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as DOMException | null)?.name;
  if (name === 'QuotaExceededError') return new StorageError('端末の空き容量が足りないため保存できませんでした', e);
  return new StorageError('保存に失敗しました', e);
}

function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(toStorageError(req.error));
  });
}

export interface RawData {
  meta: { id: string }[];
  domains: AppData['domains'];
  goals: AppData['goals'];
  scenarios: AppData['scenarios'];
  actuals: AppData['actuals'];
  dependencies: AppData['dependencies'];
  chronicle: AppData['chronicle'];
}

export async function loadAll(): Promise<RawData> {
  const db = await open();
  const [meta, domains, goals, scenarios, actuals, dependencies, chronicle] = await Promise.all(
    STORES.map((s) => getAll<never>(db, s)),
  );
  return { meta, domains, goals, scenarios, actuals, dependencies, chronicle } as RawData;
}

/** 1件以上の追加・更新・削除を1つのトランザクションで実行する（途中で失敗したら全部取り消し） */
export interface WriteOp {
  store: StoreName;
  put?: { id: string }[];
  remove?: string[];
}

export function write(ops: WriteOp[]): Promise<void> {
  const stores = [...new Set(ops.map((o) => o.store))];
  if (stores.length === 0) return Promise.resolve();
  return run(stores, 'readwrite', (tx) => {
    for (const op of ops) {
      const os = tx.objectStore(op.store);
      for (const v of op.put ?? []) os.put(v);
      for (const id of op.remove ?? []) os.delete(id);
    }
  });
}

/** すべてのデータを置き換える（インポート・全削除用）。1つのトランザクションで行う */
export function replaceAll(data: AppData | null): Promise<void> {
  return run([...STORES], 'readwrite', (tx) => {
    for (const s of STORES) tx.objectStore(s).clear();
    if (!data) return;
    tx.objectStore('meta').put(data.profile);
    tx.objectStore('meta').put(data.settings);
    for (const d of data.domains) tx.objectStore('domains').put(d);
    for (const g of data.goals) tx.objectStore('goals').put(g);
    for (const s of data.scenarios) tx.objectStore('scenarios').put(s);
    for (const a of data.actuals) tx.objectStore('actuals').put(a);
    for (const d of data.dependencies) tx.objectStore('dependencies').put(d);
    for (const c of data.chronicle) tx.objectStore('chronicle').put(c);
  });
}

/** ブラウザに保存領域を消さないよう依頼する（対応ブラウザのみ） */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* 対応していない */
  }
  return null;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
    }
  } catch {
    /* 対応していない */
  }
  return null;
}
