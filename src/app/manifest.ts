import type { MetadataRoute } from 'next';

/**
 * Manifest PWA (servi sur /manifest.webmanifest ; Next ajoute le <link> automatiquement).
 * Rend l'app installable (écran d'accueil) et lance Courses en mode « application ».
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mealing',
    short_name: 'Mealing',
    description: 'Planifie tes repas, ta nutrition, ton stock et tes courses — sans charge mentale.',
    lang: 'fr',
    start_url: '/courses',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fbf7ef',
    theme_color: '#fbf7ef',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
