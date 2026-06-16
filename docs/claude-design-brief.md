# Prompt à envoyer à Claude Design (conception du design system Mealing)

> À coller dans claude.ai/design, avec `design-direction.md` fourni en source.

---

Tu vas concevoir le **design system de Mealing**, une application web (PWA Next.js + Tailwind v4) de planification de repas, suivi nutritionnel, stock et courses, partagée au sein d'un foyer.

**Source de vérité** : le fichier `design-direction.md` que je t'ai fourni. Respecte-le strictement — palette, rôles sémantiques, typographie, rayons/ombres, et l'inventaire des écrans et composants y figurent. En cas de doute, suis ce document.

## Direction visuelle (rappel)
Ambiance **pastel, chaleureuse, dessin à la main**, fond papier crème. Base **fanée** (sauge, jaune beurre, terracotta) pour le calme ; **accents vifs et rares** (vert `#45A35E`, jaune `#F4C430`, orange `#EF8A3C`, rouge `#DD5240`) **uniquement** pour les éléments d'intérêt (action principale, à‑consommer, écarts, suppression). Typo : Fraunces (titres), Nunito (corps), Caveat (touche manuscrite, parcimonieuse). Trait dessiné main, illustrations doodle cuisine, coins arrondis, ombres basses et chaudes. Accessibilité AA (texte sur fond coloré = variantes foncées `-strong`).

## Ce que je te demande de produire
1. **Fondations** : couleurs (avec les rôles du document), typographie, échelle d'espacement, rayons, ombres, et un style d'iconographie (contour monoligne, légèrement irrégulier).
2. **Un logo Mealing** (je n'en ai pas encore) — propose **2 à 3 directions**, cohérentes avec l'identité :
   - un **wordmark** « Mealing » en Fraunces, avec une petite touche dessinée main ;
   - un **symbole/doodle** évoquant cuisine + fraîcheur (ex. bol avec une pousse/feuille, fourchette‑feuille, marmite) en trait manuel, sauge + accent vert vif ;
   - prévois une **version monochrome** et une **version compacte** (favicon/icône d'app PWA).
3. **Bibliothèque de composants** (voir l'inventaire du document) : boutons (primaire vert, secondaire contour sauge, destructif rouge, lien), champs (texte/nombre/textarea/select + erreur), cartes & sections, badges & puces (créneau, tag, **badge de péremption** frais/à‑consommer/périmé, statut conforme/sauté/différent), lignes de liste (stock, courses avec case, recette, membre), barre de navigation (desktop + mobile), tableau nutrition (planifié/réel/objectif), bulles de chat + **carte de confirmation de l'agent IA**, et **états vides** illustrés.
4. **Maquettes haute‑fidélité** des écrans clés à partir de ces composants (on les fera écran par écran ensuite) : commence par Planning, Stock + anti‑gaspi, et Assistant.

## Contraintes
- Composants pensés **web/HTML**, mappables aux tokens Tailwind v4 du document (mêmes noms de variables).
- Discipline des accents : si tout est vif, plus rien ne ressort.
- Mobile‑first (PWA), puis desktop.

Quand c'est prêt, **définis ce design system comme « Default »** pour qu'il s'applique à tous les écrans, et propose‑moi d'abord les fondations + les pistes de logo avant d'aller plus loin.
