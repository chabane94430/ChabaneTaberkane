# Serrurier Express — le "Uber de la serrurerie"

Une application mobile qui met en relation, en temps réel, des personnes ayant
un problème de serrurerie (porte claquée, clé cassée, voiture bloquée...) avec
des serruriers professionnels disponibles à proximité — sur le même principe
qu'un VTC : demande géolocalisée, diffusion aux prestataires proches, premier
arrivé/premier accepté, suivi en direct, paiement et notation.

## Concept produit

**Côté client**
1. Ouvre l'app, décrit son problème (type de panne, description, photo à venir)
2. Sa position GPS est envoyée avec la demande
3. La demande est diffusée aux serruriers en ligne dans un rayon donné
4. Dès qu'un serrurier accepte, le client voit sa position en direct sur une
   carte, peut l'appeler, et suit le statut (en route → arrivé → terminé)
5. À la fin, il valide le prix final et note l'intervention

**Côté serrurier**
1. Bascule en "En ligne" pour recevoir des demandes proches
2. Reçoit les demandes en temps réel (nouvelles demandes + demandes déjà en
   attente autour de lui) et peut en accepter une (premier arrivé, premier servi)
3. Navigue jusqu'au client, marque "arrivé" puis "terminé" avec le prix final
4. Consulte son historique de gains et sa note moyenne

## Architecture

Monorepo à deux paquets :

```
backend/   API REST + WebSocket (Node.js, Express, Prisma, SQLite, Socket.IO)
mobile/    Application mobile (React Native + Expo, TypeScript)
```

### Pourquoi cette stack

- **React Native / Expo** : un seul code pour iOS, Android *et* tablette, accès
  natif à la géolocalisation et aux cartes, écosystème mature pour ce type
  d'app "on-demand".
- **Express + Socket.IO** : REST pour les actions (créer une demande,
  accepter, changer de statut...) et WebSocket pour le temps réel (nouvelle
  demande diffusée, position du serrurier en direct) — c'est le mécanisme
  central qui fait le "Uber-like".
- **Prisma + SQLite** en développement pour une mise en route immédiate sans
  serveur de base de données ; le schéma est écrit pour basculer vers
  PostgreSQL en production (changer simplement le `datasource` dans
  `backend/prisma/schema.prisma`).
- **JWT** pour l'authentification, rôle `CLIENT` ou `LOCKSMITH` porté par
  l'utilisateur.

### Logique de mise en relation (le cœur du "Uber-like")

1. Le client crée une demande (`POST /requests`) avec sa position.
2. Le serveur calcule la distance (formule de haversine) vers tous les
   serruriers actuellement en ligne et leur pousse l'événement WebSocket
   `request:new` s'ils sont dans le rayon configuré (`BROADCAST_RADIUS_KM`).
   Si personne n'accepte dans les `ACCEPT_TIMEOUT_SECONDS`, le rayon
   s'élargit automatiquement (`RADIUS_STEP_KM` par palier, jusqu'à
   `MAX_RADIUS_KM`) et les serruriers nouvellement dans la zone sont notifiés
   à leur tour ; si aucun serrurier n'est jamais trouvé, la demande est
   automatiquement annulée (`backend/src/matching.ts`).
3. Chaque serruriers intéressé appelle `POST /requests/:id/accept`. La mise à
   jour est **atomique** (`updateMany` conditionné sur `status: PENDING`) :
   seul le premier à accepter obtient la demande, les suivants reçoivent une
   erreur `409` — exactement le comportement attendu d'une course VTC.
4. Le client est notifié en direct (`request:accepted`) avec les infos du
   serrurier ; la position du serrurier est ensuite relayée en direct
   (`job:location`) pendant qu'il est en route.
5. Le serrurier fait progresser le statut (`ARRIVED` puis `COMPLETED` avec le
   prix final), chaque changement est poussé au client.
6. Une fois la mission terminée, le client peut noter le serrurier
   (`POST /reviews`), ce qui met à jour sa note moyenne.

## Démarrer le backend

```bash
cd backend
cp .env.example .env
npm install
npx prisma migrate dev   # crée dev.db et applique le schéma
npm run dev               # démarre l'API sur http://localhost:4000
```

Tests (16 tests d'intégration couvrant tout le cycle demande → acceptation →
statuts → notation) :

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

Puis ouvrez l'app dans Expo Go (scan du QR code) ou un simulateur iOS/Android.

> Les notifications push nécessitent un **appareil physique** (pas de token
> push sur simulateur) et, pour un build EAS autonome (hors Expo Go), un
> `projectId` EAS renseigné dans `app.json` sous `extra.eas.projectId` — sans
> quoi l'app continue de fonctionner normalement, simplement sans push (le
> WebSocket reste actif pour le temps réel pendant que l'app est ouverte).

> **Limite connue de cet environnement de développement** : ce sandbox ne
> dispose pas de simulateur iOS/Android ni d'appareil physique pour lancer
> l'app visuellement. Le code a été vérifié par `tsc --noEmit` (0 erreur) et
> `expo-doctor`, et le backend est couvert par une suite de tests
> d'intégration qui passe intégralement — mais l'app mobile elle-même n'a pas
> été testée à l'écran. Avant mise en production, lancez-la sur un simulateur
> ou un vrai téléphone pour valider l'UX (cartes, permissions de
> localisation, clavier, etc.).

## Ce qui est fait (MVP)

- Inscription / connexion client & serruriers (JWT)
- Création de demande géolocalisée avec estimation de prix par type de panne
- Diffusion temps réel aux serruriers en ligne à proximité
- Acceptation "premier arrivé, premier servi" avec garantie d'atomicité
- Suivi en direct (carte, position du serrurier, statut)
- Cycle de statut complet : en attente → accepté → arrivé → terminé
- Annulation côté client
- Prix final saisi par le serrurier
- Notation / avis après intervention, mise à jour de la note moyenne
- Historique des demandes (client) et des gains (serrurier)
- **Timeout + élargissement automatique du rayon de recherche** : si personne
  n'accepte dans le délai `ACCEPT_TIMEOUT_SECONDS`, le rayon de diffusion
  s'élargit par pas de `RADIUS_STEP_KM` (jusqu'à `MAX_RADIUS_KM`) et les
  nouveaux serruriers en ligne dans la zone sont notifiés ; si personne n'est
  jamais trouvé, la demande passe automatiquement en `CANCELLED` avec
  `cancelReason: NO_LOCKSMITH_AVAILABLE`, et le client en est informé en
  direct via WebSocket (voir `backend/src/matching.ts`)
- **Notifications push (Expo)** en complément du WebSocket, pour toucher
  l'utilisateur même quand l'app est en arrière-plan ou fermée : nouvelle
  demande à proximité (serrurier), demande acceptée / serrurier arrivé /
  intervention terminée / annulée / aucun serrurier trouvé (client). Le
  token push de l'appareil est enregistré après connexion
  (`PATCH /users/me/push-token`) et effacé à la déconnexion ; l'envoi est en
  best-effort et ne bloque jamais une requête si Expo est indisponible ou si
  l'appareil n'a pas de token valide (voir `backend/src/push.ts` et
  `mobile/src/notifications.ts`). Un tap sur la notification ouvre
  directement le suivi (client) ou l'intervention en cours (serrurier).

## Pistes pour la suite

- Paiement in-app (Stripe Connect pour reverser les serruriers)
- Photos jointes à la demande, pièce d'identité / vérification des serruriers
- Chat texte client ↔ serrurier
- Système d'annulation avec pénalité en cas d'abandon tardif
- Back-office admin (modération, litiges, tarifs par zone)
- Migration PostgreSQL + déploiement (Docker/Fly.io/Render pour l'API,
  EAS Build pour publier l'app sur les stores)
