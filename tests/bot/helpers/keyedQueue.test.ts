import assert from "node:assert/strict";
import test from "node:test";
import {
  createKeyedQueue,
  keyedQueue,
} from "../../../bot/helpers/keyedQueue.ts";

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("same-key work is FIFO while other keys progress independently", async () => {
  const queue = createKeyedQueue();
  const started = gate();
  const finish = gate();
  const order: string[] = [];
  const first = queue.run("subscription:1", async () => {
    order.push("create");
    started.release();
    await finish.promise;
    order.push("created");
    return 1;
  });
  const second = queue.run("subscription:1", () => {
    order.push("update");
    return 2;
  });
  const third = queue.run("subscription:1", () => {
    order.push("delete");
    return 3;
  });
  await started.promise;
  assert.equal(
    await queue.run("subscription:2", () => "independent"),
    "independent",
  );
  assert.deepEqual(order, ["create"]);
  finish.release();
  assert.deepEqual(await Promise.all([first, second, third]), [1, 2, 3]);
  assert.deepEqual(order, ["create", "created", "update", "delete"]);
  await queue.stop();
});

test("sync throws and async failures reach callers without poisoning a key", async () => {
  const queue = createKeyedQueue();
  const syncError = new Error("sync failure");
  const asyncError = new Error("async failure");
  const first = assert.rejects(
    queue.run("record", () => {
      throw syncError;
    }),
    (error) => error === syncError,
  );
  const second = assert.rejects(
    queue.run("record", async () => {
      throw asyncError;
    }),
    (error) => error === asyncError,
  );
  const third = queue.run("record", () => "recovered");
  await Promise.all([first, second]);
  assert.equal(await third, "recovered");
  await queue.stop();
});

test("finishing an earlier task does not detach later work from the key", async () => {
  const queue = createKeyedQueue();
  const finishFirst = gate();
  const secondStarted = gate();
  const finishSecond = gate();
  const first = queue.run("record", () => finishFirst.promise);
  const second = queue.run("record", async () => {
    secondStarted.release();
    await finishSecond.promise;
  });
  finishFirst.release();
  await first;
  await secondStarted.promise;
  let thirdRan = false;
  const third = queue.run("record", () => {
    thirdRan = true;
  });
  await queue.run("independent", () => undefined);
  assert.equal(thirdRan, false);
  finishSecond.release();
  await Promise.all([second, third]);
  assert.equal(thirdRan, true);
  await queue.stop();
});

test("capacity includes running and waiting work globally and is released on either outcome", async () => {
  const queue = createKeyedQueue(2);
  const started = gate();
  const finish = gate();
  const first = queue.run("record", async () => {
    started.release();
    await finish.promise;
  });
  await started.promise;
  const second = queue.run("record", () => "waiting");
  let overflowRan = false;
  await assert.rejects(
    queue.run("other", () => {
      overflowRan = true;
    }),
    /full/,
  );
  assert.equal(overflowRan, false);
  finish.release();
  await Promise.all([first, second]);
  assert.equal(
    await queue.run("other", () => "space available"),
    "space available",
  );
  await queue.stop();

  const afterFailure = createKeyedQueue(1);
  await assert.rejects(
    afterFailure.run("record", () => {
      throw new Error("failed");
    }),
  );
  assert.equal(await afterFailure.run("record", () => "restored"), "restored");
  await afterFailure.stop();
});

test("stop closes immediately and drains all keys including work after a failure", async () => {
  const queue = createKeyedQueue();
  const finishFirst = gate();
  const finishOther = gate();
  const firstStarted = gate();
  const otherStarted = gate();
  const firstRejected = assert.rejects(
    queue.run("first", async () => {
      firstStarted.release();
      await finishFirst.promise;
      throw new Error("accepted task failed");
    }),
    /accepted task failed/,
  );
  let tailRan = false;
  const tail = queue.run("first", () => {
    tailRan = true;
  });
  const other = queue.run("other", async () => {
    otherStarted.release();
    await finishOther.promise;
  });
  await Promise.all([firstStarted.promise, otherStarted.promise]);
  assert.equal(queue.closed, false);
  let stopped = false;
  const stop = queue.stop().then(() => {
    stopped = true;
  });
  const repeatedStop = queue.stop();
  assert.equal(queue.closed, true);
  await assert.rejects(
    queue.run("new", () => assert.fail("late work ran")),
    /stopped/,
  );
  finishFirst.release();
  await Promise.all([firstRejected, tail]);
  assert.equal(tailRan, true);
  assert.equal(stopped, false);
  finishOther.release();
  await Promise.all([other, stop, repeatedStop]);
  assert.equal(stopped, true);
  await queue.stop();
});

test("validates capacity and stops an empty queue", async () => {
  for (const invalid of [0, -1, 1.5, NaN, Infinity])
    assert.throws(() => createKeyedQueue(invalid));
  const queue = createKeyedQueue(1);
  await queue.stop();
  assert.equal(queue.closed, true);
  await assert.rejects(
    queue.run("record", () => "too late"),
    /stopped/,
  );
});

test("global queue starts once, coordinates consumers, drains globally and cannot restart", async () => {
  await assert.rejects(
    keyedQueue.run("record", () => assert.fail("ran before startup")),
    /not started/,
  );
  keyedQueue.start();
  const finish = gate();
  const started = gate();
  const order: string[] = [];
  const firstConsumer = keyedQueue.run("shared:1", async () => {
    started.release();
    await finish.promise;
    order.push("first");
  });
  await started.promise;
  keyedQueue.start();
  const secondConsumer = keyedQueue.run("shared:1", () => {
    order.push("second");
  });
  await keyedQueue.run("other", () => undefined);
  assert.deepEqual(order, []);
  let drained = false;
  const stop = keyedQueue.stop().then(() => {
    drained = true;
  });
  const repeatedStop = keyedQueue.stop();
  await assert.rejects(
    keyedQueue.run("record", () => assert.fail("ran during shutdown")),
    /stopped/,
  );
  assert.equal(drained, false);
  finish.release();
  await Promise.all([firstConsumer, secondConsumer, stop, repeatedStop]);
  assert.deepEqual(order, ["first", "second"]);
  assert.equal(drained, true);
  await assert.rejects(
    keyedQueue.run("record", () => "late"),
    /stopped/,
  );
  assert.throws(() => keyedQueue.start(), /stopped/);
});

test("global shutdown before startup is safe and prevents a later startup", async () => {
  const moduleUrl = new URL(
    "../../../bot/helpers/keyedQueue.ts",
    import.meta.url,
  );
  moduleUrl.search = "stop-before-start";
  const { keyedQueue: freshQueue } = (await import(
    moduleUrl.href
  )) as typeof import("../../../bot/helpers/keyedQueue.ts");
  await freshQueue.stop();
  await freshQueue.stop();
  assert.throws(() => freshQueue.start(), /stopped/);
  await assert.rejects(
    freshQueue.run("record", () => "late"),
    /stopped/,
  );
});
