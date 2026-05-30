# Spec — Refonte UI SaaS-grade (Wave 2)

**Date** : 2026-05-29 · **Contexte** : event LIVE (check-in 29, matchs 30, finale 31 mai 2026).
**Décision** : outil LAN d'abord, archi SaaS-ready. Stack UI **shadcn/ui + Tailwind v4**.

## Objectif

Transformer l'UI fonctionnelle existante en une interface **belle, cohérente, SaaS-grade**
sans changer la logique métier ni casser les flows live. Centrée sur **un seul jeu**
(Valorant pour cet orga).

## Contraintes dures

1. **Zéro casse** : `tsc` + 112 tests + `next build` + routes 200 verts à **chaque palier**.
2. **Logique inchangée** : les server actions (`app/_lib/actions.ts`) et les moteurs
   (`lib/`) ne bougent pas. Refonte = présentation uniquement.
3. **Incrémental** : Tailwind/shadcn installés à côté du CSS actuel ; migration page par
   page ; rien n'est supprimé avant que le remplacement soit vérifié.

## Système visuel

- Tailwind v4 (`@import "tailwindcss"`, tokens en `@theme`), shadcn style « new-york ».
- Thème **sombre** par défaut (`next-themes`, classe `dark`). Tokens shadcn standard
  (`--background`, `--card`, `--primary`, etc.).
- **Accent par jeu** via un attribut `data-game` sur le shell : `--primary` = rouge
  Valorant `#ff4655` (vert GeoGuessr, bleu TrackMania).
- Toasts : **Sonner**. Icônes : **lucide-react**.

## Architecture de l'information

- App **centrée sur le tournoi** : `/t/[id]` devient un shell avec navigation latérale.
- Sections : Tableau de bord · Équipes · Phase (suisse/playoff selon l'état) · Projecteur · Discord.
- Accueil `/` : si une seule instance, lien direct ; sinon cartes par jeu (conservé).

## Composants shadcn utilisés

`button`, `input`, `select`, `table`, `card`, `badge`, `tabs`, `dialog`, `dropdown-menu`,
`tooltip`, `sonner`, `label`, `separator`, `scroll-area`.

Mapping clé :
- Boutons/inputs/selects → composants shadcn (les `<form action>` serveur restent).
- Tables (classement, équipes, membres) → `Table`.
- Présence → `Badge` + `DropdownMenu` (ou cycle conservé).
- Suppression équipe/membre → `Dialog` de confirmation.
- Feedback → `Sonner` (toast succès/erreur).
- Panneau Discord → `Card` + bouton copier (client) + Sonner.

## UX

Confirmations destructives, toasts, états vides soignés, responsive, projecteur plein
écran haute lisibilité. Verrou structurel après démarrage déjà en place (Wave 1).

## Séquence de build (chaque étape = build vert)

1. **Setup** : Tailwind v4 + PostCSS + shadcn (`components.json`, `lib/utils.ts`,
   `next-themes`, Sonner), tokens + accent par jeu. globals.css actuel conservé.
2. **App shell** : layout `/t/[id]` avec sidebar + header (nom + phase + accent jeu).
3. **Équipes** : `TeamManager` + page équipes + roster en composants shadcn + Dialog suppr.
4. **Phase suisse** : pairings/score/standings/horaire en Card/Table.
5. **Playoff** : matchs + classement (vue bracket visuelle = optionnelle, en dernier).
6. **Projecteur** : plein écran, gros contraste.
7. **Discord** : Card + copier + toast.
8. **Nettoyage** : retirer le CSS maison devenu inutile, vérif finale.

## Hors scope (Wave 2)

Auth, multi-tenant, Postgres, billing (archi prête mais non implémentée). GeoGuessr/
TrackMania : héritent du thème mais restent plus minces que Valorant.
