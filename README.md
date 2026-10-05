# 🍺 Beerdex

> **Attrapez-les toutes... les bières !**
> Le compagnon ultime pour tout zythologue en quête de collection.

![Beerdex Banner](icons/logo-bnr.png)

## 📖 À propos

Vous ne vous souvenez plus si vous avez déjà goûté cette IPA artisanale au fond du frigo ? Vous voulez garder une trace de chaque pépite dégustée lors de vos voyages ? Bienvenue sur **Beerdex**, le premier "Pokedex" entièrement dédié à l'univers de la bière.

Beerdex est une Progressive Web App (PWA) gratuite, respectueuse de la vie privée (données locales uniquement) et fonctionnant intégralement hors ligne.

---

## ✨ Fonctionnalités

### 🍺 A. Le Dex & La Collection (L'esprit Pokédex)
*   **Base de Données Massive** : Des milliers de références belges, françaises, allemandes et internationales méticuleusement documentées (degrés, styles, brasseries, volumes, ingrédients, calories, notes de dégustation).
*   **Système de Rareté & Reveal Card** : Animation de révélation holographique façon cartes à collectionner TCG (Pokémon/Hearthstone) basée sur la rareté (`Base`, `Commun`, `Rare`, `Super Rare`, `Épique`, `Mythique`, `Légendaire`, `Ultra Légendaire`).
*   **Rareté Dynamique d'Import** : Calcul intelligent qui adapte la rareté des bières importées selon votre pays d'origine !
*   **Vues Multiples & Recherche Magique** :
    *   Bascule instantanée entre affichage en Grille (Grid) et en Liste (List).
    *   Recherche magique ultra-réactive (s'ouvre et filtre automatiquement dès que vous tapez au clavier sur PC).
    *   Filtres multi-critères par style (Trappiste, IPA, Stout, Pils, Fruitée, etc.), brasserie, pays, rareté et statut de dégustation.
*   **Mode Découverte** : Possibilité de masquer les bières non encore dégustées pour gamifier votre collection.

### 📝 B. Dégustation, Notation & Arômes
*   **Ajout Rapide en 1 Clic** : Enregistrement de dégustation instantané avec sélection du volume (25cl, 33cl, pinte, personnalisé).
*   **Fiche de Dégustation Complète** : Note sur 20, commentaires personnalisés et historique précis.
*   **Roue des Saveurs Interactive (Aroma Wheel)** : Décomposez le profil aromatique (agrumes, torréfaction, épices, fruits exotiques...) pour un ressenti zythologique précis.
*   **Bières Personnalisées (Custom)** : Créez et intégrez manuellement n'importe quelle micro-cuvée locale introuvable dans la base.

### 📷 C. Scanner Hybride & Hors-Ligne
*   **Scanner Code-barres Instantané** : Détection caméra ultra-rapide via `Html5Qrcode` (avec sélection automatique du capteur arrière).
*   **Recherche Locale en Cache** : Réponse immédiate 100% hors-ligne grâce à la base de données locale EAN13.
*   **Fallback Hybride Silencieux** : En cas de code-barres inconnu, interrogation d'OpenFoodFacts pour préremplir automatiquement la fiche.

### 🎮 D. Gamer Mode & BAC IRL (Taux d'Alcoolémie)
*   **Calculateur Métabolique Précis** : Estimation en direct du taux d'alcoolémie dans le sang (g/L) selon le sexe, le poids et le métabolisme.
*   **Statistiques IRL Gamifiées** : Vos capacités traduites en direct en statistiques de jeu vidéo :
    *   *Ping* : Temps de réaction ralenti.
    *   *FPS* : Baisse de fluidité motrice.
    *   *Aim Assist* : Perte de précision.
    *   *FOV (Field of View)* : Rétrécissement du champ visuel.
*   **Rangs Compétitifs** : Évolution de votre rang (de *Wood Division* à *Global Elite*).
*   **Streaks & Sécurité** : Suivi des séries (jours consécutifs de dégustation OU de sobriété) et calcul précis du temps d'attente avant de pouvoir reconduire.

### 🗺️ E. Carte Zythologique Interactive (Maps)
*   **Exploration Géographique** : Cartographie interactive par régions et provinces (Belgique, France, Allemagne, Pays-Bas, USA, Colombie, etc.).
*   **Découverte Régionale** : Localisation des brasseries artisanales et suivi du pourcentage de complétion par terroir.

### 📚 F. Beerpedia (L'Encyclopédie de la Bière)
*   Un compendium intégré dédié à la zythologie : histoire des styles, méthodes de fermentation, guides des verres adaptés et lexique brassicole.

### 📊 G. Statistiques, Heatmap & Wrapped
*   **Dashboard & Calendrier Heatmap** : Visualisation chronologique de votre consommation façon contributions GitHub.
*   **Équivalences Ludiques** : Suivi du volume total consommé (en litres, fûts ou... baignoires !).
*   **Système d'Achievements** : Plus de 100 succès et trophées à débloquer au fil de vos dégustations.
*   **Beerdex Wrapped** : Rétrospective annuelle interactive et musicale façon Spotify Wrapped pour revivre vos temps forts zythologiques.

### 🖼️ H. Générateur de Posters de Collection
*   **Posters Haute Définition** : Génération de posters de votre collection (`poster-classic.html` et `poster-museum.html`) prêts à être imprimés ou exposés.

### 🔄 I. Sauvegarde, Partage & Synchronisation P2P
*   **100% Hors-Ligne & Respect de la Vie Privée** : Zéro compte obligatoire, zéro tracking, données hébergées localement (`localStorage`).
*   **Synchronisation Sans Contact (OTA / P2P)** : Échange direct en pair-à-pair entre appareils sans passer par un serveur tiers.
*   **Partage Social & Stories** : Génération d'images élégantes pour Instagram/Snapchat et liens magiques d'import.
*   **Import / Export Avancé** : Sauvegarde JSON complète ou sélective pour transférer votre profil en toute sérénité.

---

## 🛠️ Stack Technique

Ce projet est réalisé **sans aucun framework** (No React, No Vue, No Build Step). Juste du code pur pour une performance maximale et une maintenance minimale.

*   **Langages** : HTML5, CSS3 (Variables, Flexbox, Grid), JavaScript (ES6+ Modules).
*   **Stockage** : LocalStorage.
*   **Iconographie** : SVG Inline (pour réduire les requêtes).
*   **PWA** : Service Worker personnalisé (Cache First strategy + Network Fallback).

## 🚀 Installation

### En tant qu'utilisateur
1.  Visitez l'URL du projet (ex: `https://votre-domaine.com`).
2.  Cliquez sur "Installer" dans la barre d'adresse ou le menu du navigateur.
3.  Profitez !

### Pour les développeurs
1.  Clonez ce dépôt.
2.  Ouvrez `index.html` dans votre navigateur.
    *   *Note : Pour que le Service Worker (PWA) fonctionne, il est préférable d'utiliser un serveur local simple (ex: Live Server sur VSCode ou `python -m http.server`).*

## 🤝 Contribuer

Les contributions sont les bienvenues ! Pour ajouter de nouvelles bières à la base de données :
1. Consultez le guide dédié aux ajouts : **[AI_DB_GUIDE.md](AI_DB_GUIDE.md)**.
2. Ajoutez l'entrée dans `data/belgiumbeer.json` (ou le fichier régional adéquat dans `data/`).
3. Vérifiez et ajoutez la brasserie dans `data/breweries.json` avec sa province et son pays.
4. Placez l'image de la bière dans le dossier approprié (`images/beer/be/`, `images/beer/world/`, etc.) avec un nom au format `[brasserie]-[biere]-[volume].[ext]`.
5. Proposez une Pull Request.

## 📄 Licence

Distribué sous la licence MIT. Voir `LICENSE` pour plus d'informations.
Créé avec ❤️ et 🍺 par **DualsFWShield**.

---

## 🔌 API & URL Scheme

Beerdex expose une API via URL pour permettre l'automatisation (Raccourcis iOS, Tasker) et le partage profond.

### Schéma Global
`https://beerdex.dualsfwshield.be/?action=[ACTION]&param=value...`

### 1. Action : Import / Add
Importer des données (bières ou notes) via une chaîne compressée.

*   **Paramètres** :
    *   `action=import` ou `action=add` (alias).
    *   `data` : Chaîne JSON compressée via LZString (Base64).
    *   `download` : `true` pour télécharger un fichier `.json` au lieu d'importer directement.

### 2. Action : Export
Déclencher une sauvegarde ou générer un lien de partage.

*   **Paramètres** :
    *   `action=export`
    *   `scope` :
        *   `all` (Défaut) : Tout (Notes + Bières Custom).
        *   `custom` : Uniquement les bières créées manuellement.
        *   `ratings` : Uniquement les notes et l'historique.
    *   `mode` :
        *   `file` (Défaut) : Télécharge un fichier `beerdex_export.json`.
        *   `url` : Copie un lien magique d'import dans le presse-papier.
    *   `ids` : Liste d'IDs séparés par des virgules (ex: `1,15,42`) pour filtrer l'export.

### 3. Action : Share
Générer la "Beer Card" (image Instagram) pour une bière spécifique.

*   **Paramètres** :
    *   `action=share`
    *   `id` : ID de la bière (Requis).
    *   `score` : (Optionnel) Force une note pour l'image.
    *   `comment` : (Optionnel) Force un commentaire.
    *   `fallback=true` : Affiche un lien partageable si la génération d'image échoue.

### Structure des Données (JSON)
Le format d'échange est un tableau d'objets ou un objet clé/valeur selon le contexte, contenant :
*   `id` : Identifiant unique.
*   `title`, `brewery`, `degree` : Données statiques.
*   `user_data` : Objet contenant `rating`, `comment`, `history` (tableau de dates/volumes).

### 🚀 Exemples Rapides (Liens Directs)
Ces liens peuvent être utilisés comme raccourcis favoris :

**Sauvegardes (Fichier)**
*   **[💾 Complète (Tout)](https://beerdex.dualsfwshield.be/?action=export)** : `?action=export`
*   **[🍺 Bières Custom Uniquement](https://beerdex.dualsfwshield.be/?action=export&scope=custom)** : `?action=export&scope=custom`
*   **[📝 Notes & Historique Uniquement](https://beerdex.dualsfwshield.be/?action=export&scope=ratings)** : `?action=export&scope=ratings`

**Partage (Lien Cloud)**
*   **[🔗 Lien Magique (Tout)](https://beerdex.dualsfwshield.be/?action=export&mode=url)** : `?action=export&mode=url`
*   **[🔗 Lien Magique (Bières Custom)](https://beerdex.dualsfwshield.be/?action=export&scope=custom&mode=url)** : `?action=export&scope=custom&mode=url`
