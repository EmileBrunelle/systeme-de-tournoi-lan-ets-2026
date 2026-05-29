# Système de tournoi — LAN ÉTS 2026

**Date** : 2026-05-29
**Statut** : Design validé (en attente de revue finale)

## Objectif

Application web légère, utilisée par les **organisateurs seulement**, pour gérer
trois tournois lors du LAN ÉTS 2026 : **Valorant**, **GeoGuessr**, **TrackMania**.
Les scores sont saisis manuellement par l'orga. L'app sert aussi à afficher les
brackets/classements sur un projecteur.

But : « vibe code » un projet basique mais réellement utile le jour de l'événement.
Pas de sur-ingénierie.

## Stack technique

- **Next.js** (App Router) + **TypeScript**
- **Prisma** + **SQLite** (fichier local — idéal pour un LAN, zéro infra)
- Lancement local : `npm run dev`
- **Tout à la racine** du dépôt (pas de sous-dossier projet)

## Déploiement / organisateurs

- **3 organisateurs, un par jeu** : un orga gère Valorant, un GeoGuessr, un
  TrackMania. Chacun a **sa propre copie** du système et **sa propre base SQLite
  locale**. Comme chaque copie gère un seul tournoi, **aucune synchro entre orgas
  n'est requise** — pas de conflit d'état.

## Confidentialité des données (important)

- **Aucune donnée sensible sur git** : ni la liste des joueurs, ni la base de
  données, ni les courriels. `.gitignore` exclut les tableurs, `*.csv`, `*.db`,
  `*.sqlite*`, les fichiers de lock et `.env`.
- Le code va sur git ; les **données restent locales** sur la machine de l'orga.
- L'orga Valorant place sa liste de joueurs (tableur) à la racine localement
  (non versionnée) pour l'import.

## Formats par jeu

| Jeu | Phase 1 | Phase 2 | Participants |
|---|---|---|---|
| **Valorant** | Suisse « jusqu'à 3 V / 3 D » | Playoff **double élimination** (top 8) | Équipes (5 + subs) |
| **GeoGuessr** | — | Élimination simple **+ petite finale (3e place)** | Joueurs solo |
| **TrackMania** | **Time Attack** (classement par temps) | **Cup** : rondes à points + course finale (seedée par le Time Attack) | Joueurs solo |

- **Seeding** : aléatoire (sauf cup TrackMania, seedée par le classement Time Attack).
- **Valorant Best-of** (configurable par phase) : défaut **Bo1** en suisse, **Bo3**
  en playoff, **Bo5** en grande finale.

## Contraintes d'horaire (Valorant)

- Samedi à partir de **9h30/10h** pour les parties ; **grande finale dimanche matin**.
- Doit laisser dormir joueurs et orga (pas de matchs tard le samedi soir).
- Prévoir des **pauses repas** : dîner (~midi) et souper (~18h). L'estimation
  d'horaire de l'app réserve ces créneaux (durées configurables).
- **18 équipes attendues à date.** Suisse (à 3 V/D) ≈ 37-40 matchs, playoff
  top 8 ≈ 14 matchs (~50-54 total). 18 étant pair, la ronde 1 = 9 matchs sans bye ;
  les byes n'apparaissent qu'éventuellement dans les sous-groupes ultérieurs.
- **BYOC confirmé** : chaque joueur amène son ordi (~90 postes à 18 équipes), donc
  **9 matchs Valorant simultanés** → une ronde suisse complète = un seul créneau.
- L'app **affiche un horaire/nombre de matchs estimé** selon le nombre de postes.

## Architecture (Approche A — moteur + interface `Format`)

### Domaine commun (`lib/domain/`)
- `Tournament` — un par jeu, référence un `Format`.
- `Participant` — équipe (avec membres) **ou** joueur solo.
  - Pour une équipe : **statut de présence** (`confirmé` / `non confirmé` /
    `désisté`) et **rank moyen** (calculé à partir des ranks des membres).
- `Match` — deux participants (ou bye), score, statut, ronde.
- `Round` — ensemble de matchs d'une étape.
- `Standing` — classement calculé (W/L, points, Buchholz, etc.).

Seules les équipes **confirmées** entrent dans la génération des rondes/brackets.
L'orga peut basculer le statut de présence depuis la page tournoi.

### Interface `Format` (`lib/formats/`)
```ts
interface Format {
  generateNextRound(state): Round | null   // null = tournoi terminé
  recordResult(match, score): void
  standings(state): Standing[]
  isComplete(state): boolean
}
```
L'app web ne connaît QUE cette interface, jamais les détails internes.

### 5 modules de format (isolés, testés en TDD)
1. `single-elimination` — bracket KO + match 3e place → **GeoGuessr**
2. `swiss` — appariement jusqu'à 3 V / 3 D, **anti-revanche**, **tiebreaker Buchholz**,
   **byes génériques** (marche à 15, 16, 20… équipes) → **Valorant phase 1**
3. `double-elimination` — winner + loser bracket, **byes génériques**, cible de
   qualifiés configurable (défaut top 8) → **Valorant playoff**
4. `time-attack` — classement par meilleur temps → **TrackMania phase 1**
5. `cup` — rondes à points (position → points) + course finale, seedée par le
   time-attack → **TrackMania phase 2**

### Générateur de messages Discord (`lib/discord/`)
La communication avec les joueurs se fait sur **Discord**. Le module produit des
messages **copier/coller** en markdown Discord (fonctions pures, testables) :
1. **Appariements d'une ronde** — qui joue contre qui (+ sièges/postes si utile).
2. **Classement / standings** — classement courant formaté (suisse, points TM…).
3. **Résultats de matchs** — scores d'une ronde, qui passe / qui est éliminé.
4. **Horaire / annonces** — prochaine ronde, pauses repas, finale dimanche matin.

Contraintes : respect de la **limite Discord de 2000 caractères** (découpage auto
en plusieurs messages), gras/blocs de code pour la lisibilité. L'UI affiche chaque
message avec un **bouton « copier »**.

### Gestion des byes (point d'attention clé)
15 équipes ≠ puissance de 2. `swiss` et `double-elimination` gèrent les byes de
façon générique : un participant sans adversaire avance automatiquement. Le nombre
de qualifiés au playoff est **configurable** (défaut 8) pour rester propre quel que
soit le nombre d'équipes.

## Données / import

- Source Valorant : une **liste de joueurs (tableur)** placée localement à la
  racine par l'orga (colonnes : `Team, Username, Email, Identifier, Rank, Seat`).
  **Non versionnée** (gitignore) — données sensibles.
- État actuel : la liste = **15 équipes, 79 joueurs** (certaines équipes ont des
  subs, donc rosters de 5 à 8). **18 équipes attendues à date** — les 3 dernières
  seront ajoutées (liste mise à jour ou ajout manuel via l'app).
- `npm run import` : lit la liste locale (UTF-8), crée le tournoi Valorant + les
  équipes + leurs membres (username, courriel, identifier, rank, siège). Calcule
  le **rank moyen** par équipe à l'import. Présence par défaut : `non confirmé`.
- Niveau des équipes : large éventail observé, des tiers **Gold** jusqu'à
  **Immortal/Radiant**. Détail par équipe **non versionné** (calculé localement
  depuis la liste). Ce gros écart de niveau est un argument de plus pour le suisse,
  qui regroupe vite les équipes de force comparable.
- GeoGuessr / TrackMania : joueurs solo **ajoutés manuellement via l'app**.

## UI orga (pages simples)

1. **Accueil** — liste des 3 tournois + statut.
2. **Page tournoi** — état courant, bouton « générer la prochaine ronde »,
   saisie de scores, classement, estimation d'horaire. Liste des équipes avec
   **rank moyen** et bascule du **statut de présence** (confirmé / non / désisté).
3. **Saisie de score** — formulaire par match.
4. **Vue projecteur** — bracket / classement plein écran.
5. **Messages Discord** — panneau (sur la page tournoi) avec appariements,
   classement, résultats et horaire, chacun avec un bouton « copier ».

## Hors scope (YAGNI)

- Comptes joueurs, authentification, permissions.
- Intégration API des jeux (GeoGuessr / Valorant / TrackMania).
- Multi-événements, déploiement cloud, app mobile.

## Plan de tests (TDD)

Chaque module de format est développé en TDD avec des cas couvrant :
- nombres de participants pairs / impairs (byes),
- progression complète d'un tournoi (du round 1 à la fin),
- tiebreakers (Buchholz pour le suisse, position → points pour le cup),
- terminaison (`isComplete`) et classement final.
