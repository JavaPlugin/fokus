// Öffentliche Angaben der Instanz (ohne Anmeldung lesbar): Registrierung und Impressum.
import { useEffect, useState } from 'react';
import { api, type SetupStatus } from './api';

export function usePublic(): SetupStatus | null {
  const [s, setS] = useState<SetupStatus | null>(null);
  useEffect(() => {
    api<SetupStatus>('/api/setup/status')
      .then(setS)
      .catch(() => undefined);
  }, []);
  return s;
}
