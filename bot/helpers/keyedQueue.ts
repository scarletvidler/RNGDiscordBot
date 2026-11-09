/** In-memory FIFO per key; different keys can run concurrently. */
export function createKeyedQueue(maxPending = 1000) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) {
    throw new Error("Queue capacity must be a positive integer");
  }

  const tails = new Map<string, Promise<void>>();
  let pending = 0;
  let closed = false;

  return {
    get closed() {
      return closed;
    },

    async run<T>(key: string, work: () => T | PromiseLike<T>): Promise<T> {
      if (closed) throw new Error("Queue stopped");
      if (pending >= maxPending) throw new Error("Queue full");
      pending++;

      const previous = tails.get(key);
      let release!: () => void;
      const tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(key, tail);

      try {
        await previous;
        return await work();
      } finally {
        pending--;
        if (tails.get(key) === tail) tails.delete(key);
        // Failures reach the caller, but always release the next task and shutdown.
        release();
      }
    },

    async stop(): Promise<void> {
      closed = true;
      await Promise.all(tails.values());
    },
  };
}

let queue: ReturnType<typeof createKeyedQueue> | undefined;
let stopped = false;

/** One bot-owned queue. Start during startup; handlers only submit work. */
export const keyedQueue = {
  start(): void {
    if (stopped)
      throw new Error("Queue stopped; restart the bot to start it again");
    queue ??= createKeyedQueue();
  },

  async run<T>(key: string, work: () => T | PromiseLike<T>): Promise<T> {
    if (stopped) throw new Error("Queue stopped");
    if (!queue) throw new Error("Queue not started");
    return await queue.run(key, work);
  },

  async stop(): Promise<void> {
    stopped = true;
    await queue?.stop();
  },
};
