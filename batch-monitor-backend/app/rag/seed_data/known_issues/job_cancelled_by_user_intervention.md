# Job Cancelled by Manual Intervention

## Symptom
Job log shows the job was cancelled not by a runtime error but by a user/BASIS
action, often after sitting in "Released" or "Active" status for an unusually
long time.

## Typical Error Codes / Messages
- "Job cancelled by user XXXX" in SM37 job log
- No ABAP dump in ST22 (distinguishes this from a technical failure)

## Root Cause
BASIS or an administrator manually cancelled the job, typically because:
- It was blocking a background work process needed for higher-priority jobs
  (see background work process shortage)
- It appeared to be hung/stuck with no progress for an extended period
- A planned system maintenance window required background processing to be
  paused

## Resolution Steps
1. Check the job log and system log (SM21) around the cancellation time for the
   BASIS action and any accompanying comment.
2. Correlate with change/maintenance calendars to see if a planned outage
   coincides with the cancellation time.
3. If the job was genuinely hung, investigate the underlying program for a loop
   or unbounded wait condition before simply rescheduling.
4. Reschedule the job for the next available window once the root cause (if any)
   is addressed.

## Related T-Codes
SM37, SM21, SM50
