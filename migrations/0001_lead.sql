-- Inbox-ul cererilor de pe site (Cloudflare D1, binding LEADS_DB, jurisdicție UE).
-- Aplicare: npx wrangler d1 migrations apply youprotect-leads --remote
-- Cererile ajung aici din /api/submit-lead și pleacă spre Prospector CRM prin /api/crm/leads.
CREATE TABLE lead (
  id TEXT PRIMARY KEY,                       -- UUID
  created_at TEXT NOT NULL,                  -- ISO 8601, UTC
  environment TEXT NOT NULL CHECK (environment IN ('production', 'preview')),
  tag TEXT NOT NULL DEFAULT 'website',
  intent TEXT NOT NULL CHECK (intent IN ('quote', 'consultation')),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  cui TEXT,                                  -- fără „RO”, cu cifra de control verificată
  phone TEXT,
  email TEXT NOT NULL,
  product TEXT,                              -- slug-ul produsului de pe care a venit cererea
  answers TEXT NOT NULL DEFAULT '[]',        -- JSON: [{question, label, answer}]
  source_url TEXT,
  user_agent TEXT,
  ip TEXT,
  email_sent_at TEXT,
  email_error TEXT,
  synced_at TEXT,                            -- când a preluat-o CRM-ul
  crm_ref TEXT                               -- id-ul din CRM
);

CREATE INDEX lead_unsynced_idx ON lead (created_at) WHERE synced_at IS NULL;
CREATE INDEX lead_synced_idx ON lead (synced_at) WHERE synced_at IS NOT NULL;
