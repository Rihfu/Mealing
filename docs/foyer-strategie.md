# Section Foyer — stratégie (2026-07-09)

Document de **stratégie** (le « pourquoi » et le « vers quoi ») de la section Foyer. Il précède
le plan d'implémentation détaillé. Complète — sans le remplacer — `docs/foyer-section-design.md`
(conception V1 déjà livrée). Specs source : `specifications-projet.md` § 3.6.

Objectif de la session : passer le Foyer de **« livré »** à **« pleinement opérationnel et
user-friendly »**.

---

## 1. Raison d'être — ce que le Foyer EST stratégiquement

Le Foyer n'est pas une page de réglages parmi d'autres : c'est la **colonne vertébrale** de
Mealing. Tout est scopé foyer — stock, courses, planning, recettes, seuils, notifications. Sans
foyer, aucune section ne fonctionne (le shell `(app)` redirige vers l'onboarding).

Trois lectures stratégiques :

1. **C'est le point d'entrée social du produit.** Mealing n'est pas une app de nutrition
   individuelle de plus : c'est **« le copilote de la maisonnée »**. Le foyer est ce qui rend
   l'app collaborative — et donc ce qui la différencie et fait sa **valeur virale** (un membre
   en invite un autre → acquisition organique, rétention par le réseau familial).
2. **C'est le socle du cap commercial.** Le multi-utilisateur propre (rôles, confidentialité,
   cycle de vie) est précisément ce qui sépare un projet perso d'un produit à scaler. Facturer
   « par foyer » suppose un foyer robuste. Chaque brique posée ici (départ propre, RLS de
   partage, gouvernance admin) est un pré-requis du scaling — pas un extra.
3. **C'est un poste de pilotage, pas un annuaire.** La section répond à quatre questions :
   **qui compose la maison**, **qui voit quoi**, **comment la maison tourne**, **comment on
   entre et on sort**. La V1 répond correctement aux quatre. La V2 vise à les rendre **fluides,
   personnelles et vivantes**.

---

## 2. Constat V1 — ce qui marche, ce qui friction

**Livré et solide** (cf. `foyer-section-design.md`) : membres + avatars, rôles admin +
transfert, quitter/retirer avec sort des recettes, invitations 7 j, réglages foyer (cadence
courses, portions par défaut, seuil péremption), nutrition partagée côté lecteur, outils agent.
Backend propre (fonctions `core/household.ts`, RLS 0036/0037, SECURITY DEFINER pour les
opérations sensibles).

**Points de friction identifiés** (ce que « user-friendly » doit corriger) :

| # | Friction | Impact |
|---|---|---|
| F1 | **Invitation = lien à copier-coller à la main** ; « l'envoi d'email n'est pas encore configuré ». | La boucle d'acquisition virale est cassée à l'étape la plus critique. |
| F2 | **Section très admin-centrée.** Un membre non-admin voit surtout « géré par l'admin ». Le POV du membre simple est pauvre. | Les membres non-admins ne s'approprient pas la maison. |
| F3 | **Aucun espace de communication.** Coordonner « qui fait les courses », « pense au pain » se fait hors de l'app. | L'app organise les repas mais pas les gens ; on sort de l'app pour se parler. |
| F4 | **Confidentialité expliquée mais peu incarnée.** L'encart « qui voit quoi » est statique ; le partage nutrition est bilatéral mais peu lisible. | Confiance sous-exploitée — c'est pourtant un atout. |
| F5 | **Onboarding du nouvel arrivant sec.** On rejoint un foyer sans « accueil » (qui est là, que puis-je faire). | Premier contact tiède pour le membre invité. |

---

## 3. Principes directeurs de la section (dérivés des non-négociables projet)

1. **Confidentialité par défaut, partage explicite et réversible.** La nutrition, les objectifs,
   les conversations restent privés tant que le membre ne partage pas — et il peut retirer un
   partage à tout instant. Aucune donnée sensible (poids, taille) n'est jamais exposée, même à
   l'admin. *(Prolonge le garde-fou « chiffrement écarté MAIS vie privée respectée ».)*
2. **L'admin gouverne la structure, pas les gens.** L'admin gère le contenant (nom, invitations,
   réglages, appartenance) ; il ne lit ni ne modifie les données personnelles des membres.
3. **Personne n'est prisonnier.** Entrer et sortir d'un foyer est toujours possible, propre et
   sans perte silencieuse (choix explicite du sort des recettes, jamais de suppression cachée).
4. **Le foyer ne dépend d'aucun appareil personnel.** Communication et invitations passent par
   le cloud (Supabase / email transactionnel), jamais par un canal local fragile.
5. **Toute nouvelle donnée est extensible** (table de référence + valeurs, cf. principe n°8) :
   messages, préférences par membre, réactions… conçues pour s'enrichir.
6. **L'agent IA peut lire et proposer, mais jamais toucher à l'appartenance.** Retrait, transfert,
   départ restent des gestes humains explicites.

---

## 4. Axes stratégiques V2 — les 4 chantiers

Chaque axe répond à une friction. Ils sont **indépendamment livrables** (une brique = un lot
vérifiable, testé en local, commité sur `dev`).

### Axe A — Réparer la boucle d'entrée : invitations réelles
*Répond à F1 + F5. Priorité la plus haute : c'est la valeur virale.*

- **Envoi réel de l'email d'invitation.** Le SMTP Brevo est opérationnel pour l'auth Supabase,
  mais les invitations foyer sont un **flux applicatif custom** → il faut une brique serveur
  d'envoi (API Brevo transactionnelle recommandée, ou SMTP direct depuis une server action /
  route). Email = lien `+ …/invitations/accept?token=…`, template FR (base : §4 de
  `docs/email-templates-supabase.md`), expiration 7 j déjà en place.
- **Repli gracieux conservé** : si l'envoi échoue ou n'est pas configuré, le lien reste
  copiable (comportement V1) — on ne régresse jamais.
- **Accueil du nouvel arrivant** : après acceptation, une page/encart « Bienvenue dans *X* »
  (qui est là, ce qui est partagé, où régler sa nutrition). Transforme le premier contact.
- Abstraction : isoler le fournisseur d'email derrière une petite couche (comme `AIProvider`)
  → changer Brevo → autre = un module (principe n°5, pré-requis scaling).

### Axe B — Donner un POV à chaque membre
*Répond à F2. Rendre le foyer utile même quand on n'est pas admin.*

- **Préférences personnelles par membre**, distinctes des réglages foyer : ce que *moi* je veux
  voir/recevoir. Candidats : quelles **notifications** je reçois (péremption, courses, rappels),
  mon **prénom/avatar**, mes **partages nutrition** regroupés et lisibles, éventuellement mes
  créneaux de repas individuels par défaut.
- **Séparation nette** dans l'UI : « Réglages du foyer » (communs, admin) vs « Mes préférences »
  (perso, chacun). La V1 mélange les deux dans un même aside.
- **Réglages foyer déjà présents restent** (cadence, portions, seuil) mais côté foyer ; le seuil
  de péremption pourrait devenir perso (chacun son alerte) — *arbitrage à trancher §6*.

### Axe C — Faire vivre le foyer : communication
*Répond à F3. Nouvelle fonctionnalité — à valider/chiffrer avant de coder (règle de travail).*

- **Chat de foyer** : un fil de discussion simple par foyer (messages texte, temps réel via
  Supabase Realtime). Schéma extensible `household_message` (auteur, corps, créé_le, +champs
  réservés réactions/pièces jointes), RLS foyer stricte.
- **Portée V1 volontairement mince** : fil unique, texte, pas de threads, pas de fichiers.
  On peut enrichir ensuite (réactions, mention d'un repas/produit → deep-link vers la section).
- **Valeur** : la coordination du quotidien (« je fais les courses ce soir », « il reste du
  gratin ») se fait *dans* l'app, à côté de la donnée concernée → rétention et usage quotidien.
- **Décision requise** : est-ce V2 maintenant, ou après A/B ? (chantier le plus lourd). *(§6)*

### Axe D — Incarner la confiance : transparence du partage
*Répond à F4. Petit effort, fort signal produit.*

- **Tableau « qui voit quoi » dynamique** : pour chaque membre, ce que je partage avec lui et ce
  qu'il partage avec moi, d'un coup d'œil (au lieu de l'encart statique + boutons épars).
- **Partage nutrition plus lisible** : état bilatéral clair, réciprocité suggérée mais jamais
  imposée, retrait en un geste.
- Renforce le principe n°1 et en fait un **argument de vente** (« vos données restent à vous »).

---

## 5. Séquencement proposé

| Ordre | Axe | Pourquoi ce rang | Poids |
|---|---|---|---|
| 1 | **A — Invitations réelles + accueil** | Débloque la valeur virale ; brique email réutilisable ailleurs (reset, digest). | Moyen |
| 2 | **B — POV membre + séparation réglages** | Rend la section user-friendly pour tous, pas que l'admin ; peu de BDD. | Moyen |
| 3 | **D — Transparence du partage** | Petit, à fort signal ; capitalise sur B. | Léger |
| 4 | **C — Chat de foyer** | Plus gros (Realtime, nouveau schéma) ; à valider d'abord. | Lourd |

Principe : livrer A puis B (l'app devient « pleinement opérationnelle » dès A+B), puis décider
de C/D selon le retour. On ne lance C qu'après arbitrage explicite (nouvelle feature).

---

## 6. Arbitrages — TRANCHÉS (2026-07-09)

1. **Envoi d'email** : **API transactionnelle Brevo** (propre, tracking, indépendante du SMTP
   auth). Isolée derrière une couche `EmailProvider` (principe n°5).
2. **Chat de foyer** : **inclus dans cette vague** (Axe C). Portée V1 mince (fil unique, texte,
   Realtime) — enrichissements différés.
3. **Seuil de péremption / notifications** : passent **perso** (chacun règle ses alertes). Cœur
   de l'Axe B. Le seuil foyer actuel devient la valeur par défaut d'un nouveau membre.
4. **Périmètre « POV membre » V1** : **notifications perso + identité (prénom/avatar) + partages
   regroupés**. Les préférences de planning/repas individuels sont différées (pas V1).

---

## 7. Ce qu'on ne fait PAS (garde-fous de périmètre)

- **Multi-foyer** (un compte dans plusieurs foyers) : hors scope, comme en V1.
- **Membres sans compte** (profils gérés enfants) : écarté — les enfants = portions. *(V1)*
- **Suppression de compte RGPD** : hors chantier (mais `leaveHousehold` en est la brique).
- **Modération / rôles fins** au-delà d'admin+membre : pas nécessaire pour un foyer familial.
- **Chat riche** (threads, appels, fichiers lourds) : hors V1 du chat si on le fait.

---

## 9. Plan d'implémentation détaillé (périmètre A+B+C+D)

> **✅ STATUT (2026-07-09) : TOUS LES LOTS IMPLÉMENTÉS** sur `dev` (commits `af03636` lot 0,
> `89a30d0` lot A, `8d0a12e` lot B, `f6f6ecc` lot D, `83cb67c` lot C, `9422563` lot F).
> Migration **0038 appliquée en base**, types régénérés, tsc/eslint/build verts.
> **Vérifié 16/16 sous RLS réel** (bac à sable ZZZ headless, nettoyé) : chat envoi/lecture/
> non-lus/markRead, édition & suppression douce réservées à l'auteur, isolation inter-foyers,
> prefs perso self-only, **Realtime de bout en bout** (message reçu en direct).
> **Reste (intervention utilisateur)** : (1) générer la clé **API Brevo** transactionnelle et la
> poser en `BREVO_API_KEY` (local + Vercel) — sans elle, repli lien-copiable ; (2) test d'envoi
> réel d'un email d'invitation ; (3) passe visuelle en navigateur connecté (rendu UI).

Convention : dev sur **`dev`**, tests **en local** (`npm run dev`), commit par lot, tsc/eslint/build
verts avant chaque commit, staging git précis (jamais `git add -A`). BDD partagée dev/prod →
migrations **purement additives**. **Prochaine migration = `0038`** (dernière en base = 0037).

### Lot 0 — Fondations (BDD + brique email)

- **Migration `0038_foyer_v2`** (additive, RLS foyer/profil) :
  - `household_message` — chat foyer : `id`, `household_id` (FK cascade), `author_profile_id`
    (FK), `body text`, `created_at`, `edited_at` null, `deleted_at` null (soft-delete). RLS :
    SELECT/INSERT = membre du foyer (`is_household_member`) ; UPDATE/DELETE = **auteur only**.
    Champs réservés extensibles (principe n°8) pour réactions / pièces jointes plus tard.
  - `household_message_read` — marqueur de lecture pour le badge « non lus » : `household_id`,
    `profile_id`, `last_read_at`. PK (household_id, profile_id). RLS = self.
  - `profile_notification_pref` — préférences **par membre** : `profile_id` PK (FK), 
    `expiry_threshold_days` (défaut hérité du foyer sinon 3), `notify_expiry bool`,
    `notify_courses bool`, `notify_reminders bool`, timestamps. RLS **stricte = self**. Le
    `notification_pref` foyer reste (valeur par défaut d'un nouveau membre + planning du digest).
  - Régénérer `database.types.ts` après application.
- **Couche `EmailProvider`** (`src/lib/providers/email/`) — abstraction (principe n°5) :
  `types.ts` (`sendTransactional({to, subject, html, text})` → `{sent: boolean, reason?}`),
  `brevo.ts` (POST `https://api.brevo.com/v3/smtp/email`, clé serveur), `index.ts` (sélection).
  Env `env.server.ts` : `BREVO_API_KEY` **optionnelle**, `EMAIL_FROM`/`EMAIL_FROM_NAME`
  (`no-reply@mealings.app`). **Sans clé → no-op `{sent:false, reason:'not-configured'}`** →
  repli lien-copiable conservé (zéro régression, cf. VAPID).

### Lot A — Invitations réelles par email + accueil du nouvel arrivant

- `inviteToHousehold` (core) : après insertion, **envoie l'email** (best-effort) via
  `EmailProvider` — sujet + corps HTML FR (base §4 `docs/email-templates-supabase.md`), lien
  `…/invitations/accept?token=…`, mention expiration 7 j. Retourne `{ sent }`.
- `inviteMemberAction` remonte `sent` → l'UI affiche « Invitation envoyée à X ✓ » (email parti)
  **ou** « Invitation créée — transmets le lien » (repli). Le lien reste toujours affiché/copiable.
- **Bouton « Copier le lien »** sur chaque invitation en attente (aujourd'hui : URL brute à
  sélectionner à la main).
- **Accueil** : à l'arrivée après acceptation, bandeau « Bienvenue dans *Foyer X* » sur `/foyer`
  (`?welcome=1`) — qui est là, ce qui est partagé, lien « configure ta nutrition ».

### Lot B — POV de chaque membre (préférences perso)

- **Scinder l'aside** en deux blocs distincts : **« Réglages du foyer »** (communs, admin :
  cadence courses, portions par défaut) vs **« Mes préférences »** (perso, chacun).
- **Notifications perso** (`profile_notification_pref`) : mon seuil de péremption + interrupteurs
  (péremption / courses / rappels). `core/notification.ts` : `getProfileNotificationPref` /
  `setProfileNotificationPref` ; **`getExpiryDigest` accepte un seuil par profil** (la cloche
  d'en-tête `(app)/expiry-bell.tsx` est déjà par-utilisateur → lit le seuil perso, repli foyer).
- **Identité** : prénom déjà éditable ; garder l'avatar dérivé de l'id (V1 — pas de sélecteur).
- Le seuil foyer (dans la cloche + réglages foyer) devient la **valeur par défaut** d'un membre
  sans préférence propre.

### Lot D — Transparence « qui voit quoi »

- Remplacer l'encart statique par un **tableau par membre** : pour chacun, *je lui montre ma
  nutrition* (toggle) et *il me montre la sienne* (badge + « voir »). Réciprocité visible, jamais
  imposée. Réutilise `sharesGiven`/`sharesReceived` déjà dans `HouseholdOverview`.

### Lot C — Chat de foyer (nouvelle feature, portée V1 mince)

- **Core `src/lib/core/household-chat.ts`** : `listMessages` (pagination), `sendMessage`,
  `editMessage`/`deleteMessage` (auteur, soft-delete), `markRead`/`getUnreadCount`.
- **Temps réel** : abonnement Supabase Realtime (`postgres_changes` sur `household_message`
  filtré `household_id`) côté client → nouveaux messages en direct, sans polling.
- **UI** : section/onglet « Discussion » dans `/foyer` (fil, composer, édition/suppression de ses
  messages, avatars/prénoms réutilisés). **Badge « non lus »** dans la nav (dérivé de
  `household_message_read`).
- **Garde-fous** : RLS foyer stricte ; chat **humain uniquement** (l'agent ne poste pas en V1) ;
  texte seul (pas de fichiers). Enrichissements (réactions, deep-link repas/produit) = plus tard.

### Lot F — Agent IA (mise à jour légère)

- `get_household` : ajouter (lecture) le **nombre de messages non lus** au résumé foyer.
- **Aucune écriture nouvelle** : l'agent ne poste pas, ne retire pas, ne transfère pas (n°1 + n°6).

### Vérification (chaque lot)

- `npx tsc --noEmit` + `npm run lint` + `npm run build` verts.
- Runtime local (`npm run dev`, compte SAWADA) : Lot A = invitation → email reçu (ou repli) →
  acceptation → accueil ; Lot B = seuil perso reflété dans la cloche ; Lot C = 2 sessions →
  message en temps réel + badge non-lus ; Lot D = matrice cohérente avec les toggles.
- **Envoi email réel** : testable dès que `BREVO_API_KEY` est en env local ; sinon repli vérifié.

### Restes / dépendances

- `BREVO_API_KEY` transactionnelle à générer côté Brevo + poser en env (local puis Vercel au
  déploiement). Distincte du SMTP auth (même compte Brevo).
- Déploiement `dev → main` = **uniquement sur demande explicite** (après relecture).

---

## 8. Indicateurs de succès (ce que « pleinement opérationnel » veut dire)

- Un membre peut **inviter par email** et l'invité **reçoit et accepte** sans copier-coller.
- Un membre **non-admin** trouve la section utile (ses préférences, ce qu'il voit/partage).
- La **confidentialité** est lisible et contrôlable en un écran.
- *(Si Axe C)* Les membres se **coordonnent dans l'app** plutôt qu'à côté.
- Zéro régression : le repli lien-copiable, le cycle de vie et la RLS restent intacts.
