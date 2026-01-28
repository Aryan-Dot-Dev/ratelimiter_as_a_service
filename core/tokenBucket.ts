import { LRUCache } from "lru-cache";
import type { RateLimiterStore } from "../middleware/rateLimiterStore.js";

type Bucket = {
    tokens: number;
    lastRefill: number;
}

const store = 
    (globalThis as any).__RATE_LIMIT_LRU__ ??
    ((globalThis as any).__RATE_LIMIT_LRU__ = new LRUCache<string, Bucket>({
        max: 100_000,
        ttl: 10000,
        updateAgeOnGet: true,
}));

export class TokenLimiterStore implements RateLimiterStore {
    takeToken(key: string, capacity: number, refillRate: number): boolean {
        const now = Date.now();

    let bucket = store.get(key);

    if (!bucket) {
        bucket = { tokens: capacity, lastRefill: now };
        store.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;

    if (elapsed > 0) {
        bucket.tokens = Math.min(capacity, bucket.tokens + (elapsed / 1000) * refillRate);
        bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) return false;

    bucket.tokens -= 1;
    return true;
}}