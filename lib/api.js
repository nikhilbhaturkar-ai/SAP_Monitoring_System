const BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

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
  dashboard: (sid, asOf = null) =>
    request(`/dashboard/${sid}${asOf ? `?asOf=${asOf}` : ''}`),
  history: (sid, asOf = null) => request(`/systems/${sid}/history${asOf ? `?asOf=${asOf}` : ''}`),
  trend: (sid, checkKey, windowDays = 30) =>
    request(`/systems/${sid}/trends/${checkKey}?window=${windowDays}`),
  systemRuns: (sid) => request(`/systems/${sid}/runs`),
};
