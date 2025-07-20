import { saveToStore, loadFromStore, deleteFromStore } from './data.js';
import { showToast } from './utils.js';

export async function populateTrades() {
    console.time('populateTrades');
    console.log('Starting populateTrades...');

    try {
        const [accounts, pairs, settingsData, strategies] = await Promise.all([
            loadFromStore('accounts'),
            loadFromStore('pairs'),
            loadFromStore('settings'),
            loadFromStore('strategies')
        ]);

        console.log('Loaded accounts:', accounts);

        // Ensure exactly 3 accounts exist
        let updatedAccounts = accounts || [];
        if (!Array.isArray(updatedAccounts)) {
            updatedAccounts = [];
        }

        if (updatedAccounts.length !== 3) {
            console.log(`Found ${updatedAccounts.length} accounts. Creating missing accounts to reach exactly 3...`);
            const requiredAccounts = [
                { id: 1746824081865, name: "Conservative Account", initialBalance: 10000 },
                { id: 1746824081866, name: "Moderate Account", initialBalance: 10000 },
                { id: 1746824081867, name: "Aggressive Account", initialBalance: 10000 }
            ];

            updatedAccounts = [];
            for (const account of requiredAccounts) {
                await saveToStore('accounts', account);
                updatedAccounts.push(account);
            }
            console.log('Created 3 accounts:', updatedAccounts);
        }

        const accountWinRates = {
            'Conservative Account': 0.5,
            'Moderate Account': 0.6,
            'Aggressive Account': 0.8
        };

        // Define date ranges for the previous and current weeks (Monday to Friday)
        const previousWeekStart = new Date(2025, 3, 28); // 2025-04-28 (Monday)
        const previousWeekEnd = new Date(2025, 4, 2);   // 2025-05-02 (Friday)
        const currentWeekStart = new Date(2025, 4, 5);  // 2025-05-05 (Monday)
        const currentWeekEnd = new Date(2025, 4, 9);    // 2025-05-09 (Friday)

        function getTradingDays(start, end) {
            const days = [];
            let currentDate = new Date(start);
            
            while (currentDate <= end) {
                if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) { // Exclude weekends
                    days.push(new Date(currentDate));
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            console.log('Generated trading days:', days.map(d => d.toISOString().split('T')[0]));
            if (days.length !== 5) {
                throw new Error(`Expected 5 trading days between ${start.toISOString().split('T')[0]} and ${end.toISOString().split('T')[0]}, but found ${days.length}`);
            }
            return days.sort((a, b) => a - b);
        }

        const accountPairs = pairs.length ? pairs : [{ name: 'EURUSD' }, { name: 'USDJPY' }];
        const allTrades = [];
        const allReflections = [];
        let globalIdCounter = Date.now();

        // Psychological data options
        const moods = ['Confident', 'Stressed', 'Calm', 'Frustrated', 'Excited'];
        const emotions = ['Greedy', 'Fearful', 'Confident', 'Frustrated', 'Calm'];
        const mistakes = ['Overtrading', 'Chasing', 'No Stop Loss', 'Ignoring Plan'];

        // Use only the first 3 accounts
        const selectedAccounts = updatedAccounts.slice(0, 3);

        for (const account of selectedAccounts) {
            let balance = account.initialBalance;
            const winRate = accountWinRates[account.name] || 0.5;
            const strategy = strategies.find(s => s.accountId === account.id)?.name || 'Default Strategy';

            let totalProfit = 0;
            let drawdownTrigger = false;
            let recoveryTrigger = false;
            let switchToLosses = false;

            // Get trading days for the previous week (2025-04-28 to 2025-05-02)
            const previousWeekDays = getTradingDays(previousWeekStart, previousWeekEnd);
            console.log(`Previous week trading days for account ${account.name}:`, previousWeekDays.map(d => d.toISOString().split('T')[0]));

            // Generate 2 trades per day for the previous week
            for (const day of previousWeekDays) {
                const dateStr = day.toISOString().split('T')[0];
                const tradesToday = 2;
                for (let i = 0; i < tradesToday; i++) {
                    const isWin = Math.random() < winRate;
                    const profitLoss = isWin ? 100 : -50;

                    // Psychological data
                    const disciplineScore = isWin ? 80 + Math.floor(Math.random() * 10) : 50 + Math.floor(Math.random() * 20);
                    const adherence = isWin ? 4 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
                    const mood = isWin ? moods[Math.floor(Math.random() * 2)] : moods[2 + Math.floor(Math.random() * 3)];
                    const tradeEmotions = isWin ? [emotions[Math.floor(Math.random() * 3)]] : [emotions[3 + Math.floor(Math.random() * 2)]];
                    const tradeMistakes = !isWin && Math.random() < 0.5 ? [mistakes[Math.floor(Math.random() * mistakes.length)]] : [];
                    const outsideWindow = Math.random() < 0.2;

                    const trade = {
                        id: globalIdCounter++,
                        accountId: account.id,
                        date: dateStr,
                        tradeTime: `${String(8 + i).padStart(2, '0')}:00`,
                        pair: accountPairs[i % accountPairs.length].name,
                        outcome: isWin ? 'Win' : 'Loss',
                        adherence: '★'.repeat(adherence),
                        strategy,
                        tradeType: 'Day Trade',
                        timeframe: 'M30',
                        setupScore: isWin ? 7 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 3),
                        risk: 100,
                        plannedRisk: 100,
                        actualRisk: 100,
                        plannedRR: 2.5,
                        actualRR: isWin ? 2.5 : -1,
                        lotSize: 0.1,
                        stopLoss: 15,
                        entryPrice: 100,
                        slPrice: 85,
                        exitPrice: isWin ? 125 : 70,
                        holdTime: 60,
                        exitReason: 'Manual',
                        session: 'London',
                        mood,
                        emotions: tradeEmotions,
                        mistakes: tradeMistakes,
                        customTags: [],
                        notes: tradeMistakes.length ? `Mistake: ${tradeMistakes.join(', ')}` : '',
                        screenshots: [],
                        outsideWindow,
                        profitLoss,
                        balance: balance + profitLoss,
                        disciplineScore
                    };

                    balance += profitLoss;
                    totalProfit += profitLoss;
                    allTrades.push(trade);

                    // Add reflection for 50% of trades
                    if (Math.random() < 0.5) {
                        const checklist = {
                            planFollowed: Math.random() < 0.8,
                            riskManaged: Math.random() < 0.7,
                            emotionsControlled: isWin ? Math.random() < 0.9 : Math.random() < 0.6,
                            setupValid: Math.random() < 0.85
                        };
                        const reflection = {
                            tradeId: trade.id,
                            accountId: account.id,
                            notes: isWin ? 'Followed plan well.' : 'Need to improve risk management.',
                            lessons: tradeMistakes.length ? `Avoid ${tradeMistakes.join(', ')}` : 'Stick to plan.',
                            checklist
                        };
                        allReflections.push(reflection);
                    }
                }
            }

            // Generate 2 trades per day for the current week
            const currentWeekDays = getTradingDays(currentWeekStart, currentWeekEnd);
            console.log(`Current week trading days for account ${account.name}:`, currentWeekDays.map(d => d.toISOString().split('T')[0]));

            for (const day of currentWeekDays) {
                const dateStr = day.toISOString().split('T')[0];
                const tradesToday = 2;
                for (let i = 0; i < tradesToday; i++) {
                    let isWin;
                    let profitLoss;

                    if (account.name === 'Moderate Account') {
                        if (totalProfit < -0.09 * account.initialBalance) recoveryTrigger = true;
                        if (!drawdownTrigger && totalProfit > 0.02 * account.initialBalance) {
                            drawdownTrigger = true;
                            switchToLosses = true;
                        }
                        if (switchToLosses && !recoveryTrigger) {
                            isWin = false;
                        } else {
                            isWin = Math.random() < winRate;
                        }
                    } else if (account.name === 'Aggressive Account') {
                        if (!drawdownTrigger && totalProfit > 0.1 * account.initialBalance) {
                            drawdownTrigger = true;
                            switchToLosses = true;
                        }
                        isWin = switchToLosses ? false : Math.random() < winRate;
                    } else {
                        isWin = Math.random() < winRate;
                    }

                    profitLoss = isWin ? 100 : -50;

                    // Psychological data
                    const disciplineScore = isWin ? 80 + Math.floor(Math.random() * 10) : 50 + Math.floor(Math.random() * 20);
                    const adherence = isWin ? 4 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 3);
                    const mood = isWin ? moods[Math.floor(Math.random() * 2)] : moods[2 + Math.floor(Math.random() * 3)];
                    const tradeEmotions = isWin ? [emotions[Math.floor(Math.random() * 3)]] : [emotions[3 + Math.floor(Math.random() * 2)]];
                    const tradeMistakes = !isWin && Math.random() < 0.5 ? [mistakes[Math.floor(Math.random() * mistakes.length)]] : [];
                    const outsideWindow = Math.random() < 0.2;

                    const trade = {
                        id: globalIdCounter++,
                        accountId: account.id,
                        date: dateStr,
                        tradeTime: `${String(8 + i).padStart(2, '0')}:00`,
                        pair: accountPairs[i % accountPairs.length].name,
                        outcome: isWin ? 'Win' : 'Loss',
                        adherence: '★'.repeat(adherence),
                        strategy,
                        tradeType: 'Day Trade',
                        timeframe: 'M30',
                        setupScore: isWin ? 7 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 3),
                        risk: 100,
                        plannedRisk: 100,
                        actualRisk: 100,
                        plannedRR: 2.5,
                        actualRR: isWin ? 2.5 : -1,
                        lotSize: 0.1,
                        stopLoss: 15,
                        entryPrice: 100,
                        slPrice: 85,
                        exitPrice: isWin ? 125 : 70,
                        holdTime: 60,
                        exitReason: 'Manual',
                        session: 'London',
                        mood,
                        emotions: tradeEmotions,
                        mistakes: tradeMistakes,
                        customTags: [],
                        notes: tradeMistakes.length ? `Mistake: ${tradeMistakes.join(', ')}` : '',
                        screenshots: [],
                        outsideWindow,
                        profitLoss,
                        balance: balance + profitLoss,
                        disciplineScore
                    };

                    balance += profitLoss;
                    totalProfit += profitLoss;
                    allTrades.push(trade);

                    // Add reflection for 50% of trades
                    if (Math.random() < 0.5) {
                        const checklist = {
                            planFollowed: Math.random() < 0.8,
                            riskManaged: Math.random() < 0.7,
                            emotionsControlled: isWin ? Math.random() < 0.9 : Math.random() < 0.6,
                            setupValid: Math.random() < 0.85
                        };
                        const reflection = {
                            tradeId: trade.id,
                            accountId: account.id,
                            notes: isWin ? 'Followed plan well.' : 'Need to improve risk management.',
                            lessons: tradeMistakes.length ? `Avoid ${tradeMistakes.join(', ')}` : 'Stick to plan.',
                            checklist
                        };
                        allReflections.push(reflection);
                    }
                }
            }
        }

        // Save trades and reflections to IndexedDB
        for (const trade of allTrades) {
            await saveToStore('trades', trade);
        }
        for (const reflection of allReflections) {
            await saveToStore('reflections', reflection);
        }

        showToast(`${allTrades.length} trades and ${allReflections.length} reflections populated successfully for weeks of 2025-04-28 to 2025-05-02 and 2025-05-05 to 2025-05-09!`, 'success');
        console.log(`Populated ${allTrades.length} trades and ${allReflections.length} reflections across 3 accounts.`);
    } catch (err) {
        console.error('Error populating trades:', err);
        showToast(`Error populating trades: ${err.message}`, 'error');
    } finally {
        console.timeEnd('populateTrades');
    }
}