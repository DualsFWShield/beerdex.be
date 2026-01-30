const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '../js/ui.js');
console.log('Target:', target);

if (!fs.existsSync(target)) {
    console.error('File not found!');
    process.exit(1);
}

const raw = fs.readFileSync(target, 'utf8');

// Win1252 Map (0x80 - 0x9F)
const map = {
    0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
    0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
    0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
    0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
};
// 81, 8D, 8F, 90, 9D are holes/undefined in Win1252.

function recover(str) {
    const buf = Buffer.alloc(str.length);
    let pos = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        let b = c;
        if (c >= 256) {
            b = map[c] || 0x3F; // Map or '?'
        }
        buf[pos++] = b;
    }
    return buf.slice(0, pos).toString('utf8');
}

let fixed = recover(raw);
console.log('Algorithmic recovery completed.');

// --- Specific Fixes ---

// 1. Fix line 399 Syntax (ensure backtick for template literal)
const createBlockSig = 'if (showCreatePrompt && isDiscoveryCallback) {';
if (fixed.includes(createBlockSig)) {
    // Find the line with innerHTML
    const part = fixed.split(createBlockSig)[1];
    const innerHTMLMatch = part.match(/container\.innerHTML\s*=\s*(.*)/);
    if (innerHTMLMatch) {
        // We construct the correct block entirely to be safe
        const oldBlockStart = fixed.indexOf(createBlockSig) + createBlockSig.length;
        const nextClose = fixed.indexOf('return;', oldBlockStart);
        if (nextClose !== -1) {
            const badSection = fixed.slice(oldBlockStart, nextClose);

            // Check if we need to patch
            // We'll replace the innerHTML assignment with the known correct one.
            // This uses the correct Emoji ➕ and Text.
            const correctHTML = `
            container.innerHTML = \`
                <div style="text-align:center; padding: 40px 20px;">
                    <p style="color: #888; margin-bottom: 20px;">La bière n'existe pas encore...</p>
                    <button id="btn-create-discovery" class="btn-primary" style="background:var(--accent-gold); color:var(--bg-dark);">
                        ➕ Créer cette bière
                    </button>
                </div>\`;
            document.getElementById('btn-create-discovery').onclick = isDiscoveryCallback;
            `;

            // We replace strictly from 'container.innerHTML' to 'isDiscoveryCallback;'
            const startPatch = fixed.indexOf('container.innerHTML', oldBlockStart);
            const endPatch = fixed.indexOf('isDiscoveryCallback;', oldBlockStart) + 'isDiscoveryCallback;'.length;

            if (startPatch !== -1 && endPatch !== -1) {
                fixed = fixed.slice(0, startPatch) + correctHTML.trim() + fixed.slice(endPatch);
                console.log('Fixed "Create" block syntax and emoji.');
            }
        }
    }
}

// 2. Fix 'Recherche Approfondie' (Line ~429) - Fixes 🌍 (0x8D hole)
const searchApiSig = 'id="btn-search-api"';
if (fixed.includes(searchApiSig)) {
    // We expect garbage like 'ðŸŒ?' or '🌍' (if lucky)
    // We'll just replace the button content text
    // Regex for the button text
    const oldTextRegex = /Recherche Approfondie \(OFF API\)/;
    if (oldTextRegex.test(fixed)) {
        // Find line content
        // Hard replace the emoji part
        const searchPatch = `🌍 Recherche Approfondie (OFF API)`;
        // Since we don't know exactly what the garbage looks like, we locate the button and replace nearby text
        // or just replace 'ðŸŒ? Recherche' or '? Recherche'
        // Simpler: Replace the known surrounding substring
        const targetStr = 'Recherche Approfondie (OFF API)';
        const idx = fixed.indexOf(targetStr);
        if (idx !== -1) {
            // Look backwards for the emoji/garbage
            // likely: >\n                        ? Recherche...
            // We will try to replace the line content
            const pre = fixed.lastIndexOf('>', idx);
            if (pre !== -1) {
                // Replace from '>' to 'Recherche...'
                // Actually this is risky.
                // Let's replace the common unique line parts
                const textToReplace = 'class="btn-primary" style="margin-top:15px; background:var(--accent-gold); color:black;">';
                const replaceWith = textToReplace + '\n                        🌍 Recherche Approfondie (OFF API)';
                // And cut out the old garbage line?
                // No, that replaces the previous line logic.

                // Alternative: Just replace 'Recherche Approfondie' with '🌍 Recherche Approfondie' and assume garbage is stripped by recover?
                // '?' (0x3F) + ' '
                // Let's search for '? Recherche' or similar artifacts
                fixed = fixed.replace(/\?\s*Recherche Approfondie/, '🌍 Recherche Approfondie');
                fixed = fixed.replace(/ðŸŒ\?\s*Recherche Approfondie/, '🌍 Recherche Approfondie');
                console.log('Patched Earth Emoji.');
            }
        }
    }
}

// 3. Fix 'Rien trouvé' (Line ~446) - Fixes ❌ (0x9D hole)
if (fixed.includes('Rien trouvé...')) {
    fixed = fixed.replace(/>\s*\?\s*Rien trouvé.../, '> ❌ Rien trouvé...');
    fixed = fixed.replace(/>\s*ðŸ\?\s*Rien trouvé.../, '> ❌ Rien trouvé...');
    // Generic
    fixed = fixed.replace(/btn\.innerHTML\s*=\s*['"`].*Rien trouvé\.\.\./, "btn.innerHTML = '❌ Rien trouvé...'");
    console.log('Patched X Emoji.');
}

fs.writeFileSync(target, fixed, 'utf8');
console.log('File saved successfully.');
