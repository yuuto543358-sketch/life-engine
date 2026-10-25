/**
 * 絵を描く作業を、画面の動きを止めない小さな区切りに分けて進める。
 * 描く処理は「ひと塗りごとに一休み（yield）する」ジェネレーターとして書き、ここで少しずつ進める。
 */
export type PaintJob = Generator<unknown, void, unknown>;

interface Task {
  job: PaintJob;
  resolve: () => void;
  reject: (e: unknown) => void;
  cancelled: boolean;
}

const queue: Task[] = [];
let running = false;

/** 1回にまとめて描く時間の目安（ミリ秒）。これを越えたら次の画面更新まで待つ */
const BUDGET = 10;

function pump() {
  const start = performance.now();
  while (queue.length && performance.now() - start < BUDGET) {
    const t = queue[0];
    if (t.cancelled) {
      queue.shift();
      continue;
    }
    try {
      const r = t.job.next();
      if (r.done) {
        queue.shift();
        t.resolve();
      }
    } catch (e) {
      queue.shift();
      t.reject(e);
    }
  }
  if (queue.length) schedule();
  else running = false;
}

function schedule() {
  // 画面が隠れているときも進むように、requestAnimationFrame ではなく setTimeout を使う
  setTimeout(pump, 0);
}

export interface Handle {
  done: Promise<void>;
  cancel: () => void;
}

/** 描く作業を順番待ちに入れる。front = true なら先に描く */
export function runJob(job: PaintJob, front = false): Handle {
  let task!: Task;
  const done = new Promise<void>((resolve, reject) => {
    task = { job, resolve, reject, cancelled: false };
  });
  if (front) queue.unshift(task);
  else queue.push(task);
  if (!running) {
    running = true;
    schedule();
  }
  return {
    done,
    cancel: () => {
      task.cancelled = true;
    },
  };
}

/** その場で最後まで描く（テストや小さな絵のため） */
export function runNow(job: PaintJob) {
  for (let r = job.next(); !r.done; r = job.next());
}
