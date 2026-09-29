/**
 * thanos_cleanup_official_dupes.js
 * 
 * Script Node.js pour nettoyer les doublons identifiés dans la base officielle.
 * 
 * Usage:
 *   node scripts/thanos_cleanup_official_dupes.js            (Mode simulation / dry-run)
 *   node scripts/thanos_cleanup_official_dupes.js --apply    (Applique la suppression avec backup)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as Thanos from '../js/thanos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const belgiumPath = path.join(rootDir, 'data', 'belgiumbeer.json');
const newbeerPath = path.join(rootDir, 'data', 'newbeer.json');

const isApply = process.argv.includes('--apply');

console.log('====================================================');
console.log('⚡ BeerDex — Thanos Official Catalog Cleaner');
console.log(`Mode: ${isApply ? '🚀 APPLICATION RÉELLE (--apply)' : '🔍 SIMULATION / DRY-RUN'}`);
console.log('====================================================\n');

if (!fs.existsSync(belgiumPath) || !fs.existsSync(newbeerPath)) {
    console.error('❌ Erreur: Les fichiers de base de données data/belgiumbeer.json ou data/newbeer.json sont introuvables.');
    process.exit(1);
}

const belgiumBeers = JSON.parse(fs.readFileSync(belgiumPath, 'utf8'));
const newBeers = JSON.parse(fs.readFileSync(newbeerPath, 'utf8'));

console.log(`📦 Fiches initiales :`);
console.log(`  - data/belgiumbeer.json : ${belgiumBeers.length} bières`);
console.log(`  - data/newbeer.json     : ${newBeers.length} bières`);
console.log(`  - Total catalogue       : ${belgiumBeers.length + newBeers.length} bières\n`);

const allOfficial = [...belgiumBeers, ...newBeers].filter(b => b && b.id && !String(b.id).startsWith('CUSTOM_'));
const duplicates = Thanos.findCatalogDuplicatesFast(allOfficial, 80);

console.log(`🎯 Doublons détectés par Thanos (similarité >= 80%) : ${duplicates.length}\n`);

const deleteIds = new Set(duplicates.map(d => d.customBeer.id));

console.log('--- Top 10 des suppressions identifiées ---');
duplicates.slice(0, 10).forEach((d, idx) => {
    console.log(`${idx + 1}. [${d.score}%] 🗑️ Supprimer: "${d.customBeer.title}" (${d.customBeer.id})`);
    console.log(`         ✨ Conserver: "${d.officialBeer.title}" (${d.officialBeer.id})\n`);
});

if (duplicates.length > 10) {
    console.log(`... et ${duplicates.length - 10} autres doublons identifiés.\n`);
}

if (!isApply) {
    console.log('💡 Pour appliquer réellement les suppressions et sauvegarder les fichiers nettoyés, lancez :');
    console.log('   node scripts/thanos_cleanup_official_dupes.js --apply\n');
    process.exit(0);
}

// Backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(rootDir, 'data', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

fs.writeFileSync(path.join(backupDir, `belgiumbeer.pre_thanos_${timestamp}.json`), JSON.stringify(belgiumBeers, null, 2), 'utf8');
fs.writeFileSync(path.join(backupDir, `newbeer.pre_thanos_${timestamp}.json`), JSON.stringify(newBeers, null, 2), 'utf8');
console.log(`💾 Sauvegarde de secours créée dans data/backups/`);

// Filter out deleted IDs
const cleanBelgium = belgiumBeers.filter(b => !deleteIds.has(b.id));
const cleanNew = newBeers.filter(b => !deleteIds.has(b.id));

fs.writeFileSync(belgiumPath, JSON.stringify(cleanBelgium, null, 2), 'utf8');
fs.writeFileSync(newbeerPath, JSON.stringify(cleanNew, null, 2), 'utf8');

console.log('\n✅ Nettoyage terminé avec succès !');
console.log(`  - belgiumbeer.json : ${belgiumBeers.length} → ${cleanBelgium.length} (-${belgiumBeers.length - cleanBelgium.length})`);
console.log(`  - newbeer.json     : ${newBeers.length} → ${cleanNew.length} (-${newBeers.length - cleanNew.length})`);
console.log(`  - Total supprimé   : ${deleteIds.size} doublons supprimés.`);
console.log('====================================================\n');
