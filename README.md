# Système de tournoi — LAN ÉTS 2026

Application web légère, destinée aux **organisateurs**, pour gérer trois tournois
lors du LAN ÉTS 2026 : **Valorant**, **GeoGuessr** et **TrackMania**. Les scores
sont saisis manuellement par l'orga ; l'app sert aussi à afficher les brackets et
classements sur un projecteur, et à générer des messages Discord copier/coller.

> **But** : un outil basique mais réellement utile le jour de l'événement. Pas de
> sur-ingénierie.

## État du projet

La **couche logique** (moteurs de format, génération de messages Discord,
estimation d'horaire) est complète et entièrement testée (94 tests, `tsc` strict).
L'interface web (Next.js + Prisma/SQLite) et l'import de la liste de joueurs sont
la prochaine étape.

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
└── schedule/estimate.ts     Estimation d'horaire (postes, pauses, jour suivant)
```

## Stack technique

- **TypeScript** (strict) + **Vitest** pour les tests unitaires
- À venir : **Next.js** (App Router) + **Prisma** + **SQLite** (fichier local, zéro infra)

## Démarrage

```bash
npm install
npm test          # lance toute la suite de tests
npm run test:watch
```

## Confidentialité des données

Ce dépôt est **public** et ne contient **aucune donnée sensible**. La liste des
joueurs, la base de données et les courriels **restent locaux** sur la machine de
l'organisateur. Le `.gitignore` exclut les tableurs (`*.xlsx`, `*.xls`, `*.csv`),
les bases de données (`*.db`, `*.sqlite*`), les fichiers de lock et `.env`.

Chaque organisateur gère un seul jeu, avec sa propre copie et sa propre base
SQLite locale — aucune synchronisation n'est requise.

## Licence

[MIT](LICENSE)
