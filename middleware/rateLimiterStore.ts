export interface RateLimiterStore {
    takeToken(key: string, capacity: number, refillRate: number): boolean;
}