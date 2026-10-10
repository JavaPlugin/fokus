// Titel und Beschreibung je Route („Seite · FOKUS“), im statischen Export schon im HTML.
import Head from 'expo-router/head';

export const SITE = 'FOKUS';

export function PageHead({
  title,
  description,
  social,
}: {
  /** Ohne „· FOKUS“; leer = nur „FOKUS“. */
  title?: string;
  description?: string;
  /** Open-Graph-Angaben (öffentliche Seiten). */
  social?: boolean;
}) {
  const full = title ? `${title} · ${SITE}` : SITE;
  return (
    <Head>
      <title>{full}</title>
      {description ? <meta name="description" content={description} /> : null}
      {social ? <meta property="og:title" content={full} /> : null}
      {social && description ? <meta property="og:description" content={description} /> : null}
      {social ? <meta property="og:type" content="website" /> : null}
      {social ? <meta property="og:image" content="/og.png" /> : null}
      {social ? <meta property="og:locale" content="de_DE" /> : null}
      {social ? <meta name="twitter:card" content="summary_large_image" /> : null}
    </Head>
  );
}
