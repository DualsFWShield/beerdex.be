# AI Guide for BeerDex

## 🧠 1. L'esprit de l'App (Philosophy & Vibe)
BeerDex n'est pas juste un "carnet de notes pour bières". C'est le **Pokédex de la bière**. 
L'application mélange le monde de la zythologie (l'étude de la bière) avec la **gamification** et l'univers du jeu vidéo.
- **Le ressenti utilisateur (UX)** doit être magique, rapide, fluide, et donner envie de collectionner. L'interface est "premium" (dark mode profond, accents dorés, glassmorphism, animations fluides).
- **L'humour et le gaming** : L'app intègre des concepts comme les "Streaks", les "Rangs compétitifs" (Global Elite, Wood Division), et les "Statistiques IRL" (Ping, FPS, Aim Assist impactés par le taux d'alcoolémie).
- **La vie privée et l'autonomie** : Tout fonctionne **hors-ligne** et **localement**. Aucune donnée personnelle n'est envoyée sur des serveurs tiers. Tout reste sur le téléphone de l'utilisateur via le `localStorage` et le cache du Service Worker.

---

## 🚫 2. Règles sur la Technologie (Strict)
L'application est construite autour d'un principe de **zéro build system**. 
En tant qu'IA, tu dois respecter ces règles absolues sous peine de casser l'architecture :
1. **PAS de npm, pas de package.json, pas de node_modules.**
2. **PAS de frameworks complexes** (Ni React, ni Vue, ni Angular, ni Svelte, ni TailwindCSS).
3. **PAS de TypeScript, ni de Babel, ni de Webpack/Vite**.
4. **JavaScript** : Utilisation exclusive de **Vanilla JavaScript (ES6+)** avec des **ES Modules** natifs (`<script type="module">`). Les imports se font par chemins relatifs (ex: `import { ... } from './storage.js'`).
5. **CSS** : Utilisation exclusive de **Vanilla CSS3**. Toutes les couleurs et thèmes doivent utiliser les **Variables CSS** définies dans `style.css` (ex: `var(--accent-gold)`).
6. **Stockage** : Tout passe par `localStorage` via un fichier unique de gestion : `js/storage.js`. Ne jamais utiliser `localStorage.getItem` dans les autres fichiers.
7. **HTML / UI** : L'interface est générée dynamiquement via des **Template Literals** (` `` `) dans `js/ui.js` et injectée dans le DOM (`innerHTML`, `createElement`).
8. **Dépendances tierces** : Si une librairie externe est absolument nécessaire (ex: `Html5Qrcode`, `Chart.js`, `VanillaTilt`), elle est chargée via CDN ou placée manuellement dans `js/vendor/`.

---

## 📋 3. Liste Détaillée des Fonctionnalités

### 🍺 A. Le Cœur (La Collection)
- **Bibliothèque (Le "Dex")** : Affichage d'une base de données massive de bières belges (et internationales).
- **Vues Multiples** : Bascule entre vue en Grille (Grid) et vue en Liste (List).
- **Recherche & Filtres Avancés** : 
  - Recherche "magique" (s'ouvre automatiquement dès qu'on tape sur PC).
  - Filtres par type (Trappiste, IPA, Stout...), brasserie, pays, rareté, et bières non-goûtées/favoris.
- **Fiches de Bières Détaillées** : 
  - Animation de "Reveal" (type carte Pokémon/Hearthstone) basée sur la rareté (Commun, Rare, Légendaire, etc.).
  - Informations : Taux d'alcool (ABV), Calories, Fermentation, Ingrédients, etc.

### 📝 B. Dégustation et Notation
- **Ajout de Consommation** : Un bouton "Boire" pour ajouter une consommation en 1 clic. Possibilité de choisir le volume (25cl, 33cl, pinte, personnalisée).
- **Formulaire de Notation** : Note sur 20, roue des saveurs (Aroma Wheel) pour le ressenti, commentaires personnalisés.
- **Ajout Manuel** : Création de bières "Custom" si elles n'existent pas dans la base de données.

### 📷 C. Scanner Hors-Ligne & En Ligne
- Scanner de code-barres ultra-rapide (`Html5Qrcode`) avec sélection automatique de la caméra arrière.
- **Fallback Hybride** : Le code-barres est d'abord cherché dans la base de données locale JSON. S'il n'y est pas, l'app interroge silencieusement l'API OpenFoodFacts pour récupérer les données et créer la bière.

### 🎮 D. Gamer Mode & BAC (Blood Alcohol Content)
- **Calcul d'Alcoolémie Temps Réel** : Estimation du taux dans le sang (g/L) basé sur le sexe et le poids configurés.
- **Permis & Conduite** : Indicateur de temps restant avant de redescendre sous la limite légale pour conduire.
- **Stats IRL** : Traduction du taux d'alcoolémie en statistiques de jeu-vidéo :
  - *Ping* : Temps de réaction ralenti.
  - *FPS* : Baisse de fluidité motrice.
  - *Aim Assist* : Perte de précision.
  - *FOV (Field of View)* : Rétrécissement du champ visuel.
- **Rang Compétitif** : Le grade de l'utilisateur évolue en fonction de ce qu'il a bu dans les dernières heures.
- **Streaks** : Suivi des jours consécutifs de consommation, OU des jours consécutifs de sobriété (au choix de l'utilisateur).

### 📈 E. Historique & Statistiques
- **Historique Complet** : Liste chronologique de toutes les bières bues avec l'heure exacte.
- **Calendrier Heatmap** : Un calendrier (façon GitHub contributions) montrant les jours de consommation intense en rouge/doré.
- **Interactivité** : Cliquer sur un élément de l'historique ou du calendrier ouvre directement la fiche de la bière.

### 🏆 F. Progression & Social
- **Système d'Achievements (Succès)** : Des dizaines de badges à débloquer en atteignant des paliers secrets (ex: boire 5 Trappistes, atteindre 1.5 g/L, boire une bière rare).
- **Partage Social** : Boutons de partage vers Instagram/Snapchat avec génération d'images contenant le verre, la note et les stats.
- **BeerDex Wrapped** : Un diaporama musical de fin d'année résumant les statistiques annuelles de l'utilisateur (à la manière de Spotify Wrapped).

### 🌐 G. i18n & PWA
- **Multilinguisme complet** : Anglais et Français (via `fr.json` et `en.json`).
- **Support Hors-Ligne** : L'app s'installe sur le téléphone (PWA) et est 100% fonctionnelle sans réseau grâce au Service Worker (`sw.js`).
- **Sauvegarde / Export** : Génération d'un fichier JSON contenant tout le profil de l'utilisateur pour transférer ses données vers un autre appareil.

---

## 🛠️ 4. Organisation du Code source (Convention)

- **`js/app.js`** : Chef d'orchestre. Contient l'état de l'application (`const state = {}`), gère les changements de vue (`renderCurrentView`), le routage, et attache les événements globaux de navigation.
- **`js/ui.js`** : Usine à HTML. S'occupe de créer et manipuler le DOM. C'est ici que tu trouveras toutes les string templates (`<div class="beer-card">...</div>`) et les logiques de Modales (fenêtres pop-up).
- **`js/storage.js`** : Tout accès à `localStorage` DOIT passer par ici. Encapsule la lecture/écriture pour éviter les conflits et formater les données.
- **`js/data.js`** : Récupère et met en cache la base de données principale `belgiumbeer.json`. Gère la fusion entre les bières officielles et les bières custom de l'utilisateur.
- **`data/belgiumbeer.json`** : La base de données principale. **(Pour ajouter une bière, lis absolument le guide [AI_DB_GUIDE.md](file:///c:/Users/noah/OneDrive/Projects51c/beerdex.be/AI_DB_GUIDE.md))**
- **`js/bac.js`** : Logique mathématique complexe du métabolisme de l'alcool et des Stats Gamer.
- **`js/i18n.js`** : Outil de traduction dynamique. Remplace les balises `[data-i18n]` dans le DOM et permet d'appeler `i18n.t('cle')` en JavaScript.
- **CSS** : Utilise le préfixe `--` pour les variables CSS dans `style.css`. Pense "Mobile-First" mais assure-toi que les Modales et les grilles s'affichent correctement sur les grands écrans. Pense à gérer l'encoche des iPhones avec `env(safe-area-inset-top)`.

---

## 🤖 5. Le Forum des IAs (Communication Inter-IA)

Si tu viens d'arriver sur le projet ou que tu as terminé une tâche complexe, pense à faire un tour sur le **[Forum des IAs](file:///c:/Users/noah/OneDrive/Projects51c/beerdex.be/AI_FORUM.md)** (`AI_FORUM.md`). C'est un espace dédié où nous nous laissons des notes, des alertes de bugs, ou des idées pour les prochaines sessions. N'hésite pas à y ajouter tes propres retours d'expérience !
