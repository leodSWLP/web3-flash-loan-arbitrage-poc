import Redis, { RedisOptions } from 'ioredis';
import { ShareContentLocalStore } from '../async-local-store/share-content-local-store';
import * as JSONbig from 'json-bigint';

export class RedisUtil {
  private static initRedis() {
    const config: RedisOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    };

    // Only include username and password if explicitly set
    if (process.env.REDIS_USERNAME) {
      config.username = process.env.REDIS_USERNAME;
    }
    if (process.env.REDIS_PASSWORD) {
      config.password = process.env.REDIS_PASSWORD;
    }

    return new Redis(config);
  }

  private static getRedis() {
    const store = ShareContentLocalStore.getStore();
    if (!store) {
      throw new Error('No TransactionLocalStore context available');
    }

    if (!store.redis) {
      store.redis = this.initRedis();
    }
    return store.redis;
  }

  static async write(key: string, value: string | object, ttl?: number) {
    try {
      const redis = this.getRedis();
      const stringValue =
        typeof value === 'string' ? value : JSONbig.stringify(value);

      await redis.set(key, stringValue);
      if (typeof ttl === 'number' && ttl > 0) {
        await redis.expire(key, ttl);
      }
      return true;
    } catch (error) {
      throw new Error(`Failed to write to key ${key}: ${error.message}`);
    }
  }

  static async get(key) {
    try {
      const redis = this.getRedis();
      const value = await redis.get(key);
      return value;
    } catch (error) {
      throw new Error(`Failed to read from key ${key}: ${error.message}`);
    }
  }

  static async remove(key) {
    try {
      const redis = this.getRedis();
      const deleted = await redis.del(key);
      return deleted; // Returns number of keys deleted (0 or 1)
    } catch (error) {
      throw new Error(`Failed to remove key ${key}: ${error.message}`);
    }
  }

  static async clearByRegex(pattern) {
    try {
      const redis = this.getRedis();
      const keys = await redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      await redis.del(...keys);
      return keys.length;
    } catch (error) {
      throw new Error(
        `Failed to clear lists by pattern ${pattern}: ${error.message}`,
      );
    }
  }

  static async getByPrefixOrRegex(pattern: string) {
    try {
      const redis = this.getRedis();
      const result: { key: string; value: string }[] = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        for (const key of keys) {
          const type = await redis.type(key);
          if (type !== 'string') {
            continue; // Skip non-string types (e.g., list, hash, set)
          }
          const value = await redis.get(key);
          result.push({ key, value: value! });
        }
      } while (cursor !== '0');

      return result; // Returns [{ key, value }, ...]
    } catch (error) {
      throw new Error(
        `Failed to get keys by pattern ${pattern}: ${error.message}`,
      );
    }
  }

  static async batchWrite(
    operations: { key: string; value: string; ttl?: number }[],
  ) {
    try {
      const redis = this.getRedis();
      const multi = redis.multi();

      for (const op of operations) {
        const { key, value, ttl } = op;
        const stringValue =
          typeof value === 'string' ? value : JSON.stringify(value);
        multi.set(key, stringValue);
        if (typeof ttl === 'number' && ttl > 0) {
          multi.expire(key, ttl);
        }
      }

      await multi.exec();
      return true;
    } catch (error) {
      throw new Error(`Failed to batch write: ${error.message}`);
    }
  }

  // Close Redis connection
  static async disconnect() {
    try {
      const store = ShareContentLocalStore.getStore();
      if (store && store.redis) {
        await store.redis.quit();
        store.redis = null; // Clear the instance
      }
    } catch (error) {
      throw new Error(`Failed to disconnect: ${error.message}`);
    }
  }
}
