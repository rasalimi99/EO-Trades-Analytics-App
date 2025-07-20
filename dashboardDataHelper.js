// Import the loadFromStore function from the data module
import { loadFromStore } from '../data.js';

// Loads trades filtered by account ID and date range, and enriches them with emotions and mistakes from reflections
// Purpose: Provides a consolidated dataset of trades with associated emotions and mistakes for use in dashboard widgets,
// ensuring that the data is filtered by the active account and optional date range, and includes reflection data
export async function loadTradesWithEmotions({ activeAccountId, startDate, endDate }) {
    // Fetch trades and reflections concurrently from storage
    const [trades, reflections] = await Promise.all([
        loadFromStore('trades'),
        loadFromStore('reflections')
    ]);

    // Create a map of reflections keyed by tradeId for efficient lookup
    // Purpose: Allows quick access to reflection data for each trade without repeated searches
    const reflectionMap = Object.fromEntries(reflections.map(r => [r.tradeId, r]));
    console.log('Loaded reflections:', reflections); // Debug log to verify loaded reflections

    // Filter and enrich trades
    const filteredTrades = trades
        .filter(t => {
            // Parse the trade date for comparison
            const date = new Date(t.date);

            // Filter conditions:
            // - Match the active account ID
            // - Match the start date (if provided)
            // - Match the end date (if provided)
            const matchAccount = t.accountId === activeAccountId;
            const matchStart = !startDate || date >= new Date(startDate);
            const matchEnd = !endDate || date <= new Date(endDate);
            return matchAccount && matchStart && matchEnd;
        })
        .map(t => {
            // Enrich each trade with emotions and mistakes from reflections
            // Purpose: Combines trade data with reflection data, ensuring emotions and mistakes are included
            const tradeWithEmotions = {
                ...t, // Copy all existing trade properties
                emotions: reflectionMap[t.id]?.emotions || t.emotions || [], // Use reflection emotions, fallback to trade emotions or empty array
                mistakes: reflectionMap[t.id]?.mistakes ? 
                    (Array.isArray(reflectionMap[t.id].mistakes) ? 
                        reflectionMap[t.id].mistakes : 
                        reflectionMap[t.id].mistakes.split(',').map(m => m.trim())) // Handle string-based mistakes by splitting and trimming
                    : t.mistakes || [] // Fallback to trade mistakes or empty array
            };
            console.log(`Trade ${t.id} emotions:`, tradeWithEmotions.emotions); // Debug log to verify emotions for each trade
            return tradeWithEmotions;
        });

    console.log('Filtered trades with emotions:', filteredTrades); // Debug log to verify the final filtered trades
    return filteredTrades;
}