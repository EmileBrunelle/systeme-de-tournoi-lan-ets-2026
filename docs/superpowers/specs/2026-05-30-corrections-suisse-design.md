# Corrections suisse sans douleur — Valorant LAN ÉTS

_2026-05-30 — fonctionnement retenu._

Ce document décrit **ce qu'on a décidé** pour que deux situations vécues en live
deviennent indolores, sans script jetable ni chirurgie de base de données.

## Le problème vécu

Pendant la phase suisse (LAN du 30 mai), un score de la manche 3 a été saisi à
l'envers (OP//ZERO vs PANDAS Pulsar). L'erreur a été repérée **après** la
génération de la manche 4. Deux frictions en ont découlé :

1. **Amend verrouillé.** `amendResult` refuse de corriger un match dès que la
   manche suivante est générée (ses appariements dépendent du résultat). Il a
   fallu un script `tsx` qui retire la manche 4, corrige, puis régénère.
2. **Esquive de revanche contre-productive.** En régénérant la manche 4,
   l'anti-revanche glouton du moteur a été « réparé » à la main pour éviter une
   revanche (ETS vs Horizon A). Mais — décision prise depuis — **les revanches
   ne dérangent pas** ; seule compte la justice du pli. Ce swap manuel a en fait
   *dévié* du pli le plus juste. Le vrai correctif n'est donc pas « éviter les
   revanches » mais « garder le pli pur ».

On veut que la correction (point 1) se fasse **depuis l'interface** la prochaine
fois, et que le moteur (point 2) reste **strictement juste** (pli pur).

---

## Partie 1 — Annuler la manche courante (déverrouille la correction)

### Décision

On **ne** crée **pas** de bouton « corriger un score verrouillé » qui ferait tout
en cachette. On ajoute une brique simple et réutilisable : **annuler la manche
courante**. Une fois la manche courante annulée, la manche précédente redevient
courante → le bouton **« Corriger »** existant se débloque → on corrige → on
clique **« Générer la manche suivante »** (existant).

→ 3 clics transparents, qui réutilisent les flux déjà testés (amend + génération).

### Brique moteur : `undoLastRound(state)`

Nouvelle fonction dans `lib/formats/swiss.ts` :

- **Cible** la dernière manche générée (`currentRound(state)`).
- **Garde-fou** : refuse (throw, message clair) si un **vrai match** de cette
  manche a un score (`m.away !== null && m.score !== null`). Autrement dit : on
  n'annule que si la manche courante est **vierge de résultats joués**.
- **Byes** : un bye de la manche courante a un score auto (`{1,0}`) et un effet
  sur le bilan (`wins += 1`, `hadBye = true`). `undoLastRound` **réverse** ces
  effets avant de retirer le match (sinon le bilan reste faussé). Un bye n'est
  pas un « vrai match joué » → il ne bloque pas l'annulation.
- **Effet** : retire tous les matchs de la manche courante (après réverse des
  byes) et retourne un nouvel état où `currentRound` vaut N-1.
- **Cas manche 0 / aucune manche** : throw « aucune manche à annuler ».

C'est l'inverse exact de `generateNextRound` pour une manche non jouée : comme
`generateNextRound` ne touche aux bilans **que** pour les byes, le seul effet à
réverser est le bye. Aucune perte de donnée (rien de joué n'est retiré).

### Portée de la correction d'un score « passé »

La règle retenue (« cascade seulement si la suite est vierge ») tombe
naturellement de cette brique :

- Corriger la manche **courante** : déjà possible (amend actuel).
- Corriger la manche **précédente** quand la courante est vierge : annuler la
  courante → la précédente devient courante → amend → régénérer. ✅
- Corriger une manche **plus ancienne** : impossible, car pour qu'une manche
  N+1 existe, la manche N devait être **complète** (toutes jouées). Les manches
  intermédiaires ont donc des résultats → `undoLastRound` refuse de les
  atteindre. C'est exactement le comportement voulu : pas de cascade destructive.

En pratique, l'annulation ne peut donc « remonter » que d'une seule manche
vierge à la fois — ce qui couvre le cas vécu et interdit la perte de résultats.

### Surfaces

- **Engine** : `undoLastRound(state)` (+ tests).
- **Action serveur** : `app/_lib/actions.ts` — `undoLastSwissRound(tournamentId)`
  + variante `submit…` pour le `<form>`. Charge l'état, applique, sauvegarde.
- **MCP** : outil `undo_last_swiss_round` dans `mcp/server.ts`, mêmes gardes.
- **UI** : `app/_components/ValorantView.tsx`, carte « Matchs ». Un bouton
  **« Annuler la manche N »** visible **uniquement** quand la manche courante est
  vierge de résultats joués (sinon caché — pas de tentation de détruire du
  joué). Confirmation (`ConfirmDialog`) : « Annuler la manche N ? Ses
  appariements seront effacés ; tu pourras corriger la manche N-1 puis
  régénérer. »

---

## Partie 2 — Pli pur (retrait de l'anti-revanche)

### Décision (révisée le 2026-05-30)

**Les revanches ne dérangent pas.** Ce qui compte, c'est que l'appariement reste
**le plus juste possible**. Or la justice retenue ici, c'est le **pli** :
fort-vs-faible **dans** chaque groupe de bilan (le choix délibéré de bb81813).

L'anti-revanche actuel **nuit** à cette justice : pour fuir une revanche, le
choix glouton de `takeOpponent` déforme le pli (il peut donner au #2 du haut un
adversaire du bas plus faible que celui que le pli lui assignerait). Puisqu'on
ne cherche plus à éviter les revanches, on **retire** cette logique.

> Cas vécu : en manche 4, la réparation manuelle « anti-revanche » (OP//ZERO ↔
> Horizon A) a dévié du pli pur. Avec cette décision, le pli pur l'emporte : on
> ne fait plus ce genre de swap.

### Ce qui change dans `generateNextRound`

Le pli devient **pur** : au sein de chaque groupe de bilan trié par force, on
oppose strictement la moitié haute à la moitié basse, position par position —
`top[k]` vs `bottom[k]`. Plus de recherche d'adversaire « non déjà rencontré ».

- On **supprime** `takeOpponent` (le tri glouton anti-revanche).
- Le découpage en groupes de bilan, le flottement du reliquat impair vers le
  bas, l'appariement des reliquats entre eux (du plus fort au plus faible), et
  la résolution du bye **ne changent pas** — ils deviennent juste déterministes
  par position, sans esquive de revanche.
- Une revanche peut donc se produire ; c'est assumé.

C'est une **simplification** : moins de code, plus déterministe, et l'ordre du
pli est strictement respecté.

### Invariants à préserver (tests existants)

- Pli strict : dans un groupe de bilan trié par force, `top[k]` joue `bottom[k]`.
- Les byes, reliquats et le découpage par nombre de victoires sont inchangés.
- Déterminisme : même état → même manche générée.
- ⚠️ Les 179 tests actuels peuvent contenir des cas qui supposent l'esquive de
  revanche. Ceux-là devront être **réécrits** pour refléter le pli pur (ce n'est
  pas une régression : c'est le nouveau comportement voulu). À vérifier au début
  de l'implémentation.

### Cas de test à ajouter / ajuster

- Le cas vécu : groupe 2-1 `[XTM, OP//ZERO, ETS | Garnis, Pandas Solaris,
  Horizon A]` → le moteur produit le **pli pur** : XTM-Garnis,
  OP//ZERO-Pandas Solaris, ETS-Horizon A (revanche incluse, assumée).
- Un test qui vérifiait explicitement « pas de revanche » est soit supprimé,
  soit retourné pour vérifier le pli pur.
- Reliquats et bye : confirmer qu'ils restent identiques.

---

## Hors périmètre (YAGNI)

- Corriger un score quand une manche **suivante est déjà jouée** (perte de
  résultats) — refusé, on reste verrouillé.
- Annuler plusieurs manches d'un coup.
- Toute logique d'évitement de revanche — explicitement abandonnée (on assume
  les revanches au profit du pli pur).

## Calendrier

À construire **après le LAN** (post 2026-05-31). Aucun changement du moteur en
plein événement. Ce document est la référence pour reprendre à froid.
