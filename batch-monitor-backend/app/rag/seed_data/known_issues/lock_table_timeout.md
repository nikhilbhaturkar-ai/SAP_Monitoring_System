# Lock Table Timeout During Collective Runs

## Symptom
Job cancels with a `TIME_OUT` error while waiting for an enqueue lock, commonly on
sales/billing tables like VBAK, VBAP, or VBFA during collective billing or
delivery runs.

## Typical Error Codes / Messages
- ENQUEUE_TABLE_LOCK
- TIME_OUT waiting for lock release
- "Foreign lock" message referencing another user or job holding the lock on the
  same document

## Root Cause
Two processes (often an online user and a batch job, or two overlapping batch
jobs) are trying to lock the same sales/billing document simultaneously. This is
common when a collective run is scheduled to overlap with peak interactive usage,
or when a prior job run did not release its locks cleanly after an abnormal
termination.

## Resolution Steps
1. Check transaction SM12 for stale locks on the affected table/document range.
2. If a lock is stale (owning session no longer active), have BASIS release it.
3. Review the job schedule in SM37/SM36 to ensure collective runs do not overlap
   with each other or with known peak interactive usage windows.
4. Consider splitting very large collective runs into smaller variant-based
   batches to reduce lock contention and the blast radius of any single failure.

## Related T-Codes
SM12, SM37, SM36, VA05
