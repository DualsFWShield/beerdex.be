# Capacitor Widget Roadmap pour Beerdex

Ce document définit la roadmap pour l'intégration de widgets natifs (iOS et Android) dans la version Capacitor de Beerdex.

Une fois que le projet Capacitor (bridge natif) sera configuré, cette implémentation permettra d'exposer des données clés de l'application directement sur l'écran d'accueil du téléphone de l'utilisateur.

## Objectif
Afficher un widget récapitulatif contenant :
1. **Le taux d'alcoolémie actuel (BAC)**
2. **Le temps avant de repasser sous la limite légale**
3. **Le nombre de bières dégustées ce mois-ci**

## Plugins Recommandés

- **iOS** : `@niceshops/capacitor-ios-widget` ou via une intégration native custom avec WidgetKit.
- **Android** : `capacitor-widgetsbridge` ou équivalent permettant de mettre à jour le SharedPreferences d'Android depuis le code JS.

## Architecture Proposée

Puisque Beerdex est une architecture PWA encapsulée avec des données entièrement stockées en LocalStorage :

1. **Le Bridge Natif :**
   Créer un Service Worker ou utiliser Background Tasks Capacitor pour réveiller périodiquement le contexte et recalculer le BAC, car la courbe d'alcoolémie fluctue dans le temps sans action utilisateur.

2. **Côté JS (Beerdex) :**
   Dans le fichier `app.js` ou au moment de la mise à jour des statistiques de dégustation, l'app enverra la nouvelle donnée `state` au widget natif.

   ```javascript
   function updateWidgetData(bacValue, remainingTimeText, monthlyCount) {
       if (Capacitor.isPluginAvailable('WidgetBridge')) {
           WidgetBridge.setWidgetData({
               appWidgetId: 'beerdex_status',
               data: {
                   bac: bacValue.toFixed(2),
                   timeToSober: remainingTimeText,
                   monthly: monthlyCount
               }
           });
       }
   }
   ```

## Vue native (Design)

Le design du widget natif devra reprendre la même esthétique :
- **Dark Mode :** Fond `#111` ou effet glassmorphism (si natif).
- **Couleurs d'accent :** Doré (`#ffcc00`) pour les données importantes ou Rouge/Vert selon le niveau de BAC.

## Étapes d'implémentation futures

1. Cloner ou initialiser le dépôt Capacitor source de l'application Beerdex.
2. Installer le support Swift pour iOS / le support Kotlin pour Android.
3. Créer une Extension `AppWidgetProvider` sous Android et utiliser `WidgetKit` sous iOS (via Xcode).
4. Relier les appels JavaScript à la surcouche native pour rafraîchir les données.
5. Intégrer un bouton dans les paramètres de Beerdex "Activer le Widget en Live".
