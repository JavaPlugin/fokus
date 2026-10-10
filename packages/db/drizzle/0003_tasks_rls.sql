-- Row Level Security für Aufgaben, Zeitblöcke, Fokus-Durchgänge, Guthaben und Inbox
-- (gleiche Regel wie 0001_rls.sql: nur eigene Zeilen, FORCE auch für den Eigentümer).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['task', 'time_block', 'focus_session', 'credit_entry', 'inbox_item']
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
-- Admin-Kontext (nur serverseitig): Zählwerte je Nutzer für das Admin-Panel, nie Inhalte.
CREATE POLICY admin_read ON task FOR SELECT
  USING (current_setting('app.admin', true) = '1');
