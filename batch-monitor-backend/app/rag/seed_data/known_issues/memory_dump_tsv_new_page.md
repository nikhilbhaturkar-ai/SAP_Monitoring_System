# Memory Dumps: TSV_TNEW_PAGE_ALLOC_FAILED / SYSTEM_NO_ROLL

## Symptom
Job terminates with a short dump (visible in ST22) instead of a normal error
message. Job log shows the job was cancelled after an ABAP runtime error.

## Typical Error Codes / Messages
- TSV_TNEW_PAGE_ALLOC_FAILED
- SYSTEM_NO_ROLL
- "No more storage space available for extending an internal table"

## Root Cause
The job's internal table (often built while reading a large data set, e.g. stock
reconciliation or a large FI extract) exceeded the memory available to the work
process. Common triggers:
- A selection variant with an overly broad date range or missing restriction
- Growth in the underlying data volume since the variant was last sized
- The work process's abap/heap_area_dia or ztta/roll_extension parameters are
  too low for the current data volume

## Resolution Steps
1. Check ST22 for the exact dump and the internal table/line that exhausted
   memory.
2. Narrow the job's selection variant (e.g. process by plant/company code in
   parallel smaller jobs) rather than a single huge selection.
3. If the data volume has structurally grown, ask BASIS to review the relevant
   memory profile parameters for the batch server group used by these jobs.
4. Consider adding FREE MEMORY / packaging logic if this is a custom program
   (report to the ABAP development team for a permanent code fix).

## Related T-Codes
ST22, SM37, ST02, RZ11
