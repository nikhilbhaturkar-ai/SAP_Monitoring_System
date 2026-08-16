const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request(path) {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      /* response had no JSON body */
    }
    throw new Error(message);
  }
  return response.json();
}

export const api = {
  health: () => request('/health'),
  systems: () => request('/systems'),
  // The dashboard always shows the latest run, so neither call passes a window —
  // the API's own defaults govern how far back the trends and history log reach.
  dashboard: (sid) => request(`/dashboard/${sid}`),
  history: (sid) => request(`/systems/${sid}/history`),
  trend: (sid, checkKey, windowDays = 30) =>
    request(`/systems/${sid}/trends/${checkKey}?window=${windowDays}`),
};
