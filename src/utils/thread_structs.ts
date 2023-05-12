import * as async_mutex from 'async-mutex';

export class ThreadSafeDictionary<K, V> {
  private map: Map<K, V>;
  private mutex: async_mutex.Mutex;

  constructor() {
    this.map = new Map<K, V>();
    this.mutex = new async_mutex.Mutex();
  }

  public async set(key: K, value: V): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.map.set(key, value);
    });
  }

  public async get(key: K): Promise<V | undefined> {
    return await this.mutex.runExclusive(async () => {
      return this.map.get(key);
    });
  }

  public async tryInsert(key: K, value: V): Promise<boolean> {
    return await this.mutex.runExclusive(async () => {
      if (this.map.has(key)) {
        return false;
      }
      this.map.set(key, value);
      return true;
    });
  }

  public async remove(key: K): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.map.delete(key);
    });
  }


  // Implement other methods as needed (e.g., delete, clear, etc.)
}