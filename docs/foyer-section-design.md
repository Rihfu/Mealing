# Section Foyer — conception validée (2026-07-08)

Document de référence du chantier Foyer. Concept proposé par l'assistant, arbitrages tranchés
par l'utilisateur le 2026-07-08 (§ 3). Specs source : `specifications-projet.md` § 3.6.

---

## 1. Constat de départ

Le foyer est la colonne vertébrale silencieuse de l'app (stock, courses, planning, recettes,
seuils, notifications — tout est scopé foyer), mais la section `/foyer` est la plus pauvre :
liste de membres + toggle « partager ma nutrition » + invitation par lien à copier-coller.

Manques relevés dans le code (audit 2026-07-08) :

- **`nutrition_share` fantôme côté lecteur** : on peut partager sa nutrition, aucune UI ne
  permet de la voir. La RLS était pourtant PRÊTE côté `profile_goal` + `real_consumption`
  (helper `can_view_profile_nutrition()`) — il manque les policies sur `nutrition_profile`,
  `profile_nutrient_tracking`, `profile_habit_tracking`.
- **`household.shopping_horizon_days` orphelin** : le sélecteur de cadence a été retiré de
  Courses, le réglage n'est plus accessible nulle part.
- **Aucun cycle de vie** : pas de renommage, pas de départ, pas de retrait, pas de rôles.
- **Invitations rudimentaires** : lien manuel (email réel gated par le SMTP custom), aucune
  expiration automatique (le statut `expired` existe en base mais rien ne l'applique).
- **Un membre = un compte auth** (`profile.id` → FK `auth.users`).

## 2. Concept retenu : le poste de pilotage de la maisonnée

La section répond à 4 questions : **qui compose la maison**, **qui voit quoi** (confidentialité
nutrition dans les deux sens), **comment la maison tourne** (réglages transverses), **comment
on entre et on sort** (inviter / rejoindre / quitter / retirer).

## 3. Arbitrages utilisateur (2026-07-08) — NE PAS REDISCUTER

1. **Membres sans compte : NON.** Un membre = un compte (pas de « profils gérés » enfants).
   Les enfants sont représentés par le **nombre de portions** (réglage foyer `default_servings`).
2. **Rôles : admin simple + transfert.** Le créateur est admin (renommer, retirer un membre,
   gérer les invitations, transférer le rôle, supprimer le foyer). Les membres gèrent librement
   les données du quotidien.
3. **Départ d'un membre : ON DEMANDE.** Écran de départ avec choix « laisser mes recettes au
   foyer » (transfert de `created_by` à l'admin) ou « les emporter » (comportement RLS actuel :
   elles disparaissent du foyer). En cas de **retrait par l'admin**, défaut = les recettes
   restent au foyer (on ne peut pas demander au retiré).
4. **Nutrition partagée côté lecteur : OUI.** Résumé lecture seule de la semaine d'un membre
   qui m'a partagé sa nutrition (jauges des nutriments suivis + habitudes ; vue variété pour
   un profil enfant — jamais de kcal).

## 4. Lots d'implémentation

- **Lot 0 — BDD** : migration `0036_foyer_roles_lifecycle` (colonne `household.admin_profile_id`
  + backfill créateur, `household.default_servings`, `household_invitation.expires_at` défaut
  +7 j, fonction `is_household_admin()`, policy delete household = admin, privilèges de colonne
  (rename/transfert via fonctions SECURITY DEFINER), policy `profile_admin_detach` (l'admin ne
  peut QUE détacher un profil de son foyer), fonctions `leave_household(keep_recipes)` /
  `remove_household_member(member)` avec nettoyage : repas individuels futurs du partant,
  day_off perso futurs, paires `nutrition_share`) ; migration `0037_nutrition_share_read`
  (policies lecteur sur les 3 tables nutrition manquantes, via `can_view_profile_nutrition`).
- **Lot A — Identité & membres** : renommer le foyer (admin), avatar initiale + couleur stable
  par membre, badge Admin, carte membre.
- **Lot B — Cycle de vie** : quitter le foyer (modal avec choix recettes ; l'admin qui part
  transfère d'abord ou supprime si dernier membre), retirer un membre (admin), transférer
  l'admin, invitations avec expiration (lazy-expire au rendu + contrôle à l'acceptation),
  invitations gérées par l'admin.
- **Lot D — Nutrition partagée (lecteur)** : « Voir sa nutrition » sur un membre qui m'a
  partagé la sienne → résumé semaine lecture seule (réutilise `aggregatePeriodNutrition`,
  `getNutritionSettings`, `getProfileHabits`, `countHabitOccurrences`, `computeChildWeek` —
  RLS honorée, aucune nouvelle logique de calcul). Encart « qui voit quoi ».
- **Lot E — Réglages du foyer (hub)** : cadence de courses (réactive l'orphelin
  `shopping_horizon_days`), portions par défaut d'un repas foyer (`default_servings`, utilisé
  comme valeur initiale du stepper du planning), seuil de péremption (déjà réglable dans la
  cloche — exposé aussi ici).
- **Lot F — Agent IA** : lecture `get_household` (membres, admin, invitations en attente,
  réglages) ; écritures confirmées `rename_household`, `invite_member`, `cancel_invitation`,
  `set_household_settings`. **Jamais** de retrait de membre / transfert / départ par l'agent.

## 5. Contraintes & notes

- Un compte = un seul foyer (`profile.household_id`). Changer de foyer = quitter puis accepter
  une invitation. Multi-foyer hors scope V1.
- BDD partagée dev/prod → migrations additives ; le durcissement des policies d'invitation
  (admin) est couplé au déploiement de la nouvelle UI.
- SMTP custom = prérequis pour l'envoi réel des invitations par email (reste connu).
- Suppression de compte (RGPD, cap commercial) : hors chantier, mais `leave_household` en est
  la brique préalable.
- Sécurité : rename/transfert d'admin protégés par privilèges de colonne + fonctions DEFINER
  (un membre ne peut pas s'auto-promouvoir via l'API). Le reste de la posture S3 (tables de
  référence monde-écrivables) reste à re-trancher au cap commercial.
