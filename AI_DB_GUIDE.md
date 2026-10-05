# 📚 AI Database Guide : Ajouter une bière

Ce guide explique comment insérer correctement une nouvelle bière dans la base de données principale de BeerDex (`data/belgiumbeer.json`).

Il est crucial de respecter ce schéma exact pour ne pas casser l'interface utilisateur, la recherche ou le scanner.

---

## 🏗️ Schéma JSON d'une Bière

Chaque bière est un objet JSON contenu dans le tableau principal de `belgiumbeer.json`. 

Voici la structure exacte et les types attendus :

```json
{
  "title": "CARA PILS",               // (String) MAJUSCULES fortement recommandées.
  "brewery": "EVERYDAY (COLRUYT)",    // (String) Nom de la brasserie en MAJUSCULES.
  "type": "Pils",                     // (String) Ex: Blonde, Brune, Ambrée, Blanche, Rouge / Fruit, IPA, Stout, Pils.
  "volume": "0.33 L",                 // (String) Format strict: "X.XX L" (avec un espace avant le L majuscule).
  "alcohol": "4.4°",                  // (String) Format: "X.X°" (avec le symbole degré à la fin).
  "id": "CARA_PILS_PILS_0.33",        // (String|null) Règle: TITLE_TYPE_VOLUME avec des underscores à la place des espaces. Peut être null si inconnu.
  "image": "images/beer/be/cara.png", // (String) Chemin relatif vers l'image. Chaîne vide `""` si pas d'image.
  "production_volume": "Industrielle",// (String) "Industrielle", "Régionale", ou "Micro-brasserie".
  "distribution": "Supermarché",      // (String) Ex: "Supermarché", "Partout", "Cavistes spécialisés", "Horeca".
  "barrel_aged": false,               // (Boolean) true si vieillie en fût, false sinon.
  "community_rating": 2.0,            // (Number) Note moyenne sur 5 (Float ou Int).
  "ingredients": "Maïs/Standard",     // (String) Ingrédient principal ou "Standard".
  "rarity_rank": "Base",              // (String) "Base", "Commun", "Rare", "Super Rare", "Epique", "Mythique", "Legendaire", "Ultra Legendaire", "Saisonniere".
  "barcode": "5412186003013"          // (String) Optionnel. Code-barres EAN13 pour le scanner.
}
```

---

## 🛠️ Règles d'insertion (À respecter absolument)

1. **L'ID est la clé primaire** : Si tu dois mettre à jour une bière, cherche son `id`. Lors de la création, génère un ID unique propre (idéalement `NOM_TYPE_VOLUME`). Remplace les espaces de l'ID par des underscores (`_`). Ne mets pas l'unité "L" dans l'ID.
2. **Symbole Degré (°) obligatoire** : Le champ `alcohol` doit se terminer par le symbole `°` (ex: `8.5°`). Si c'est sans alcool, écrire `0°`.
3. **Espace dans le Volume** : Le champ `volume` doit toujours s'écrire avec l'unité séparée par un espace (ex: `0.33 L`, `20 L`, `0.75 L`).
4. **Code-barres (Barcode)** : S'il est fourni par l'utilisateur ou disponible (ex: OpenFoodFacts), ajoute-le impérativement. C'est ce qui permet au scanner hors-ligne instantané de matcher la bière !
5. **Rarity Rank** : Ce champ détermine l'animation visuelle de la carte (effet holographique, etc.). 
   - `Base` : Pas d'effet.
   - `Commun` : Petit effet brillant.
   - `Rare` : Effet doré/argenté marqué.
   - `Super Rare` : Animations holographiques premium.
   - `Epique` : Reflets violets dynamiques.
   - `Mythique` : Effet rouge/noir intense.
   - `Legendaire` : Puissantes vagues dorées/orangées.
   - `Ultra Legendaire` : Animation arc-en-ciel / dégradé époustouflant.
   - `Saisonniere` : Effet thématique.
6. **Référencement de la brasserie (`data/breweries.json`)** : 
   - Chaque brasserie DOIT être référencée dans `data/breweries.json` avec son nom, sa province et son code pays (ex: `{"name": "BRASSERIE DE NAMUR", "province": "NAM", "country": "BE"}`).
   - C'est ce fichier qui permet à `enrichBeerMetadata` d'associer la bière à sa région sur la carte zythologique (`js/map.js`) et aux filtres géographiques.
7. **Organisation et Nommage des Images (`images/beer/`)** :
   - Ranger l'image dans le sous-dossier adéquat : `images/beer/be/` (Belgique), `images/beer/world/` (International), ou les sous-dossiers spécifiques (`fr/`, `de/`, `nl/`, `us/`, `co/`).
   - Nommer le fichier en minuscules kebab-case : `[brasserie]-[nom-biere]-[volume].[ext]` (ex: `houppe-classic-33cl.jpg`, `soultrip-triple-blonde-33cl.png`).
   - Aucun espace, ni accent, ni majuscule dans les noms de fichiers.
   - Si les images sont temporairement dans `images/beer/notadded/`, les renommer et les copier/déplacer dans leur dossier cible.

---

## 🚀 Comment ajouter la bière (Procédure IA)
1. Demande confirmation des données à l'utilisateur (ou complète les champs avec des données réalistes et documentées).
2. Vérifie dans `data/belgiumbeer.json` que la bière (ou le code-barres) n'existe pas déjà.
3. Vérifie si la brasserie existe dans `data/breweries.json`. Si elle est absente, ajoute-la avec son code province et pays.
4. Prépare, renomme proprement et place l'image dans `images/beer/be/` ou `images/beer/world/`.
5. Injecte le nouveau bloc JSON à la fin du fichier `data/belgiumbeer.json` (juste avant le `]` final). Fais bien attention à la virgule de l'objet précédent !
6. Valide la syntaxe JSON de `belgiumbeer.json` et `breweries.json`.
7. Ajoute un mot dans `AI_FORUM.md` pour informer les autres assistants des ajouts réalisés.
