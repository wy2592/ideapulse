export class PriorityQueue {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.heap = [];
    this.sequence = 0;
  }

  enqueue(item, priority) {
    if (this.heap.length >= this.maxSize) return false;
    this.heap.push({ item, priority, sequence: this.sequence++ });
    this.bubbleUp(this.heap.length - 1);
    return true;
  }

  dequeue() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.sinkDown(0);
    }
    return top.item;
  }

  peek() {
    return this.heap[0]?.item || null;
  }

  remove(predicate) {
    let removed = 0;
    this.heap = this.heap.filter((entry) => {
      const keep = !predicate(entry.item);
      if (!keep) removed += 1;
      return keep;
    });
    this.heapify();
    return removed;
  }

  get length() {
    return this.heap.length;
  }

  positionOf(predicate) {
    const ordered = [...this.heap].sort(compareEntries);
    const index = ordered.findIndex((entry) => predicate(entry.item));
    return index === -1 ? null : index + 1;
  }

  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareEntries(this.heap[index], this.heap[parent]) >= 0) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
      index = parent;
    }
  }

  sinkDown(index) {
    const length = this.heap.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < length && compareEntries(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && compareEntries(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }

  heapify() {
    for (let i = Math.floor(this.heap.length / 2); i >= 0; i -= 1) {
      this.sinkDown(i);
    }
  }
}

function compareEntries(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.sequence - b.sequence;
}
