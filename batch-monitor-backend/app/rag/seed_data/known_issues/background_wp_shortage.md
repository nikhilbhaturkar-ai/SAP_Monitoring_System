# Background Work Process Shortage

## Symptom
Job stays in "Released" or "Scheduled" status well past its intended start time
and never actually starts running, eventually being cancelled manually or timing
out.

## Typical Error Codes / Messages
- NO_BATCH_WP_AVAILABLE
- Job visible in SM37 stuck in "Released" status
- SM50/SM66 shows all BTC (background) work processes busy or long-running

## Root Cause
More batch jobs were scheduled to start in the same window than there are
available background work processes on the relevant server/server group. This is
common at end-of-month or end-of-period when many collective jobs are scheduled
at the same trigger time (e.g. midnight).

## Resolution Steps
1. Check SM50/SM66 across the batch server group to confirm all BTC work
   processes are occupied by long-running jobs.
2. Identify whether a single runaway job is monopolizing work processes and, if
   safe, cancel/investigate it separately.
3. Stagger the start times of large batch jobs (in SM36) so they do not all fire
   at the same trigger time.
4. If this recurs regularly, ask BASIS to evaluate increasing the number of BTC
   work processes on the relevant application server(s).

## Related T-Codes
SM37, SM50, SM66, SM36, RZ04
