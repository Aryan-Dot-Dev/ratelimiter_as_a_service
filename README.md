# Rate Limiter Package

A lightweight, flexible token-bucket rate limiter for Node.js and edge runtimes (Bun, Deno). Built with TypeScript, fully typed, and designed for modern Fetch API-based applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ⚡ **Token Bucket Algorithm** — Smooth rate limiting with burst capacity
- 🔌 **Framework Agnostic** — Works with Bun, Express, Cloudflare Workers, Next.js, and more
- 💾 **Built-in LRU Store** — Production-ready in-memory storage with automatic cleanup
- 🔧 **Custom Store Support** — Bring your own Redis, DynamoDB, or database adapter
- 📦 **Zero Dependencies** — Only uses `lru-cache` for built-in storage
- 🔷 **TypeScript First** — Full type safety and IntelliSense support

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
  - [Bun / Fetch API](#bun--fetch-api)
  - [Express.js](#expressjs)
- [API Reference](#api-reference)
  - [rateLimiter(options)](#ratelimiteroptions)
  - [TokenLimiterStore](#tokenlimiterstore)
  - [RateLimiterStore Interface](#ratelimiterstore-interface)
- [Advanced Usage](#advanced-usage)
  - [Custom Redis Store](#custom-redis-store)
  - [Per-Route Rate Limits](#per-route-rate-limits)
  - [Dynamic Rate Limits](#dynamic-rate-limits)
- [How It Works](#how-it-works)
- [Load Testing](#load-testing)
- [Publishing](#publishing)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Installation

```bash
npm install @suspiciousdev21/rl-aas
```

```bash
yarn add @suspiciousdev21/rl-aas
```

```bash
pnpm add @suspiciousdev21/rl-aas
```

## Quick Start

### Bun / Fetch API

```typescript
import { rateLimiter } from "@suspiciousdev21/rl-aas/middleware/rateLimiter";
import { TokenLimiterStore } from "@suspiciousdev21/rl-aas/core/tokenBucket";

const limiter = rateLimiter({
  limit: 100,           // 100 requests
  windowMs: 60_000,     // per minute
  key: (req) => req.headers.get("X-API-KEY") || "anonymous",
  store: new TokenLimiterStore(),
});

Bun.serve({
  port: 3000,
  async fetch(req) {
    return limiter(req, new Response(), async () => {
      return new Response("Success!", { status: 200 });
    });
  },
});
```

### Express.js

```typescript
import express from "express";
import { TokenLimiterStore } from "@suspiciousdev21/rl-aas/core/tokenBucket";

const app = express();
const store = new TokenLimiterStore();

app.use((req, res, next) => {
  const key = req.header("X-API-KEY") || req.ip || "anonymous";
  const refillRate = 100 / 60_000; // 100 requests per minute
  
  if (!store.takeToken(key, 100, refillRate)) {
    return res.status(429).json({ error: "Too Many Requests" });
  }
  
  next();
});

app.get("/", (req, res) => {
  res.json({ message: "Hello, world!" });
});

app.listen(3000);
```
## API Reference

### `rateLimiter(options)`

Creates a rate limiting middleware function.

#### Options

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | `number` | Yes | Maximum number of requests allowed within the time window |
| `windowMs` | `number` | Yes | Time window in milliseconds |
| `key` | `(req: Request) => string` | Yes | Function to extract the rate limit key from the request |
| `store` | `RateLimiterStore` | Yes | Storage implementation for tracking rate limits |

#### Returns

Middleware function with signature:

```typescript
(req: Request, res: Response, next: () => Promise<Response>) => Promise<Response>
```

#### Example

```typescript
const limiter = rateLimiter({
  limit: 100,
  windowMs: 60_000,
  key: (req) => {
    // Rate limit by API key
    const apiKey = req.headers.get("Authorization");
    if (apiKey) return apiKey;
    
    // Fallback to IP address
    return req.headers.get("X-Forwarded-For") || "anonymous";
  },
  store: new TokenLimiterStore(),
});
```

### `TokenLimiterStore`

Built-in in-memory rate limit store using an LRU cache.

#### Configuration

The store is pre-configured with sensible defaults:

- **Max entries**: 100,000 keys
- **TTL**: 10 seconds after last access
- **Auto-cleanup**: Removes stale entries automatically

#### Methods

##### `takeToken(key, capacity, refillRate)`

Attempts to consume one token from the bucket.

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | `string` | Unique identifier for the rate limit bucket |
| `capacity` | `number` | Maximum tokens in the bucket |
| `refillRate` | `number` | Tokens refilled per second |

**Returns**: `boolean` — `true` if token was consumed, `false` if rate limit exceeded

#### Example

```typescript
const store = new TokenLimiterStore();
const key = "user:123";
const capacity = 100;
const refillRate = 100 / 60_000; // 100 per minute = ~1.67 per second

const allowed = store.takeToken(key, capacity, refillRate);

if (allowed) {
  console.log("Request allowed");
} else {
  console.log("Rate limit exceeded");
}
```

### `RateLimiterStore` Interface

Implement this interface to create custom storage backends.

```typescript
interface RateLimiterStore {
  takeToken(key: string, capacity: number, refillRate: number): boolean;
}
```

## How It Works

### Token Bucket Algorithm

The rate limiter uses the **token bucket algorithm**:

1. Each user gets a "bucket" that holds tokens
2. The bucket starts full (at `capacity`)
3. Each request consumes 1 token
4. Tokens refill continuously at `refillRate` per second
5. If the bucket is empty, requests are rejected

**Benefits**:

- Allows short bursts while maintaining average rate
- More flexible than fixed windows
- No "thundering herd" at window boundaries

### Refill Rate Calculation

```typescript
const refillRate = limit / windowMs;

// Example: 100 requests per minute
// refillRate = 100 / 60000 = 0.00167 tokens per millisecond
//            = 1.67 tokens per second
```

### Example Scenario

```typescript
// Configuration: 10 requests per 10 seconds
limit: 10
windowMs: 10_000
refillRate: 10 / 10_000 = 0.001 tokens/ms = 1 token/second

// Timeline:
t=0s:  Make 10 requests → bucket empty (0 tokens)
t=1s:  Bucket has 1 token → 1 request allowed
t=5s:  Bucket has 5 tokens → 5 requests allowed
t=10s: Bucket refilled to 10 tokens → burst of 10 allowed
```

## Load Testing

Test your rate limiter with k6:

```javascript
// test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },  // Ramp up
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
};

export default function () {
  const res = http.get('http://localhost:3000/api/data', {
    headers: { 'X-API-KEY': `user-${__VU}` },
  });
  
  check(res, {
    'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
  });
  
  sleep(0.1);
}
```

Run the test:

```bash
k6 run test.js
```

## Best Practices

### 1. Choose Appropriate Limits

```typescript
// API endpoints
limit: 100, windowMs: 60_000  // 100/min

// Login/auth endpoints  
limit: 5, windowMs: 60_000    // 5/min

// Heavy operations
limit: 10, windowMs: 60_000   // 10/min

// Public endpoints
limit: 1000, windowMs: 60_000 // 1000/min
```

### 2. Use Meaningful Keys

```typescript
// ✅ Good: Specific to user
key: (req) => req.headers.get("Authorization")

// ✅ Good: Fallback chain
key: (req) => 
  req.headers.get("X-API-KEY") || 
  req.headers.get("X-Forwarded-For") || 
  "anonymous"

// ❌ Bad: Everyone shares limit
key: (req) => "global"
```

### 3. Handle Rate Limit Responses

```typescript
return limiter(req, new Response(), async () => {
  return next();
}).catch((err) => {
  if (err.status === 429) {
    return new Response(
      JSON.stringify({ 
        error: "Rate limit exceeded",
        retryAfter: 60 
      }),
      { 
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60"
        }
      }
    );
  }
  throw err;
});
```

### 4. Monitor Rate Limit Hits

```typescript
const limiter = rateLimiter({
  limit: 100,
  windowMs: 60_000,
  key: (req) => req.headers.get("X-API-KEY") || "anonymous",
  store: new TokenLimiterStore(),
});

async function withLogging(req: Request, res: Response, next: () => Promise<Response>) {
  const result = await limiter(req, res, next);
  
  if (result.status === 429) {
    console.warn(`Rate limit exceeded for ${req.headers.get("X-API-KEY")}`);
    // Send to monitoring service
  }
  
  return result;
}
```

## Troubleshooting

### Issue: Rate limits not working in distributed systems

**Solution**: Use Redis store instead of in-memory store

```typescript
const store = new RedisRateLimiterStore(redis);
```

### Issue: Memory growing unbounded

**Solution**: The built-in `TokenLimiterStore` uses LRU cache with automatic cleanup. Ensure you're not creating new instances on every request:

```typescript
// ✅ Good: Create once
const store = new TokenLimiterStore();
const limiter = rateLimiter({ ..., store });

// ❌ Bad: Creates new store each time
app.use((req, res, next) => {
  const limiter = rateLimiter({ ..., store: new TokenLimiterStore() });
});
```

### Issue: Too many false positives

**Solution**: Increase the limit or window size, or implement key-based exemptions:

```typescript
key: (req) => {
  const apiKey = req.headers.get("X-API-KEY");
  if (PREMIUM_KEYS.includes(apiKey)) {
    return `premium:${apiKey}`;
  }
  return `standard:${apiKey}`;
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/ratelimiter/issues)
- **Email**: aryan.main21@gmail.com

---

Made with ❤️ by [SuspiciousDev21](@https://www.npmjs.com/~suspiciousdev)