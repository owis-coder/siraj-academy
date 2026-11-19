// ============================================================
// محرك التخزين المشترك (Redis / High-Performance Fallback Cache)
// يدعم Redis كـ Shared Store عندما يتوفر REDIS_URL، مع انتقال
// سلس وآمن للذاكرة المحلية المؤقتة دون انقطاع الخدمة في حال تعطل Redis.
// ============================================================
import Redis from "ioredis";

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

interface MemoryZEntry {
  member: string;
  score: number;
}

class InMemoryStore {
  private kv = new Map<string, MemoryEntry>();
  private zsets = new Map<string, MemoryZEntry[]>();

  constructor() {
    // تنظيف دوري للذاكرة كل 30 ثانية
    setInterval(() => this.cleanup(), 30000).unref();
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.kv.entries()) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.kv.delete(key);
      }
    }
  }

  get(key: string): string | null {
    const entry = this.kv.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.kv.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.kv.set(key, { value, expiresAt });
  }

  /**
   * عملية حجز وتعيين ذرية في الذاكرة (Atomic Set If Not Exists)
   */
  setNX(key: string, value: string, ttlSeconds: number): boolean {
    const existing = this.get(key);
    if (existing !== null) {
      return false;
    }
    this.set(key, value, ttlSeconds);
    return true;
  }

  del(key: string): void {
    this.kv.delete(key);
    this.zsets.delete(key);
  }

  incr(key: string, ttlSeconds?: number): number {
    const current = Number(this.get(key) || 0) + 1;
    this.set(key, String(current), ttlSeconds);
    return current;
  }

  zadd(key: string, score: number, member: string): void {
    let set = this.zsets.get(key);
    if (!set) {
      set = [];
      this.zsets.set(key, set);
    }
    // إزالة العضو إن وجد مسبقًا وتحديث النقاط
    const filtered = set.filter((item) => item.member !== member);
    filtered.push({ score, member });
    this.zsets.set(key, filtered);
  }

  zremrangebyscore(key: string, min: number, max: number): void {
    const set = this.zsets.get(key);
    if (!set) return;
    this.zsets.set(
      key,
      set.filter((item) => item.score < min || item.score > max),
    );
  }

  zcard(key: string): number {
    const set = this.zsets.get(key);
    return set ? set.length : 0;
  }

  expire(key: string, ttlSeconds: number): void {
    const entry = this.kv.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlSeconds * 1000;
    }
  }

  flush(): void {
    this.kv.clear();
    this.zsets.clear();
  }
}

const memoryStore = new InMemoryStore();
let redisClient: Redis | null = null;
let isRedisConnected = false;
let redisInitAttempted = false;

export function initRedis(): void {
  if (redisInitAttempted) return;
  redisInitAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.log("[CACHE] REDIS_URL غير معرّف — يعمل في وضع التخزين المحلي الآمن (In-Memory Sliding Window)");
    return;
  }

  try {
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 5) {
          // eslint-disable-next-line no-console
          console.warn("[CACHE] تعذر الاتصال بـ Redis بعد عدة محاولات — استخدام الذاكرة المحلية كبديل آمن");
          return null;
        }
        return Math.min(times * 1000, 3000);
      },
    });

    redisClient.on("connect", () => {
      isRedisConnected = true;
      // eslint-disable-next-line no-console
      console.log("[CACHE] تم الاتصال بـ Redis بنجاح (Shared Cache Store)");
    });

    redisClient.on("error", (err) => {
      isRedisConnected = false;
      // eslint-disable-next-line no-console
      console.warn("[CACHE] خطأ في اتصال Redis (الانتقال التلقائي للذاكرة البديلة):", (err as Error).message);
    });

    redisClient.on("close", () => {
      isRedisConnected = false;
    });

    void redisClient.connect().catch(() => {
      isRedisConnected = false;
    });
  } catch (err) {
    isRedisConnected = false;
    // eslint-disable-next-line no-console
    console.warn("[CACHE] تعذر تهيئة عميل Redis:", (err as Error).message);
  }
}

export const securityCache = {
  isRedisActive(): boolean {
    return isRedisConnected && !!redisClient;
  },

  async get(key: string): Promise<string | null> {
    if (this.isRedisActive() && redisClient) {
      try {
        return await redisClient.get(key);
      } catch {
        return memoryStore.get(key);
      }
    }
    return memoryStore.get(key);
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isRedisActive() && redisClient) {
      try {
        if (ttlSeconds) {
          await redisClient.set(key, value, "EX", ttlSeconds);
        } else {
          await redisClient.set(key, value);
        }
        return;
      } catch {
        memoryStore.set(key, value, ttlSeconds);
        return;
      }
    }
    memoryStore.set(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    if (this.isRedisActive() && redisClient) {
      try {
        await redisClient.del(key);
      } catch {
        memoryStore.del(key);
      }
    }
    memoryStore.del(key);
  },

  /**
   * عملية حجز وتعيين ذرية عبر Redis SET NX EX أو الذاكرة المحلية
   * تعيد true إذا نجح الحجز (المفتاح جديد)، وتعيد false إذا كان مستهلكًا مسبقًا
   */
  async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.isRedisActive() && redisClient) {
      try {
        const res = await redisClient.set(key, value, "EX", ttlSeconds, "NX");
        return res === "OK";
      } catch {
        return memoryStore.setNX(key, value, ttlSeconds);
      }
    }
    return memoryStore.setNX(key, value, ttlSeconds);
  },

  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (this.isRedisActive() && redisClient) {
      try {
        const val = await redisClient.incr(key);
        if (ttlSeconds && val === 1) {
          await redisClient.expire(key, ttlSeconds);
        }
        return val;
      } catch {
        return memoryStore.incr(key, ttlSeconds);
      }
    }
    return memoryStore.incr(key, ttlSeconds);
  },

  async zadd(key: string, score: number, member: string): Promise<void> {
    if (this.isRedisActive() && redisClient) {
      try {
        await redisClient.zadd(key, score, member);
        return;
      } catch {
        memoryStore.zadd(key, score, member);
        return;
      }
    }
    memoryStore.zadd(key, score, member);
  },

  async zremrangebyscore(key: string, min: number, max: number): Promise<void> {
    if (this.isRedisActive() && redisClient) {
      try {
        await redisClient.zremrangebyscore(key, min, max);
        return;
      } catch {
        memoryStore.zremrangebyscore(key, min, max);
        return;
      }
    }
    memoryStore.zremrangebyscore(key, min, max);
  },

  async zcard(key: string): Promise<number> {
    if (this.isRedisActive() && redisClient) {
      try {
        return await redisClient.zcard(key);
      } catch {
        return memoryStore.zcard(key);
      }
    }
    return memoryStore.zcard(key);
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.isRedisActive() && redisClient) {
      try {
        await redisClient.expire(key, ttlSeconds);
        return;
      } catch {
        memoryStore.expire(key, ttlSeconds);
        return;
      }
    }
    memoryStore.expire(key, ttlSeconds);
  },

  async flush(): Promise<void> {
    if (this.isRedisActive() && redisClient) {
      try {
        await redisClient.flushdb();
      } catch {}
    }
    memoryStore.flush();
  },

  getHealth(): { status: "connected" | "fallback_memory" | "disabled"; mode: string } {
    if (this.isRedisActive()) {
      return { status: "connected", mode: "Redis Clustered/Shared" };
    }
    if (process.env.REDIS_URL) {
      return { status: "fallback_memory", mode: "In-Memory Fallback (Redis unreachable)" };
    }
    return { status: "disabled", mode: "In-Memory Native Sliding-Window" };
  },
};
