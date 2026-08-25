/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nothing SAP-specific needed here — route handlers under app/api/** talk
  // straight to Postgres via lib/server/db.js, and app/api/batch/[...path]
  // reverse-proxies to the separate FastAPI backend.
  //
  // Disabled: `next dev` otherwise appends an "agent rules" block to this
  // repo's own CLAUDE.md on every run, which fights with the hand-maintained
  // architecture doc at the repo root.
  agentRules: false,
};

export default nextConfig;
