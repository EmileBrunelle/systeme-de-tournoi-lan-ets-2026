# Forfaits & ajustements d'affichage — Valorant LAN ÉTS

_2026-05-30 — fonctionnement retenu._

Ce document décrit **ce qu'on a décidé** après avoir évoqué plusieurs façons de
gérer les forfaits. Il sert de référence pour l'orga.

## Le vocabulaire : deux « forfaits » distincts

On a séparé deux situations qui se ressemblent mais ne font pas la même chose.

| Situation | Ce que ça veut dire | Effet sur l'équipe |
|-----------|---------------------|--------------------|
| **Concession de manche** | Pendant un match, une équipe donne la victoire à l'autre | Perd **cette manche** seulement ; **reste en lice** |
| **Retrait du tournoi** | Une équipe abandonne / ne se présente plus du tout | **Éliminée** ; n'est plus jamais appariée |

> Règle simple : *concession* = je perds **un** match. *retrait* = je quitte **le tournoi**.

## 1. Concession de manche

**Où :** bouton « ⚑ Forfait » sur chaque match non joué — en phase suisse **et** en
playoff.

**Comportement :**
- On choisit **quelle** équipe déclare forfait.
- L'adversaire remporte la manche (score enregistré 13-0, le format Valorant d'un
  forfait).
- L'équipe qui concède encaisse **une défaite** mais **continue** le tournoi
  (elle peut très bien gagner ses prochains matchs).
- La manche est marquée d'un badge **« forfait »** (pas un faux score 13-0
  trompeur), et le flux Discord l'annote `→ forfait`.

**Pourquoi ce choix :** tu voulais *savoir* qu'il y a eu forfait, pas le déguiser
en raclée. Donc on l'étiquette honnêtement plutôt que de juste taper 13-0 à la main.

## 2. Retrait du tournoi (forfait d'équipe)

Deux moments, gérés de façon cohérente :

**Avant le départ** — déjà en place : marquer l'équipe « Retiré » (présence) ; elle
est exclue du roster au démarrage. Aucun changement nécessaire.

**En cours de phase suisse** — nouveau : action « Retirer du tournoi » (icône ⚑
dans le classement, sur les équipes encore en lice, avec confirmation).
- L'équipe passe **éliminée** immédiatement, même sans avoir atteint la limite de
  3 défaites.
- Si elle a un match **en cours non joué** dans la ronde courante, ce match est
  **automatiquement accordé à l'adversaire** (concession).
- Les rondes suivantes **ne l'apparient plus**.
- Ses résultats déjà joués sont **conservés** (le classement reste cohérent).

**Pourquoi ce choix (vs alternatives) :** on a écarté le « juste un marqueur visuel »
(le moteur aurait continué à l'apparier, ingérable) et le « élimination seulement »
(il aurait fallu saisir le score du match en cours à la main). Le retrait fait les
deux d'un coup : éliminer **et** régler le match en attente. C'est le plus fiable
en plein événement.

**Playoff :** en double-élimination, « être sorti » = perdre son match. Donc un
retrait en playoff se gère simplement avec la **concession de manche** (le bouton
⚑ Forfait sur le match), qui fait avancer l'adversaire. Pas de notion de « retrait »
séparée à ce stade.

## 3. Ajustements d'affichage (pré-match)

Tant qu'**aucun match n'est joué**, il n'y a pas de classement réel : le tri se fait
par seed (tirage **aléatoire**), donc afficher un « meneur » ou un classement 1→16
était trompeur. Corrigé :

- **Tuile « Meneur »** : affiche **« Aucun · aucun match joué »** au lieu de couronner
  l'équipe qui a tiré le seed 1. Dès qu'une victoire existe, le vrai meneur s'affiche.
- **Classement** : tant que rien n'est joué, note **« Aucun match joué — classement à
  venir »**, rangs affichés `—`, équipes listées par ordre **alphabétique** (neutre).
  Dès le premier résultat, le classement normal reprend.

## Annexe — c'est quoi le « bris d'égalité » ?

Affiché **« bris d'égalité »** (FR) / **"tiebreaker"** (EN) pour les joueurs. Le nom
technique de la méthode est le **Buchholz**, mais on évite le jargon côté joueurs.

Quand deux équipes ont le même nombre de victoires, on les départage par la **somme
des victoires de tous leurs adversaires affrontés**.

L'idée : avoir 3 victoires contre des équipes fortes vaut mieux que 3 victoires contre
des équipes faibles. Un bris d'égalité élevé = « j'ai battu du monde qui gagne aussi »,
donc un parcours plus difficile, donc mieux classé à égalité de victoires.

Ordre de tri du classement suisse :
1. Statut (qualifié > en lice > éliminé)
2. **Victoires** (décroissant)
3. **Bris d'égalité** / Buchholz (décroissant)
4. Seed (le tirage initial, dernier recours)

## Où ça vit dans le code

| Élément | Fichier |
|---------|---------|
| Moteur suisse : `concedeMatch`, `withdraw`, drapeaux `forfeit`/`forfeited` | `lib/formats/swiss.ts` |
| Calcul du meneur (« Aucun » si rien joué) | `lib/valorant/dashboard.ts` |
| Server actions : `concedeSwissMatch`, `withdrawTeam`, `concedePlayoffMatch` | `app/_lib/actions.ts` |
| UI : boutons Forfait, retrait, badges, classement pré-match | `app/_components/ValorantView.tsx`, `app/_components/ForfeitDialog.tsx` |
| Annotation `forfait` dans le flux Discord | `app/_lib/discord-views.ts` |

Tout le moteur est couvert par des tests (`lib/formats/swiss.test.ts`,
`lib/valorant/dashboard.test.ts`).
