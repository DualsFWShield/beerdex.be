/**
 * Beerdex Beer Match - Global Initializer
 * Called from app.js when user clicks "Beer Match" button
 */

import * as BeerMatch from './beermatch.js';
import * as UI from './ui.js';

export async function startBeerMatch(allBeers) {
    // Show import modal
    UI.renderBeerMatchImport(async (opponentData) => {
        try {
            // Import the opponent's profile
            const opponentProfile = BeerMatch.importOpponentProfile(opponentData);

            // Calculate match stats
            const matchStats = BeerMatch.calculateMatchStats(allBeers, opponentProfile);

            // Render results
            UI.closeModal();
            UI.renderBeerMatchResults(matchStats);

            UI.showToast('Match généré !', 'success');
        } catch (err) {
            console.error('[BeerMatch] Import failed:', err);
            UI.showToast(err.message || 'Erreur lors de l\'importation', 'error');
        }
    });
}
