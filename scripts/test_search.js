const https = require('https');

function testSearch(query) {
    const page = 1;
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&tagtype_0=categories&tag_contains_0=contains&tag_0=beers&json=1&page=${page}&page_size=24`;

    console.log(`Testing URL: ${url}`);

    https.get(url, { headers: { 'User-Agent': 'Beerdex-Test/1.0' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log(`Status: ${res.statusCode}`);
                console.log(`Count: ${json.count}`);
                console.log(`Products: ${json.products ? json.products.length : 0}`);
                if (json.products && json.products.length > 0) {
                    console.log(`First product: ${json.products[0].product_name}`);
                }
            } catch (e) {
                console.error("Error parsing JSON", e);
                console.log("Raw Data preview:", data.substring(0, 200));
            }
        });
    }).on('error', (err) => {
        console.error("Error:", err.message);
    });
}

testSearch('Chimay');
