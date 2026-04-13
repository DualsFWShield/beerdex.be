# 🍺 Beerdex

> **Attrapez-les toutes... les bières !**
> Le compagnon ultime pour tout zythologue en quête de collection.

![Beerdex Banner](icons/logo-bnr.png)

## 📖 À propos

Vous ne vous souvenez plus si vous avez déjà goûté cette IPA artisanale au fond du frigo ? Vous voulez garder une trace de chaque pépite dégustée lors de vos voyages ? Bienvenue sur **Beerdex**, le premier "Pokedex" entièrement dédié à l'univers de la bière.

Beerdex est une Progressive Web App (PWA) gratuite, respectueuse de la vie privée (données locales uniquement) et fonctionnant intégralement hors ligne.

---

## ✨ Fonctionnalités

### 🔍 REMPLISSEZ VOTRE BEERDEX
*   **Capturez vos dégustations** : Scannez, répertoriez et collectionnez chaque bouteille, canette ou pression grâce au scanner intégré (Open Food Facts).
*   **Mode Découverte** : Gamifiez votre expérience en cachant les bières que vous n'avez pas encore débusquées.
*   **Fiches Détaillées** : Notez l'amertume (IBU), le degré d'alcool, le style, les calories et vos impressions personnelles.

### 🛡️ SÉCURITÉ & SÉRIEUX
*   **Calculateur d'Alcoolémie** : Suivez votre taux (g/L) estimé en temps réel selon votre profil (poids/sexe).
*   **Indicateur de Conduite** : Sachez précisément combien de temps vous devez attendre avant de reprendre le volant en toute sécurité.
*   **Réglementation Locale** : Adaptation automatique des seuils de sanction (France, Belgique, US, etc.).

### 📊 STATISTIQUES & RÉCAP
*   **Tableau de Bord** : Visualisez votre volume total bu (en litres... ou en baignoires !).
*   **Beerdex Wrapped** : Vivez votre propre récapitulatif annuel pour découvrir vos styles et brasseries préférés.
*   **Succès & Rangs** : Plus de 100 succès à débloquer pour passer de "Novice" à "Légende".

### 🌍 GLOBAL & ACCESSIBLE
*   **Multilingue** : Entièrement traduit en **Français** et en **Anglais**.
*   **No Framework** : Construit sans dépendance lourde pour une vitesse de chargement instantanée (même sur vieux mobiles).
*   **Local First** : Vos données vous appartiennent et ne quittent jamais votre téléphone.

### 💾 Données & Vie Privée
*   **Local First** : Toutes les données sont stockées dans votre navigateur (IndexedDB/LocalStorage).
*   **Import/Export Avancé** :
    *   **Sauvegarde Fichier** : Export complet ou partiel (Bières perso, notes...) en JSON.
    *   **Lien Magique** : Transférez vos données vers un autre appareil via un simple lien URL.
*   **Partage Social** :
    *   Générez des stories Instagram personnalisées avec vos notes.
    *   Partagez des liens directs vers vos bières préférées.

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

Les contributions sont les bienvenues ! Pour ajouter de nouvelles bières à la base de données statique :
1.  Ajoutez l'entrée dans le fichier JSON correspondant dans `data/`.
2.  Ajoutez l'image dans `images/beer/`.
3.  Proposez une Pull Request.

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
*   **[� Notes & Historique Uniquement](https://beerdex.dualsfwshield.be/?action=export&scope=ratings)** : `?action=export&scope=ratings`

**Partage (Lien Cloud)**
*   **[🔗 Lien Magique (Tout)](https://beerdex.dualsfwshield.be/?action=export&mode=url)** : `?action=export&mode=url`
*   **[🔗 Lien Magique (Bières Custom)](https://beerdex.dualsfwshield.be/?action=export&scope=custom&mode=url)** : `?action=export&scope=custom&mode=url`
