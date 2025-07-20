// Imports utility functions for data handling and trade processing
import { loadFromStore, getDB, openDB } from './data.js';
import {
    filterTradesByAccount,
    filterTradesByDateRange,
    showToast,
    calculateTradeCounts,
    isTimeOutsideWindow
} from './utils.js';
import {
    groupTradesByDayOfWeek,
    groupTradesByWeekOfMonth,
    groupTradesByMonthOfYear,
    groupTradesByHourOfDay,
    groupTradesByTradingSession,
    groupTradesByDayOfMonth,
    formatTableData,
    generateChartData,
    validateDateRange,
    calculateDrawdown,
    calculateWinRate,
    calculateProfitFactor,
    calculateAvgWinLoss,
    analyzeTradeSequences,
    calculateRiskVariability,
    groupTradesByMarket,
    calculatePositionBias
} from './report-helpers.js';

// Global variables for storing trade data and chart instances
// Purpose: Maintains state for trades, charts, and metrics across functions
let trades = [];
let chartInstances = {};
let statsData = {};
let initialBalance = 0;
let metrics = {};
let outsideWindowTrades = [];

// Initializes the reports page
// Purpose: Sets up event listeners, loads data, and renders initial reports
export async function initReports() {
    try {
        // Checks if the reports page is active
        if (!document.getElementById('reports')) {
            console.log('Reports page not active, skipping initialization');
            return;
        }

        // Initializes the database
        // Purpose: Ensures database is ready for data operations
        await openDB().catch(err => {
            showToast('Failed to initialize database.', 'error');
            console.error('Database init error:', err);
            throw err;
        });

        // Validates tabs element
        // Purpose: Ensures UI components are present
        const tabs = document.getElementById('rpt-tabs');
        if (!tabs) {
            console.error('Tabs element not found');
            document.querySelector('.rpt-error').style.display = 'block';
        } else {
            console.log('Tabs rendered:', tabs.getAttribute('data-debug'));
        }

        // Sets default initial balance and metrics
        // Purpose: Initializes metrics for performance calculations
        initialBalance = 10000;
        metrics = { 
            totalTrades: 0, 
            winRate: 0, 
            profitFactor: 0, 
            netPnl: 0, 
            avgPnl: 0, 
            maxDrawdown: 0, 
            winTrades: 0, 
            lossTrades: 0, 
            breakevenTrades: 0 
        };

        // Initializes date range picker
        // Purpose: Sets up date range filter with Flatpickr
        flatpickr('#rpt-report-date-range', {
            mode: 'range',
            dateFormat: 'Y-m-d',
            onChange: updateReports
        });

        // Populates account dropdown
        // Purpose: Loads account options for filtering
        const accounts = await loadFromStore('accounts');
        document.getElementById('rpt-report-account').innerHTML = `<option value="">All Accounts</option>${accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}`;

        // Populates pair dropdown
        // Purpose: Loads currency pair options for filtering
        const pairs = await loadFromStore('pairs');
        document.getElementById('rpt-report-pair').innerHTML = `<option value="">All Pairs</option>${pairs.map(p => `<option value="${p.name}">${p.name}</option>`).join('')}`;

        // Populates strategy dropdown
        // Purpose: Loads strategy options for filtering
        const strategies = await loadFromStore('strategies');
        document.getElementById('rpt-report-strategy').innerHTML = `<option value="">All Strategies</option>${strategies.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}`;

        // Initializes checkbox states
        // Purpose: Sets default visibility for charts
        const performanceCheckbox = document.getElementById('rpt-show-performance-charts');
        const statisticsCheckbox = document.getElementById('rpt-show-charts');
        const outsideWindowCheckbox = document.getElementById('rpt-show-outside-window-charts');
        if (performanceCheckbox) {
            performanceCheckbox.checked = false;
            console.log('Unchecked rpt-show-performance-charts');
        } else {
            console.warn('Performance charts checkbox not found');
        }
        if (statisticsCheckbox) {
            statisticsCheckbox.checked = false;
            console.log('Unchecked rpt-show-charts');
        } else {
            console.warn('Statistics charts checkbox not found');
        }
        if (outsideWindowCheckbox) {
            outsideWindowCheckbox.checked = false;
            console.log('Unchecked rpt-show-outside-window-charts');
        } else {
            console.warn('Outside window charts checkbox not found');
        }

        // Adds event listeners for checkbox changes
        // Purpose: Updates chart visibility when checkboxes are toggled
        document.addEventListener('change', (event) => {
            if (event.target.id === 'rpt-show-performance-charts' ||
                event.target.id === 'rpt-show-charts' ||
                event.target.id === 'rpt-show-outside-window-charts') {
                console.log(`${event.target.id} toggled:`, event.target.checked);
                toggleCharts();
            }
        });

        // Adds delayed event listeners for checkboxes
        // Purpose: Ensures listeners are attached after potential DOM updates
        setTimeout(() => {
            if (performanceCheckbox) {
                performanceCheckbox.addEventListener('change', () => {
                    console.log('Performance checkbox re-toggled:', performanceCheckbox.checked);
                    toggleCharts();
                });
            }
            if (statisticsCheckbox) {
                statisticsCheckbox.addEventListener('change', () => {
                    console.log('Statistics checkbox re-toggled:', statisticsCheckbox.checked);
                    toggleCharts();
                });
            }
            if (outsideWindowCheckbox) {
                outsideWindowCheckbox.addEventListener('change', () => {
                    console.log('Outside window checkbox re-toggled:', outsideWindowCheckbox.checked);
                    toggleCharts();
                });
            }
        }, 1000);

        // Adds event listeners for filter changes
        // Purpose: Updates reports when filters are modified
        document.getElementById('rpt-report-account').addEventListener('change', updateReports);
        document.getElementById('rpt-report-pair').addEventListener('change', updateReports);
        document.getElementById('rpt-report-strategy').addEventListener('click', resetFilters);

        // Adds event listener for CSV export button
        // Purpose: Triggers CSV export on button click
        const exportCsvButton = document.querySelector('#rpt-export-csv');
        if (exportCsvButton) {
            exportCsvButton.addEventListener('click', () => {
                console.log('Export CSV button clicked');
                exportCSV().catch(err => {
                    console.error('CSV export error:', err);
                    showToast('Failed to export CSV: ' + err.message, 'error');
                });
            });
            console.log('Export CSV button listener attached');
        } else {
            console.warn('Export CSV button (#rpt-export-csv) not found');
        }

        // Adds event listeners for tab changes
        // Purpose: Updates charts when tabs are switched
        const tabList = document.querySelectorAll('#rpt-tabs .nav-link');
        tabList.forEach(tab => {
            tab.addEventListener('shown.bs.tab', () => {
                console.log('Tab shown:', tab.id);
                toggleCharts();
            });
        });

        // Activates performance tab by default
        // Purpose: Sets initial tab view
        const performanceTab = document.querySelector('#rpt-performance-tab');
        if (performanceTab) {
            const bsTab = new bootstrap.Tab(performanceTab);
            bsTab.show();
            console.log('Performance tab initialized');
        }

        // Updates reports and toggles charts
        // Purpose: Initializes data and UI
        await updateReports();
        toggleCharts();
    } catch (err) {
        showToast('Error initializing reports.', 'error');
        console.error('Init error:', err);
        document.querySelector('.rpt-error').style.display = 'block';
    }
}

// Updates reports based on current filters
// Purpose: Filters trades and renders updated reports
async function updateReports() {
    try {
        // Retrieves filter values
        // Purpose: Gets current filter settings from UI
        const accountId = document.getElementById('rpt-report-account').value;
        const dateRangeInput = document.getElementById('rpt-report-date-range').value;
        const pair = document.getElementById('rpt-report-pair').value;
        const strategy = document.getElementById('rpt-report-strategy').value;

        // Validates date range
        // Purpose: Ensures valid date range for filtering
        let dateRange = dateRangeInput ? dateRangeInput.split(' to ').map(d => d.trim()) : [];
        let isValidDateRange = dateRange.length === 2 ? validateDateRange(dateRange[0], dateRange[1]) : true;
        if (dateRange.length === 2 && !isValidDateRange) {
            console.warn('Invalid date range, using all trades:', dateRangeInput);
            showToast('Invalid date range, showing all trades.', 'warning');
            dateRange = [];
        }

        // Loads and deduplicates trades
        // Purpose: Ensures unique trades for accurate reporting
        let allTrades = await loadFromStore('trades');
        const tradeIds = new Set();
        allTrades = allTrades.filter(trade => {
            if (tradeIds.has(trade.id)) {
                console.warn('Duplicate trade ID:', trade.id);
                return false;
            }
            tradeIds.add(trade.id);
            return true;
        });
        console.log('Loaded trades:', allTrades.length, 'Filters:', { accountId, dateRange, pair, strategy }, 'Trade IDs:', allTrades.map(t => t.id));

        // Applies filters to trades
        // Purpose: Narrows down trades based on user selections
        trades = allTrades;
        if (accountId) {
            trades = filterTradesByAccount(trades, parseInt(accountId));
            console.log('Filtered by accountId:', accountId, 'Trades:', trades.length, 'Trade IDs:', trades.map(t => t.id));
        }
        if (dateRange.length === 2 && isValidDateRange) {
            trades = filterTradesByDateRange(trades, dateRange[0], dateRange[1]);
            console.log('Filtered by date range:', dateRange, 'Trades:', trades.length, 'Trade IDs:', trades.map(t => t.id));
        }
        if (pair) {
            trades = trades.filter(t => t.pair === pair);
            console.log('Filtered by pair:', pair, 'Trades:', trades.length, 'Trade IDs:', trades.map(t => t.id));
        }
        if (strategy) {
            trades = trades.filter(t => t.strategy === strategy);
            console.log('Filtered by strategy:', strategy, 'Trades:', trades.length, 'Trade IDs:', trades.map(t => t.id));
        }

        // Filters trades outside trading window
        // Purpose: Identifies trades outside defined trading hours
        let tradingWindowStart = '00:00';
        let tradingWindowEnd = '23:59';
        const savedConfig = await loadFromStore('settings');
        const settings = savedConfig?.find(s => s.id === 'settings')?.tradingWindow;
        if (settings) {
            tradingWindowStart = settings.start || '00:00';
            tradingWindowEnd = settings.end || '23:59';
            console.log(`Fetched trading window: ${tradingWindowStart} - ${tradingWindowEnd}`);
        } else {
            console.warn('No trading window found in settings, using default: 00:00 - 23:59');
        }
        outsideWindowTrades = trades.filter(trade => {
            const isValidTradeTime = trade.tradeTime && /^\d{2}:\d{2}$/.test(trade.tradeTime);
            return isValidTradeTime && isTimeOutsideWindow(trade.tradeTime, tradingWindowStart, tradingWindowEnd);
        });
        console.log('Outside window trades:', outsideWindowTrades.length, 'Trade IDs:', outsideWindowTrades.map(t => t.id));

        // Logs filtered trades
        // Purpose: Debugging aid for filtered trade details
        console.log('Final filtered trades:', trades.length, 'Details:', trades.map(t => ({
            id: t.id,
            date: t.date,
            accountId: t.accountId,
            profitLoss: t.profitLoss,
            commission: t.commission,
            swap: t.swap,
            totalPnl: Number(t.profitLoss) + Number(t.commission) + Number(t.swap)
        })));

        // Calculates initial balance based on account filter
        // Purpose: Determines starting balance for metrics
        const accounts = await loadFromStore('accounts');
        if (accountId) {
            const account = accounts.find(acc => acc.id === parseInt(accountId));
            initialBalance = account?.initialBalance || 10000;
            console.log('Single account initial balance:', initialBalance, 'Account ID:', accountId);
        } else {
            const accountIdsInTrades = [...new Set(trades.map(t => t.accountId))];
            initialBalance = accountIdsInTrades.reduce((sum, id) => {
                const account = accounts.find(acc => acc.id === id);
                const accountBalance = account?.initialBalance || 10000;
                console.log(`Account ID: ${id}, Initial Balance: ${accountBalance}`);
                return sum + accountBalance;
            }, 0);
            console.log('Total initial balance for all accounts with trades:', initialBalance, 'Account IDs:', accountIdsInTrades);
        }

        // Renders empty reports if no trades
        // Purpose: Handles case with no data
        if (!trades.length) {
            renderEmptyPerformance();
            renderEmptyStatistics();
            renderEmptyTraderProfile();
            renderEmptyOutsideWindow();
            return;
        }

        // Renders all report sections
        // Purpose: Updates UI with filtered data
        renderPerformanceMetrics(initialBalance);
        renderStatistics(initialBalance);
        renderTraderProfile(initialBalance);
        renderOutsideWindowReport(initialBalance);
    } catch (err) {
        showToast('Error updating reports.', 'error');
        console.error('Update error:', err);
        renderEmptyPerformance();
        renderEmptyStatistics();
        renderEmptyTraderProfile();
        renderEmptyOutsideWindow();
    }
}

// Generates data for equity curve chart
// Purpose: Creates cumulative P&L data for visualization
export function generateEquityCurveData(trades, initialBalance = 0) {
    // Validates input
    // Purpose: Ensures valid data for chart generation
    if (!trades || !trades.length) {
        console.warn('No trades for equity curve');
        return { labels: [], datasets: [{ label: 'Cumulative P&L ($)', data: [], borderColor: '#007bff', fill: false, tension: 0.1 }] };
    }

    // Sorts trades by datetime
    // Purpose: Ensures chronological order for equity curve
    const sortedTrades = [...trades].sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.tradeTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.tradeTime || '00:00'}`);
        return dateA - dateB;
    });

    // Calculates cumulative balance
    // Purpose: Tracks balance over time
    let balance = initialBalance;
    const data = sortedTrades.map(trade => {
        balance += Number(trade.profitLoss) || 0;
        return {
            date: new Date(trade.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            balance
        };
    });

    // Groups data by date to avoid duplicates
    // Purpose: Ensures one data point per day
    const groupedData = [];
    const seenDates = new Set();
    data.forEach(item => {
        if (!seenDates.has(item.date)) {
            seenDates.add(item.date);
            groupedData.push(item);
        } else {
            groupedData[groupedData.length - 1].balance = item.balance;
        }
    });

    return {
        labels: groupedData.map(d => d.date),
        datasets: [{
            label: 'Cumulative P&L ($)',
            data: groupedData.map(d => d.balance),
            borderColor: '#007bff',
            fill: false,
            tension: 0.1
        }]
    };
}

// Generates data for win/loss pie chart
// Purpose: Creates data for visualizing win/loss distribution
export function generateWinLossData(totalTrades, winRate) {
    console.log('Generating Win/Loss Data:', { totalTrades, winRate });
    // Validates input
    // Purpose: Ensures valid data for chart generation
    if (!totalTrades || isNaN(winRate)) {
        console.warn('Invalid totalTrades or winRate for win/loss chart:', { totalTrades, winRate });
        return { labels: ['Wins', 'Losses'], datasets: [{ data: [0, 0], backgroundColor: ['#28a745', '#dc3545'], hoverOffset: 4 }] };
    }

    // Calculates wins and losses
    // Purpose: Determines data points for pie chart
    const wins = Math.round((winRate / 100) * totalTrades);
    const losses = totalTrades - wins;

    return {
        labels: ['Wins', 'Losses'],
        datasets: [{
            data: [wins, losses],
            backgroundColor: ['#28a745', '#dc3545'],
            hoverOffset: 4
        }]
    };
}

// Generates data for pair P&L chart
// Purpose: Creates data for visualizing P&L by currency pair
export function generatePairPnlData(trades) {
    // Validates input
    // Purpose: Ensures valid data for chart generation
    if (!trades || !trades.length) {
        console.warn('No trades for pair P&L chart');
        return { labels: [], datasets: [{ label: 'Net P&L ($)', data: [], backgroundColor: [], borderColor: '#2c3e50', borderWidth: 1 }] };
    }

    // Aggregates P&L by pair
    // Purpose: Calculates net P&L for each currency pair
    const pairPnl = {};
    trades.forEach(trade => {
        const pair = trade.pair || 'Unknown';
        pairPnl[pair] = (pairPnl[pair] || 0) + (Number(trade.profitLoss) || 0);
    });

    // Selects top 5 pairs by absolute P&L
    // Purpose: Limits chart to most significant pairs
    const sortedPairs = Object.entries(pairPnl)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 5);

    return {
        labels: sortedPairs.map(([pair]) => pair),
        datasets: [{
            label: 'Net P&L ($)',
            data: sortedPairs.map(([, pnl]) => pnl),
            backgroundColor: sortedPairs.map(([, pnl]) => pnl >= 0 ? '#28a745' : '#dc3545'),
            borderColor: '#2c3e50',
            borderWidth: 1
        }]
    };
}

// Renders performance metrics and charts
// Purpose: Displays key performance indicators and related charts
function renderPerformanceMetrics(initialBalance = 10000) {
    // Validates trades
    // Purpose: Ensures valid data for rendering
    if (!trades || !Array.isArray(trades)) {
        console.warn('Trades not initialized in renderPerformanceMetrics');
        document.querySelector('.rpt-performance-metrics').innerHTML = '<p>No trade data available to display performance metrics.</p>';
        return;
    }

    // Adjusts trades to include total P&L
    // Purpose: Accounts for commissions and swaps
    const adjustedTrades = trades.map(trade => {
        const profitLoss = Number(trade.profitLoss) || 0;
        const commission = Number(trade.commission) || 0;
        const swap = Number(trade.swap) || 0;
        const totalPnl = profitLoss + commission + swap;
        return { ...trade, totalPnl };
    });

    // Calculates performance metrics
    // Purpose: Computes key statistics for display
    metrics = {
        totalTrades: trades.length,
        winRate: calculateWinRate(adjustedTrades),
        netPnl: adjustedTrades.reduce((sum, t) => sum + t.totalPnl, 0).toFixed(2),
        avgPnl: adjustedTrades.length ? (adjustedTrades.reduce((sum, t) => sum + t.totalPnl, 0) / adjustedTrades.length).toFixed(2) : 0,
        profitFactor: calculateProfitFactor(adjustedTrades),
        maxDrawdown: calculateDrawdown(adjustedTrades, initialBalance),
        avgWinLoss: calculateAvgWinLoss(adjustedTrades)
    };

    // Calculates additional metrics
    // Purpose: Provides detailed performance insights
    const wins = adjustedTrades.filter(t => t.totalPnl > 0);
    const losses = adjustedTrades.filter(t => t.totalPnl < 0);
    const equity = (initialBalance + parseFloat(metrics.netPnl)).toFixed(2);
    const balance = equity;
    const avgWinningTrade = wins.length ? (wins.reduce((sum, t) => sum + t.totalPnl, 0) / wins.length).toFixed(2) : '0.00';
    const avgLosingTrade = losses.length ? (losses.reduce((sum, t) => sum + t.totalPnl, 0) / losses.length).toFixed(2) : '0.00';
    const tradesCount = metrics.totalTrades;
    const lots = trades.reduce((sum, t) => sum + (Number(t.lotSize) || 0), 0).toFixed(2);
    const avgWinLoss = metrics.avgWinLoss ? Number(metrics.avgWinLoss).toFixed(2) : '0.00';
    const avgRrr = metrics.avgWinLoss ? `1:${(metrics.avgWinLoss ? 1 / metrics.avgWinLoss : 0).toFixed(2)}` : 'N/A';
    const winRate = metrics.winRate.toFixed(2);
    const lossRate = (100 - metrics.winRate).toFixed(2);
    const profitFactor = metrics.profitFactor;
    const bestTrade = adjustedTrades.length ? Math.max(...adjustedTrades.map(t => t.totalPnl)).toFixed(2) : '0.00';
    const worstTrade = adjustedTrades.length ? Math.min(...adjustedTrades.map(t => t.totalPnl)).toFixed(2) : '0.00';
    const longTrades = adjustedTrades.filter(t => t.position === 'buy');
    const shortTrades = adjustedTrades.filter(t => t.position === 'sell');
    const longWins = longTrades.filter(t => t.totalPnl > 0);
    const shortWins = shortTrades.filter(t => t.totalPnl > 0);
    const longWon = longTrades.length ? (longWins.length / longTrades.length * 100).toFixed(2) : '0.00';
    const shortWon = shortTrades.length ? (shortWins.length / shortTrades.length * 100).toFixed(2) : '0.00';
    const grossProfit = wins.reduce((sum, t) => sum + t.totalPnl, 0).toFixed(2);
    const grossLoss = losses.reduce((sum, t) => sum + t.totalPnl, 0).toFixed(2);

    // Logs metrics for debugging
    console.log('Performance Metrics:', {
        ...metrics,
        equity,
        balance,
        avgWinningTrade,
        avgLosingTrade,
        trades: tradesCount,
        lots,
        avgRrr,
        winRate,
        lossRate,
        profitFactor,
        bestTrade,
        worstTrade,
        longWon,
        shortWon,
        grossProfit,
        grossLoss,
        longTrades: longTrades.length,
        shortTrades: shortTrades.length,
        longWins: longWins.length,
        shortWins: shortWins.length
    }, 'Initial Balance:', initialBalance);

    // Defines performance cards
    // Purpose: Prepares data for UI display
    const cards = [
        { title: 'Equity', value: `$${equity}`, icon: 'bi-wallet2' },
        { title: 'Balance', value: `$${balance}`, icon: 'bi-bank' },
        { title: 'Avg. Winning Trade', value: `$${avgWinningTrade}`, icon: 'bi-arrow-up-circle' },
        { title: 'Avg. Losing Trade', value: `$${avgLosingTrade}`, icon: 'bi-arrow-down-circle' },
        { title: 'Trades', value: tradesCount, icon: 'bi-bar-chart' },
        { title: 'Lots', value: lots, icon: 'bi-boxes' },
        { title: 'Avg. RRR', value: avgRrr, icon: 'bi-arrows-expand' },
        { title: 'Win Rate', value: `${winRate}%`, icon: 'bi-pie-chart' },
        { title: 'Loss Rate', value: `${lossRate}%`, icon: 'bi-pie-chart-fill' },
        { title: 'Profit Factor', value: profitFactor, icon: 'bi-arrow-up-circle' },
        { title: 'Best Trade', value: `$${bestTrade}`, icon: 'bi-trophy' },
        { title: 'Worst Trade', value: `$${worstTrade}`, icon: 'bi-exclamation-triangle' },
        { title: 'Long Won', value: `${longWon}%`, icon: 'bi-arrow-up' },
        { title: 'Short Won', value: `${shortWon}%`, icon: 'bi-arrow-down' },
        { title: 'Gross Profit', value: `$${grossProfit}`, icon: 'bi-plus-circle' },
        { title: 'Gross Loss', value: `$${grossLoss}`, icon: 'bi-dash-circle' },
        { title: 'Net P&L', value: `$${metrics.netPnl}`, icon: 'bi-currency-dollar' },
        { title: 'Avg P&L/Trade', value: `$${metrics.avgPnl}`, icon: 'bi-graph-up' },
        { title: 'Max Drawdown', value: `${metrics.maxDrawdown.toFixed(2)}%`, icon: 'bi-arrow-down-circle' },
        { title: 'Win/Loss Ratio', value: avgWinLoss, icon: 'bi-balance-scale' }
    ];

    // Generates insights and advice
    // Purpose: Provides actionable feedback based on metrics
    const { insights, advice } = generatePerformanceInsights();

    // Renders performance metrics to DOM
    // Purpose: Updates UI with cards and insights
    document.querySelector('.rpt-performance-metrics').innerHTML = `
        <div class="performance-widgets">
            ${cards.map(card => `
                <div class="performance-widget">
                    <div class="widget-icon"><i class="${card.icon}"></i></div>
                    <div class="widget-content">
                        <h5 class="widget-title">${card.title}</h5>
                        <p class="widget-value">${card.value}</p>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="performance-insights">
            <h4>Performance Insights</h4>
            <ul>
                ${insights.map(item => `
                    <li class="insight-item insight-${item.type}">
                        <span class="insight-icon">
                            <i class="${item.type === 'positive' ? 'bi-check-circle' : 'bi-exclamation-triangle'}"></i>
                        </span>
                        <span class="insight-text">${item.text}</span>
                    </li>
                `).join('')}
            </ul>
            <h4>Trading Advice</h4>
            <ul>
                ${advice.map(item => `
                    <li class="advice-item advice-${item.type} ${item.isCritical ? 'critical' : ''}">
                        <span class="advice-icon">
                            <i class="${item.type === 'positive' ? 'bi-check-circle' : 'bi-exclamation-triangle'}"></i>
                        </span>
                        <span class="advice-text">${item.text}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;

    // Renders performance charts
    renderPerformanceCharts();
}

// Renders performance charts
// Purpose: Displays equity curve, win/loss, and pair P&L charts
function renderPerformanceCharts() {
    // Checks if charts should be shown
    // Purpose: Respects user preference for chart visibility
    const showCharts = document.getElementById('rpt-show-performance-charts')?.checked || false;
    console.log('Rendering Performance Charts - Show:', showCharts, 'Trades:', trades.length);

    // Validates trades
    // Purpose: Ensures data is available for charts
    if (!trades.length) {
        console.warn('No trades for Performance charts');
        showToast('No data available for Performance charts.', 'warning');
        return;
    }

    // Renders equity curve chart
    const equityChartData = generateEquityCurveData(trades, initialBalance);
    renderChart('.rpt-equity-chart', generateChartData(equityChartData, 'line'), showCharts);

    // Renders win/loss chart
    const winLossChartData = generateWinLossData(metrics.totalTrades, metrics.winRate);
    renderChart('.rpt-win-loss-chart', generateChartData(winLossChartData, 'pie'), showCharts);

    // Renders pair P&L chart
    const pairPnlChartData = generatePairPnlData(trades);
    renderChart('.rpt-pair-pnl-chart', generateChartData(pairPnlChartData, 'bar'), showCharts);
}

// Renders empty performance section
// Purpose: Displays placeholder when no data is available
function renderEmptyPerformance() {
    document.querySelector('.rpt-performance-metrics').innerHTML = '<p>No performance data available.</p>';
}

// Renders statistics tables and charts
// Purpose: Displays grouped trade data by various time periods
function renderStatistics(initialBalance = 10000) {
    // Validates trades
    // Purpose: Ensures data is available for rendering
    if (!trades || !Array.isArray(trades) || !trades.length) {
        console.warn('No trades for Statistics charts');
        renderEmptyStatistics();
        return;
    }

    // Groups and renders data by day of week
    statsData.dayOfWeekData = groupTradesByDayOfWeek(trades);
    console.log('Rendering Day of Week:', statsData.dayOfWeekData);
    renderTable('.rpt-day-week-table', statsData.dayOfWeekData, ['Period', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L/Trade', 'Win/Loss Ratio'], initialBalance);

    // Groups and renders data by week of month
    statsData.weekOfMonthData = groupTradesByWeekOfMonth(trades);
    renderTable('.rpt-week-month-table', statsData.weekOfMonthData, ['Week', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L/Trade', 'Win/Loss Ratio'], initialBalance);

    // Groups and renders data by month of year
    statsData.monthOfYearData = groupTradesByMonthOfYear(trades);
    renderTable('.rpt-month-year-table', statsData.monthOfYearData, ['Month', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L/Trade', 'Win/Loss Ratio', 'Max Drawdown'], initialBalance);

    // Groups and renders data by hour of day
    statsData.hourOfDayData = groupTradesByHourOfDay(trades);
    renderTable('.rpt-hour-day-table', statsData.hourOfDayData, ['Hour', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L/Trade', 'Win/Loss Ratio'], initialBalance);

    // Groups and renders data by trading session
    statsData.tradingSessionData = groupTradesByTradingSession(trades);
    renderTable('.rpt-trading-session-table', statsData.tradingSessionData, ['Session', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L/Trade', 'Win/Loss Ratio'], initialBalance);

    // Groups and renders data by day of month
    statsData.dayOfMonthData = groupTradesByDayOfMonth(trades);
    renderTable('.rpt-day-month-table', statsData.dayOfMonthData, ['Day', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L/Trade', 'Win/Loss Ratio'], initialBalance);

    // Renders charts based on visibility setting
    const showCharts = document.getElementById('rpt-show-charts')?.checked || false;
    renderChart('.rpt-day-week-chart', generateChartData(statsData.dayOfWeekData, 'bar'), showCharts);
    renderChart('.rpt-week-month-chart', generateChartData(statsData.weekOfMonthData, 'bar'), showCharts);
    renderChart('.rpt-month-year-chart', generateChartData(statsData.monthOfYearData, 'line'), showCharts);
    renderChart('.rpt-hour-day-chart', generateChartData(statsData.hourOfDayData, 'bar'), showCharts);
    renderChart('.rpt-trading-session-chart', generateChartData(statsData.tradingSessionData, 'bar'), showCharts);
    renderChart('.rpt-day-month-chart', generateChartData(statsData.dayOfMonthData, 'bar'), showCharts);
}

// Renders empty statistics section
// Purpose: Displays placeholder when no data is available
function renderEmptyStatistics() {
    const selectors = [
        '.rpt-day-week-table',
        '.rpt-week-month-table',
        '.rpt-month-year-table',
        '.rpt-hour-day-table',
        '.rpt-trading-session-table',
        '.rpt-day-month-table'
    ];
    selectors.forEach(selector => {
        document.querySelector(selector).innerHTML = '<tr><td colspan="6">No data available</td></tr>';
    });
}

// Renders a table with trade data
// Purpose: Displays grouped trade data in a tabular format
function renderTable(selector, data, headers, initialBalance = 10000) {
    // Validates table element
    // Purpose: Ensures table exists in DOM
    const table = document.querySelector(selector);
    if (!table) {
        console.error('Table not found:', selector);
        return;
    }

    // Formats table data and filters out empty rows
    // Purpose: Prepares data for display
    const rows = formatTableData(data, headers.includes('Max Drawdown'), initialBalance)
        .filter(row => parseInt(row[1]) > 0)
        .map(row => {
            const netPnl = parseFloat(row[3].replace('$', '')) || 0;
            const isBest = netPnl === Math.max(...data.map(d => parseFloat(d.metrics.netPnl) || 0)) && netPnl !== 0;
            return `<tr${isBest ? ' class="best"' : ''}>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
        });

    // Renders table to DOM
    // Purpose: Updates UI with table data
    table.innerHTML = `
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">No data available</td></tr>`}</tbody>
    `;
    console.log('Rendered table:', selector, 'Headers:', headers, 'Rows:', rows.length, 'Data:', data.map(d => ({ label: d.label, tradeCount: d.metrics.tradeCount })), 'Initial Balance:', initialBalance);
}

// Renders a chart
// Purpose: Displays a chart with specified data and type
function renderChart(selector, chartData, showCharts) {
    // Validates chart container
    // Purpose: Ensures container exists in DOM
    const container = document.querySelector(selector);
    if (!container) {
        console.warn(`Chart container not found: ${selector}`);
        return;
    }

    // Hides chart if not shown or invalid data
    // Purpose: Respects visibility settings and data validity
    if (!showCharts || !chartData || !chartData.data || !chartData.data.labels || !chartData.data.datasets) {
        container.style.display = 'none';
        console.warn(`No chart data or charts hidden for ${selector}`, { chartData, showCharts });
        return;
    }

    // Shows container and ensures canvas exists
    container.style.display = 'block';
    if (!container.querySelector('canvas')) {
        container.innerHTML = '<canvas></canvas>';
    }

    // Renders or updates chart
    // Purpose: Creates or updates Chart.js instance
    const id = selector.replace('.', '');
    if (chartInstances[id]) chartInstances[id].destroy();
    try {
        chartInstances[id] = new Chart(container.querySelector('canvas'), chartData);
        console.log(`Chart rendered for ${selector}`);
    } catch (err) {
        console.error(`Error rendering chart for ${selector}:`, err);
        showToast(`Failed to render chart for ${selector.replace('.rpt-', '').replace('-chart', '')}.`, 'error');
    }
}

// Toggles chart visibility
// Purpose: Shows or hides charts based on checkbox states
function toggleCharts() {
    // Retrieves checkbox states
    // Purpose: Determines which charts to display
    const showChartsPerformance = document.getElementById('rpt-show-performance-charts')?.checked || false;
    const showChartsStatistics = document.getElementById('rpt-show-charts')?.checked || false;
    const showChartsOutsideWindow = document.getElementById('rpt-show-outside-window-charts')?.checked || false;
    console.log('Toggle Charts - Performance:', showChartsPerformance, 'Statistics:', showChartsStatistics, 'Outside Window:', showChartsOutsideWindow, 'Trades:', trades.length, 'Metrics:', metrics, 'Stats Data:', statsData);

    // Defines chart configurations
    // Purpose: Maps chart selectors to their data and visibility
    const chartMap = {
        'rpt-day-week-chart': { data: statsData.dayOfWeekData || [], type: 'bar', show: showChartsStatistics },
        'rpt-week-month-chart': { data: statsData.weekOfMonthData || [], type: 'bar', show: showChartsStatistics },
        'rpt-month-year-chart': { data: statsData.monthOfYearData || [], type: 'line', show: showChartsStatistics },
        'rpt-hour-day-chart': { data: statsData.hourOfDayData || [], type: 'bar', show: showChartsStatistics },
        'rpt-trading-session-chart': { data: statsData.tradingSessionData || [], type: 'bar', show: showChartsStatistics },
        'rpt-day-month-chart': { data: statsData.dayOfMonthData || [], type: 'bar', show: showChartsStatistics },
        'rpt-equity-chart': { data: trades.length ? generateEquityCurveData(trades, initialBalance) : [], type: 'line', show: showChartsPerformance },
        'rpt-win-loss-chart': { data: metrics.totalTrades ? generateWinLossData(metrics.totalTrades, metrics.winRate) : [], type: 'pie', show: showChartsPerformance },
        'rpt-pair-pnl-chart': { data: trades.length ? generatePairPnlData(trades) : [], type: 'bar', show: showChartsPerformance },
        'rpt-outside-window-pnl-chart': { data: outsideWindowTrades.length ? groupTradesByHourOfDay(outsideWindowTrades) : [], type: 'bar', show: showChartsOutsideWindow }
    };

    // Processes each chart container
    // Purpose: Updates visibility and renders charts as needed
    document.querySelectorAll('.rpt-chart-container').forEach(container => {
        const chartId = container.classList[1];
        const chartConfig = chartMap[chartId];
        if (chartConfig) {
            console.log(`Processing chart: ${chartId}, Show: ${chartConfig.show}, Data:`, chartConfig.data);
            const chartData = generateChartData(chartConfig.data, chartConfig.type);
            const hasValidData = chartData?.data?.labels?.length > 0 && chartData?.data?.datasets?.length > 0;
            console.log(`Chart ${chartId} - Valid data: ${hasValidData}, Labels: ${chartData?.data?.labels?.length || 0}, Datasets: ${chartData?.data?.datasets?.length || 0}`);
            if (chartConfig.show && hasValidData) {
                console.log(`Rendering chart ${chartId}, Type: ${chartConfig.type}, Labels:`, chartData.data.labels, 'Datasets:', chartData.data.datasets);
                renderChart(`.${chartId}`, chartData, true);
                container.style.display = 'block';
            } else {
                console.log(`Hiding chart ${chartId}: Show=${chartConfig.show}, ValidData=${hasValidData}`);
                container.style.display = 'none';
                if (chartInstances[chartId]) {
                    chartInstances[chartId].destroy();
                    delete chartInstances[chartId];
                    console.log(`Destroyed chart instance: ${chartId}`);
                }
            }
        } else {
            console.warn(`No chart config for ${chartId} - ignoring container`);
            container.style.display = 'none';
        }
    });
}

// Resets all filters
// Purpose: Clears filter selections and updates reports
function resetFilters() {
    document.getElementById('rpt-report-account').value = '';
    document.getElementById('rpt-report-date-range').value = '';
    document.getElementById('rpt-report-pair').value = '';
    document.getElementById('rpt-report-strategy').value = '';
    updateReports();
}

// Generates performance insights and advice
// Purpose: Provides actionable feedback based on performance metrics
function generatePerformanceInsights() {
    const insights = [];
    const advice = [];

    // Generates summary insight
    // Purpose: Provides overview of performance
    const summaryText = metrics.netPnl < 0 
        ? `Summary: You're at a net loss of $${metrics.netPnl} with a win rate of ${metrics.winRate}% and a drawdown of ${metrics.maxDrawdown}%. Focus on improving consistency and managing risk.`
        : `Summary: You've achieved a net profit of $${metrics.netPnl} with a win rate of ${metrics.winRate}% and a drawdown of ${metrics.maxDrawdown}%. Continue leveraging your strengths.`;
    insights.push({ text: summaryText, type: metrics.netPnl < 0 ? 'negative' : 'positive' });

    // Overall performance insight
    if (metrics.netPnl < 0) {
        insights.push({ text: `Overall Performance: You're currently at a net loss of $${metrics.netPnl}, indicating challenges in your trading strategy.`, type: 'negative' });
        advice.push({ text: `Focus on reducing losses by analyzing your losing trades and adjusting your strategy. Consider using stop-loss orders to limit downside risk.`, type: 'negative' });
    } else {
        insights.push({ text: `Overall Performance: You've achieved a net profit of $${metrics.netPnl}, showing a positive trading outcome.`, type: 'positive' });
        advice.push({ text: `Maintain your current strategy but look for opportunities to scale up winning trades while managing risk.`, type: 'positive' });
    }

    // Win rate insights
    if (metrics.winRate < 40) {
        insights.push({ text: `Win Rate Concern: Your win rate (${metrics.winRate}%) is below 40%, suggesting inconsistent performance.`, type: 'negative' });
        advice.push({ text: `Work on improving your trade selection criteria or entry/exit timing to boost your win rate.`, type: 'negative' });
    } else if (metrics.winRate > 60) {
        insights.push({ text: `Strong Win Rate: Your win rate (${metrics.winRate}%) is above 60%, indicating consistent success in trade outcomes.`, type: 'positive' });
        advice.push({ text: `Leverage your high win rate by increasing trade frequency in favorable conditions, but monitor for overconfidence.`, type: 'positive' });
    }

    // Drawdown insights
    let criticalAdviceIndex = -1;
    if (metrics.maxDrawdown < -50) {
        insights.push({ text: `Risk Alert: Your maximum drawdown (${metrics.maxDrawdown}%) is significant, indicating high risk exposure.`, type: 'negative' });
        advice.push({ text: `Implement stricter risk management practices, such as reducing trade sizes or setting tighter stop-losses, to protect your capital.`, type: 'negative', isCritical: true });
        criticalAdviceIndex = advice.length - 1;
    }

    // Outside window trades insights
    if (outsideWindowTrades.length > 0) {
        const outsideWinRate = calculateWinRate(outsideWindowTrades).toFixed(2);
        const outsideNetPnl = outsideWindowTrades.reduce((sum, t) => sum + (Number(t.profitLoss) || 0), 0).toFixed(2);
        insights.push({
            text: `Outside Window Trades: ${outsideWindowTrades.length} trades occurred outside your trading window, with a ${outsideWinRate}% win rate and $${outsideNetPnl} net P&L.`,
            type: outsideNetPnl < 0 ? 'negative' : 'positive'
        });
        advice.push({
            text: outsideWinRate < 50
                ? `Avoid trading outside your defined window to improve consistency and reduce losses.`
                : `Continue monitoring outside-window trades, as they contribute positively, but ensure they align with your strategy.`,
            type: outsideWinRate < 50 ? 'negative' : 'positive'
        });
    }

    // Day of week insights
    if (statsData.dayOfWeekData?.length) {
        const bestDay = statsData.dayOfWeekData.reduce((best, curr) => parseFloat(curr.metrics.netPnl) > parseFloat(best.metrics.netPnl) ? curr : best);
        const worstDay = statsData.dayOfWeekData.reduce((worst, curr) => parseFloat(curr.metrics.netPnl) < parseFloat(worst.metrics.netPnl) ? curr : worst);
        const bestWinRateDay = statsData.dayOfWeekData.reduce((best, curr) => parseFloat(curr.metrics.winRate) > parseFloat(best.metrics.winRate) ? curr : best);
        const worstWinRateDay = statsData.dayOfWeekData.reduce((worst, curr) => parseFloat(curr.metrics.winRate) < parseFloat(worst.metrics.winRate) ? curr : worst);

        insights.push({ text: `Best Day: You perform best on ${bestDay.label} with a Net P&L of $${bestDay.metrics.netPnl}.`, type: 'positive' });
        advice.push({ text: `Increase trading activity on ${bestDay.label} to capitalize on your strong performance.`, type: 'positive' });
        insights.push({ text: `Worst Day: Your weakest performance is on ${worstDay.label} with a Net P&L of $${worstDay.metrics.netPnl}.`, type: 'negative' });
        advice.push({ text: `Consider reducing or avoiding trades on ${worstDay.label}, or analyze what went wrong to improve.`, type: 'negative' });

        insights.push({ text: `Best Win Rate Day: ${bestWinRateDay.label} has the highest win rate at ${bestWinRateDay.metrics.winRate}%.`, type: 'positive' });
        advice.push({ text: `Leverage your high win rate on ${bestWinRateDay.label} by focusing on strategies that work well on that day.`, type: 'positive' });
        insights.push({ text: `Worst Win Rate Day: ${worstWinRateDay.label} has the lowest win rate at ${worstWinRateDay.metrics.winRate}%.`, type: 'negative' });
        advice.push({ text: `Improve your trade outcomes on ${worstWinRateDay.label} by refining your entry/exit timing or avoiding trades on that day.`, type: 'negative' });
    }

    // Hour of day insights
    if (statsData.hourOfDayData?.length) {
        const bestHour = statsData.hourOfDayData.reduce((best, curr) => parseFloat(curr.metrics.netPnl) > parseFloat(best.metrics.netPnl) ? curr : best);
        const worstHour = statsData.hourOfDayData.reduce((worst, curr) => parseFloat(curr.metrics.netPnl) < parseFloat(worst.metrics.netPnl) ? curr : worst);
        insights.push({ text: `Best Hour: Your highest P&L occurs at ${bestHour.label} with $${bestHour.metrics.netPnl}.`, type: 'positive' });
        advice.push({ text: `Focus more trading activity around ${bestHour.label} to maximize profits.`, type: 'positive' });
        insights.push({ text: `Worst Hour: You've lost the most at ${worstHour.label} with $${worstHour.metrics.netPnl}.`, type: 'negative' });
        advice.push({ text: `Avoid trading at ${worstHour.label} or adjust your strategy during this time to minimize losses.`, type: 'negative' });
        if (criticalAdviceIndex === -1) {
            criticalAdviceIndex = advice.length - 1;
        }
    }

    // Pair P&L insights
    const pairPnlData = generatePairPnlData(trades);
    if (pairPnlData.labels?.length) {
        const bestPair = pairPnlData.datasets[0].data.reduce((max, curr, index) => curr > max.value ? { value: curr, index } : max, { value: -Infinity, index: -1 });
        const worstPair = pairPnlData.datasets[0].data.reduce((min, curr, index) => curr < min.value ? { value: curr, index } : min, { value: Infinity, index: -1 });
        if (bestPair.index !== -1) {
            const bestPnl = bestPair.value.toFixed(2);
            const bestPairName = pairPnlData.labels[bestPair.index];
            if (bestPnl >= 0) {
                insights.push({ text: `Best Pair: ${bestPairName} has the highest P&L at $${bestPnl}.`, type: 'positive' });
                advice.push({ text: `Consider allocating more capital to ${bestPairName} trades, as they are performing well.`, type: 'positive' });
            } else {
                insights.push({ text: `Least Loss Pair: ${bestPairName} has the least negative P&L at $${bestPnl} among your top pairs.`, type: 'negative' });
                advice.push({ text: `While ${bestPairName} is your least negative pair, it's still a loss. Reassess your strategy for this pair to turn it profitable.`, type: 'negative' });
            }
        }
        if (worstPair.index !== -1) {
            const worstPnl = worstPair.value.toFixed(2);
            const worstPairName = pairPnlData.labels[worstPair.index];
            insights.push({ text: `Worst Pair: ${worstPairName} has the lowest P&L at $${worstPnl}.`, type: 'negative' });
            advice.push({ text: `Reduce exposure to ${worstPairName} or reassess your strategy for this pair to avoid further losses.`, type: 'negative' });
        }
    }

    // Marks critical advice
    if (criticalAdviceIndex !== -1 && advice[criticalAdviceIndex]) {
        advice[criticalAdviceIndex].isCritical = true;
    }

    return { insights, advice };
}

// Renders trader profile section
// Purpose: Displays trader behavior and performance metrics
function renderTraderProfile(initialBalance = 10000) {
    // Validates trades
    // Purpose: Ensures data is available for rendering
    if (!trades || !Array.isArray(trades)) {
        console.warn('Trades not initialized in renderTraderProfile');
        document.querySelector('.rpt-trader-profile').innerHTML = '<p>No trade data available to display trader profile.</p>';
        return;
    }

    // Adjusts trades to include total P&L
    // Purpose: Accounts for commissions and swaps
    const adjustedTrades = trades.map(trade => {
        const profitLoss = Number(trade.profitLoss) || 0;
        const commission = Number(trade.commission) || 0;
        const swap = Number(trade.swap) || 0;
        const totalPnl = profitLoss + commission + swap;
        return { ...trade, totalPnl };
    });

    // Calculates profile metrics
    // Purpose: Computes key statistics for trader profile
    const profileMetrics = {
        totalTrades: trades.length,
        winRate: calculateWinRate(adjustedTrades).toFixed(2),
        netPnl: adjustedTrades.reduce((sum, t) => sum + t.totalPnl, 0).toFixed(2),
        maxDrawdown: calculateDrawdown(adjustedTrades, initialBalance).toFixed(2),
        avgLotSize: trades.length ? (trades.reduce((sum, t) => sum + Number(t.lotSize), 0) / trades.length).toFixed(2) : '0.00'
    };

    // Analyzes trading behavior
    const sequences = analyzeTradeSequences(trades);
    const risk = calculateRiskVariability(trades);
    const markets = groupTradesByMarket(trades);
    const positionBias = calculatePositionBias(trades);
    const dayData = groupTradesByDayOfWeek(trades);

    // Generates insights and advice
    const { profileInsights, profileAdvice } = generateTraderProfileInsights(profileMetrics, sequences, risk, markets, positionBias, dayData);

    // Defines profile cards
    const cards = [
        { title: 'Total Trades', value: profileMetrics.totalTrades, icon: 'bi-bar-chart' },
        { title: 'Win Rate', value: `${profileMetrics.winRate}%`, icon: 'bi-pie-chart' },
        { title: 'Net P&L', value: `$${profileMetrics.netPnl}`, icon: 'bi-currency-dollar' },
        { title: 'Max Drawdown', value: `${profileMetrics.maxDrawdown}%`, icon: 'bi-arrow-down-circle' },
        { title: 'Avg Lot Size', value: profileMetrics.avgLotSize, icon: 'bi-boxes' }
    ];

    // Renders profile to DOM
    document.querySelector('.rpt-trader-profile').innerHTML = `
        <div class="profile-metrics">
            ${cards.map(card => `
                <div class="rpt-profile-card">
                    <div class="profile-icon"><i class="${card.icon}"></i></div>
                    <div class="profile-content">
                        <h5>${card.title}</h5>
                        <p>${card.value}</p>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="rpt-profile-insights">
            <h4>Trader Profile Insights</h4>
            <ul>
                ${profileInsights.map(item => `
                    <li class="insight-item insight-${item.type}">
                        <span class="insight-icon">
                            <i class="${item.type === 'positive' ? 'bi-check-circle' : 'bi-exclamation-triangle'}"></i>
                        </span>
                        <span class="insight-text">${item.text}</span>
                    </li>
                `).join('')}
            </ul>
            <h4>Trading Advice</h4>
            <ul>
                ${profileAdvice.map(item => `
                    <li class="advice-item advice-${item.type} ${item.isCritical ? 'critical' : ''}">
                        <span class="advice-icon">
                            <i class="${item.type === 'positive' ? 'bi-check-circle' : 'bi-exclamation-triangle'}"></i>
                        </span>
                        <span class="advice-text">${item.text}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
    console.log('Rendered Trader Profile:', { metrics: profileMetrics, insights: profileInsights.length, advice: profileAdvice.length });
}

// Renders empty trader profile
// Purpose: Displays placeholder when no data is available
function renderEmptyTraderProfile() {
    document.querySelector('.rpt-trader-profile').innerHTML = '<p>No trader profile data available.</p>';
}

// Generates trader profile insights and advice
// Purpose: Provides feedback on trader behavior and performance
function generateTraderProfileInsights(metrics, sequences, risk, markets, positionBias, dayData) {
    const insights = [];
    const advice = [];
    let criticalAdviceIndex = -1;

    // Trader quality insights
    insights.push({
        text: `Trader Quality: You have a ${metrics.winRate}% win rate and $${metrics.netPnl} net P&L across ${metrics.totalTrades} trades, indicating ${metrics.netPnl < 0 ? 'challenges in achieving consistent profitability' : 'potential for profitability'}.`,
        type: metrics.netPnl < 0 ? 'negative' : 'positive'
    });
    advice.push({
        text: metrics.netPnl < 0
            ? 'Refine your trade selection and risk management to improve profitability.'
            : 'Continue leveraging your strengths and consider scaling successful strategies.',
        type: metrics.netPnl < 0 ? 'negative' : 'positive'
    });

    // Win rate insights
    if (metrics.winRate < 40) {
        insights.push({ text: `Low Win Rate: Your ${metrics.winRate}% win rate suggests difficulty in selecting winning trades.`, type: 'negative' });
        advice.push({ text: 'Backtest your setups to improve win rate, focusing on high-probability entries.', type: 'negative' });
    } else if (metrics.winRate > 60) {
        insights.push({ text: `Strong Win Rate: Your ${metrics.winRate}% win rate indicates consistent trade selection.`, type: 'positive' });
        advice.push({ text: 'Maintain your approach but monitor for overconfidence in favorable conditions.', type: 'positive' });
    }

    // Drawdown insights
    if (metrics.maxDrawdown < -20) {
        insights.push({ text: `High Drawdown: A ${metrics.maxDrawdown}% drawdown indicates significant risk exposure.`, type: 'negative' });
        advice.push({ text: 'Implement stricter risk controls, such as 1-2% risk per trade, to protect capital.', type: 'negative', isCritical: true });
        criticalAdviceIndex = advice.length - 1;
    }

    // Emotional trading insights
    if (sequences.rapidSequences.length > 2) {
        const rapidDays = [...new Set(sequences.rapidSequences.map(s => s.date))];
        insights.push({ text: `Emotional Trading: You executed rapid trade sequences on ${rapidDays.length} day(s), suggesting impulsive behavior.`, type: 'negative' });
        advice.push({ text: `Pause trading after 2-3 trades in 15 minutes to avoid emotional decisions.`, type: 'negative' });
    }
    if (sequences.largeLosses.length > 0) {
        const largeLossDates = sequences.largeLosses.map(l => l.date).join(', ');
        insights.push({ text: `Large Losses: You incurred ${sequences.largeLosses.length} loss(es) over $500 on ${largeLossDates}, possibly due to emotional trading.`, type: 'negative' });
        advice.push({ text: `Review large loss trades for emotional triggers and use stop-losses consistently.`, type: 'negative' });
    }
    const prematureExits = trades.filter(t => t.actualRR != null && t.plannedRR != null && t.outcome === 'Win' && Number(t.actualRR) < Number(t.plannedRR) * 0.5).length;
    if (prematureExits > trades.length * 0.2) {
        insights.push({ text: `Premature Exits: You closed ${prematureExits} winning trades significantly below planned RR, possibly due to fear.`, type: 'negative' });
        advice.push({ text: `Use trailing stops or partial profit-taking to hold winners longer.`, type: 'negative' });
    }

    // Overtrading insights
    const dailyCounts = groupTradesByDayOfMonth(trades).map(d => ({ date: d.trades[0]?.date, count: d.metrics.tradeCount }));
    const highVolumeDays = dailyCounts.filter(d => d.count > 10);
    if (highVolumeDays.length > 0) {
        const highVolumeDates = highVolumeDays.map(d => d.date).join(', ');
        insights.push({ text: `Overtrading: You executed over 10 trades/day on ${highVolumeDates}, potentially reducing setup quality.`, type: 'negative' });
        advice.push({ text: `Cap trades at 3-5/day, focusing on high-probability setups.`, type: 'negative' });
        if (criticalAdviceIndex === -1) criticalAdviceIndex = advice.length - 1;
    } else if (dailyCounts.some(d => d.count > 5)) {
        insights.push({ text: `Moderate Trading Volume: Some days exceed 5 trades, which may indicate overtrading.`, type: 'negative' });
        advice.push({ text: `Limit trades to 3-5/day to maintain discipline and focus.`, type: 'negative' });
    }

    // Risk management insights
    if (risk.lotSizeVariance > 1 || risk.riskVariance > 50) {
        insights.push({ text: `Inconsistent Risk: High lot size (${risk.lotSizeVariance.toFixed(2)}) and risk (${risk.riskVariance.toFixed(2)}) variability suggest uneven position sizing.`, type: 'negative' });
        advice.push({ text: `Standardize risk at 1-2% per trade, adjusting lot sizes based on stop-loss distance.`, type: 'negative' });
    }
    if (risk.stopLossUsage < 90) {
        insights.push({ text: `Low Stop-Loss Usage: Only ${risk.stopLossUsage}% of trades have stop-losses, increasing risk exposure.`, type: 'negative' });
        advice.push({ text: `Always set stop-losses to limit potential losses, especially in volatile markets.`, type: 'negative' });
    }
    const highRiskTrades = trades.filter(t => Number(t.lotSize) > 10 || (t.actualRisk != null && Number(t.actualRisk) > 100));
    if (highRiskTrades.length > 0) {
        insights.push({ text: `High-Risk Trades: ${highRiskTrades.length} trade(s) with large lot sizes or risk, leading to significant losses.`, type: 'negative' });
        advice.push({ text: `Reduce lot sizes and risk per trade to avoid catastrophic losses.`, type: 'negative' });
    }

    // Consistency insights
    if (dayData.length) {
        const bestDay = dayData.reduce((best, curr) => parseFloat(curr.metrics.winRate) > parseFloat(best.metrics.winRate) ? curr : best);
        const worstDay = dayData.reduce((worst, curr) => parseFloat(curr.metrics.winRate) < parseFloat(worst.metrics.winRate) ? curr : worst);
        if (bestDay.metrics.winRate > 60) {
            insights.push({ text: `Consistent Day: ${bestDay.label} has a strong ${bestDay.metrics.winRate}% win rate.`, type: 'positive' });
            advice.push({ text: `Focus trading on ${bestDay.label} to capitalize on consistent performance.`, type: 'positive' });
        }
        if (worstDay.metrics.winRate < 40) {
            insights.push({ text: `Inconsistent Day: ${worstDay.label} has a low ${worstDay.metrics.winRate}% win rate.`, type: 'negative' });
            advice.push({ text: `Analyze ${worstDay.label} trades to improve consistency or reduce activity.`, type: 'negative' });
        }
    }
    if (markets.length) {
        const bestMarket = markets.reduce((best, curr) => parseFloat(curr.metrics.netPnl) > parseFloat(best.metrics.netPnl) ? curr : best);
        const worstMarket = markets.reduce((worst, curr) => parseFloat(curr.metrics.netPnl) < parseFloat(worst.metrics.netPnl) ? curr : worst);
        insights.push({ text: `Best Market: ${bestMarket.label} has a net P&L of $${bestMarket.metrics.netPnl}.`, type: 'positive' });
        advice.push({ text: `Allocate more capital to ${bestMarket.label} trades, where you perform well.`, type: 'positive' });
        insights.push({ text: `Worst Market: ${worstMarket.label} has a net P&L of $${worstMarket.metrics.netPnl}.`, type: 'negative' });
        advice.push({ text: `Reassess your strategy for ${worstMarket.label} to improve performance.`, type: 'negative' });
    }
    if (positionBias.sellCount / (positionBias.buyCount + positionBias.sellCount) > 0.7) {
        insights.push({ text: `Sell-Side Bias: ${positionBias.sellCount} sell trades vs. ${positionBias.buyCount} buy trades, potentially limiting adaptability.`, type: 'negative' });
        advice.push({ text: `Test buy-side setups to balance your trading approach, using higher timeframes for trend confirmation.`, type: 'negative' });
    }
    if (Math.abs(positionBias.buyWinRate - positionBias.sellWinRate) > 20) {
        const stronger = positionBias.buyWinRate > positionBias.sellWinRate ? 'buy' : 'sell';
        insights.push({ text: `Position Imbalance: ${stronger.charAt(0).toUpperCase() + stronger.slice(1)} trades have a ${stronger === 'buy' ? positionBias.buyWinRate : positionBias.sellWinRate}% win rate, significantly outperforming ${stronger === 'buy' ? 'sell' : 'buy'} trades.`, type: stronger === 'buy' ? 'positive' : 'negative' });
        advice.push({ text: `Focus on ${stronger} trades where you perform better, while improving ${stronger === 'buy' ? 'sell' : 'buy'} trade setups.`, type: stronger === 'buy' ? 'positive' : 'negative' });
    }

    // Action plan insights
    insights.push({ text: `Action Plan: To improve, focus on short-term discipline, medium-term strategy refinement, and long-term consistency.`, type: 'positive' });
    advice.push({ text: `Short-Term: Limit trades to 3-5/day, risk 1% per trade, and journal emotional states.`, type: 'positive' });
    advice.push({ text: `Medium-Term: Backtest H1 setups, use trailing stops, and analyze high-volume days for overtrading triggers.`, type: 'positive' });
    advice.push({ text: `Long-Term: Test strategies in a demo account, track win rate and P&L, and aim for 50%+ win rate.`, type: 'positive' });

    // Marks critical advice
    if (criticalAdviceIndex !== -1 && advice[criticalAdviceIndex]) {
        advice[criticalAdviceIndex].isCritical = true;
    }

    return { profileInsights: insights, profileAdvice: advice };
}

// Renders outside window trades report
// Purpose: Displays trades outside defined trading window
function renderOutsideWindowReport(initialBalance = 10000) {
    // Validates outside window trades
    // Purpose: Ensures data is available for rendering
    if (!outsideWindowTrades || !Array.isArray(outsideWindowTrades)) {
        console.warn('No outside window trades for report');
        renderEmptyOutsideWindow();
        return;
    }

    // Handles case with no outside window trades
    if (outsideWindowTrades.length === 0) {
        document.querySelector('.rpt-outside-window').innerHTML = `
            <p>No trades found outside the trading window. All trades are within the defined window or have invalid time formats.</p>
        `;
        console.log('Rendered empty Outside Window Report: no trades outside window');
        return;
    }

    // Adjusts trades to include total P&L
    const adjustedTrades = outsideWindowTrades.map(trade => {
        const profitLoss = Number(trade.profitLoss) || 0;
        const commission = Number(trade.commission) || 0;
        const swap = Number(trade.swap) || 0;
        const totalPnl = profitLoss + commission + swap;
        return { ...trade, totalPnl };
    });

    // Calculates metrics for outside window trades
    const metrics = {
        totalTrades: adjustedTrades.length,
        winRate: calculateWinRate(adjustedTrades, 'totalPnl').toFixed(2),
        netPnl: adjustedTrades.reduce((sum, t) => sum + t.totalPnl, 0).toFixed(2),
        avgPnl: adjustedTrades.length ? (adjustedTrades.reduce((sum, t) => sum + t.totalPnl, 0) / adjustedTrades.length).toFixed(2) : '0.00',
        winLossRatio: Number(calculateAvgWinLoss(adjustedTrades, 'totalPnl')).toFixed(2)
    };

    // Defines metric cards
    const cards = [
        { title: 'Total Trades', value: metrics.totalTrades, icon: 'bi-bar-chart' },
        { title: 'Win Rate', value: `${metrics.winRate}%`, icon: 'bi-pie-chart' },
        { title: 'Net P&L', value: `$${metrics.netPnl}`, icon: 'bi-currency-dollar' },
        { title: 'Avg P&L/Trade', value: `$${metrics.avgPnl}`, icon: 'bi-graph-up' },
        { title: 'Win/Loss Ratio', value: metrics.winLossRatio, icon: 'bi-balance-scale' }
    ];

    // Generates trade list for table
    const tradeList = adjustedTrades.map(trade => `
        <tr>
            <td>${trade.date || '-'}</td>
            <td>${trade.tradeTime || '-'}</td>
            <td>${trade.pair || '-'}</td>
            <td>${trade.strategy || '-'}</td>
            <td><span class="badge ${trade.outcome === 'Win' ? 'bg-success' : 'bg-danger'}">${trade.outcome || '-'}</span></td>
            <td class="${trade.totalPnl >= 0 ? 'text-success' : 'text-danger'}">$${trade.totalPnl.toFixed(2)}</td>
        </tr>
    `).join('');

    // Groups data for chart
    const hourPnlData = groupTradesByHourOfDay(outsideWindowTrades);
    const showCharts = document.getElementById('rpt-show-outside-window-charts')?.checked || false;

    // Renders report to DOM
    document.querySelector('.rpt-outside-window').innerHTML = `
        <div class="profile-metrics">
            ${cards.map(card => `
                <div class="rpt-profile-card">
                    <div class="profile-icon"><i class="${card.icon}"></i></div>
                    <div class="profile-content">
                        <h5>${card.title}</h5>
                        <p>${card.value}</p>
                    </div>
                </div>
            `).join('')}
        </div>
        <h5>Outside Window Trades</h5>
        <div class="table-responsive">
            <table class="table rpt-table rpt-outside-window-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Pair</th>
                        <th>Strategy</th>
                        <th>Outcome</th>
                        <th>P&L</th>
                    </tr>
                </thead>
                <tbody>${tradeList}</tbody>
            </table>
        </div>
        <div class="rpt-chart-container rpt-outside-window-pnl-chart"></div>
    `;

    // Renders chart
    renderChart('.rpt-outside-window-pnl-chart', generateChartData(hourPnlData, 'bar', 'netPnl'), showCharts);
    console.log('Rendered Outside Window Report:', { metrics, tradeCount: adjustedTrades.length });
}

// Renders empty outside window report
// Purpose: Displays placeholder when no data is available
function renderEmptyOutsideWindow() {
    document.querySelector('.rpt-outside-window').innerHTML = '<p>No outside window trade data available.</p>';
}

// Exports reports to CSV
// Purpose: Saves performance and statistics data to a CSV file
async function exportCSV() {
    try {
        console.log('Exporting CSV');
        let csv = '';

        // Exports performance metrics
        const performanceElement = document.querySelector('.rpt-performance-metrics');
        if (performanceElement && performanceElement.innerText.trim()) {
            csv += 'Performance Metrics\n';
            csv += performanceElement.innerText.replace(/\n/g, ',') + '\n\n';
        } else {
            console.warn('Performance metrics element empty or not found for CSV');
            showToast('Performance metrics not available for export.', 'warning');
        }

        // Exports statistics tables
        csv += 'Day of Week\n' + tableToCsv('.rpt-day-week-table') + '\n';
        csv += 'Week of Month\n' + tableToCsv('.rpt-week-month-table') + '\n';
        csv += 'Month of Year\n' + tableToCsv('.rpt-month-year-table') + '\n';
        csv += 'Hour of Day\n' + tableToCsv('.rpt-hour-day-table') + '\n';
        csv += 'Trading Session\n' + tableToCsv('.rpt-trading-session-table') + '\n';
        csv += 'Day of Month\n' + tableToCsv('.rpt-day-month-table') + '\n';
        csv += 'Outside Window Trades\n' + tableToCsv('.rpt-outside-window-table') + '\n';

        // Validates CSV content
        if (!csv.trim()) {
            console.warn('No data selected for CSV export');
            showToast('No data available for CSV export.', 'warning');
            return;
        }

        // Creates and downloads CSV file
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trading_report.csv';
        a.click();
        URL.revokeObjectURL(url);
        console.log('CSV export completed');
    } catch (err) {
        console.error('CSV export error:', err);
        showToast('Failed to export CSV: ' + err.message, 'error');
        throw err;
    }
}

// Converts table to CSV format
// Purpose: Extracts table data for export
function tableToCsv(selector) {
    const table = document.querySelector(selector);
    const rows = Array.from(table.querySelectorAll('tr')).map(row => Array.from(row.cells).map(cell => `"${cell.textContent.replace(/"/g, '""')}"`).join(','));
    return rows.join('\n');
}

// Initializes reports on page load
// Purpose: Starts report generation when DOM is ready
document.addEventListener('DOMContentLoaded', initReports);