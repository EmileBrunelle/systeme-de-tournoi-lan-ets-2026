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

## Décision — critère « difficulté du calendrier »

On classe les 8 qualifiés par, dans l'ordre :

1. **Difficulté moyenne du calendrier** ↓ — `buchholz(id) / nombre d'adversaires`
   (moyenne des victoires des adversaires affrontés). *Moyenne*, pas somme, pour
   neutraliser le biais « un 3-2 joue 5 matchs, un 3-0 en joue 3 ». Affronter du
   gros monde monte ce score qu'on ait gagné **ou** perdu → ne punit jamais un
   parcours dur.
2. **Diff de manches** ↓ — `Σ(manches gagnées − manches perdues)`, départage à
   calendrier égal (la domination en manches).
3. **Victoires** ↓ — filet.
4. **Seed initial** ↑ — filet final déterministe.

**Explication aux équipes (sans jargon) :** « Le seed récompense d'abord la
dureté du parcours — la force des équipes affrontées —, puis la marge dans les
manches. »

### Pourquoi ça franchit les paliers dans le bon sens

Un 3-2 au calendrier de feu (a affronté les meilleurs) a une difficulté moyenne
plus haute qu'un 3-1 au parcours doux → il passe devant. C'est exactement le
scénario qu'on veut corriger. Inversement, dans le pli (fort-vs-faible **dans**
chaque groupe de bilan), les équipes qui gagnent affrontent d'autres gagnants :
record et difficulté de calendrier sont donc fortement corrélés. Le
franchissement ne se déclenche donc qu'au cas par cas, sur les vraies anomalies
de tirage — pas en permanence.

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
  (= les qualifiés) et les **trie par le critère ci-dessus**. Retourne le même
  type `Standing[]` que `standings`, dans l'ordre de seed.

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

- **Parcours dur vs facile** : un 3-2 à forte difficulté moyenne passe devant un
  3-1 à faible difficulté (le franchissement fonctionne).
- **Pas de pénalité pour parcours dur** : perdre contre un fort ne fait jamais
  *descendre* sous une équipe au calendrier plus mou à diff de manches comparable.
- **Biais du nombre de matchs** : à difficulté/diff égales, un 3-2 et un 3-0 ne
  sont pas départagés par le nombre d'adversaires (moyenne, pas somme).
- **Diff de manches en départage** : à difficulté de calendrier égale, la plus
  grosse diff de manches l'emporte.
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
