import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les Server Actions plafonnent le corps de requête à 1 Mo par défaut → une dictée
  // vocale (audio) le dépasse et est REJETÉE avant traitement. On relève la limite pour
  // accepter des segments audio (la dictée longue est découpée côté client en segments,
  // chacun bien sous cette borne ; marge confortable ici).
  experimental: {
    serverActions: { bodySizeLimit: '15mb' },
  },
  async headers() {
    return [
      {
        // Le service worker doit être revalidé à chaque chargement (sinon les MAJ du
        // SW ne se propagent pas), et autorisé à contrôler tout le scope racine.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
