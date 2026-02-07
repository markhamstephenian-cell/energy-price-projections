/**
 * Energy Price Projections - Backend Server
 * Coordinator: Luke Markham
 *
 * This server fetches real energy price data from multiple APIs
 * and serves it to the frontend application.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API Keys from environment variables
const EIA_API_KEY = process.env.EIA_API_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;

// Cache for API responses (5 minute TTL)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
    const item = cache.get(key);
    if (item && Date.now() - item.timestamp < CACHE_TTL) {
        return item.data;
    }
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ===== EIA API Integration =====
// Documentation: https://www.eia.gov/opendata/documentation.php
async function fetchEIAData(series) {
    if (!EIA_API_KEY) {
        console.log('EIA API key not configured, using fallback data');
        return null;
    }

    const cacheKey = `eia_${series}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        // EIA API v2 endpoints
        const endpoints = {
            'PET.RWTC.D': 'petroleum/pri/spt/data/?frequency=daily&data[0]=value&facets[series][]=RWTC&sort[0][column]=period&sort[0][direction]=desc&length=1',
            'NG.RNGWHHD.D': 'natural-gas/pri/sum/data/?frequency=daily&data[0]=value&facets[process][]=PNG&sort[0][column]=period&sort[0][direction]=desc&length=1',
            'COAL.PRICE': 'coal/markets/data/?frequency=weekly&data[0]=price&sort[0][column]=period&sort[0][direction]=desc&length=1'
        };

        const endpoint = endpoints[series];
        if (!endpoint) return null;

        const url = `https://api.eia.gov/v2/${endpoint}&api_key=${EIA_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.response && data.response.data && data.response.data.length > 0) {
            const result = {
                value: parseFloat(data.response.data[0].value),
                date: data.response.data[0].period,
                source: 'EIA'
            };
            setCache(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error('EIA API error:', error.message);
    }
    return null;
}

// ===== FRED API Integration =====
// Documentation: https://fred.stlouisfed.org/docs/api/fred/
async function fetchFREDData(series) {
    if (!FRED_API_KEY) {
        console.log('FRED API key not configured, using fallback data');
        return null;
    }

    const cacheKey = `fred_${series}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.observations && data.observations.length > 0) {
            const obs = data.observations[0];
            const result = {
                value: parseFloat(obs.value),
                date: obs.date,
                source: 'FRED'
            };
            setCache(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error('FRED API error:', error.message);
    }
    return null;
}

// ===== Our World in Data Integration =====
// Uses their GitHub-hosted data files (no API key needed)
async function fetchOWIDData(indicator) {
    const cacheKey = `owid_${indicator}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        // OWID provides LCOE data via their GitHub repository
        const url = 'https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.json';
        const response = await fetch(url);
        const data = await response.json();

        // Get USA data for the most recent year
        if (data.USA) {
            const years = Object.keys(data.USA).filter(k => !isNaN(k)).sort().reverse();
            const latestYear = years[0];
            const usaData = data.USA[latestYear] || data.USA;

            const result = {
                solar_lcoe: usaData.solar_electricity || 28,
                wind_lcoe: usaData.wind_electricity || 31,
                nuclear_lcoe: usaData.nuclear_electricity || 33,
                date: latestYear || new Date().getFullYear().toString(),
                source: 'Our World in Data'
            };
            setCache(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error('OWID API error:', error.message);
    }
    return null;
}

// ===== Yahoo Finance API (Unofficial - for commodities) =====
async function fetchYahooFinance(symbol) {
    const cacheKey = `yahoo_${symbol}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const data = await response.json();

        if (data.chart && data.chart.result && data.chart.result[0]) {
            const quote = data.chart.result[0].meta;
            const result = {
                value: quote.regularMarketPrice,
                date: new Date().toISOString().split('T')[0],
                source: 'Yahoo Finance'
            };
            setCache(cacheKey, result);
            return result;
        }
    } catch (error) {
        console.error('Yahoo Finance error:', error.message);
    }
    return null;
}

// ===== Fallback Data (current market estimates) =====
function getFallbackData(source) {
    const now = new Date().toISOString().split('T')[0];

    const fallbackPrices = {
        oil: { us: 74.50, world: 78.80, usUnit: '/barrel', worldUnit: '/barrel' },
        'natural-gas': { us: 3.15, world: 12.40, usUnit: '/MMBtu', worldUnit: '/MMBtu' },
        nuclear: { us: 31.00, world: 35.00, usUnit: '/MWh', worldUnit: '/MWh' },
        solar: { us: 28.00, world: 32.00, usUnit: '/MWh', worldUnit: '/MWh' },
        renewables: { us: 31.00, world: 36.00, usUnit: '/MWh', worldUnit: '/MWh' },
        coal: { us: 140.00, world: 120.00, usUnit: '/short ton', worldUnit: '/metric ton' }
    };

    return {
        ...fallbackPrices[source],
        date: now,
        source: 'Estimated (API keys not configured)',
        isFallback: true
    };
}

// ===== API Endpoints =====

// Get all energy prices for a specific source
app.get('/api/prices/:source', async (req, res) => {
    const { source } = req.params;
    console.log(`Fetching prices for: ${source}`);

    let usPrice = null;
    let worldPrice = null;
    let sources = [];

    try {
        switch (source) {
            case 'oil':
                // WTI Crude Oil
                const eiaOil = await fetchEIAData('PET.RWTC.D');
                const yahooOil = await fetchYahooFinance('CL=F');
                const yahooBrent = await fetchYahooFinance('BZ=F');

                if (eiaOil) {
                    usPrice = { value: eiaOil.value, date: eiaOil.date, source: eiaOil.source };
                    sources.push('EIA');
                } else if (yahooOil) {
                    usPrice = { value: yahooOil.value, date: yahooOil.date, source: yahooOil.source };
                    sources.push('Yahoo Finance');
                }

                if (yahooBrent) {
                    worldPrice = { value: yahooBrent.value, date: yahooBrent.date, source: yahooBrent.source };
                    sources.push('Yahoo Finance (Brent)');
                }
                break;

            case 'natural-gas':
                // Henry Hub Natural Gas
                const eiaNatGas = await fetchEIAData('NG.RNGWHHD.D');
                const yahooNatGas = await fetchYahooFinance('NG=F');

                if (eiaNatGas) {
                    usPrice = { value: eiaNatGas.value, date: eiaNatGas.date, source: eiaNatGas.source };
                    sources.push('EIA');
                } else if (yahooNatGas) {
                    usPrice = { value: yahooNatGas.value, date: yahooNatGas.date, source: yahooNatGas.source };
                    sources.push('Yahoo Finance');
                }

                // World LNG prices (estimated multiplier from Henry Hub)
                if (usPrice) {
                    worldPrice = {
                        value: usPrice.value * 3.5, // LNG typically trades at premium
                        date: usPrice.date,
                        source: 'Calculated from US price'
                    };
                }
                break;

            case 'nuclear':
                // Nuclear LCOE from OWID
                const owidNuclear = await fetchOWIDData('nuclear');
                const fredUranium = await fetchFREDData('PURANUSDM');

                if (owidNuclear) {
                    usPrice = { value: owidNuclear.nuclear_lcoe, date: owidNuclear.date, source: owidNuclear.source };
                    worldPrice = { value: owidNuclear.nuclear_lcoe * 1.1, date: owidNuclear.date, source: owidNuclear.source };
                    sources.push('Our World in Data');
                }

                if (fredUranium) {
                    sources.push('FRED');
                }
                break;

            case 'solar':
                // Solar LCOE
                const owidSolar = await fetchOWIDData('solar');

                if (owidSolar) {
                    usPrice = { value: owidSolar.solar_lcoe, date: owidSolar.date, source: owidSolar.source };
                    worldPrice = { value: owidSolar.solar_lcoe * 1.15, date: owidSolar.date, source: owidSolar.source };
                    sources.push('Our World in Data');
                }
                break;

            case 'renewables':
                // Wind and other renewables LCOE
                const owidWind = await fetchOWIDData('wind');

                if (owidWind) {
                    usPrice = { value: owidWind.wind_lcoe, date: owidWind.date, source: owidWind.source };
                    worldPrice = { value: owidWind.wind_lcoe * 1.15, date: owidWind.date, source: owidWind.source };
                    sources.push('Our World in Data');
                }
                break;

            case 'coal':
                // Thermal Coal
                const eiaCoal = await fetchEIAData('COAL.PRICE');
                const yahooCoal = await fetchYahooFinance('MTF=F');

                if (eiaCoal) {
                    usPrice = { value: eiaCoal.value, date: eiaCoal.date, source: eiaCoal.source };
                    sources.push('EIA');
                }

                if (yahooCoal) {
                    worldPrice = { value: yahooCoal.value, date: yahooCoal.date, source: yahooCoal.source };
                    sources.push('Yahoo Finance');
                }
                break;
        }

        // Use fallback if no live data available
        const fallback = getFallbackData(source);

        const response = {
            source: source,
            timestamp: new Date().toISOString(),
            us: usPrice || { value: fallback.us, date: fallback.date, source: fallback.source },
            world: worldPrice || { value: fallback.world, date: fallback.date, source: fallback.source },
            units: {
                us: fallback.usUnit,
                world: fallback.worldUnit
            },
            dataSources: sources.length > 0 ? sources : ['Fallback estimates'],
            isFallback: !usPrice && !worldPrice
        };

        console.log(`Response for ${source}:`, JSON.stringify(response, null, 2));
        res.json(response);

    } catch (error) {
        console.error('Error fetching prices:', error);
        const fallback = getFallbackData(source);
        res.json({
            source: source,
            timestamp: new Date().toISOString(),
            us: { value: fallback.us, date: fallback.date, source: 'Fallback' },
            world: { value: fallback.world, date: fallback.date, source: 'Fallback' },
            units: { us: fallback.usUnit, world: fallback.worldUnit },
            dataSources: ['Fallback estimates'],
            isFallback: true,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        apiKeys: {
            eia: !!EIA_API_KEY,
            fred: !!FRED_API_KEY
        }
    });
});

// API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        platform: 'Energy Price Projections',
        coordinator: 'Luke Markham',
        version: '1.0.0',
        apis: {
            eia: {
                configured: !!EIA_API_KEY,
                description: 'U.S. Energy Information Administration'
            },
            fred: {
                configured: !!FRED_API_KEY,
                description: 'Federal Reserve Economic Data'
            },
            owid: {
                configured: true,
                description: 'Our World in Data (no key required)'
            },
            yahoo: {
                configured: true,
                description: 'Yahoo Finance (no key required)'
            }
        },
        dataSources: [
            'https://www.eia.gov/opendata/',
            'https://fred.stlouisfed.org/docs/api/fred/',
            'https://github.com/owid/energy-data',
            'https://finance.yahoo.com/'
        ]
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║           ENERGY PRICE PROJECTIONS PLATFORM                   ║
║              Coordinator: Luke Markham                        ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   Server running at: http://localhost:${PORT}                   ║
║                                                               ║
║   API Status:                                                 ║
║   • EIA API Key:  ${EIA_API_KEY ? '✓ Configured' : '✗ Not configured'}                            ║
║   • FRED API Key: ${FRED_API_KEY ? '✓ Configured' : '✗ Not configured'}                            ║
║   • OWID:         ✓ No key required                           ║
║   • Yahoo:        ✓ No key required                           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);

    if (!EIA_API_KEY || !FRED_API_KEY) {
        console.log(`
💡 To enable full API access, create a .env file with:

   EIA_API_KEY=your_eia_key_here
   FRED_API_KEY=your_fred_key_here

   Get free API keys at:
   • EIA:  https://www.eia.gov/opendata/register.php
   • FRED: https://fred.stlouisfed.org/docs/api/api_key.html
        `);
    }
});

module.exports = app;
