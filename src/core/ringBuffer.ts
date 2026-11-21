/** 固定容量环形缓冲区：用于历史快照，O(1) 写入、自动丢弃最旧数据 */
export class RingBuffer<T> {
  private buf: Array<T | undefined>
  private head = 0
  private count = 0

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('RingBuffer capacity must be > 0')
    this.buf = new Array<T | undefined>(capacity)
  }

  get size(): number {
    return this.count
  }

  push(item: T): T | undefined {
    const evicted = this.buf[this.head]
    this.buf[this.head] = item
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
    return evicted
  }

  /** index 0 = 最旧，size-1 = 最新 */
  at(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined
    const start = (this.head - this.count + this.capacity) % this.capacity
    return this.buf[(start + index) % this.capacity]
  }

  latest(): T | undefined {
    return this.at(this.count - 1)
  }

  toArray(): T[] {
    const out: T[] = []
    for (let i = 0; i < this.count; i++) out.push(this.at(i) as T)
    return out
  }

  clear(): void {
    this.buf = new Array<T | undefined>(this.capacity)
    this.head = 0
    this.count = 0
  }
}
