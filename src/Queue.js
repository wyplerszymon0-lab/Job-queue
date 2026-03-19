const { EventEmitter } = require("events");

class Job {
  constructor(id, type, data, options = {}) {
    this.id = id;
    this.type = type;
    this.data = data;
    this.priority = options.priority ?? 0;
    this.maxRetries = options.maxRetries ?? 3;
    this.retries = 0;
    this.status = "waiting";
    this.createdAt = Date.now();
    this.startedAt = null;
    this.finishedAt = null;
    this.error = null;
    this.result = null;
  }
}

class Queue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency ?? 1;
    this.jobs = [];
    this.deadLetter = [];
    this.running = 0;
    this.handlers = {};
    this._idCounter = 0;
  }

  process(type, handler) {
    this.handlers[type] = handler;
  }

  add(type, data, options = {}) {
    const id = ++this._idCounter;
    const job = new Job(id, type, data, options);
    this._insertByPriority(job);
    this.emit("job:added", job);
    setImmediate(() => this._tick());
    return job;
  }

  _insertByPriority(job) {
    let i = this.jobs.length;
    while (i > 0 && this.jobs[i - 1].priority < job.priority) i--;
    this.jobs.splice(i, 0, job);
  }

  _tick() {
    while (this.running < this.concurrency && this.jobs.length > 0) {
      const job = this.jobs.shift();
      this._run(job);
    }
  }

  async _run(job) {
    const handler = this.handlers[job.type];
    if (!handler) {
      job.status = "failed";
      job.error = `No handler registered for type: ${job.type}`;
      job.finishedAt = Date.now();
      this.deadLetter.push(job);
      this.emit("job:dead", job);
      return;
    }

    this.running++;
    job.status = "active";
    job.startedAt = Date.now();
    this.emit("job:started", job);

    try {
      job.result = await handler(job);
      job.status = "completed";
      job.finishedAt = Date.now();
      this.emit("job:completed", job);
    } catch (err) {
      job.retries++;
      job.error = err.message;

      if (job.retries <= job.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, job.retries - 1), 30000);
        job.status = "waiting";
        this.emit("job:retrying", job, delay);
        setTimeout(() => {
          this._insertByPriority(job);
          this._tick();
        }, delay);
      } else {
        job.status = "failed";
        job.finishedAt = Date.now();
        this.deadLetter.push(job);
        this.emit("job:dead", job);
      }
    } finally {
      this.running--;
      this._tick();
    }
  }

  getJob(id) {
    return (
      this.jobs.find(j => j.id === id) ||
      this.deadLetter.find(j => j.id === id) ||
      null
    );
  }

  retryDead(id) {
    const idx = this.deadLetter.findIndex(j => j.id === id);
    if (idx === -1) return false;
    const job = this.deadLetter.splice(idx, 1)[0];
    job.status = "waiting";
    job.error = null;
    job.retries = 0;
    this._insertByPriority(job);
    setImmediate(() => this._tick());
    return true;
  }

  stats() {
    return {
      waiting: this.jobs.length,
      active: this.running,
      dead: this.deadLetter.length,
    };
  }
}

module.exports = { Queue };
