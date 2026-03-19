# job-queue

Lightweight in-memory job queue for Node.js. No external dependencies. Supports concurrency control, job priorities, exponential backoff retries, dead-letter queue and lifecycle events.

## Features

- Concurrency control — run N jobs in parallel
- Priority queue — higher priority jobs run first
- Automatic retries with exponential backoff
- Dead-letter queue for permanently failed jobs
- Manual dead-letter retry
- EventEmitter lifecycle hooks
- Zero runtime dependencies

## Usage
```javascript
const { Queue } = require("./src/Queue");

const q = new Queue({ concurrency: 3 });

q.process("send-email", async (job) => {
  await sendEmail(job.data);
  return "sent";
});

q.on("job:completed", job => console.log("Done:", job.id));
q.on("job:dead",      job => console.log("Failed:", job.error));

q.add("send-email", { to: "user@example.com" }, { priority: 5, maxRetries: 3 });
```

## Test
```bash
npm install
npm test
```
