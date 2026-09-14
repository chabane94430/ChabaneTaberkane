# Serrurier Express — le "Uber de la serrurerie"

Une application mobile qui met en relation, en temps réel, des personnes ayant
un problème de serrurerie (porte claquée, clé cassée, voiture bloquée...) avec
des serruriers professionnels disponibles à proximité — sur le même principe
qu'un VTC : demande géolocalisée, diffusion aux prestataires proches, premier
arrivé/premier accepté, suivi en direct, messagerie, paiement in-app et
notation. Un back-office admin permet la modération, la vérification des
serruriers et le pilotage des tarifs.

## Concept produit

**Côté client**
1. Ouvre l'app, décrit son problème (type de panne, description, photo
   optionnelle jointe)
2. Sa position GPS est envoyée avec la demande
3. La demande est diffusée aux serruriers en ligne dans un rayon donné, qui
   s'élargit automatiquement si personne n'accepte
4. Dès qu'un serrurier accepte, le client voit sa position en direct sur une
   carte, peut l'appeler ou lui écrire, et suit le statut (en route → arrivé
   → terminé)
5. Une fois l'intervention terminée, il règle en carte bancaire dans l'app
   (Stripe) puis note le serrurier

**Côté serrurier**
1. Bascule en "En ligne" pour recevoir des demandes proches
2. Reçoit les demandes en temps réel (nouvelles demandes + demandes déjà en
   attente autour de lui) et peut en accepter une (premier arrivé, premier
   servi)
3. Navigue jusqu'au client, échange par message si besoin, marque "arrivé"
   puis "terminé" avec le prix final
4. Est payé directement sur son compte bancaire via Stripe Connect (moins la
   commission de la plateforme)
5. Consulte son historique de gains, sa note moyenne, et son statut de
   vérification d'identité

**Back-office admin** (page web servie par le backend, à `/admin`)
- Statistiques (utilisateurs, demandes par statut, revenu, vérifications en
  attente, comptes suspendus)
- Liste et suivi des demandes (modération, litiges)
- Vérification d'identité des serruriers (approuver/rejeter), suspension
  manuelle / réactivation
- Tarification par type de panne (surcharge les prix par défaut)

## Architecture

Monorepo à deux paquets :

```
backend/   API REST + WebSocket + back-office admin (Node.js, Express, Prisma, Socket.IO, Stripe)
mobile/    Application mobile (React Native + Expo, TypeScript)
```

### Pourquoi cette stack

- **React Native / Expo** : un seul code pour iOS, Android *et* tablette, accès
  natif à la géolocalisation, aux cartes, à l'appareil photo et aux
  notifications push.
- **Express + Socket.IO** : REST pour les actions (créer une demande,
  accepter, changer de statut...) et WebSocket pour le temps réel (nouvelle
  demande diffusée, position du serrurier en direct, messages) — c'est le
  mécanisme central qui fait le "Uber-like".
- **Prisma + SQLite** en développement pour une mise en route immédiate sans
  serveur de base de données ; voir [Passer en production](#passer-en-production)
  pour basculer vers PostgreSQL.
- **JWT** pour l'authentification, rôle `CLIENT`, `LOCKSMITH` ou `ADMIN` porté
  par l'utilisateur.
- **Stripe Connect (Express accounts)** pour les paiements in-app : le client
  paie via l'app, la plateforme prélève une commission et reverse le reste au
  serrurier directement — Stripe gère KYC et coordonnées bancaires, nous ne
  stockons jamais rien de sensible.
- **Multer + stockage disque local** pour les photos de demande et les pièces
  d'identité en développement (voir limites de scalabilité plus bas).

### Logique de mise en relation (le cœur du "Uber-like")

1. Le client crée une demande (`POST /requests`) avec sa position, et peut y
   joindre une photo (`POST /requests/:id/photos`).
2. Le serveur calcule la distance (formule de haversine) vers tous les
   serruriers actuellement en ligne et leur pousse l'événement WebSocket
   `request:new` (+ notification push) s'ils sont dans le rayon configuré
   (`BROADCAST_RADIUS_KM`). Si personne n'accepte dans les
   `ACCEPT_TIMEOUT_SECONDS`, le rayon s'élargit automatiquement
   (`RADIUS_STEP_KM` par palier, jusqu'à `MAX_RADIUS_KM`) et les serruriers
   nouvellement dans la zone sont notifiés à leur tour ; si aucun serrurier
   n'est jamais trouvé, la demande est automatiquement annulée
   (`backend/src/matching.ts`).
3. Chaque serrurier intéressé appelle `POST /requests/:id/accept`. La mise à
   jour est **atomique** (`updateMany` conditionné sur `status: PENDING`) :
   seul le premier à accepter obtient la demande, les suivants reçoivent une
   erreur `409` — exactement le comportement attendu d'une course VTC.
4. Le client est notifié en direct (`request:accepted`) avec les infos du
   serrurier ; la position du serrurier est ensuite relayée en direct
   (`job:location`) pendant qu'il est en route. Les deux parties peuvent
   échanger des messages (`POST /requests/:id/messages`, relayés en direct).
5. Le serrurier fait progresser le statut (`ARRIVED` puis `COMPLETED` avec le
   prix final), chaque changement est poussé au client (WebSocket + push).
6. Le client règle via `POST /requests/:id/payment-intent` (Stripe
   PaymentSheet côté app), puis peut noter le serrurier (`POST /reviews`), ce
   qui met à jour sa note moyenne.
7. **Annulation** : gratuite tant que la demande est `PENDING` (pas encore de
   serrurier assigné). Une fois un serrurier assigné (`ACCEPTED`/`ARRIVED`),
   l'annulation par le client déclenche des frais (`LATE_CANCELLATION_FEE_EUR`)
   ; l'annulation par le serrurier compte comme une "défaillance" — au-delà de
   `MAX_LOCKSMITH_CANCELLATIONS`, son compte est suspendu automatiquement
   (bloqué pour accepter de nouvelles demandes, jusqu'à réactivation par un
   admin).

## Démarrer le backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev   # crée dev.db (SQLite) et applique le schéma
npm run dev               # démarre l'API sur http://localhost:4000
```

Le back-office admin est servi sur `http://localhost:4000/admin`. Pour vous y
connecter, créez un compte admin :

```bash
# dans backend/.env, renseignez ADMIN_EMAIL et ADMIN_PASSWORD, puis :
npm run seed
```

Pour activer les paiements in-app, renseignez `STRIPE_SECRET_KEY` et
`STRIPE_WEBHOOK_SECRET` dans `.env` (clés de test sur
https://dashboard.stripe.com/test/apikeys) ; tant qu'elles sont absentes, les
routes de paiement répondent clairement `503` au lieu de planter — le reste de
l'app fonctionne normalement.

Tests (58 tests d'intégration : auth, cycle de demande complet, matching et
élargissement de rayon, notifications push, chat, photos, vérification
d'identité, pénalités d'annulation, paiements Stripe mockés, back-office
admin) :

```bash
npm test
```

## Démarrer l'application mobile

```bash
cd mobile
npm install
```

Configurez l'URL de l'API dans `mobile/src/api/config.ts` (ou variable
d'environnement `EXPO_PUBLIC_API_URL`) : sur un appareil physique ou un
émulateur, `localhost` ne pointe pas vers votre machine — utilisez l'IP de
votre réseau local (ex. `http://192.168.1.20:4000`) ou un tunnel Expo/ngrok.

```bash
npm start
```

> **Important — Expo Go ne suffit plus.** Depuis l'ajout du paiement in-app
> (`@stripe/stripe-react-native`, un module natif), l'app nécessite un
> **dev client** personnalisé plutôt qu'Expo Go :
> ```bash
> npx expo prebuild
> npx expo run:ios      # ou run:android
> # ou, sans machine macOS/Android Studio, via EAS :
> eas build --profile development --platform ios
> ```
> Sans dev client, tout le reste de l'app fonctionne dans Expo Go — seul
> l'écran de paiement ne pourra pas s'initialiser.

> Les notifications push nécessitent un **appareil physique** (pas de token
> push sur simulateur) et, pour un build EAS, un `projectId` généré par
> `eas build:configure` (il s'écrit automatiquement dans `app.json`) — sans
> quoi l'app continue de fonctionner normalement, simplement sans push (le
> WebSocket reste actif pour le temps réel pendant que l'app est ouverte).

> **Limite connue de cet environnement de développement** : ce sandbox ne
> dispose pas de simulateur iOS/Android ni d'appareil physique pour lancer
> l'app visuellement. Le code a été vérifié par `tsc --noEmit` (0 erreur) et
> `expo-doctor` (17/17 checks), et le backend est couvert par une suite de
> tests d'intégration qui passe intégralement — mais l'app mobile elle-même
> n'a pas été testée à l'écran. Avant mise en production, lancez-la sur un
> simulateur ou un vrai téléphone pour valider l'UX (cartes, permissions,
> écran de paiement Stripe, clavier, etc.).

## Passer en production

Quelques changements sont nécessaires avant un vrai déploiement — aucun n'a
pu être exécuté ni vérifié dans cet environnement (pas d'accès à un vrai
compte Stripe, Postgres, Fly/Render, ou aux comptes développeur Apple/Google) :

**Base de données : SQLite → PostgreSQL**
1. Dans `backend/prisma/schema.prisma`, changez `provider = "sqlite"` en
   `provider = "postgresql"` dans le bloc `datasource`.
2. Supprimez `backend/prisma/migrations/` (les migrations SQLite ne sont pas
   compatibles avec Postgres).
3. Pointez `DATABASE_URL` vers votre instance Postgres, puis régénérez les
   migrations à neuf : `npx prisma migrate dev --name init`.
4. En production, appliquez-les avec `npx prisma migrate deploy` (déjà fait
   automatiquement au démarrage du conteneur Docker, voir `Dockerfile`).

**Stockage des fichiers**
Les photos de demande et pièces d'identité sont stockées sur disque local
(`backend/uploads/`, voir `src/uploads.ts`) — pratique en dev, mais perdu à
chaque redéploiement et non partagé entre plusieurs instances. Pour la
production : montez un volume persistant (Fly volumes, `docker-compose.yml`
le fait déjà pour un test local) ou, mieux, remplacez `src/uploads.ts` par un
stockage S3-compatible.

**Paiements Stripe**
1. Créez un compte Stripe, récupérez `STRIPE_SECRET_KEY` (backend) et la clé
   publiable `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (mobile,
   `dashboard.stripe.com/test/apikeys`).
2. Configurez un webhook Stripe vers `https://votre-api/payments/webhook`
   pour les événements `payment_intent.succeeded` et
   `payment_intent.payment_failed`, récupérez `STRIPE_WEBHOOK_SECRET`.
3. Mettez à jour `STRIPE_ONBOARDING_REFRESH_URL` /
   `STRIPE_ONBOARDING_RETURN_URL` avec de vraies pages (ou un deep link
   `serrurierexpress://...` vers l'app).

**Déploiement backend** — voir `backend/Dockerfile`, `backend/fly.toml`
(Fly.io) et `backend/render.yaml` (Render), prêts à l'emploi une fois les
secrets renseignés (`fly secrets set ...` ou dashboard Render). Un
`docker-compose.yml` est fourni pour tester la stack Postgres + backend en
local.

**Publication mobile** — `mobile/eas.json` définit des profils `development`
/ `preview` / `production`. `eas build --profile production` puis
`eas submit` pour publier sur l'App Store / Google Play (nécessite des
comptes développeur Apple/Google).

## Ce qui est fait

- Inscription / connexion client, serruriers & admin (JWT)
- Création de demande géolocalisée avec photo optionnelle et estimation de
  prix par type de panne (ajustable par un admin)
- Diffusion temps réel aux serruriers en ligne à proximité, avec **timeout +
  élargissement automatique du rayon de recherche** : si personne n'accepte
  dans `ACCEPT_TIMEOUT_SECONDS`, le rayon grandit par paliers de
  `RADIUS_STEP_KM` jusqu'à `MAX_RADIUS_KM` ; sans succès, la demande
  s'auto-annule (`cancelReason: NO_LOCKSMITH_AVAILABLE`)
- Acceptation "premier arrivé, premier servi" avec garantie d'atomicité
- Suivi en direct (carte, position du serrurier, statut)
- **Chat texte** client ↔ serrurier une fois un serrurier assigné, relayé en
  temps réel
- Cycle de statut complet : en attente → accepté → arrivé → terminé
- **Pénalités d'annulation** : frais pour le client en cas d'annulation
  tardive (serrurier déjà assigné), suspension automatique d'un serrurier qui
  enchaîne les annulations, réactivable par un admin
- **Vérification d'identité** des serruriers (upload de pièce d'identité,
  statut suivi et validé côté admin)
- **Paiement in-app (Stripe Connect)** : le client paie par carte dans l'app,
  la plateforme prélève une commission (`PLATFORM_FEE_PERCENT`) et transfère
  le reste directement au compte Stripe du serrurier
- Notation / avis après intervention, mise à jour de la note moyenne
- Historique des demandes (client) et des gains (serrurier)
- **Notifications push (Expo)** en complément du WebSocket, pour toucher
  l'utilisateur même quand l'app est en arrière-plan ou fermée
- **Back-office admin** (page web à `/admin`) : statistiques, modération des
  demandes, vérification/suspension des serruriers, tarification par type de
  panne
- Scaffolding de déploiement prêt à l'emploi : Docker, Fly.io, Render, EAS

## Limites connues / pistes pour la suite

- **Non testé visuellement** : voir la note ci-dessus — l'app mobile n'a pas
  pu être lancée sur un simulateur/appareil dans cet environnement.
- **Rien de tout ça n'a tourné en conditions réelles** : Stripe est câblé et
  testé avec le SDK mocké, mais jamais appelé avec de vraies clés ; le
  déploiement (Docker/Fly/Render/EAS) n'a pas été exécuté faute de comptes
  externes. À valider avant mise en production.
- Stockage de fichiers local (non scalable au-delà d'une seule instance) — à
  remplacer par S3 en production, voir ci-dessus.
- Tarification par zone géographique : seule une tarification par *type de
  panne* est ajustable (pas de zonage géographique, qui demanderait un
  service de géocodage).
- Pas de ré-diffusion automatique immédiate quand un serrurier annule après
  acceptation — le client doit recréer une demande (la logique de pénalité
  existe, la re-diffusion instantanée serait une amélioration naturelle).
- Pas de gestion multi-appareils pour le token push (un seul token par
  utilisateur, écrasé à chaque connexion).
