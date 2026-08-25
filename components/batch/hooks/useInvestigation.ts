"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createInvestigation, getInvestigation, streamInvestigation } from "../api/client";
import type { InvestigationState } from "../types";

export function useInvestigation() {
  const [state, setState] = useState<InvestigationState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeStreamRef = useRef<(() => void) | null>(null);

  const start = useCallback(async (runDate: string) => {
    setError(null);
    setState(null);
    try {
      const { investigation_id } = await createInvestigation(runDate);
      const initial = await getInvestigation(investigation_id);
      setState(initial);

      closeStreamRef.current?.();
      closeStreamRef.current = streamInvestigation(investigation_id, (update) => {
        setState(update);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!state) return;
    const fresh = await getInvestigation(state.investigation_id);
    setState(fresh);
  }, [state]);

  return { state, error, start, refresh, setState };
}
