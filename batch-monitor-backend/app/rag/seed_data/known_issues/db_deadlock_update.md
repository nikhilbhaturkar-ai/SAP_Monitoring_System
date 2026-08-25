# Database Deadlocks / DBIF_RSQL_SQL_ERROR

## Symptom
Job cancels with a database-level SQL error rather than an SAP-level lock
message. The job log or short dump references a database deadlock or resource
wait timeout at the database layer.

## Typical Error Codes / Messages
- DBIF_RSQL_SQL_ERROR
- ORA-00060: deadlock detected while waiting for resource
- Similar deadlock codes for other DB platforms (e.g. HANA lock wait timeout)

## Root Cause
Two database sessions (often a batch job and another batch job, or a batch job
and an interface/RFC process) are each waiting on a resource the other holds,
typically on heavily updated tables like VBFA, BSEG, or custom Z-tables during
overlapping update-heavy jobs.

## Resolution Steps
1. Capture the exact table and SQL statement from the short dump/database trace.
2. Check whether two batch jobs that both update the same table were scheduled
   to run concurrently; reschedule one to avoid overlap.
3. For recurring deadlocks, review index design and update order in the
   underlying program(s) — deadlocks are often caused by two processes updating
   the same rows in a different order.
4. Escalate to the DBA/BASIS team if the deadlock involves system tables or
   spans multiple applications, since a database-level fix may be required.

## Related T-Codes
ST04, ST22, SM37, DB02
