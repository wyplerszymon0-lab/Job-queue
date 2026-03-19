const { Queue } = require("../src/Queue");

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("processes a simple job", async () => {
  const q = new Queue();
  q.process("greet", async job => `Hello, ${job.data.name}`);
  const job = q.add("greet", { name: "Szymon" });
  await wait(50);
  expect(job.status).toBe("completed");
  expect(job.result).toBe("Hello, Szymon");
});

test("respects concurrency limit", async () => {
  const q = new Queue({ concurrency: 2 });
  let running = 0;
  let maxRunning = 0;
  q.process("slow", async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await wait(30);
    running--;
  });
  for (let i = 0; i < 5; i++) q.add("slow", {});
  await wait(300);
  expect(maxRunning).toBeLessThanOrEqual(2);
});

test("respects job priority", async () => {
  const q = new Queue({ concurrency: 1 });
  const order = [];
  q.process("task", async job => { order.push(job.data.label); });
  q.add("task", { label: "low" }, { priority: 1 });
  q.add("task", { label: "high" }, { priority: 10 });
  q.add("task", { label: "mid" }, { priority: 5 });
  await wait(100);
  expect(order[0]).toBe("low");
  expect(order[1]).toBe("high");
  expect(order[2]).toBe("mid");
});

test("retries failed jobs with exponential backoff", async () => {
  const q = new Queue();
  let attempts = 0;
  q.process("flaky", async () => {
    attempts++;
    if (attempts < 3) throw new Error("temporary failure");
    return "ok";
  });
  const job = q.add("flaky", {}, { maxRetries: 3 });
  await wait(2000);
  expect(job.status).toBe("completed");
  expect(attempts).toBe(3);
}, 5000);

test("moves to dead-letter after max retries", async () => {
  const q = new Queue();
  q.process("always-fails", async () => { throw new Error("permanent"); });
  const job = q.add("always-fails", {}, { maxRetries: 2 });
  await wait(3000);
  expect(job.status).toBe("failed");
  expect(q.deadLetter).toContain(job);
}, 8000);

test("retryDead requeues a dead-letter job", async () => {
  const q = new Queue();
  let calls = 0;
  q.process("recover", async () => {
    calls++;
    if (calls === 1) throw new Error("first fail");
    return "recovered";
  });
  const job = q.add("recover", {}, { maxRetries: 0 });
  await wait(100);
  expect(job.status).toBe("failed");
  q.retryDead(job.id);
  await wait(100);
  expect(job.status).toBe("completed");
});

test("unknown handler sends job to dead-letter", async () => {
  const q = new Queue();
  const job = q.add("unknown-type", {});
  await wait(50);
  expect(job.status).toBe("failed");
  expect(q.deadLetter).toContain(job);
});

test("stats returns correct counts", async () => {
  const q = new Queue({ concurrency: 1 });
  q.process("stat-task", async () => wait(200));
  q.add("stat-task", {});
  q.add("stat-task", {});
  await wait(20);
  const s = q.stats();
  expect(s.active).toBe(1);
  expect(s.waiting).toBe(1);
}, 3000);

test("emits lifecycle events", async () => {
  const q = new Queue();
  const events = [];
  q.on("job:added",     () => events.push("added"));
  q.on("job:started",   () => events.push("started"));
  q.on("job:completed", () => events.push("completed"));
  q.process("event-task", async () => "done");
  q.add("event-task", {});
  await wait(50);
  expect(events).toContain("added");
  expect(events).toContain("started");
  expect(events).toContain("completed");
});

test("getJob returns job by id", async () => {
  const q = new Queue();
  q.process("lookup", async () => "ok");
  const job = q.add("lookup", { x: 1 });
  await wait(50);
  const found = q.getJob(job.id);
  expect(found).toBe(job);
});
