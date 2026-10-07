# Milo mobile

Coques iPhone et Android de Milo, avec [Capacitor](https://capacitorjs.com/).

L'application charge le Milo déployé (`server.url`) : le client garde ses
appels relatifs à `/api`, sa session et la connexion Entra, comme dans un
navigateur. Un déploiement de Milo est donc visible aussitôt dans
l'application, sans republier sur les stores. On ne republie que pour changer
la coque : nom, icône, permissions, version de Capacitor.

Ce dossier est hors de l'espace de travail npm : il a ses propres
dépendances.

## Prérequis

- Node.js 22+ (Capacitor 8)
- iPhone : un Mac avec Xcode 26+ (dépendances par Swift Package Manager), un compte Apple Developer
- Android : Android Studio (JDK 21, SDK 36), un compte Google Play Console

## Mise en place

Les projets `ios/` et `android/` sont déjà générés et versionnés : on y règle
signature et numéros de version. Identifiant : `art.lesmanufactures.milo`.

```bash
cd mobile
npm install
npm run sync
```

## Au quotidien

```bash
npm run sync       # après tout changement de config (production par défaut)
npm run ios        # ouvre Xcode
npm run android    # ouvre Android Studio
```

Pour tester sur le serveur de développement :
`MILO_URL=http://<ip-du-poste>:5273 npm run sync`
(le HTTP en clair est alors autorisé ; relancer `npm run sync` sans
`MILO_URL` avant de livrer).

## Connexion Entra

La page de connexion Microsoft s'ouvre dans l'application (`allowNavigation`),
puis revient sur `/api/auth/entra/callback` : l'URI de redirection déjà
déclarée pour le site suffit. Tout autre domaine externe s'ouvre dans le
navigateur du téléphone.

## Icônes et écran de démarrage

Provisoires, tirés de `client/public/Milo-2.svg` (et `Milo-Inv-2.svg` pour le
mode sombre) par `make-assets.mjs`. Pour une icône dédiée, remplacer
`assets/icon-only.png` (1024×1024, opaque) et `assets/icon-foreground.png`
(1024×1024, transparent, logo dans les 66 % centraux), retirer les lignes
correspondantes de `make-assets.mjs`, puis :

```bash
npm run assets
```

## Distribution par Intune

- iPhone : archive signée (`.ipa`) depuis Xcode, avec un profil
  *Enterprise* (Apple Developer Enterprise Program) ou en *Custom App* via
  Apple Business Manager, déployée comme application métier.
- Android : `.aab`/`.apk` signé depuis Android Studio, publié en application
  privée sur Managed Google Play, ou déployé comme application métier.

Les stratégies de protection d'applications Intune (MAM : copier-coller,
chiffrement des données…) demanderaient en plus d'intégrer le SDK Intune ;
le simple déploiement géré (MDM) n'en a pas besoin.
