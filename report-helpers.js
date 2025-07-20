// Groups trades by day of the week based on their date
// Purpose: Organizes trades into daily groups for temporal analysis
export function groupTradesByDayOfWeek(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Initializes an array of 7 empty arrays for each day of the week
    // Purpose: Stores trades for Sunday (0) to Saturday (6)
    const groups = Array(7).fill().map(() => []);

    // Iterates through trades to assign them to the appropriate day
    // Purpose: Groups trades based on UTC day of the week
    trades.forEach(trade => {
        const date = new Date(trade.date + 'T00:00:00Z');
        // Validates date format and ensures it's a valid date
        if (!isNaN(date.getTime()) && trade.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const day = date.getUTCDay();
            groups[day].push(trade);
            console.log('Trade:', trade.id, 'Date:', trade.date, 'UTC Day:', day, 'Day Name:', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]);
        } else {
            console.warn('Invalid date in trade:', trade);
        }
    });

    // Defines day labels for result
    // Purpose: Maps numerical day indices to readable names
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Creates result array with metrics for non-empty groups
    // Purpose: Formats data for display or further processing
    const result = groups
        .map((group, index) => ({
            label: days[index],
            trades: group,
            metrics: calculateTemporalMetrics(group, false)
        }))
        .filter(item => item.metrics.tradeCount > 0);

    // Logs summary for debugging
    console.log('Day of Week Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount })));
    return result;
}

// Groups trades by week of the month
// Purpose: Organizes trades into weekly groups within each month
export function groupTradesByWeekOfMonth(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Groups trades by year-month
    // Purpose: Organizes trades by month for week-based grouping
    const monthGroups = {};
    trades.forEach(trade => {
        const date = new Date(trade.date + 'T00:00:00Z');
        // Validates date format and ensures it's a valid date
        if (!isNaN(date.getTime()) && trade.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const yearMonth = trade.date.slice(0, 7);
            if (!monthGroups[yearMonth]) monthGroups[yearMonth] = [];
            monthGroups[yearMonth].push(trade);
        } else {
            console.warn('Invalid date in trade:', trade);
        }
    });

    // Processes each month's trades into weekly groups
    // Purpose: Divides trades into weeks (1-5) within each month
    const result = [];
    Object.keys(monthGroups).sort().forEach(yearMonth => {
        const monthTrades = monthGroups[yearMonth].sort((a, b) => new Date(a.date + 'T00:00:00Z') - new Date(b.date + 'T00:00:00Z'));
        const weekGroups = Array(5).fill().map(() => []);
        monthTrades.forEach(trade => {
            const date = new Date(trade.date + 'T00:00:00Z');
            const day = date.getUTCDate();
            const week = Math.floor((day - 1) / 7);
            // Assigns trade to appropriate week (0-4)
            if (week >= 0 && week < 5) {
                weekGroups[week].push(trade);
                console.log('Trade:', trade.id, 'Date:', trade.date, 'YearMonth:', yearMonth, 'Day:', day, 'Week:', week + 1);
            } else {
                console.warn('Trade outside valid week range:', trade, 'Week:', week);
            }
        });
        // Creates result entries for non-empty week groups
        weekGroups.forEach((group, index) => {
            if (group.length > 0) {
                result.push({
                    label: `Week ${index + 1} (${yearMonth})`,
                    trades: group,
                    metrics: calculateTemporalMetrics(group, false)
                });
            }
        });
    });

    // Logs summary for debugging
    console.log('Week of Month Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount, tradeIds: r.trades.map(t => t.id) })));
    return result.filter(item => item.metrics.tradeCount > 0);
}

// Groups trades by month of the year
// Purpose: Organizes trades into monthly groups regardless of year
export function groupTradesByMonthOfYear(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Initializes an array of 12 empty arrays for each month
    // Purpose: Stores trades for January (0) to December (11)
    const groups = Array(12).fill().map(() => []);

    // Iterates through trades to assign them to the appropriate month
    // Purpose: Groups trades based on month index
    trades.forEach(trade => {
        const date = new Date(trade.date);
        // Validates date format and ensures it's a valid date
        if (!isNaN(date.getTime()) && trade.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            groups[date.getMonth()].push(trade);
            console.log('Trade:', trade.id, 'Date:', trade.date, 'Month:', date.getMonth() + 1);
        } else {
            console.warn('Invalid date in trade:', trade);
        }
    });

    // Defines month labels for result
    // Purpose: Maps numerical month indices to readable names
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Creates result array with metrics for non-empty groups
    // Purpose: Formats data for display or further processing
    const result = groups
        .map((group, index) => ({
            label: months[index],
            trades: group,
            metrics: calculateTemporalMetrics(group, true)
        }))
        .filter(item => item.metrics.tradeCount > 0);

    // Logs summary for debugging
    console.log('Month of Year Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount })));
    return result;
}

// Groups trades by hour of the day
// Purpose: Organizes trades into hourly groups based on trade time
export function groupTradesByHourOfDay(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Initializes an array of 24 empty arrays for each hour
    // Purpose: Stores trades for hours 00:00 to 23:00
    const groups = Array(24).fill().map(() => []);

    // Iterates through trades to assign them to the appropriate hour
    // Purpose: Groups trades based on trade time
    trades.forEach(trade => {
        const time = trade.tradeTime || '00:00';
        // Validates time format
        if (time.match(/^\d{2}:\d{2}$/)) {
            const hour = parseInt(time.split(':')[0]);
            groups[hour].push(trade);
            console.log('Trade:', trade.id, 'Time:', time, 'Hour:', hour);
        } else {
            console.warn('Invalid tradeTime in trade:', trade);
        }
    });

    // Creates result array with metrics for non-empty groups
    // Purpose: Formats data for display or further processing
    const result = groups
        .map((group, index) => ({
            label: `${index.toString().padStart(2, '0')}:00`,
            trades: group,
            metrics: calculateTemporalMetrics(group, false)
        }))
        .filter(item => item.metrics.tradeCount > 0);

    // Logs summary for debugging
    console.log('Hour of Day Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount })));
    return result;
}

// Groups trades by trading session (Asian, London, New York)
// Purpose: Organizes trades into predefined trading sessions based on trade time
export function groupTradesByTradingSession(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Defines trading sessions with start and end hours
    // Purpose: Maps trades to sessions based on time
    const sessions = [
        { name: 'Asian', start: 0, end: 8 },
        { name: 'London', start: 8, end: 16 },
        { name: 'New York', start: 16, end: 24 }
    ];

    // Initializes groups for each session
    // Purpose: Stores trades for each session
    const groups = sessions.map(() => []);

    // Iterates through trades to assign them to the appropriate session
    // Purpose: Groups trades based on trade time
    trades.forEach(trade => {
        const time = trade.tradeTime || '00:00';
        // Validates time format
        if (time.match(/^\d{2}:\d{2}$/)) {
            const hour = parseInt(time.split(':')[0]);
            let sessionIndex = sessions.findIndex(s => hour >= s.start && hour < s.end);
            if (sessionIndex === -1) sessionIndex = 2; // Defaults to New York if no match
            groups[sessionIndex].push(trade);
            console.log('Trade:', trade.id, 'Time:', time, 'Session:', sessions[sessionIndex].name);
        } else {
            console.warn('Invalid tradeTime in trade:', trade);
        }
    });

    // Creates result array with metrics for non-empty groups
    // Purpose: Formats data for display or further processing
    const result = sessions.map((session, index) => ({
        label: session.name,
        trades: groups[index],
        metrics: calculateTemporalMetrics(groups[index], false)
    })).filter(item => item.metrics.tradeCount > 0);

    // Logs summary for debugging
    console.log('Trading Session Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount })));
    return result;
}

// Groups trades by day of the month
// Purpose: Organizes trades into daily groups within a month
export function groupTradesByDayOfMonth(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Initializes an array of 31 empty arrays for each day
    // Purpose: Stores trades for days 1 to 31
    const groups = Array(31).fill().map(() => []);

    // Iterates through trades to assign them to the appropriate day
    // Purpose: Groups trades based on UTC date
    trades.forEach(trade => {
        const date = new Date(trade.date + 'T00:00:00Z');
        // Validates date format and ensures it's a valid date
        if (!isNaN(date.getTime()) && trade.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const day = date.getUTCDate();
            groups[day - 1].push(trade);
            console.log('Trade:', trade.id, 'Date:', trade.date, 'Day:', day);
        } else {
            console.warn('Invalid date in trade:', trade);
        }
    });

    // Creates result array with metrics for non-empty groups
    // Purpose: Formats data for display or further processing
    const result = groups
        .map((group, index) => ({
            label: `Day ${index + 1}`,
            trades: group,
            metrics: calculateTemporalMetrics(group, false)
        }))
        .filter(item => item.metrics.tradeCount > 0);

    // Logs summary for debugging
    console.log('Day of Month Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount, tradeIds: r.trades.map(t => t.id) })));
    return result;
}

// Calculates the maximum drawdown for a set of trades
// Purpose: Measures the largest peak-to-trough decline in balance
export function calculateDrawdown(trades, initialBalance = 10000, profitLossField = 'profitLoss') {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return 0;

    // Tracks balance and peak to calculate drawdown
    // Purpose: Computes drawdown percentage based on profit/loss
    let balance = initialBalance;
    let peak = initialBalance;
    const drawdowns = trades.map(trade => {
        const profitLoss = Number(trade[profitLossField]) || 0;
        balance += profitLoss;
        peak = Math.max(peak, balance);
        const drawdown = peak > 0 ? ((balance - peak) / peak) * 100 : 0;
        return drawdown;
    });

    // Finds the maximum drawdown (most negative)
    // Purpose: Identifies the largest loss relative to peak
    const maxDrawdown = drawdowns.length ? Math.min(...drawdowns.filter(d => !isNaN(d) && d <= 0)) : 0;

    // Logs details for debugging
    console.log('CalculateDrawdown - Initial Balance:', initialBalance, 'Trades:', trades.map(t => ({ id: t.id, [profitLossField]: t[profitLossField] })), 'Drawdowns:', drawdowns, 'Max Drawdown:', maxDrawdown);
    return maxDrawdown;
}

// Calculates temporal metrics for a group of trades
// Purpose: Computes trade count, win rate, P&L, and drawdown for analysis
export function calculateTemporalMetrics(trades, includeDrawdown = false, initialBalance = 10000, profitLossField = 'profitLoss') {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return { tradeCount: 0, winRate: 0, netPnl: '0.00', avgPnl: '0.00', winLossRatio: '0.00', drawdown: null };

    // Calculates basic metrics
    // Purpose: Summarizes trade performance
    const tradeCount = trades.length;
    const winRate = tradeCount ? calculateWinRate(trades, profitLossField).toFixed(2) : 0;
    const netPnl = tradeCount ? trades.reduce((sum, t) => {
        const pl = Number(t[profitLossField]) || 0;
        console.log('Trade:', t.id, 'ProfitLoss:', pl);
        return sum + pl;
    }, 0).toFixed(2) : '0.00';
    const avgPnl = tradeCount ? (parseFloat(netPnl) / tradeCount).toFixed(2) : '0.00';
    const winLossRatio = tradeCount ? Number(calculateAvgWinLoss(trades, profitLossField)).toFixed(2) : '0.00';

    // Calculates drawdown if requested
    // Purpose: Includes drawdown for specific analyses
    let drawdown = null;
    if (includeDrawdown) {
        drawdown = tradeCount ? calculateDrawdown(trades, initialBalance, profitLossField).toFixed(2) : '0.00';
        console.log('Temporal Metrics - Trades:', trades.length, 'P&L:', netPnl, 'Initial Balance:', initialBalance, 'Calculated Drawdown:', drawdown);
    }

    // Logs result for debugging
    console.log('Temporal Metrics Result:', { tradeCount, winRate, netPnl, avgPnl, winLossRatio, drawdown });
    return { tradeCount, winRate, netPnl, avgPnl, winLossRatio, drawdown };
}

// Formats data for table display
// Purpose: Prepares grouped trade data for table rendering
export function formatTableData(data, includeDrawdown = false, initialBalance = 10000) {
    // Maps data to table rows
    // Purpose: Creates an array of arrays for table display
    return data.map(item => {
        const metrics = item.metrics;
        const row = [
            item.label,
            metrics.tradeCount,
            `${metrics.winRate}%`,
            `$${metrics.netPnl}`,
            `$${metrics.avgPnl}`,
            metrics.winLossRatio
        ];
        if (includeDrawdown) {
            row.push(`${metrics.drawdown || '0.00'}%`);
        }
        return row;
    });
}

// Calculates the win rate for a set of trades
// Purpose: Determines the percentage of winning trades
export function calculateWinRate(trades, profitLossField = 'profitLoss') {
    // Validates input and checks for non-empty array
    // Purpose: Prevents errors with invalid data
    if (!trades || !trades.length) return 0;

    // Counts winning trades
    // Purpose: Calculates win rate as a percentage
    const wins = trades.filter(t => Number(t[profitLossField]) > 0).length;
    return (wins / trades.length) * 100;
}

// Calculates the profit factor for a set of trades
// Purpose: Measures the ratio of gross profits to gross losses
export function calculateProfitFactor(trades, profitLossField = 'profitLoss') {
    // Validates input and checks for non-empty array
    // Purpose: Prevents errors with invalid data
    if (!trades || !trades.length) return 0;

    // Separates wins and losses
    // Purpose: Computes total profits and losses
    const wins = trades.filter(t => Number(t[profitLossField]) > 0);
    const losses = trades.filter(t => Number(t[profitLossField]) < 0);
    const grossProfit = wins.reduce((sum, t) => sum + Number(t[profitLossField]), 0);
    const grossLoss = losses.reduce((sum, t) => sum + Number(t[profitLossField]), 0);

    // Calculates profit factor
    // Purpose: Returns ratio or handles edge cases
    return grossLoss !== 0 ? (grossProfit / Math.abs(grossLoss)).toFixed(2) : grossProfit > 0 ? 'Infinity' : 0;
}

// Calculates the average win/loss ratio for a set of trades
// Purpose: Measures the ratio of average win to average loss
export function calculateAvgWinLoss(trades, profitLossField = 'profitLoss') {
    // Validates input and checks for non-empty array
    // Purpose: Prevents errors with invalid data
    if (!trades || !trades.length) return 0;

    // Separates wins and losses
    // Purpose: Computes average win and loss amounts
    const wins = trades.filter(t => Number(t[profitLossField]) > 0);
    const losses = trades.filter(t => Number(t[profitLossField]) < 0);
    const avgWin = wins.length ? wins.reduce((sum, t) => sum + Number(t[profitLossField]), 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((sum, t) => sum + Number(t[profitLossField]), 0) / losses.length : 0;

    // Calculates win/loss ratio
    // Purpose: Returns ratio or handles edge cases
    return avgLoss !== 0 ? (avgWin / Math.abs(avgLoss)).toFixed(2) : avgWin > 0 ? 'Infinity' : 0;
}

// Generates chart data for visualization
// Purpose: Prepares data for bar, line, or pie charts
export function generateChartData(data, type, metric = 'netPnl') {
    // Handles pre-formatted chart data
    // Purpose: Returns existing chart data if already structured
    if (data && data.labels && data.datasets) {
        return {
            type: type,
            data: {
                labels: data.labels,
                datasets: data.datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: type !== 'pie' ? { y: { beginAtZero: true } } : undefined
            }
        };
    }

    // Validates input to ensure data is a non-empty array
    // Purpose: Returns default empty chart data if invalid
    if (!data || !Array.isArray(data) || !data.length) {
        console.warn('No valid array data for chart generation:', data);
        return {
            type: type,
            data: {
                labels: [],
                datasets: [{
                    label: metric === 'netPnl' ? 'Net P&L ($)' : 'Win Rate (%)',
                    data: [],
                    backgroundColor: [],
                    borderColor: '#2c3e50',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: type !== 'pie' ? { y: { beginAtZero: true } } : undefined
            }
        };
    }

    // Generates bar chart data
    // Purpose: Creates data for bar chart visualization
    if (type === 'bar') {
        return {
            type: 'bar',
            data: {
                labels: data.map(d => d.label || 'Unknown'),
                datasets: [{
                    label: metric === 'netPnl' ? 'Net P&L ($)' : 'Win Rate (%)',
                    data: data.map(d => Number(d.metrics?.[metric]) || 0),
                    backgroundColor: data.map(d => (Number(d.metrics?.[metric]) || 0) >= 0 ? '#28a745' : '#dc3545'),
                    borderColor: '#2c3e50',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        };
    } 
    // Generates line chart data
    // Purpose: Creates data for line chart visualization
    else if (type === 'line') {
        return {
            type: 'line',
            data: {
                labels: data.map(d => d.label || 'Unknown'),
                datasets: [{
                    label: 'Net P&L ($)',
                    data: data.map(d => Number(d.metrics?.netPnl) || 0),
                    borderColor: '#007bff',
                    fill: false,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        };
    } 
    // Generates pie chart data
    // Purpose: Creates data for pie chart visualization
    else if (type === 'pie') {
        return {
            type: 'pie',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Distribution',
                    data: data.datasets?.[0]?.data || [],
                    backgroundColor: data.datasets?.[0]?.backgroundColor || ['#28a745', '#dc3545'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        };
    }
}

// Validates a date range
// Purpose: Ensures start and end dates are valid and logical
export function validateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    // Checks for valid date formats
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.warn('Invalid date format:', { startDate, endDate });
        return false;
    }
    // Ensures start date is not after end date
    if (start > end) {
        console.warn('Start date after end date:', { startDate, endDate });
        return false;
    }
    return true;
}

// Analyzes trade sequences for rapid trading or large losses
// Purpose: Identifies potential behavioral patterns in trading
export function analyzeTradeSequences(trades) {
    // Validates input and checks for non-empty array
    // Purpose: Prevents errors with invalid data
    if (!trades || !trades.length) return { rapidSequences: [], largeLosses: [] };

    // Sorts trades by datetime
    // Purpose: Ensures chronological order for sequence analysis
    const sortedTrades = [...trades].sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.tradeTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.tradeTime || '00:00'}`);
        return dateA - dateB;
    });

    // Identifies rapid sequences (trades within 15 minutes) and large losses
    // Purpose: Detects potential overtrading or significant losses
    const rapidSequences = [];
    const largeLosses = trades.filter(t => Number(t.profitLoss) < -500).map(t => ({
        id: t.id,
        date: t.date,
        tradeTime: t.tradeTime,
        profitLoss: Number(t.profitLoss),
        lotSize: Number(t.lotSize)
    }));
    for (let i = 1; i < sortedTrades.length; i++) {
        const prevTrade = sortedTrades[i - 1];
        const currTrade = sortedTrades[i];
        const prevTime = new Date(`${prevTrade.date}T${prevTrade.tradeTime || '00:00'}`);
        const currTime = new Date(`${currTrade.date}T${currTrade.tradeTime || '00:00'}`);
        const timeDiff = (currTime - prevTime) / (1000 * 60);
        if (timeDiff <= 15 && prevTrade.date === currTrade.date) {
            rapidSequences.push({
                trades: [prevTrade, currTrade],
                date: currTrade.date,
                timeDiff,
                profitLoss: [Number(prevTrade.profitLoss), Number(currTrade.profitLoss)]
            });
        }
    }

    // Logs results for debugging
    console.log('Trade Sequences:', { rapidSequences: rapidSequences.length, largeLosses: largeLosses.length });
    return { rapidSequences, largeLosses };
}

// Calculates risk variability metrics
// Purpose: Analyzes consistency in lot sizes, risk, and stop-loss usage
export function calculateRiskVariability(trades) {
    // Validates input and checks for non-empty array
    // Purpose: Prevents errors with invalid data
    if (!trades || !trades.length) return { lotSizeVariance: 0, riskVariance: 0, stopLossUsage: 0 };

    // Collects lot sizes, risks, and stop-loss usage
    // Purpose: Computes statistical measures of risk consistency
    const lotSizes = trades.map(t => Number(t.lotSize) || 0);
    const risks = trades.filter(t => t.actualRisk != null).map(t => Number(t.actualRisk) || 0);
    const stopLossTrades = trades.filter(t => Number(t.slPrice) !== 0).length;

    // Calculates variance for lot sizes and risks
    // Purpose: Measures dispersion in trading parameters
    const lotSizeMean = lotSizes.length ? lotSizes.reduce((sum, val) => sum + val, 0) / lotSizes.length : 0;
    const riskMean = risks.length ? risks.reduce((sum, val) => sum + val, 0) / risks.length : 0;
    const lotSizeVariance = lotSizes.length ? Math.sqrt(lotSizes.reduce((sum, val) => sum + Math.pow(val - lotSizeMean, 2), 0) / lotSizes.length) : 0;
    const riskVariance = risks.length ? Math.sqrt(risks.reduce((sum, val) => sum + Math.pow(val - riskMean, 2), 0) / risks.length) : 0;
    const stopLossUsage = trades.length ? (stopLossTrades / trades.length * 100).toFixed(2) : 0;

    // Logs results for debugging
    console.log('Risk Variability:', { lotSizeVariance, riskVariance, stopLossUsage });
    return { lotSizeVariance, riskVariance, stopLossUsage };
}

// Groups trades by market type
// Purpose: Organizes trades by market (e.g., forex, indices) for analysis
export function groupTradesByMarket(trades) {
    // Validates input to ensure trades is an array
    // Purpose: Prevents errors with invalid or missing data
    if (!trades || !Array.isArray(trades)) return [];

    // Groups trades by market type
    // Purpose: Organizes trades into market-specific groups
    const marketGroups = {};
    trades.forEach(trade => {
        const market = trade.market_type || 'unknown';
        if (!marketGroups[market]) marketGroups[market] = [];
        marketGroups[market].push(trade);
    });

    // Creates result array with metrics for non-empty groups
    // Purpose: Formats data for display or further processing
    const result = Object.keys(marketGroups).map(market => ({
        label: market.charAt(0).toUpperCase() + market.slice(1),
        trades: marketGroups[market],
        metrics: calculateTemporalMetrics(marketGroups[market], false)
    })).filter(item => item.metrics.tradeCount > 0);

    // Logs summary for debugging
    console.log('Market Groups:', result.map(r => ({ label: r.label, tradeCount: r.metrics.tradeCount })));
    return result;
}

// Calculates position bias (buy vs. sell performance)
// Purpose: Analyzes performance differences between buy and sell trades
export function calculatePositionBias(trades) {
    // Validates input and checks for non-empty array
    // Purpose: Prevents errors with invalid data
    if (!trades || !trades.length) return { buyWinRate: 0, sellWinRate: 0, buyCount: 0, sellCount: 0 };

    // Separates buy and sell trades
    // Purpose: Computes win rates and counts for each position type
    const buys = trades.filter(t => t.position === 'buy');
    const sells = trades.filter(t => t.position === 'sell');
    const buyWins = buys.filter(t => Number(t.profitLoss) > 0).length;
    const sellWins = sells.filter(t => Number(t.profitLoss) > 0).length;
    const buyWinRate = buys.length ? (buyWins / buys.length * 100).toFixed(2) : 0;
    const sellWinRate = sells.length ? (sellWins / sells.length * 100).toFixed(2) : 0;

    // Logs results for debugging
    console.log('Position Bias:', { buyWinRate, sellWinRate, buyCount: buys.length, sellCount: sells.length });
    return { buyWinRate, sellWinRate, buyCount: buys.length, sellCount: sells.length };
}