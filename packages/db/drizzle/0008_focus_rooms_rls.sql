-- Fokus-Partner: jede Person sieht und ändert nur ihre eigenen Zeilen. Den gemeinsamen Blick
-- (Raum mit allen Mitgliedern) liest die API im Admin-Kontext (app.admin = '1', nur serverseitig),
-- nachdem sie die Mitgliedschaft geprüft hat. Der Admin-Kontext darf außerdem aufräumen.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['focus_room', 'focus_room_member']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO fokus_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY own_rows ON %I USING (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid) WITH CHECK (user_id = nullif(current_setting(''app.user_id'', true), '''')::uuid)',
      t
    );
    EXECUTE format(
      'CREATE POLICY admin_all ON %I USING (current_setting(''app.admin'', true) = ''1'') WITH CHECK (current_setting(''app.admin'', true) = ''1'')',
      t
    );
  END LOOP;
END
$$;
