# Authorization Errors in Background Jobs

## Symptom
Batch job cancels early with `AUTHORITY_CHECK_FAILED` in the job log. Often occurs
right after a batch user's role assignment changes or after a transport that adds
a new authorization-relevant field to a report.

## Typical Error Codes / Messages
- AUTHORITY_CHECK_FAILED
- "User XXXX has no authorization for ..." in ST22 or job log
- Missing authorization objects such as S_BTCH_JOB, S_PROGRAM, F_KNA1_BUK

## Root Cause
The background user (e.g. BATCH_FI, BATCH_SD) is missing an authorization object
required by the report/program, usually because:
- The batch user's role was not updated after a new authorization object was added
- The job's execution company code / plant is not included in the batch user's
  organizational-level authorization values
- A composite role was deactivated during a security review

## Resolution Steps
1. Identify the missing object from the short dump (ST22) or job log detail.
2. In SU53, check the last failed authorization check for the batch user.
3. Add the missing authorization object/value to the batch user's role via PFCG.
4. Re-run the job manually (SM37 -> Start immediately) to confirm the fix.
5. If the change is not urgent, batch it into the next role transport and rerun
   at the next scheduled window.

## Related T-Codes
SU53, PFCG, SM37, ST22
