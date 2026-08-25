# Variant Errors After Transport

## Symptom
Job cancels immediately at step 1 with a message that the selection variant does
not exist for the program, even though the job ran successfully in a prior period.

## Typical Error Codes / Messages
- VARIANT_NOT_FOUND
- "Variant XXXX does not exist for program YYYY"

## Root Cause
The job's variant was not included in the most recent transport to production
(variants are client-specific and must be transported explicitly), or the
variant was deleted/renamed as part of a program cleanup without updating the
job definition in SM36/SM37.

## Resolution Steps
1. Confirm in SE38/program variant maintenance (SA38 -> Goto -> Variants) whether
   the variant exists in the target client.
2. If missing, re-transport the variant from the source system (variants travel
   in their own transport request type) or recreate it manually if the original
   is unavailable.
3. Update the job definition in SM36 to point at the correct/current variant
   name if it was renamed.
4. Re-run the job manually to confirm resolution before the next scheduled run.

## Related T-Codes
SM36, SM37, SE38, SA38
