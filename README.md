# Système de tournoi — LAN ÉTS 2026

Application web légère, destinée aux **organisateurs**, pour gérer trois tournois
lors du LAN ÉTS 2026 : **Valorant**, **GeoGuessr** et **TrackMania**. Les scores
sont saisis manuellement par l'orga ; l'app sert aussi à afficher les brackets et
classements sur un projecteur, et à générer des messages Discord copier/coller.

> **But** : un outil basique mais réellement utile le jour de l'événement. Pas de
> sur-ingénierie.

## État du projet

Application **fonctionnelle de bout en bout** pour Valorant (suisse → playoff),
avec GeoGuessr et TrackMania également jouables. Inclus : import du roster depuis
un fichier `.xlsx`, gestion complète des équipes/rosters, saisie des scores, vue
projecteur et panneau Discord. La couche logique pure est entièrement testée
(112 tests, `tsc` strict ; `next build` comme garde-fou de l'UI).

## Formats par jeu

| Jeu | Phase 1 | Phase 2 | Participants |
|---|---|---|---|
| **Valorant** | Suisse « jusqu'à 3 V / 3 D » (anti-revanche, Buchholz, byes) | Playoff double élimination (top 8 configurable) | Équipes |
| **GeoGuessr** | — | Élimination simple **+ petite finale (3ᵉ place)** | Joueurs solo |
| **TrackMania** | **Time Attack** (classement par temps) | **Cup** : rondes à points + course finale (seedée par le Time Attack) | Joueurs solo |

## Architecture

Toute la logique vit dans `lib/`, en TypeScript pur, sans dépendance au framework
UI. Les fonctions sont **pures et immuables** (elles retournent un nouvel état),
ce qui les rend faciles à tester.

```
lib/
├── domain/types.ts          Types partagés (Participant, Standing…)
├── formats/
│   ├── swiss.ts             Phase suisse (Valorant phase 1)
│   ├── double-elimination.ts Playoff double élimination (Valorant phase 2)
│   ├── single-elimination.ts Élimination simple + 3ᵉ place (GeoGuessr)
│   ├── time-attack.ts       Classement par temps (TrackMania phase 1)
│   └── cup.ts               Rondes à points + finale (TrackMania phase 2)
├── discord/
│   ├── split.ts             Découpe à la limite Discord (2000 car.)
│   └── format.ts            Messages copier/coller (appariements, classement…)
├── schedule/estimate.ts     Estimation d'horaire (postes, pauses, jour suivant)
└── runtime/runner.ts        Orchestration par jeu (enchaîne les moteurs)
```

L'interface et la persistance s'appuient sur cette logique sans la dupliquer :

```
app/
├── page.tsx                 Accueil (les tournois)
├── t/[id]/                  Tableau de bord d'un tournoi, équipes, projecteur
├── _components/             Vues par jeu, gestion d'équipes, panneau Discord
└── _lib/                    Client Prisma, actions serveur, vues Discord
prisma/schema.prisma         Tables (Tournament, Team, Member, Player) — SQLite local
scripts/import.ts            Import du roster .xlsx (répare l'encodage, calcule le rang moyen)
```

Une action = charger l'état sérialisé → exécuter une fonction pure de `lib/` →
sauver le nouvel état. Les données sensibles ne vivent que dans la base locale.

## Stack technique

- **Next.js** (App Router) + **React** — interface, rendue côté serveur
- **Prisma** + **SQLite** — base de données dans un simple fichier local, zéro infra
- **TypeScript** (strict) + **Vitest** — logique pure et tests unitaires

## Démarrage — guide pas à pas (débutant)

Aucune expérience requise. Suivez les étapes dans l'ordre, dans un terminal.

### 1. Installer Node.js

Téléchargez et installez **Node.js version 20 ou plus récente** depuis
<https://nodejs.org> (choisissez la version « LTS »). Pour vérifier que c'est bon :

```bash
node --version   # doit afficher v20.x.x ou plus
```

### 2. Récupérer le projet et ses dépendances

```bash
# Depuis le dossier du projet :
npm install
```

### 3. Créer la base de données locale

```bash
cp .env.example .env     # crée le fichier de configuration (à faire une seule fois)
npm run db:push          # crée le fichier de base de données SQLite (prisma/dev.db)
```

### 4. (Valorant) Importer la liste des équipes

Placez le fichier `.xlsx` du roster à la racine du projet, puis :

```bash
npm run import                       # lit Valorant_game_profiles_2026.xlsx par défaut
# ou, si le fichier a un autre nom/emplacement :
npm run import chemin/vers/mon-fichier.xlsx
```

Colonnes attendues (l'ordre et la casse importent peu) : `Team`, `Username`,
`Email`, `Identifier`, `Rank`, `Seat`. L'import n'affiche **aucune donnée
personnelle**, seulement des compteurs. Vous pourrez ensuite ajouter/modifier des
équipes directement dans l'interface.

### 5. Lancer l'application

**En développement** (rechargement automatique, idéal pour travailler) :

```bash
npm run dev
```

**En production** (plus rapide, pour le jour de l'événement) :

```bash
npm run build
npm start
```

Puis ouvrez **<http://localhost:3000>** dans votre navigateur.

### En cas de besoin

```bash
npm test          # vérifie que toute la logique fonctionne (112 tests)
npm run db:push   # re-synchronise la base si le schéma a changé
```

> Astuce : si un port est déjà utilisé, lancez par exemple `npm run dev -- -p 3001`
> puis ouvrez `http://localhost:3001`.

## Confidentialité des données

Ce dépôt est **public** et ne contient **aucune donnée sensible**. La liste des
joueurs, la base de données et les courriels **restent locaux** sur la machine de
l'organisateur. Le `.gitignore` exclut les tableurs (`*.xlsx`, `*.xls`, `*.csv`),
les bases de données (`*.db`, `*.sqlite*`), les fichiers de lock et `.env`.

Chaque organisateur gère un seul jeu, avec sa propre copie et sa propre base
SQLite locale — aucune synchronisation n'est requise.

## Licence

[MIT](LICENSE)
