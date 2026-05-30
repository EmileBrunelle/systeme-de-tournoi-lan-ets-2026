# Seeding playoff par difficulté du calendrier — Valorant LAN ÉTS

_2026-05-30 — fonctionnement retenu. Implémentation **en live** (avant de générer le playoff de ce LAN)._

Ce document décrit **ce qu'on a décidé** pour que le seeding du playoff (top 8 →
braquette double-élimination) reflète la vraie force des équipes, et ne relègue
pas une équipe forte simplement parce qu'elle a affronté les meilleures.

## Le problème

Le seeding du playoff prend les 8 qualifiés et les classe par l'ordre du
classement suisse (`startPlayoff` → `standings` → `slice(0, 8)`). Cet ordre
repose sur `strengthCompare` : **victoires → moins de défaites → Buchholz →
seed**. Les défaites passant avant le Buchholz, un **3-2 reste toujours sous un
3-1**, peu importe la dureté de son parcours.

Conséquence redoutée : une équipe de calibre top-3 qui a tiré la 1ère et la 2e
équipe en chemin finit 3-2, hérite d'un seed 6-8, et croise un gros seed dès le
premier tour. On veut qu'un **parcours difficile puisse compenser** une fiche
légèrement moins bonne — que le critère de performance **franchisse** les
paliers 3-0 / 3-1 / 3-2 (décision explicite du user).

### Le piège à éviter

La **diff de manches pure** (Σ manches gagnées − perdues) ferait *l'inverse* du
but : elle récompense d'avoir écrasé des faibles et punit d'avoir perdu serré
contre les forts. Le critère doit donc traiter « avoir affronté un fort » comme
un **bonus inconditionnel** (gagné ou perdu) — jamais une pénalité.

---

## Décision — score borné « le calendrier compense, sans écraser »

> **Révision (2026-05-30, 2e passe).** La 1re version mettait le calibre du
> calendrier en critère **#1** et reléguait les défaites au 3e rang. Sur les vraies
> données du LAN, ça *écrasait* le record au lieu de le *compenser* : un invaincu
> (Minions, 3-0) tombait sous un 3-1, et un 3-1 (OP//ZERO) chutait **dernier**
> derrière trois 3-2. C'est une surcorrection — l'objectif déclaré était de
> *compenser* une fiche légèrement moins bonne, pas de rendre le record inerte.
> On remplace par un **score borné**.

**Constat-clé :** tous les qualifiés ont **le même nombre de victoires** (la suisse
s'arrête à `winsToQualify`). Le seul vrai levier est donc **défaites vs dureté du
parcours**. On les met sur la même échelle :

> **`score = SCHEDULE_WEIGHT × calibre_moyen − défaites`**, avec `SCHEDULE_WEIGHT = 2`.

On classe les 8 qualifiés par, dans l'ordre :

1. **Score de seeding** ↓ — ci-dessus. `calibre_moyen = buchholz(id) / nb d'adversaires`
   (moyenne, pas somme, pour neutraliser « un 3-2 joue plus de matchs »). Affronter
   du gros monde monte le score qu'on ait gagné **ou** perdu → ne punit jamais un
   parcours dur ; une défaite le baisse.
2. **Diff de manches** ↓ — départage à score égal (la domination en manches).
3. **Seed initial** ↑ — filet final déterministe.

**Pourquoi `SCHEDULE_WEIGHT = 2` :** il faut **une demi-victoire** d'écart de
calibre moyen pour compenser **une défaite** (`2 × 0.5 = 1`). C'est le réglage qui,
sur les vraies données, produit la **correction minimale** : un seul échange
(XTM 3-2, calendrier le plus dur, monte d'un cran devant OP//ZERO 3-1, parcours le
plus mou). Tunable : ↑ pour plus de franchissements, ↓ pour coller au record.

**Explication aux équipes (sans jargon) :** « Ton seed, c'est ton bilan, plus un
bonus pour avoir affronté un calendrier difficile. »

### Pourquoi c'est borné (et pas « calibre d'abord »)

- Un **invaincu reste en tête** : son score (pas de défaite) ne se fait dépasser
  par un 3-1 que si l'écart de calibre dépasse une demi-victoire — pas pour
  quelques centièmes.
- Un **3-2 au calendrier de feu** peut franchir un 3-1 au parcours doux *uniquement*
  si l'écart de calibre (≥ 0.5) compense la défaite supplémentaire. C'est le
  scénario qu'on voulait corriger (le vrai cas XTM), sans déclasser personne d'autre.
- Dans le pli, record et calibre sont fortement corrélés (les gagnants jouent des
  gagnants) → le franchissement ne se déclenche qu'au cas par cas, sur les vraies
  anomalies de tirage.

### Le piège évité (rappel)

La **diff de manches pure** ferait *l'inverse* du but (récompense d'écraser des
faibles). Elle ne sert donc QUE de départage à score égal — jamais de critère
primaire. Le calibre, lui, traite « avoir affronté un fort » comme un bonus
inconditionnel.

---

## Isolation — zéro risque sur la phase suisse

`strengthCompare` est partagé par **l'appariement** (`generateNextRound`, lignes
252 & 311) **et** par `standings` (ligne 348). Le modifier changerait les
appariements de la manche 5 — **inacceptable en live**.

→ On **ne touche pas** à `strengthCompare`. On ajoute une fonction **dédiée** au
seeding du playoff, appelée **uniquement** par `startPlayoff`.

- Les **8 qualifiés** sont les mêmes qu'avant : la qualification dépend du nombre
  de victoires (statut `qualified`), pas de l'ordre. On ne fait que **réordonner
  ces 8-là**.
- L'affichage du classement suisse (`standings`) et l'appariement restent
  **strictement inchangés**.

### Briques moteur (`lib/formats/swiss.ts`)

- `roundDiff(state, id): number` — somme, sur les matchs joués de l'équipe (score
  non nul), de `(manches à soi − manches adverses)`. Byes et forfaits sans score
  → ignorés (le gain/perte est déjà compté dans le bilan ; ils ne pèsent pas sur
  la diff de manches).
- `avgOpponentWins(state, id): number` — `buchholz(id) / opponents.length` ;
  retourne `0` si aucun adversaire (garde anti division-par-zéro).
- `playoffSeeding(state, n): Standing[]` — prend les `n` premiers du classement
  (= les qualifiés) et les **trie par le score borné** (`SCHEDULE_WEIGHT × calibre
  moyen − défaites`, puis diff de manches, puis seed initial). `SCHEDULE_WEIGHT`
  et `seedingScore` sont des constantes/fonctions privées du module. Retourne le
  même type `Standing[]` que `standings`, dans l'ordre de seed.

### Branchement (`lib/runtime/runner.ts`)

`startPlayoff` remplace `standings(...).slice(0, playoffSize)` par
`playoffSeeding(state.swiss, playoffSize)` pour produire les `participants`
seedés 1..N. Le reste (`createDoubleElim`, `grandFinalReset: false`) ne change
pas.

---

## Le garde-fou (obligatoire avant de générer le playoff)

Le pli de manche 1 oppose fort-vs-faible (seed 1 vs seed 9) : même une équipe
3-0 a donc au moins un adversaire faible qui tire sa moyenne vers le bas. Une 3-0
pourrait théoriquement passer **sous** une 3-2 — c'est le franchissement
demandé, mais ça peut surprendre une équipe qui a tout gagné.

→ **Une fois la manche 5 jouée, avant de générer le playoff :** calculer les
**deux ordres** (record-roi actuel vs nouveau critère), présenter la **braquette
concrète côte à côte**, et **obtenir l'accord du user**. Si l'ordre paraît
injuste sur les vraies équipes, on ajuste *avant* de publier. Rien à l'aveugle.

---

## Tests (TDD strict)

Écrits **avant** l'implémentation. Cas conçus pour exposer les pièges :

- **Gros écart de calendrier → franchissement** : un 3-2 au calendrier nettement
  plus dur passe devant un 3-1 au parcours mou (le bonus dépasse la défaite).
- **Mince écart → PAS de franchissement (le bornage)** : un 3-0 reste devant un
  3-1 à peine plus dur (quelques centièmes de calibre ne renversent pas une
  défaite) ; un 3-1 garde sa place sur un 3-2 au calendrier à peine plus dur.
- **Biais du nombre de matchs** : à difficulté/diff égales, un 3-2 et un 3-0 ne
  sont pas départagés par le nombre d'adversaires (moyenne, pas somme).
- **Diff de manches en départage** : à score égal, la plus grosse diff de manches
  l'emporte.
- **Forfait / bye sans score** : `roundDiff` les ignore sans planter ;
  `avgOpponentWins` ne divise pas par zéro.
- **Déterminisme** : même état → même ordre (filet seed initial).

### Invariants à préserver

- Les tests existants de `strengthCompare` et de l'appariement suisse **restent
  verts** (preuve que la phase suisse est intacte).
- Les 8 qualifiés sont identiques à `standings().slice(0, 8)` (même ensemble,
  ordre différent).

---

## Hors périmètre (YAGNI)

- Score « sur mesure » pondéré (marge × force adverse avec pardon des défaites) —
  écarté : imprévisible et imbuvable à expliquer aux équipes.
- Médiane-Buchholz / coupes d'adversaires — non nécessaire ; la moyenne suffit.
- Changer l'ordre d'affichage du classement suisse — hors périmètre ; on ne
  touche qu'au seeding du playoff.

## Calendrier

**En live**, avant de générer le playoff de ce LAN (après la manche 5). Le
garde-fou ci-dessus est la dernière barrière avant publication.

---

## Addendum live (2026-05-30) — biais pré-tournoi ponctuel pour la vraie braquette

Au moment de générer, le garde-fou a révélé un **défaut de bracketing** que le
score borné seul ne corrige pas : les trois équipes jugées les plus fortes
(GRID, Garnis, XTM — seeds **initiaux** 1/2/3) tombaient **toutes dans la même
moitié**, Garnis vs XTM s'affrontant dès le 1er tour. C'est de la **séparation
des têtes de série** — un principe de bracketing standard, distinct du *ranking*.

Décision d'orga (« les chiffres ne disent pas tout ») : pour CETTE braquette, on
a appliqué un **biais pré-tournoi** au score de seeding :

> `score = 2×calibre_moyen − défaites − SEED_BIAS×seed_initial`, `SEED_BIAS = 2`.

À ce poids, le seed initial mène → ordre **GRID, Garnis, XTM, Pandas, Minions,
OP//ZERO, ETS, Durham**, ce qui place GRID seul en haut et Garnis/XTM en bas
(séparés ; ils ne peuvent se croiser qu'en demie, jamais au 1er tour).

**Portée :** override **ponctuel** appliqué via `scripts/generate-playoff-biased.ts`
(pas dans `playoffSeeding`, qui reste le **score borné sans biais** par défaut).
Conséquence assumée : régénérer le playoff via l'app produirait le bracket *sans*
biais — sans objet ici, le playoff étant déjà lancé (`canStartPlayoff` = false).
Backups d'état pris avant chaque génération (gitignorés).
