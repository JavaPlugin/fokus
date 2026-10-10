#!/bin/sh
# Läuft einmal beim ersten Start von Postgres.
# Die App verbindet sich als eigene Rolle ohne Superuser und ohne BYPASSRLS,
# damit Row Level Security (ab Phase 1) wirklich greift.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE fokus_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${APP_DB_PASSWORD}';
CREATE DATABASE fokus OWNER fokus_app;
SQL
