# Redis event distribution
- ID: redis-event-distribution
- Domain: scaling
- Status: researching
- Updated: 2026-11-07

## Current state
The user is exploring Redis for Lerche and requested explanatory diagrams and examples before implementation (discussion, 2026-11-07). Architecture and scope are not yet agreed; this discussion does not authorize implementation.

## Open decisions and future intentions
- User intention (clarified 2026-11-07): use Redis to support scaling by buffering events such as `guildCreate` and handing them off for processing, rather than having all event handlers run concurrently. The original request described this as Pub/Sub for all Discord events; it does not establish a specific transport or queue design.
- Define what “all Discord events” includes: application events versus gateway and voice protocol internals.
- Agree delivery guarantees and controlled worker handoff. Pure Pub/Sub, direct durable Streams, and a Redis-backed job queue (such as BullMQ) remain design options; the queue alternative is assistant-proposed, not a user-accepted choice.
