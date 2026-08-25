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
  ('st22',    'ST22 — ABAP Runtime Errors',  '0',                           FALSE, FALSE, 30),
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
  ('freeApp', 'Free Memory — App Server',    NULL,                          TRUE,  TRUE,  160),
  ('freeDb',  'Free Memory — Database',      NULL,                          TRUE,  TRUE,  170),
  ('urlStatus','Endpoint Availability',      'accessable',                  FALSE, FALSE, 180)
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label,
      normal_text = EXCLUDED.normal_text,
      is_info = EXCLUDED.is_info,
      is_volume = EXCLUDED.is_volume,
      sort_order = EXCLUDED.sort_order;
