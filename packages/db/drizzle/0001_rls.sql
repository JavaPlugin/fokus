-- Row Level Security für alle Fachdaten.
-- Die API greift nur über withUser() zu: SET LOCAL ROLE fokus_app + app.user_id.
-- FORCE gilt auch für den Tabellen-Eigentümer (in Produktion ist das fokus_app selbst).

-- Rolle anlegen, falls sie fehlt (PGlite, CI). In Produktion legt deploy/db/10-app-role.sh sie an.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fokus_app') THEN
    CREATE ROLE fokus_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT has_schema_privilege('fokus_app', 'public', 'USAGE') THEN
    GRANT USAGE ON SCHEMA public TO fokus_app;
  END IF;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_settings', 'push_subscription', 'notification_log', 'api_key', 'webhook', 'webhook_delivery'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO fokus_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY own_rows ON %I USING (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint
-- API-Schlüssel: zum Anmelden per Schlüssel (Hash bekannt, Nutzer noch nicht) darf die API im
-- Kontext app.key_lookup = '1' lesen und last_used_at setzen (withKeyLookup).
CREATE POLICY key_lookup ON api_key FOR SELECT
  USING (current_setting('app.key_lookup', true) = '1');
--> statement-breakpoint
CREATE POLICY key_touch ON api_key FOR UPDATE
  USING (current_setting('app.key_lookup', true) = '1')
  WITH CHECK (current_setting('app.key_lookup', true) = '1');
--> statement-breakpoint
-- Webhooks: der Zustell-Job arbeitet über alle Nutzer im Admin-Kontext (app.admin = '1', nur
-- serverseitig gesetzt).
CREATE POLICY admin_read ON webhook FOR SELECT
  USING (current_setting('app.admin', true) = '1');
--> statement-breakpoint
CREATE POLICY admin_all ON webhook_delivery
  USING (current_setting('app.admin', true) = '1')
  WITH CHECK (current_setting('app.admin', true) = '1');
--> statement-breakpoint
-- Globale Tabellen ohne user_id: kein RLS, Zugriff nur über die API.
GRANT SELECT, INSERT ON admin_audit TO fokus_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON legal_text TO fokus_app;
