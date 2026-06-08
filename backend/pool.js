export class Semaphore {
  constructor(size) {
    this.size = Math.max(1, Number(size) || 1);
    this.available = this.size;
    this.waiters = [];
  }

  acquire() {
    if (this.available > 0) {
      this.available -= 1;
      return Promise.resolve(this.release.bind(this));
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release() {
    const next = this.waiters.shift();
    if (next) {
      next(this.release.bind(this));
      return;
    }
    this.available = Math.min(this.size, this.available + 1);
  }

  snapshot() {
    return {
      size: this.size,
      available: this.available,
      waiting: this.waiters.length
    };
  }
}
