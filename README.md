# Le Noël de Victor

La liste contient huit envies. Chaque visiteur peut consulter une photo au survol du nom ou en touchant la vignette, ouvrir la boutique et réserver un cadeau. Les personnes qui consultent la liste voient sa disponibilité. La personne qui a réservé peut annuler dans le même navigateur. Victor peut libérer une réservation depuis l’aperçu du cadeau.

## Essayer sur ton Mac

Avec Node.js 22.9 ou plus récent, ouvre un terminal dans le dossier décompressé puis lance `npm run dev`. Ouvre l’adresse affichée. Le mot de passe temporaire d’**Espace Victor** s’affiche au démarrage. Tu peux le fixer avec `ADMIN_PASSWORD` dans un fichier `.env.local` (16 caractères minimum). Aucune installation de dépendances n’est nécessaire.

Les essais locaux sont enregistrés dans `.local/gifts.json`. Un deuxième profil de navigateur permet de tester le point de vue d’un proche. La liste en ligne démarre avec les cadeaux de `public/seed.json`. Pour consulter simplement le rendu, ouvre **Apercu.html** dans ton navigateur.

## Mettre en ligne sur Vercel

1. Depuis le dossier qui contient `vercel.json`, lance `npx vercel` et associe le dossier à un nouveau projet. Autre possibilité : importe ce dossier depuis un dépôt Git dans Vercel. Choisis le framework **Other**. La configuration fournie construit `dist/` et déploie la fonction `api/index.js`.
2. Crée une base **Upstash Redis** et récupère l’URL REST HTTPS et le jeton REST en lecture/écriture. La base conserve les réservations et les modifications après chaque déploiement.
3. Dans **Project → Settings → Environment Variables**, renseigne ces trois variables pour **Production** :
   - `UPSTASH_REDIS_REST_URL` : l’URL REST de la base.
   - `UPSTASH_REDIS_REST_TOKEN` : le jeton REST en lecture/écriture.
   - `ADMIN_PASSWORD` : ton propre mot de passe de 16 caractères ou plus.
4. Lance `npx vercel --prod` ou redéploie en production depuis le tableau de bord. Ouvre l’URL de production en navigation privée, réserve un cadeau test et annule la réservation. Le bouton **Partager la liste** copie le lien pour tes proches.

Sans configuration complète, le déploiement montre un aperçu en lecture seule. Pour une préversion partageable avec réservations, configure les variables pour **Preview** avec une base séparée. Les secrets restent côté serveur.

## Gérer la liste

Connecte-toi à **Espace Victor**, puis choisis **Ajouter une envie** ou **Modifier**. Colle un lien HTTPS : l’atelier importe les informations publiques de la boutique. Tu peux modifier le nom, le prix, la devise, la photo, la catégorie, la taille et le modèle avant d’enregistrer. Utilise **Importer depuis le lien** pour relire une fiche. Certaines boutiques rendent le prix après chargement, demandent un CAPTCHA ou indiquent le prix du modèle par défaut. Le formulaire reste modifiable dans tous les cas.

Les prix sont indicatifs et ne sont pas actualisés en arrière-plan. Une fiche sans prix propose **Voir le prix** si elle a un lien. Une illustration identifie les idées sans photo. Les chaussettes et le home trainer sont réservables même sans lien.

## Vérification

`npm run check`, `npm test` puis `npm run build`. Le build copie les fichiers web dans `dist/`. Les fonctions Vercel sont dans `api/`.

Documentation : [Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js) · [API REST Upstash](https://upstash.com/docs/redis/features/restapi).
