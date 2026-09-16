-- Reference data: the SAP landscape and the daily monitoring checklist.
-- Safe to re-run; everything upserts.

INSERT INTO systems (sid, name, kind, host, url, sort_order) VALUES
  ('MSP',     'Production — MSP Client 300', 'sap', NULL, NULL, 10),
  ('MSD',     'Development — MSD Client 100','sap', NULL, NULL, 15),
  ('MGP',     'BW / Analytics — MGP',        'sap', NULL, NULL, 20),
  ('SPA',     'Solution Manager — SPA',      'sap', NULL, NULL, 30),
  ('BIPROD',  'BI Platform',                 'url', 'mpclsapbip.mpower.com.qa:8080',
              'http://mpclsapbip.mpower.com.qa:8080/BOE/CMC', 40),
  ('FIORI',   'Fiori Launchpad',             'url', 'mpclsapgws.mpower.com.qa:1443',
              'https://mpclsapgws.mpower.com.qa:1443/sap/bc/ui2/flp', 50),
  ('WEBDISP', 'Web Dispatcher',              'url', 'mpclsapwdp.mpower.com.qa:8000',
              'https://mpclsapwdp.mpower.com.qa:8000/sap/wdisp/admin/public/default.html', 60)
ON CONFLICT (sid) DO UPDATE
  SET name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      host = EXCLUDED.host,
      url  = EXCLUDED.url,
      sort_order = EXCLUDED.sort_order;

INSERT INTO checks (key, label, normal_text, is_info, is_volume, sort_order) VALUES
  ('dataVol', 'DBA Cockpit — Data Volume',   NULL,                          TRUE,  TRUE,  10),
  ('logVol',  'DBA Cockpit — Log Volume',    NULL,                          TRUE,  TRUE,  20),
  ('st22',    'ST22 — ABAP Runtime Errors',  '0',                           FALSE, FALSE, 157),
  ('backup',  'Backup',                      'backup successful',           FALSE, FALSE, 40),
  ('sm13',    'SM13 — Update Requests',      'active',                      FALSE, FALSE, 50),
  ('sm12',    'SM12 — Lock Entries',         NULL,                          TRUE,  FALSE, 60),
  ('sm51',    'SM51 — Application Servers',  'active',                      FALSE, FALSE, 70),
  ('sm50',    'SM50 — Work Process List',    'all ok',                      FALSE, FALSE, 80),
  ('st06',    'ST06 — OS Monitoring',        'all ok',                      FALSE, FALSE, 90),
  ('sm37',    'SM37 — Background Jobs',      'no long running',             FALSE, FALSE, 100),
  ('smq1',    'SMQ1 — Outbound Queues',      'no queues found',             FALSE, FALSE, 110),
  ('smq2',    'SMQ2 — Inbound Queues',       'no queues found',             FALSE, FALSE, 120),
  ('sm20',    'SM20 — Security Audit Log',   'no user critical activity',   FALSE, FALSE, 130),
  ('sm21',    'SM21 — System Log',           'no high priority entry found',FALSE, FALSE, 140),
  ('sm58',    'SM58 — Transactional RFC',    NULL,                          TRUE,  FALSE, 150),
  ('cancel',  'Cancelled Jobs',              'no cancelled jobs',           FALSE, FALSE, 155),
  ('strust',  'STRUST — SSL Certificates Expired',            '0',          FALSE, FALSE, 30),
  ('strustToday', 'STRUST — SSL Certificates Expired Today',  '0',          FALSE, FALSE, 31),
  ('strust15d',   'STRUST — SSL Certificates Expiring in 15 Days', '0',     FALSE, FALSE, 32),
  ('freeApp', 'Free Memory — App Server',    NULL,                          TRUE,  TRUE,  160),
  ('freeDb',  'Free Memory — Database',      NULL,                          TRUE,  TRUE,  170),
  ('urlStatus','Endpoint Availability',      'accessable',                  FALSE, FALSE, 180)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      normal_text = EXCLUDED.normal_text,
      is_info = EXCLUDED.is_info,
      is_volume = EXCLUDED.is_volume,
      sort_order = EXCLUDED.sort_order;

INSERT INTO plans (id, name) VALUES
  (1, 'Advanced'),
  (2, 'Basic')
ON CONFLICT (name) DO UPDATE
  SET name = EXCLUDED.name;

INSERT INTO users (username, password, name, role, email, avatar, plan_id) VALUES
  ('admin', 'password123', 'SAP Basis Admin', 'Lead Administrator', 'basis.admin@company.sap', 'SA', 1),
  ('operator', 'sap123', 'Basis Operator', 'Landscape Monitor', 'operator@company.sap', 'BO', 2)
ON CONFLICT (username) DO UPDATE
  SET password = EXCLUDED.password,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      email = EXCLUDED.email,
      avatar = EXCLUDED.avatar,
      plan_id = EXCLUDED.plan_id;

-- By default, allow everything for Advanced, and maybe a subset for Basic.
INSERT INTO plan_tiles (plan_id, tile_key, is_enabled)
SELECT 1, key, TRUE FROM checks
ON CONFLICT (plan_id, tile_key) DO NOTHING;

INSERT INTO plan_tiles (plan_id, tile_key, is_enabled)
SELECT 2, key, TRUE FROM checks
ON CONFLICT (plan_id, tile_key) DO NOTHING;
