-- Erinnerungen und Tagesrückblick laufen als Job über alle Nutzer im Admin-Kontext (app.admin = '1',
-- nur serverseitig gesetzt). Gelesen werden nur Zeiten und Längen für Mitteilungen.
CREATE POLICY admin_read ON time_block FOR SELECT
  USING (current_setting('app.admin', true) = '1');
--> statement-breakpoint
CREATE POLICY admin_read ON focus_session FOR SELECT
  USING (current_setting('app.admin', true) = '1');
--> statement-breakpoint
CREATE POLICY admin_read ON credit_entry FOR SELECT
  USING (current_setting('app.admin', true) = '1');
