# Déroulement du tournoi — Valorant LAN ÉTS 2026

> Récapitulatif du format sur lequel on a abouti. Le code en est la source de
> vérité (`lib/formats/`, `lib/schedule/lan-ets.ts`, `lib/runtime/runner.ts`) —
> ce document ne fait que le raconter en mots.

## En une phrase

**16 équipes**, une **ronde suisse** (jusqu'à 3 victoires ou 3 défaites), puis
les **8 meilleures** passent en **séries éliminatoires à double élimination**.
La **grande finale** se joue le dimanche matin en direct.

---

## Le calendrier

| Quand | Quoi |
|-------|------|
| **Ven. 29 mai** | Accueil / inscription (check-in) |
| **Sam. 30 mai** | Phase suisse (5 rondes) + presque toutes les séries éliminatoires |
| **Dim. 31 mai, 8 h 00** | Grande finale en direct |

- Le samedi démarre à **9 h 30**.
- Jusqu'à **9 matchs en même temps** (BYOC, 90 postes).
- Pauses repas réservées : **dîner 12 h 00**, **souper 17 h 30** (60 min chacune).
- Une vague de matchs = 10 min d'installation + 45 min de jeu + 15 min de marge.

---

## Phase 1 — Ronde suisse

L'idée du système suisse : **pas d'élimination immédiate**. Chaque équipe affronte
un adversaire qui a, jusque-là, un parcours semblable au sien. On joue jusqu'à
décrocher sa place ou se faire sortir.

**Règles :**

- **Matchs en BO1** (une seule carte par match).
- **3 victoires → qualifiée** pour les séries.
- **3 défaites → éliminée.**
- On rejoue tant qu'une équipe n'a ni 3 V ni 3 D — soit **environ 5 rondes**.

**Comment les adversaires sont pairés :**

- On regroupe les équipes par bilan (les 2-0 ensemble, les 1-1 ensemble, etc.).
- **Pas de revanche** : on évite de refaire jouer deux équipes qui se sont déjà
  affrontées (sauf si c'est vraiment impossible de faire autrement).
- Quand le nombre d'équipes actives est impair, une équipe a un **laissez-passer**
  (bye) : victoire automatique cette ronde-là. Il est donné à l'équipe la moins
  bien classée qui n'en a pas encore eu, et jamais deux fois à la même.

**En cas d'égalité au classement :** on départage avec un **bris d'égalité** basé
sur la force des adversaires rencontrés (la somme de leurs victoires). Autrement
dit, avoir affronté du monde fort compte en ta faveur.

À la fin de la phase suisse, on prend les **8 premières équipes** au classement,
qu'on **re-classe de 1 à 8** pour les séries.

---

## Phase 2 — Séries à double élimination (top 8)

**Double élimination = deux vies.** Une seule défaite ne te sort pas : tu tombes
dans le tableau des perdants et tu peux remonter jusqu'à la finale.

- **Tableau des gagnants** : tu y restes tant que tu gagnes.
- **Tableau des perdants** : une défaite t'y envoie. Une 2ᵉ défaite, et c'est fini.
- Les deux survivants se rejoignent en **grande finale**.

**Format des matchs :**

- Toutes les rondes du **samedi sont en BO1**.
- La **grande finale est en BO3** (au meilleur de 3 cartes), dimanche 8 h 00,
  à l'heure du stream.

**Total : 14 matchs** (7 dans le tableau des gagnants, 6 chez les perdants, 1 finale).

> **Note d'organisation :** il n'y a **pas de match de remise (« reset »)** en
> finale. Le gagnant de la grande finale est champion, point — même s'il venait
> du tableau des perdants. C'est un choix assumé pour garantir une heure de fin
> fixe pour le stream.

---

## Forfaits

- **Forfait sur un match** : l'adversaire gagne le match, l'équipe qui déclare
  forfait encaisse une défaite **mais reste dans le tournoi**.
- **Retrait complet (forfait d'équipe)** : l'équipe est éliminée et ne sera plus
  pairée; son match en cours est accordé à l'adversaire.

> À l'affichage (UI et Discord), un forfait apparaît comme **« → forfait »**,
> jamais avec un faux pointage.

---

## Aide-mémoire express

| | |
|---|---|
| Équipes | 16 |
| Phase 1 | Suisse, BO1, jusqu'à 3 V / 3 D (~5 rondes) |
| Bris d'égalité | Force des adversaires rencontrés |
| Qualifiées | Top 8 → re-classées 1 à 8 |
| Phase 2 | Double élimination, BO1 le samedi |
| Grande finale | BO3, dimanche 8 h 00, en direct |
| Remise en finale | Non |
