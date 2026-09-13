---
name: PostgreSQL challenge writes
description: Constraint for parameterized PostgreSQL writes used by authentication challenges.
---

Parameterized `pg` queries must contain one SQL command; cleanup and insertion of authentication challenges need separate queries or an explicit transaction.

**Why:** PostgreSQL rejects multiple commands in a prepared statement when parameters are present, which otherwise surfaces as a generic API failure during WebAuthn option generation.

**How to apply:** Keep challenge lifecycle writes separate, and add a transaction if atomic cleanup-plus-insert behavior becomes necessary.