# PostgreSQL 17.11 limiter qualification

Disposable local PostgreSQL 17.11; no production mutation. Exact migration SHA-256 7fc76e61f74273d556fbda758bd9850aebcca5c733985af3d91494ec87ee6da6.

- ACL result: limiter execute anon=false, authenticated=false, service_role=true; pairing handoff anon=false, service_role=true.
- Burst: 12 allowed, 1 rejected from 13 immediate calls.
- Refill: after bucket reset to 0 and 1.05s wait, first call allowed and next rejected (1/1).
- Concurrency: pgbench -c 64 -j 16 -t 1; 64 completed, 0 client failures, 12 allowed and 52 rejected. Measured duration .148s; floor(12+.148)=12, within token-bucket envelope; remaining balance .076850.
- Rollback: limiter function/table absent; pairing handoff remained denied to anon and allowed only for service_role.

PostgreSQL 17 row-locking docs: https://www.postgresql.org/docs/17/explicit-locking.html. The limiter locks a singleton bucket row and reads clock_timestamp only after obtaining the lock. This result qualifies database atomicity, not production deployment or physical behavior.
