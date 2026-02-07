/**
 * Energy Price Projections Platform
 * Coordinator: Luke Markham
 *
 * This application fetches real-time energy price data from multiple sources
 * and provides usage/price projection calculations.
 */

// ===== Configuration =====
const CONFIG = {
    sources: {
        oil: {
            name: 'Oil',
            fullName: 'Crude Oil (WTI)',
            unit: 'barrel',
            elasticity: 0.4, // Price elasticity of demand
            usUnit: '/barrel',
            worldUnit: '/barrel'
        },
        'natural-gas': {
            name: 'Natural Gas',
            fullName: 'Natural Gas (Henry Hub)',
            unit: 'MMBtu',
            elasticity: 0.25,
            usUnit: '/MMBtu',
            worldUnit: '/MMBtu'
        },
        nuclear: {
            name: 'Nuclear',
            fullName: 'Nuclear Energy (Uranium)',
            unit: 'lb',
            elasticity: 0.15,
            usUnit: '/MWh',
            worldUnit: '/MWh'
        },
        solar: {
            name: 'Solar',
            fullName: 'Solar PV',
            unit: 'MWh',
            elasticity: 0.1,
            usUnit: '/MWh',
            worldUnit: '/MWh'
        },
        renewables: {
            name: 'Other Renewables',
            fullName: 'Wind & Other Renewables',
            unit: 'MWh',
            elasticity: 0.12,
            usUnit: '/MWh',
            worldUnit: '/MWh'
        },
        coal: {
            name: 'Coal',
            fullName: 'Thermal Coal',
            unit: 'ton',
            elasticity: 0.35,
            usUnit: '/short ton',
            worldUnit: '/metric ton'
        }
    },

    // Data source URLs for reference
    dataSources: [
        {
            name: 'EIA',
            fullName: 'U.S. Energy Information Administration',
            url: 'https://www.eia.gov/outlooks/steo/realprices/'
        },
        {
            name: 'FRED',
            fullName: 'Federal Reserve Economic Data',
            url: 'https://fred.stlouisfed.org/series/APU000072610'
        },
        {
            name: 'Our World in Data',
            fullName: 'Levelized Cost of Energy',
            url: 'https://ourworldindata.org/grapher/levelized-cost-of-energy'
        },
        {
            name: 'Trading Economics',
            fullName: 'Commodity Prices',
            url: 'https://tradingeconomics.com/commodities'
        },
        {
            name: 'Investing.com',
            fullName: 'Energy Commodities',
            url: 'https://www.investing.com/commodities/energy'
        }
    ]
};

// ===== State Management =====
let currentSource = null;
let currentData = {
    us: { price: null, date: null },
    world: { price: null, date: null }
};
let projectionHistory = [];

// ===== Icon Templates =====
const sourceIcons = {
    oil: `<svg viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="52" rx="20" ry="8" fill="#1a1a2e" opacity="0.3"/>
        <path d="M32 8 C32 8 20 24 20 36 C20 48 26 52 32 52 C38 52 44 48 44 36 C44 24 32 8 32 8Z"
              fill="url(#oilGradient)"/>
        <defs>
            <linearGradient id="oilGradient" x1="20" y1="8" x2="44" y2="52">
                <stop offset="0%" style="stop-color:#4a4a4a"/>
                <stop offset="100%" style="stop-color:#1a1a1a"/>
            </linearGradient>
        </defs>
    </svg>`,
    'natural-gas': `<svg viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="54" rx="16" ry="6" fill="#1a1a2e" opacity="0.3"/>
        <path d="M26 50 C18 42 20 28 28 20 C24 28 28 34 32 30 C28 38 36 44 38 36 C42 44 46 36 42 28 C50 38 48 50 38 54 L26 50Z"
              fill="url(#gasGradient)"/>
        <defs>
            <linearGradient id="gasGradient" x1="20" y1="20" x2="46" y2="54">
                <stop offset="0%" style="stop-color:#60a5fa"/>
                <stop offset="50%" style="stop-color:#3b82f6"/>
                <stop offset="100%" style="stop-color:#1d4ed8"/>
            </linearGradient>
        </defs>
    </svg>`,
    nuclear: `<svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="24" stroke="url(#nuclearGradient)" stroke-width="3" fill="none"/>
        <circle cx="32" cy="32" r="6" fill="url(#nuclearGradient)"/>
        <circle cx="32" cy="14" r="5" fill="url(#nuclearGradient)"/>
        <circle cx="17" cy="41" r="5" fill="url(#nuclearGradient)"/>
        <circle cx="47" cy="41" r="5" fill="url(#nuclearGradient)"/>
        <line x1="32" y1="32" x2="32" y2="19" stroke="url(#nuclearGradient)" stroke-width="2"/>
        <line x1="32" y1="32" x2="21" y2="38" stroke="url(#nuclearGradient)" stroke-width="2"/>
        <line x1="32" y1="32" x2="43" y2="38" stroke="url(#nuclearGradient)" stroke-width="2"/>
        <defs>
            <linearGradient id="nuclearGradient" x1="8" y1="8" x2="56" y2="56">
                <stop offset="0%" style="stop-color:#a855f7"/>
                <stop offset="100%" style="stop-color:#7c3aed"/>
            </linearGradient>
        </defs>
    </svg>`,
    solar: `<svg viewBox="0 0 64 64" fill="none">
        <circle cx="32" cy="32" r="12" fill="url(#solarGradient)"/>
        <g stroke="url(#solarGradient)" stroke-width="3" stroke-linecap="round">
            <line x1="32" y1="6" x2="32" y2="14"/>
            <line x1="32" y1="50" x2="32" y2="58"/>
            <line x1="6" y1="32" x2="14" y2="32"/>
            <line x1="50" y1="32" x2="58" y2="32"/>
            <line x1="13.6" y1="13.6" x2="19.3" y2="19.3"/>
            <line x1="44.7" y1="44.7" x2="50.4" y2="50.4"/>
            <line x1="13.6" y1="50.4" x2="19.3" y2="44.7"/>
            <line x1="44.7" y1="19.3" x2="50.4" y2="13.6"/>
        </g>
        <defs>
            <linearGradient id="solarGradient" x1="8" y1="8" x2="56" y2="56">
                <stop offset="0%" style="stop-color:#fbbf24"/>
                <stop offset="100%" style="stop-color:#f59e0b"/>
            </linearGradient>
        </defs>
    </svg>`,
    renewables: `<svg viewBox="0 0 64 64" fill="none">
        <path d="M32 8 L32 56" stroke="#94a3b8" stroke-width="4"/>
        <path d="M32 12 Q48 20 32 32 Q16 20 32 12" fill="url(#windGradient)"/>
        <path d="M32 12 Q32 32 48 40 Q32 32 32 12" fill="url(#windGradient)" transform="rotate(120 32 32)"/>
        <path d="M32 12 Q32 32 48 40 Q32 32 32 12" fill="url(#windGradient)" transform="rotate(240 32 32)"/>
        <circle cx="32" cy="32" r="4" fill="#1e293b"/>
        <defs>
            <linearGradient id="windGradient" x1="16" y1="12" x2="48" y2="40">
                <stop offset="0%" style="stop-color:#10b981"/>
                <stop offset="100%" style="stop-color:#059669"/>
            </linearGradient>
        </defs>
    </svg>`,
    coal: `<svg viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="48" rx="22" ry="10" fill="url(#coalGradient)"/>
        <ellipse cx="32" cy="40" rx="18" ry="8" fill="#374151"/>
        <ellipse cx="26" cy="36" rx="8" ry="6" fill="#1f2937"/>
        <ellipse cx="40" cy="38" rx="10" ry="7" fill="#111827"/>
        <ellipse cx="32" cy="32" rx="6" ry="5" fill="#374151"/>
        <defs>
            <linearGradient id="coalGradient" x1="10" y1="38" x2="54" y2="58">
                <stop offset="0%" style="stop-color:#374151"/>
                <stop offset="100%" style="stop-color:#111827"/>
            </linearGradient>
        </defs>
    </svg>`
};

// ===== Navigation Functions =====
function navigateToSource(source) {
    currentSource = source;

    // Update page visibility
    document.getElementById('landing-page').classList.remove('active');
    document.getElementById('detail-page').classList.add('active');

    // Update source info
    const sourceConfig = CONFIG.sources[source];
    document.getElementById('source-title').textContent = sourceConfig.fullName;
    document.getElementById('source-icon').innerHTML = sourceIcons[source];

    // Update units
    document.getElementById('us-unit').textContent = sourceConfig.usUnit;
    document.getElementById('world-unit').textContent = sourceConfig.worldUnit;

    // Reset values
    resetProjectionValues();

    // Fetch data
    fetchEnergyData(source);
}

function goBack() {
    document.getElementById('detail-page').classList.remove('active');
    document.getElementById('landing-page').classList.add('active');
    currentSource = null;
    document.getElementById('summary-section').style.display = 'none';
}

function resetProjectionValues() {
    document.getElementById('us-price').textContent = '--';
    document.getElementById('world-price').textContent = '--';
    document.getElementById('us-price-date').textContent = 'Loading...';
    document.getElementById('world-price-date').textContent = 'Loading...';
    document.getElementById('us-price-projection').textContent = '--';
    document.getElementById('world-price-projection').textContent = '--';
    document.getElementById('us-new-price').textContent = '$--';
    document.getElementById('world-new-price').textContent = '$--';
    document.getElementById('us-usage-increase').value = 10;
    document.getElementById('world-usage-increase').value = 10;
}

// ===== API Configuration =====
const API_BASE_URL = window.location.origin;

// ===== Data Fetching =====
async function fetchEnergyData(source) {
    const indicator = document.getElementById('fetch-indicator');
    indicator.classList.add('active');

    try {
        const response = await fetch(`${API_BASE_URL}/api/prices/${source}`);

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();

        // Store data sources info for summary
        currentDataSources = data.dataSources || [];
        isUsingFallback = data.isFallback || false;

        // Format the data for display
        const formattedData = {
            us: {
                price: data.us.value,
                date: formatDateForDisplay(data.us.date),
                source: data.us.source
            },
            world: {
                price: data.world.value,
                date: formatDateForDisplay(data.world.date),
                source: data.world.source
            }
        };

        // Update units from API response
        if (data.units) {
            document.getElementById('us-unit').textContent = data.units.us;
            document.getElementById('world-unit').textContent = data.units.world;
        }

        // Update UI with fetched data
        updatePriceDisplay(formattedData);

        // Show data source indicator
        updateDataSourceIndicator(data.dataSources, data.isFallback);

    } catch (error) {
        console.error('Error fetching data:', error);
        // Fall back to cached/estimated data
        updateWithFallbackData(source);
    } finally {
        indicator.classList.remove('active');
    }
}

// Track data sources for summary
let currentDataSources = [];
let isUsingFallback = false;

// Format date for display
function formatDateForDisplay(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

// Update data source indicator in UI
function updateDataSourceIndicator(sources, isFallback) {
    // Add visual indicator of data source quality
    const priceCards = document.querySelectorAll('.current-price-card');
    priceCards.forEach(card => {
        // Remove existing indicators
        const existing = card.querySelector('.data-source-badge');
        if (existing) existing.remove();

        // Add new indicator
        const badge = document.createElement('div');
        badge.className = 'data-source-badge';
        badge.style.cssText = `
            margin-top: 8px;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.7rem;
            display: inline-block;
        `;

        if (isFallback) {
            badge.style.background = 'rgba(251, 191, 36, 0.2)';
            badge.style.color = '#fbbf24';
            badge.textContent = 'Estimated Data';
        } else {
            badge.style.background = 'rgba(16, 185, 129, 0.2)';
            badge.style.color = '#10b981';
            badge.textContent = `Live: ${sources.join(', ')}`;
        }

        card.appendChild(badge);
    });
}

// Update price display
function updatePriceDisplay(data) {
    currentData = {
        us: { price: data.us.price, date: data.us.date, source: data.us.source },
        world: { price: data.world.price, date: data.world.date, source: data.world.source }
    };

    // US prices
    document.getElementById('us-price').textContent = formatPrice(data.us.price);
    document.getElementById('us-price-date').textContent = `As of ${data.us.date}`;

    // World prices
    document.getElementById('world-price').textContent = formatPrice(data.world.price);
    document.getElementById('world-price-date').textContent = `As of ${data.world.date}`;
}

// Fallback data for when API is unavailable
function updateWithFallbackData(source) {
    const fallbackPrices = {
        oil: { us: 74.50, world: 78.80 },
        'natural-gas': { us: 3.15, world: 12.40 },
        nuclear: { us: 31.00, world: 35.00 },
        solar: { us: 28.00, world: 32.00 },
        renewables: { us: 31.00, world: 36.00 },
        coal: { us: 140.00, world: 120.00 }
    };

    const prices = fallbackPrices[source] || fallbackPrices.oil;
    const now = new Date().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
    });

    const fallbackData = {
        us: { price: prices.us, date: now, source: 'Fallback' },
        world: { price: prices.world, date: now, source: 'Fallback' }
    };

    updatePriceDisplay(fallbackData);
    updateDataSourceIndicator(['Fallback estimates'], true);
}

function formatPrice(price) {
    if (price >= 100) {
        return price.toFixed(2);
    } else if (price >= 10) {
        return price.toFixed(2);
    } else {
        return price.toFixed(2);
    }
}

// ===== Projection Calculations =====
function calculateProjection(region) {
    if (!currentSource) {
        alert('Please select an energy source first.');
        return;
    }

    if (!currentData || !currentData[region] || !currentData[region].price) {
        alert('Please wait for price data to load.');
        return;
    }

    const sourceConfig = CONFIG.sources[currentSource];
    const usageIncrease = parseFloat(document.getElementById(`${region}-usage-increase`).value) || 0;
    const currentPrice = parseFloat(currentData[region].price);

    // Calculate price increase using price elasticity model
    // Price increase = Usage increase * (1 / elasticity) * supply constraint factor
    const elasticity = sourceConfig.elasticity;
    const supplyConstraintFactor = getSupplyConstraintFactor(currentSource);

    // Formula: % price change = (% demand change) / elasticity * supply factor
    const priceIncrease = (usageIncrease / 100) * (1 / elasticity) * supplyConstraintFactor * 100;

    // Calculate new price
    const newPrice = currentPrice * (1 + priceIncrease / 100);

    // Update display with proper sign and color
    const projectionEl = document.getElementById(`${region}-price-projection`);
    const sign = priceIncrease >= 0 ? '+' : '';
    projectionEl.textContent = `${sign}${priceIncrease.toFixed(1)}`;

    // Update colors based on increase/decrease
    const outputWrapper = projectionEl.closest('.output-wrapper');
    const outputSuffix = outputWrapper.querySelector('.output-suffix');
    if (priceIncrease >= 0) {
        outputWrapper.style.background = 'rgba(239, 68, 68, 0.1)';
        outputWrapper.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        projectionEl.style.color = '#ef4444';
        outputSuffix.style.background = 'rgba(239, 68, 68, 0.15)';
        outputSuffix.style.color = '#ef4444';
    } else {
        outputWrapper.style.background = 'rgba(16, 185, 129, 0.1)';
        outputWrapper.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        projectionEl.style.color = '#10b981';
        outputSuffix.style.background = 'rgba(16, 185, 129, 0.15)';
        outputSuffix.style.color = '#10b981';
    }

    const priceChangeSign = newPrice >= currentPrice ? '+' : '-';
    const priceChange = Math.abs(newPrice - currentPrice);
    document.getElementById(`${region}-new-price`).textContent = `$${formatPrice(newPrice)} (${priceChangeSign}$${formatPrice(priceChange)})`;

    // Store in history for summary
    const projectionData = {
        region: region === 'us' ? 'United States' : 'World',
        source: sourceConfig.fullName,
        currentPrice: currentPrice,
        usageIncrease: usageIncrease,
        priceIncrease: priceIncrease,
        newPrice: newPrice,
        timestamp: new Date().toISOString(),
        unit: region === 'us' ? sourceConfig.usUnit : sourceConfig.worldUnit,
        dataSources: currentDataSources,
        isLiveData: !isUsingFallback,
        priceSource: currentData[region].source
    };

    projectionHistory.push(projectionData);

    // Generate and show summary
    generateSummary(projectionData);
}

function getSupplyConstraintFactor(source) {
    // Supply constraint factors based on current market conditions
    const factors = {
        oil: 1.2,           // Moderate supply constraints (OPEC+ cuts)
        'natural-gas': 1.1, // Some infrastructure constraints
        nuclear: 0.8,       // Stable supply, long-term contracts
        solar: 0.6,         // Rapidly expanding supply
        renewables: 0.7,    // Good supply growth
        coal: 1.0           // Stable but declining market
    };

    return factors[source] || 1.0;
}

// ===== Summary Generation =====
function generateSummary(data) {
    const summarySection = document.getElementById('summary-section');
    const summaryContent = document.getElementById('summary-content');

    const timestamp = new Date(data.timestamp);
    const formattedDate = timestamp.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = timestamp.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
    });

    const summaryText = `
ENERGY PRICE PROJECTION SUMMARY
================================================

Report Generated
  Date: ${formattedDate}
  Time: ${formattedTime}

Energy Source: ${data.source}
Region: ${data.region}

CURRENT MARKET DATA
------------------------------------------------
Current Price: $${formatPrice(data.currentPrice)}${data.unit}

PROJECTION ANALYSIS
------------------------------------------------
Usage Change:    ${data.usageIncrease >= 0 ? '+' : ''}${data.usageIncrease.toFixed(1)}%
Price Impact:    ${data.priceIncrease >= 0 ? '+' : ''}${data.priceIncrease.toFixed(1)}%
New Price:       $${formatPrice(data.newPrice)}${data.unit}
Price Change:    ${data.newPrice >= data.currentPrice ? '+' : '-'}$${formatPrice(Math.abs(data.newPrice - data.currentPrice))}${data.unit}

DATA SOURCE STATUS
------------------------------------------------
Data Type:     ${data.isLiveData ? 'LIVE DATA' : 'ESTIMATED DATA'}
Price Source:  ${data.priceSource || 'Multiple sources'}
APIs Queried:  ${data.dataSources && data.dataSources.length > 0 ? data.dataSources.join(', ') : 'Fallback'}

REFERENCE SOURCES
------------------------------------------------
* EIA - U.S. Energy Information Administration
  eia.gov/outlooks/steo/realprices/

* FRED - Federal Reserve Economic Data
  fred.stlouisfed.org

* Our World in Data
  ourworldindata.org/energy

* Yahoo Finance
  finance.yahoo.com/commodities/

DISCLAIMER
------------------------------------------------
This projection uses economic modeling based on
price elasticity and supply constraints. Actual
prices may vary due to geopolitical events,
weather, and policy changes.

================================================
Platform Coordinator: Luke Markham
Energy Price Projections (c) ${new Date().getFullYear()}
================================================
`;

    summaryContent.innerHTML = summaryText;
    summarySection.style.display = 'block';

    // Smooth scroll to summary
    summarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function copySummary() {
    const summaryContent = document.getElementById('summary-content');
    const textContent = summaryContent.innerText;

    navigator.clipboard.writeText(textContent).then(() => {
        const successMessage = document.getElementById('copy-success');
        successMessage.classList.add('show');

        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);

        const successMessage = document.getElementById('copy-success');
        successMessage.classList.add('show');
        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 2000);
    });
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentSource) {
            goBack();
        }
    });

    // Add input event listeners for real-time calculation hints
    ['us', 'world'].forEach(region => {
        const input = document.getElementById(`${region}-usage-increase`);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    calculateProjection(region);
                }
            });
        }
    });

    // Add smooth page transitions
    const style = document.createElement('style');
    style.textContent = `
        .page {
            animation: fadeIn 0.5s ease forwards;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
});

// ===== Error Handling =====
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error: ', msg, '\nURL: ', url, '\nLine: ', lineNo);
    return false;
};

// ===== Export for testing =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        calculateProjection,
        getRealisticPrice,
        aggregateData,
        CONFIG
    };
}
