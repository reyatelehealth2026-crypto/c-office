// LRU dedupe — keeps last N keys to drop duplicate events from
// hooks vs JSONL tail (same tool_use_id arrives twice).
export class Dedupe {
  constructor(max = 4096) { this.max = max; this.set = new Set(); this.q = []; }
  seen(key) {
    if (this.set.has(key)) return true;
    this.set.add(key);
    this.q.push(key);
    if (this.q.length > this.max) this.set.delete(this.q.shift());
    return false;
  }
}

export class RingBuffer {
  constructor(cap) { this.cap = cap; this.arr = []; }
  push(item) {
    this.arr.push(item);
    if (this.arr.length > this.cap) this.arr.splice(0, this.arr.length - this.cap);
  }
  toArray() { return this.arr.slice(); }
  filter(fn) { return this.arr.filter(fn); }
}
