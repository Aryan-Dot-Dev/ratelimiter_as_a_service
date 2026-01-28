import {type RateLimiterStore } from "./rateLimiterStore.js";

export function rateLimiter(options: {limit: number, windowMs: number, key: (req: Request) => string, store: RateLimiterStore}) {
    const refillRate = options.limit / options.windowMs;

    return async (req: Request, res: Response, next: () => Promise<Response>) => {
        const key = options.key(req);
        const allowed = options.store.takeToken(key, options.limit, refillRate);

        if (!allowed) {
            return new Response("Too Many Requests", { status: 429 });
        }

        return next();
    }
}