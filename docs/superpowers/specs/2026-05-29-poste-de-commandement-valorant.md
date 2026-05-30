# Spec — Poste de commandement orga (Valorant)

Date : 2026-05-29 · Auteur : Émile + Claude

## But

Battre le flow orga de Challonge/Toornament sur **un seul point précis** : *voir l'état du
tournoi d'un coup d'œil*, sans naviguer entre onglets ni scroller entre cartes. La console
Valorant devient un **dashboard à deux étages** : tuiles glançables en haut, actions juste
en dessous, là où on regarde.

Cible : **Valorant uniquement** (jeu de cet orga). Geo/TrackMania gardent leur vue actuelle.

## Contrainte non négociable

Événement **live** ce week-end. Le moteur (`lib/formats/*`) n'est **pas** touché — on dérive
des données existantes et on réorganise la présentation. App jamais cassée entre deux commits ;
commits petits = revert instantané.

## Disposition

```
┌─ EN-TÊTE : nom · phase · ronde ──────────────────────────────┐
├─ ÉTAGE 1 — TUILES (grille 4 col. desktop, 2 col. mobile) ────┤
│  [Ronde]   [Matchs joués/total]   [Qualification]   [Meneur] │
├─ ÉTAGE 2 — ZONE D'ACTION ────────────────────────────────────┤
│  Matchs de la ronde (saisie score inline) │ Classement compact│
│  + CTA primaire (générer ronde suivante / démarrer playoff)   │
├─ SOUS LE PLI (consulté moins souvent) ───────────────────────┤
│  Horaire estimé · Panneau Discord · Zone dangereuse           │
└──────────────────────────────────────────────────────────────┘
```

Projecteur (vue public) : inchangé. Le dashboard est la vue *orga*.

## Tuiles

**Phase suisse :**
1. **Ronde** — n° de ronde courante · sous-titre « Phase suisse ».
2. **Matchs de la ronde** — `joués / total` + barre de progression ; accent si des matchs restent.
3. **Qualification** — `qualifiés / playoffSize` (places playoff) ; sous-titre `actifs · éliminés`.
4. **Meneur** — équipe en tête du classement + bilan `V-D`.

**Playoff (double élim) :**
1. **Phase** — « Playoff · double élim ».
2. **Matchs jouables** — nombre de matchs prêts maintenant.
3. **Progression** — `joués / total` du bracket + barre.
4. **Champion** — nom quand décidé, sinon « en cours ».

## Architecture (respecte « zéro logique dans l'UI »)

- **Nouveau** `app/_lib/dashboard.ts` — fonctions **pures** dérivant les « vitals » depuis
  `ValorantState` (swiss + playoff). Retourne une structure normalisée de tuiles. **Testé unitairement.**
- **Réécrit** `app/_components/ValorantView.tsx` — consomme `dashboard.ts`, compose
  `StatusTiles` + zone d'action + classement. Aucun calcul dans le composant.
- Réutilise la saisie de score inline et les server actions existantes (`submitSwissResult`,
  `generateSwissRound`, `startPlayoff`, `submitPlayoffResult`). Inchangées.
- Geo/TrackMania, projecteur, moteur : non touchés.

## Visuel / UX

- Système existant : shadcn (new-york), dark-only, accent par jeu via `data-game="valorant"`.
- Tuiles = `Card` avec icône (lucide), grand nombre `tabular-nums`, libellé sourd, accent.
- Barre de progression : composant léger maison (div + largeur %), pas de dépendance nouvelle.
- Couleurs de statut déjà établies : emerald (qualifié), red (éliminé), amber (champion).
- Responsive : grille 4→2 colonnes ; la zone d'action passe en pleine largeur sous le classement.

## Hors périmètre (YAGNI)

- Pas de temps réel / polling (approche C écartée pour le live).
- Pas de 2ᵉ écran orga dédié.
- Pas de refonte Geo/TrackMania.

## Vérification

- `dashboard.ts` : tests unitaires (rondes, comptes qualif/actif/élim, meneur, phase playoff).
- `tsc` propre · suite de tests verte · `next build` OK · route console 200.
