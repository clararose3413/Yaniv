# Yaniv multijoueur

Jeu de Yaniv à jouer en direct, chacun sur son téléphone (2 à 4 joueurs). Aucune installation côté joueur : on ouvre le lien dans le navigateur.

## Règles codées
- 5 cartes en main, 52 cartes + 2 jokers (jokers = 0 point, remplacent n'importe quelle carte). As = 1, figures = 10.
- Poser : une carte, plusieurs cartes de même valeur (2 à 4), ou une suite de 3 cartes ou plus du même symbole. Puis prendre la pioche, ou une carte de la dernière pose (extrémités si c'est une suite).
- Yaniv : possible avec une main de 7 points ou moins (7 inclus). Si un adversaire a autant ou moins : Assaf, +30 points pour celui qui a annoncé.
- On perd au-delà de 200 points. Pile sur 50, 100, 150 ou 200 : le score baisse de 50.
- Pour changer le seuil du Yaniv, modifier `MAX` en haut de `server.js`.

## Lancer en local
    node server.js
puis ouvrir http://localhost:3000 (Node 18 ou plus). Tests : `node test.js`.

## Mettre en ligne (GitHub + Render, gratuit)
1. Créer un dépôt sur github.com et y envoyer ces fichiers, directement à la racine (bouton « Add file > Upload files »).
2. Sur render.com : « New + > Web Service », connecter GitHub, choisir le dépôt.
3. Réglages : Runtime Node, Build Command vide (ou `echo ok`), Start Command `npm start`, offre Free.
4. Après le déploiement, Render donne une adresse en onrender.com : c'est le lien du jeu.

Note : en offre gratuite, le serveur se met en veille après un moment d'inactivité (premier chargement lent, environ 30 s). Les parties en cours sont gardées en mémoire : un redémarrage du serveur les efface.
