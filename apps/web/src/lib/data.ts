import { API_BASE } from './api';

/** Export als Datei herunterladen (gleiche Anmeldung, das Cookie geht mit). */
export function downloadExport() {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = `${API_BASE}/api/me/export`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
