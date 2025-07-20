/* CHANGES START: Remove dashboard-specific DOM cache and analytics rendering */
import {calculateStrategyMetrics,calculateAccountBalance,showToast, formatHoldTime, TagManager, parseHoldTime, isTimeOutsideWindow } from './utils.js';
import { calculateDailyLoss } from './trade.js';
import { validateField,settings } from './main.js';
import { renderCalendar, renderYearlyOverview, calculateYearlyStats } from './calendar.js';
import { loadFromStore } from './data.js';


const Clusterize = window.Clusterize;

const domCache = {
    tradeBody: document.getElementById('trade-body'),
    tradeHeader: document.getElementById('trade-header'),
    dailyPlanBody: document.getElementById('daily-plan-body'),
    dailyStats: document.getElementById('daily-stats'),
    dailyTradesBody: document.getElementById('daily-trades-body'),
    weeklyReviewBody: document.getElementById('weekly-review-body'),
    strategyList: document.getElementById('strategy-list'),
    filterInput: document.getElementById('filter-input'),
    sortSelect: document.getElementById('sort-select'),
    tradeForm: document.getElementById('trade-form'),
    pagination: document.getElementById('pagination'),
    filterSummary: document.getElementById('filter-summary'),
    accountListBody: document.getElementById('account-list-body'),
    pairListBody: document.getElementById('pair-list-body'),
    dailyPlanModal: document.getElementById('dailyPlanModal'),
    dailyPlanContent: document.getElementById('daily-plan-content'),
    dailyPlanAccount: document.getElementById('daily-plan-account'),
    dailyPlanDate: document.getElementById('daily-plan-date'),
    dailyPlanGamePlan: document.getElementById('daily-plan-game-plan'),
    dailyPlanMarketBias: document.getElementById('daily-plan-market-bias'),
    dailyPlanEmotions: document.getElementById('daily-plan-emotions'),
    dailyPlanConfidence: document.getElementById('daily-plan-confidence'),
    dailyPlanTrades: document.getElementById('daily-plan-trades'),
    tradeDetailsSection: document.getElementById('trade-details-section'),
    tradeDetailTime: document.getElementById('trade-detail-time'),
    tradeDetailPair: document.getElementById('trade-detail-pair'),
    tradeDetailStrategy: document.getElementById('trade-detail-strategy'),
    tradeDetailType: document.getElementById('trade-detail-type'),
    tradeDetailTimeframe: document.getElementById('trade-detail-timeframe'),
    tradeDetailScore: document.getElementById('trade-detail-score'),
    tradeDetailOutcome: document.getElementById('trade-detail-outcome'),
    tradeDetailPnl: document.getElementById('trade-detail-pnl'),
    tradeDetailBalance: document.getElementById('trade-detail-balance'),
    tradeDetailPlannedRisk: document.getElementById('trade-detail-planned-risk'),
    tradeDetailActualRisk: document.getElementById('trade-detail-actual-risk'),
    tradeDetailPlannedRr: document.getElementById('trade-detail-planned-rr'),
    tradeDetailActualRr: document.getElementById('trade-detail-actual-rr'),
    tradeDetailLotSize: document.getElementById('trade-detail-lot-size'),
    tradeDetailStopLoss: document.getElementById('trade-detail-stop-loss'),
    tradeDetailEntryPrice: document.getElementById('trade-detail-entry-price'),
    tradeDetailSlPrice: document.getElementById('trade-detail-sl-price'),
    tradeDetailExitPrice: document.getElementById('trade-detail-exit-price'),
    tradeDetailHoldTime: document.getElementById('trade-detail-hold-time'),
    tradeDetailExitReason: document.getElementById('trade-detail-exit-reason'),
    tradeDetailSession: document.getElementById('trade-detail-session'),
    tradeDetailMood: document.getElementById('trade-detail-mood'),
    tradeDetailDisciplineScore: document.getElementById('trade-detail-discipline-score'),
    tradeDetailOutsideWindow: document.getElementById('trade-detail-outside-window'),
    tradeDetailMistakes: document.getElementById('trade-detail-mistakes'),
    tradeDetailEmotions: document.getElementById('trade-detail-emotions'),
    tradeDetailCustomTags: document.getElementById('trade-detail-custom-tags'),
    tradeDetailNotes: document.getElementById('trade-detail-notes'),
    tradeDetailScreenshots: document.getElementById('trade-detail-screenshots'),
    fullScreenImageModal: document.getElementById('fullScreenImageModal'),
    fullScreenImage: document.getElementById('full-screen-image')
};

let loadedTrades = [];
let isLoading = false;
let cachedFilteredTrades = null;
let lastFilters = null;
let clusterize = null;

let yearlyOverviewYear = new Date().getFullYear();
let calendarYear = new Date().getFullYear();
let calendarMonth = new Date().getMonth();
let strategyList = [];



// Ensure Bootstrap's modal JS is loaded (should be in index.html)
if (typeof bootstrap === 'undefined') {
    console.error('Bootstrap JavaScript is not loaded. Please include it in your index.html.');
}


export function resetTradeCache() {
    cachedFilteredTrades = null;
    lastFilters = null;
    console.log('Trade cache reset');
}

const tradeColumns = [
    { 
        key: 'trade-num', 
        label: 'Trade #', 
        render: (trade, index, start) => `${start + index + 1}`, 
        editable: false 
    },
    { key: 'date', label: 'Date', render: trade => trade.date || '-', editable: true, type: 'date' },
    { key: 'time', label: 'Time', render: trade => trade.tradeTime || '-', editable: true, type: 'time' },
    { 
        key: 'pair', 
        label: 'Pair', 
        render: trade => trade.pair || '-', 
        editable: true, 
        type: 'select', 
        options: [] 
    },
   
    { 
        key: 'type', 
        label: 'Type', 
        render: trade => trade.tradeType || '-', 
        editable: true, 
        type: 'select', 
        options: ['Scalp', 'Swing', 'Day Trade'] 
    },
    { 
        key: 'timeframe', 
        label: 'Timeframe', 
        render: trade => trade.timeframe || '-', 
        editable: true, 
        type: 'select', 
        options: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'] 
    },
{
    key: 'direction',
    label: 'Direction',
    render: (trade) => {
      const raw = (trade.position || '').toLowerCase().trim();
      const positionMap = {
        long: 'Long',
        buy: 'Long',
        'long buy': 'Long',
        'buy long': 'Long',
        'long position': 'Long',
        short: 'Short',
        sell: 'Short',
        'short sell': 'Short',
        'sell short': 'Short',
        'short position': 'Short',
      };
      const direction = positionMap[raw];
      if (direction === 'Long') {
        return `<span class="badge bg-success">${direction}</span>`;
      } else if (direction === 'Short') {
        return `<span class="badge bg-danger">${direction}</span>`;
      } else {
        return `<span class="badge bg-secondary">-</span>`;
      }
    },
    editable: false
  }
,
{
  key: 'strategy',
  label: 'Strategy',
  render: (trade) => {
const strategyObj = strategyList.find(s => s.id === trade.strategyId);
    return strategyObj ? strategyObj.name : '-';
  },
  editable: true,
  type: 'select',
  options: []
},

    ,
    { 
        key: 'risk-plan', 
        label: 'Planned Risk', 
        render: trade => trade.plannedRisk?.toFixed(2) || '-', 
        editable: true, 
        type: 'number' 
    },
    { 
        key: 'risk', 
        label: 'Actual Risk', 
        render: trade => trade.actualRisk?.toFixed(2) || '-', 
        editable: true, 
        type: 'number' 
    },
    { 
        key: 'planned-rr', 
        label: 'Planned RR', 
        render: trade => trade.plannedRR?.toFixed(2) || '-', 
        editable: true, 
        type: 'number' 
    },
    { 
        key: 'actual-rr', 
        label: 'Actual RR', 
        render: trade => trade.actualRR?.toFixed(2) || '-', 
        editable: true, 
        type: 'number' 
    },
    { key: 'lot-size', label: 'Lot Size', render: trade => trade.lotSize?.toFixed(2) || '-', editable: true, type: 'number' },
    { 
        key: 'outcome', 
        label: 'Outcome', 
        render: trade => `
            <span class="badge ${trade.outcome === 'Win' ? 'outcome-win' : trade.outcome === 'Loss' ? 'outcome-loss' : 'bg-secondary'}">
                ${trade.outcome || '-'}
            </span>`, 
        editable: true, 
        type: 'select', 
        options: ['Win', 'Loss'] 
    },
    { 
        key: 'profit-loss', 
        label: 'Profit/Loss', 
        render: trade => `
            <span class="badge ${trade.profitLoss > 0 ? 'bg-success' : trade.profitLoss < 0 ? 'bg-danger' : 'bg-secondary'}">
                ${trade.profitLoss?.toFixed(2) || '0.00'}
            </span>`,
        editable: true,
        type: 'number'
    },
    { 
        key: 'balance', 
        label: 'Balance', 
        render: (trade, index, start, settings, trades, balanceMap) => {
            const balance = balanceMap && balanceMap[trade.id];
            return `
                <span class="${balance >= 54000 ? 'target-met' : balance <= 48000 ? 'stop-trading' : ''}">
                    ${balance !== undefined ? `$${balance.toFixed(2)}` : '-'}
                </span>`;
        }
    },
    { 
        key: 'tags', 
        label: 'Tags', 
        render: trade => {
            const tags = [...(trade.mistakes || []), ...(trade.emotions || [])].map(tag => `<span class="badge bg-secondary tag-badge">${tag}</span>`).join('');
            return tags || '-';
        }
    },
    { key: 'images', label: 'Images', render: trade => trade.screenshots?.length ? `${trade.screenshots.length} image${trade.screenshots.length > 1 ? 's' : ''}` : '-' },
    { 
        key: 'actions', 
        label: 'Actions', 
        render: (trade, _, __, ___, trades) => `
            <span class="d-flex justify-content-center">
                <i class="bi bi-pencil text-primary me-3 detail-btn" data-id="${trade.id}" title="Edit Trade"></i>
                <i class="bi bi-trash text-danger delete-btn" data-id="${trade.id}" title="Delete Trade"></i>
            </span>`,
        editable: false
    }
];

export { cachedFilteredTrades, lastFilters, loadedTrades };

// State for bulk copy feature
export const selectedStrategyIds = new Set();

export function updateCopyButtonState() {
    const copyButton = document.getElementById('copy-strategies-btn');
    const targetAccount = document.getElementById('copy-target-account');
    if (copyButton && targetAccount) {
        copyButton.disabled = selectedStrategyIds.size === 0 || !targetAccount.value;
    }
}

export function renderStrategyList(strategies, accountId, containerId, strategyTradesMap = new Map(), accounts, filters = {}, sort = 'name') {
    console.time('renderStrategyList');
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Strategy list container ${containerId} not found`);
        showToast('Error: Strategy list container not found.', 'error');
        return;
    }

    console.log('renderStrategyList received strategyTradesMap:', strategyTradesMap.size, 'for accountId:', accountId);
    console.log('strategyTradesMap contents:', Array.from(strategyTradesMap.entries()).map(([id, trades]) => ({ strategyId: id, tradeCount: trades.length })));

    // Filter strategies
    let filteredStrategies = strategies.filter(s => s.accountId === accountId);
    if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredStrategies = filteredStrategies.filter(s =>
            s.name.toLowerCase().includes(searchLower) ||
            s.description.toLowerCase().includes(searchLower) ||
            s.tags.some(t => t.toLowerCase().includes(searchLower))
        );
    }
    if (filters.marketType) {
        filteredStrategies = filteredStrategies.filter(s => s.marketType === filters.marketType);
    }
    if (filters.timeframe) {
        filteredStrategies = filteredStrategies.filter(s => s.timeframes.includes(filters.timeframe));
    }
    if (filters.tag) {
        filteredStrategies = filteredStrategies.filter(s => s.tags.includes(filters.tag));
    }

    // Sort strategies
    filteredStrategies.sort((a, b) => {
        if (sort === 'name') return a.name.localeCompare(b.name);
        if (sort === 'createdAt') return new Date(b.createdAt) - new Date(a.createdAt);
        if (sort === 'lastUsed') {
            const aTrades = Array.isArray(strategyTradesMap.get(a.id)) ? strategyTradesMap.get(a.id) : [];
            const bTrades = Array.isArray(strategyTradesMap.get(b.id)) ? strategyTradesMap.get(b.id) : [];
            const aLast = calculateStrategyMetrics(aTrades, a.name).lastUsed;
            const bLast = calculateStrategyMetrics(bTrades, b.name).lastUsed;
            return (bLast ? new Date(bLast) : 0) - (aLast ? new Date(aLast) : 0);
        }
        if (sort === 'tradeCount') {
            const aTrades = Array.isArray(strategyTradesMap.get(a.id)) ? strategyTradesMap.get(a.id) : [];
            const bTrades = Array.isArray(strategyTradesMap.get(b.id)) ? strategyTradesMap.get(b.id) : [];
            return calculateStrategyMetrics(bTrades, b.name).totalTrades - calculateStrategyMetrics(aTrades, a.name).totalTrades;
        }
        return 0;
    });

    // Render strategy cards
    container.innerHTML = filteredStrategies.length ? filteredStrategies.map(strategy => {
        const strategyTrades = Array.isArray(strategyTradesMap.get(strategy.id)) ? strategyTradesMap.get(strategy.id) : [];
        console.log(`Processing strategy "${strategy.name}" (ID: ${strategy.id}) with ${strategyTrades.length} trades, trade strategyIds:`, strategyTrades.map(t => t.strategyId));
        const metrics = calculateStrategyMetrics(strategyTrades, strategy.name);
        console.log(`Metrics for strategy "${strategy.name}":`, metrics);

        // Ensure fallback values for metrics
        const totalTrades = metrics.totalTrades || 0;
        const winRate = metrics.winRate || 0;
        const netPnL = metrics.netPnL || 0;

        return `
            <div class="card mb-3 strategy-card stratcard-container" data-id="${strategy.id}">
                <div class="card-body stratcard-body">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="form-check">
                            <input type="checkbox" class="form-check-input strategy-select" data-id="${strategy.id}">
                            <label class="form-check-label stratcard-title"><i class="bi bi-bar-chart-line me-2"></i>${strategy.name}</label>
                        </div>
                        <span class="stratcard-status"><i class="bi bi-clock-history me-1"></i>Last Used: ${metrics.lastUsed ? new Date(metrics.lastUsed).toLocaleDateString() : 'Never'}</span>
                    </div>
                    <div class="stratcard-content-wrapper">
                        <div class="stratcard-details">
                            <div class="stratcard-meta-row">
                                <span class="stratcard-meta-label"><i class="bi bi-globe me-1"></i>Market:</span>
                                <span class="stratcard-meta-value">${strategy.marketType}</span>
                            </div>
                            <div class="stratcard-meta-row">
                                <span class="stratcard-meta-label"><i class="bi bi-clock me-1"></i>Timeframes:</span>
                                <span class="stratcard-meta-value">${strategy.timeframes.join(', ')}</span>
                            </div>
                            <div class="stratcard-meta-row">
                                <span class="stratcard-meta-label"><i class="bi bi-tags-fill me-1"></i>Tags:</span>
                                <span class="stratcard-meta-value">${strategy.tags.join(', ') || 'None'}</span>
                            </div>
                            <div class="stratcard-meta-row">
                                <span class="stratcard-meta-label"><i class="bi bi-box-arrow-in-right me-1"></i>Entry Conditions:</span>
                                <span class="stratcard-meta-value">${strategy.entryConditions.map(c => c.description).join('; ')}</span>
                            </div>
                            <div class="stratcard-meta-row">
                                <span class="stratcard-meta-label"><i class="bi bi-box-arrow-right me-1"></i>Exit Conditions:</span>
                                <span class="stratcard-meta-value">${strategy.exitConditions.map(c => c.description).join('; ')}</span>
                            </div>
                        </div>
                        <div class="stratcard-performance">
                            <div class="stratcard-performance-title"><i class="bi bi-graph-up me-1"></i>Performance</div>
                            <div class="stratcard-performance-metrics">
                                <div class="stratcard-performance-circle">
                                    <svg class="stratcard-circle-progress" width="60" height="60">
                                        <circle class="stratcard-circle-bg" cx="30" cy="30" r="25" />
                                        <circle class="stratcard-circle-fill stratcard-trades-fill" cx="30" cy="30" r="25" style="stroke-dasharray: ${totalTrades * 1.57}, 157;" />
                                    </svg>
                                    <div class="stratcard-circle-label">
                                        <span>${totalTrades}</span>
                                        <small>Trades</small>
                                    </div>
                                </div>
                                <div class="stratcard-performance-circle">
                                    <svg class="stratcard-circle-progress" width="60" height="60">
                                        <circle class="stratcard-circle-bg" cx="30" cy="30" r="25" />
                                        <circle class="stratcard-circle-fill stratcard-win-rate-fill" cx="30" cy="30" r="25" style="stroke-dasharray: ${winRate * 1.57}, 157;" />
                                    </svg>
                                    <div class="stratcard-circle-label">
                                        <span>${winRate}%</span>
                                        <small>Win Rate</small>
                                    </div>
                                </div>
                                <div class="stratcard-performance-circle">
                                    <svg class="stratcard-circle-progress" width="60" height="60">
                                        <circle class="stratcard-circle-bg" cx="30" cy="30" r="25" />
                                        <circle class="stratcard-circle-fill stratcard-net-pl-fill" cx="30" cy="30" r="25" style="stroke-dasharray: ${Math.min(Math.abs(netPnL) / 1000 * 1.57, 157)}, 157;" />
                                    </svg>
                                    <div class="stratcard-circle-label">
                                        <span>$${netPnL}</span>
                                        <small>Net P&L</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="d-flex gap-2 mt-3">
                        <button class="btn btn-primary btn-sm edit-strategy stratcard-btn-action stratcard-btn-edit" data-id="${strategy.id}"><i class="bi bi-pencil me-1"></i>Edit</button>
                        <button class="btn btn-danger btn-sm delete-strategy stratcard-btn-remove" data-id="${strategy.id}"><i class="bi bi-trash me-1"></i>Delete</button>
                        <button class="btn btn-info btn-sm view-strategy stratcard-btn-action stratcard-btn-view" data-id="${strategy.id}"><i class="bi bi-eye me-1"></i>View Details</button>
                        <button class="btn btn-secondary btn-sm duplicate-strategy stratcard-btn-action stratcard-btn-duplicate" data-id="${strategy.id}"><i class="bi bi-files me-1"></i>Duplicate</button>
                    </div>
                </div>
            </div>
        `;
    }).join('') : '<p class="text-muted">No strategies found.</p>';

    // Populate copy target account dropdown, excluding the active account
    const copyTargetAccount = document.getElementById('copy-target-account');
    if (copyTargetAccount && Array.isArray(accounts)) {
        console.log('Populating copy-target-account dropdown with accounts:', accounts);
        copyTargetAccount.innerHTML = '<option value="">Select Target Account</option>' +
            accounts
                .filter(a => a.id && a.name && a.id !== accountId)
                .map(a => `<option value="${a.id}">${a.name}</option>`)
                .join('');
        console.log('Dropdown options set:', copyTargetAccount.innerHTML);
    } else {
        console.warn('Copy target account dropdown not found or accounts array invalid:', {
            copyTargetAccount: !!copyTargetAccount,
            accounts: accounts
        });
    }

    console.timeEnd('renderStrategyList');
}

export function renderStrategies(strategies, activeAccountId, accounts, trades = []) {
    // Guard against invalid calls
    if (!Array.isArray(strategies) || strategies.length === 0) {
        console.warn('renderStrategies skipped: invalid or empty strategies array:', strategies);
        return;
    }
    if (!activeAccountId || activeAccountId === 'account1') {
        console.warn('renderStrategies skipped: invalid activeAccountId:', activeAccountId);
        return;
    }
    if (!Array.isArray(trades)) {
        console.warn('Invalid trades array in renderStrategies, using empty array instead:', trades);
        trades = [];
    }
    if (!Array.isArray(accounts)) {
        console.warn('Invalid accounts array in renderStrategies, using empty array instead:', accounts);
        accounts = [];
    }

    console.log('renderStrategies called with strategies:', strategies, 'activeAccountId:', activeAccountId, 'accounts:', accounts, 'trades:', trades.length);
    console.log('Trade strategyIds:', trades.map(t => t.strategyId || t.strategy));
    const filteredStrategies = strategies.filter(s => s.accountId === activeAccountId);

    // Create a map of trades filtered by strategyId
    const strategyTradesMap = new Map();
    filteredStrategies.forEach(strategy => {
        const strategyTrades = trades.filter(t => t.accountId === activeAccountId && t.strategyId === strategy.id);
        strategyTradesMap.set(strategy.id, strategyTrades);
        console.log(`Trades for strategy "${strategy.name}" (ID: ${strategy.id}):`, strategyTrades.length, strategyTrades);
    });
    console.log('strategyTradesMap:', Array.from(strategyTradesMap.entries()).map(([id, trades]) => ({ strategyId: id, tradeCount: trades.length })));

    // Defer strategy dropdown population to trade form's updateStrategyOptions
    const strategySelect = document.getElementById('strategy');
    if (strategySelect) {
        console.log('Strategy select found, population handled by trade form updateStrategyOptions');
    } else {
        console.warn('Strategy select element not found in DOM');
    }

    const detailStrategySelect = document.getElementById('detail-strategy');
    if (detailStrategySelect) {
        detailStrategySelect.innerHTML = '<option value="">Select Strategy</option>' +
            filteredStrategies.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    const filterStrategy = document.getElementById('filter-strategy');
    if (filterStrategy) {
        filterStrategy.innerHTML = '<option value="">All Strategies</option>' +
            filteredStrategies.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    }

    // Render strategy list with filtering and sorting
    const filterInputs = {
        search: document.getElementById('strategy-search'),
        marketType: document.getElementById('strategy-market-type'),
        timeframe: document.getElementById('strategy-timeframe'),
        tag: document.getElementById('strategy-tag-filter')
    };
    const sortSelect = document.getElementById('strategy-sort');
    const filters = {};
    if (filterInputs.search) filters.search = filterInputs.search.value;
    if (filterInputs.marketType) filters.marketType = filterInputs.marketType.value;
    if (filterInputs.timeframe) filters.timeframe = filterInputs.timeframe.value;
    if (filterInputs.tag) filters.tag = filterInputs.tag.value;
    const sort = sortSelect ? sortSelect.value : 'name';

    if (domCache.strategyList) {
        console.log('Calling renderStrategyList with accounts:', accounts, 'strategyTradesMap:', strategyTradesMap.size);
        renderStrategyList(strategies, activeAccountId, 'strategy-list', strategyTradesMap, accounts, filters, sort);
        updateCopyButtonState();
    } else {
        console.warn('Strategy list element not found in DOM');
    }

    const strategyColumn = tradeColumns.find(col => col.key === 'strategy');
    strategyColumn.options = filteredStrategies.map(s => s.name);
}

export function renderPairs(pairs) {
    const pairSelect = document.getElementById('pair');
    if (pairSelect) {
        pairSelect.innerHTML = '<option value="">Select Pair</option>' + 
            pairs.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    }

    const filterPair = document.getElementById('filter-pair');
    if (filterPair) {
        filterPair.innerHTML = '<option value="">All Pairs</option>' + 
            pairs.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    }

    const pairColumn = tradeColumns.find(col => col.key === 'pair');
    pairColumn.options = pairs.map(p => p.name);
}

export async function renderAccounts(accounts, activeAccountId, trades, strategies, settings, consecutiveLosses, dailyPlans, weeklyReviews, visibleColumns, recordsPerPage, currentFilters, currentPage) {
    const brokers = await loadFromStore('brokers');
    const activeAccountSelect = document.getElementById('active-account');
    if (activeAccountSelect) {
        activeAccountSelect.innerHTML = '<option value="">Select Account</option>' + 
            accounts.map(a => `<option value="${a.id}" ${a.id === activeAccountId ? 'selected' : ''}>${a.name}</option>`).join('');
        activeAccountSelect.removeEventListener('change', onAccountChange);
        activeAccountSelect.addEventListener('change', onAccountChange);
    }

    async function onAccountChange(e) {
        const newAccountId = e.target.value;
        const dashboardData = await loadFromStore('dashboard');
        let existingFilter = dashboardData.find(c => c.id === 'dateFilter');
        if (existingFilter) {
            const newData = dashboardData.filter(c => c.id !== 'dateFilter');
            await saveToStore('dashboard', newData);
            console.log('Old date filter removed from IndexedDB.');
        }
        const defaultDateFilter = { type: '', startDate: null, endDate: null };
        settings.activeAccountId = newAccountId;
        await saveToStore('settings', settings);
        await initializeDashboard(trades, strategies, newAccountId, accounts, defaultDateFilter);
        const activeAccount = accounts.find(a => a.id === newAccountId);
        renderTrades(
            trades,
            settings,
            consecutiveLosses,
            dailyPlans,
            weeklyReviews,
            strategies,
            visibleColumns,
            currentPage,
            recordsPerPage,
            currentFilters,
            activeAccount,
            newAccountId
        );
    }

    const tradeAccountSelect = document.getElementById('account');
    if (tradeAccountSelect) {
        tradeAccountSelect.innerHTML = '<option value="">Select Account</option>' + 
            accounts.map(a => `<option value="${a.id}" ${a.id === activeAccountId ? 'selected' : ''}>${a.name}</option>`).join('');
    }

    const strategyAccountSelect = document.querySelector('#strategies #account');
    if (strategyAccountSelect) {
        strategyAccountSelect.innerHTML = '<option value="">Select Account</option>' + 
            accounts.map(a => `<option value="${a.id}" ${a.id === activeAccountId ? 'selected' : ''}>${a.name}</option>`).join('');
    }

    const brokerSelect = document.getElementById('broker-id');
    if (brokerSelect) {
        brokerSelect.innerHTML = '<option value="">Select Broker</option>' + 
            brokers.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
    }

    if (domCache.accountListBody) {
        domCache.accountListBody.innerHTML = accounts.map(a => {
            const broker = brokers.find(b => b.id === a.brokerId);
            return `
                <tr>
                    <td>${a.name}</td>
                    <td>$${a.initialBalance.toFixed(2)}</td>
                    <td>${a.maxDrawdown}%</td>
                    <td>${a.dailyDrawdown}%</td>
                    <td>${a.maxTradesPerDay}</td>
                    <td>${a.maxLossPerDay}%</td>
                    <td>${a.profitSplit || 0}%</td>
                    <td>${a.isPropFirm ? 'Yes' : 'No'}</td>
                    <td>${broker ? broker.name : 'None'}</td>
                    <td>
                        <button class="btn btn-clean-primary btn-sm action-btn edit-account" data-id="${a.id}">Edit</button>
                        <button class="btn btn-clean-danger btn-sm action-btn delete-account" data-id="${a.id}" ${accounts.length === 1 ? 'disabled' : ''}>Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }
}


export async function renderBrokers(brokers) {
    const brokerListBody = document.getElementById('broker-list-body');
    if (brokerListBody) {
        console.log('renderBrokers: Rendering', brokers.length, 'brokers');
        brokerListBody.innerHTML = brokers.map(b => `
            <tr>
                <td>${b.name}</td>
                <td>${b.multipliers.forex}</td>
                <td>${b.multipliers.indices}</td>
                <td>${b.multipliers.commodities}</td>
                <td>${b.multipliers.crypto}</td>
                <td>${b.multipliers.commodities_exceptions.XAGUSD}</td>
                <td>${b.multipliers.commodities_exceptions.XAUUSD}</td>
                <td>
                    <button class="btn btn-clean-primary btn-sm action-btn edit-broker" data-id="${b.id}">Edit</button>
                    <button class="btn btn-clean-danger btn-sm action-btn delete-broker" data-id="${b.id}">Delete</button>
                </td>
            </tr>
        `).join('');
    } else {
        console.warn('Broker list body (#broker-list-body) not found in DOM');
        showToast('Broker table not found. Please check the settings page.', 'error');
    }
}


export function renderPairList(pairs) {
    if (domCache.pairListBody) {
        domCache.pairListBody.innerHTML = pairs.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.market_type || '-'}</td>
                <td>
                    <button class="btn btn-clean-primary btn-sm action-btn edit-pair" data-id="${p.id}">Edit</button>
                    <button class="btn btn-clean-danger btn-sm action-btn delete-pair" data-id="${p.id}" ${pairs.length === 1 ? 'disabled' : ''}>Delete</button>
                </td>
            </tr>
        `).join('');
    }
}


export async function renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, page = 1, pageSize = 20, filters = {}, activeAccount, activeAccountId) {
    console.log('Incoming strategies in renderTrades:', strategies); 
    strategyList = strategies; // <--- add this
    console.log('strategyList after assignment:', strategyList);
    console.time('renderTrades');
    console.log('renderTrades called with:', {
        tradeCount: trades.length,
        activeAccountId,
        page,
        pageSize,
        filters,
        visibleColumns
    });

    if (!domCache.tradeBody || !domCache.tradeHeader || !domCache.pagination || !domCache.filterSummary) {
        console.error('Required DOM elements missing for renderTrades:', {
            tradeBody: !!domCache.tradeBody,
            tradeHeader: !!domCache.tradeHeader,
            pagination: !!domCache.pagination,
            filterSummary: !!domCache.filterSummary
        });
        showToast('Error: Trade log DOM elements missing.', 'error');
        console.timeEnd('renderTrades');
        return;
    }

    const effectiveColumns = visibleColumns.includes('actions') ? visibleColumns : [...visibleColumns, 'actions'];
    console.log('Effective columns:', effectiveColumns);

    // Force cache invalidation on initial load or if activeAccountId changes
    const filterKey = JSON.stringify(filters) + activeAccountId;
    if (filterKey !== JSON.stringify(lastFilters) || !cachedFilteredTrades) {
        console.log('Invalidating trade cache: filterKey=', filterKey, 'lastFilters=', lastFilters, 'cachedFilteredTrades=', cachedFilteredTrades?.length);
        cachedFilteredTrades = trades.filter(t => t.accountId === activeAccountId);
        console.log('Initial cachedFilteredTrades:', cachedFilteredTrades.length, 'Trades for activeAccountId:', cachedFilteredTrades.map(t => t.id));

        // Apply filters
        if (filters.quickSearch) {
            const searchLower = filters.quickSearch.toLowerCase();
            cachedFilteredTrades = cachedFilteredTrades.filter(t => {
                return (
                    (t.pair?.toLowerCase() || '').includes(searchLower) ||
                    (t.strategy?.toLowerCase() || '').includes(searchLower) ||
                    (t.outcome?.toLowerCase() || '').includes(searchLower)
                );
            });
        }
        if (filters.pair) cachedFilteredTrades = cachedFilteredTrades.filter(t => t.pair === filters.pair);
        if (filters.outcome) cachedFilteredTrades = cachedFilteredTrades.filter(t => t.outcome === filters.outcome);
        if (filters.strategy) cachedFilteredTrades = cachedFilteredTrades.filter(t => t.strategy === filters.strategy);
        if (filters.riskPlan) cachedFilteredTrades = cachedFilteredTrades.filter(t => t.riskPlan === filters.riskPlan);
        if (filters.dateStart) cachedFilteredTrades = cachedFilteredTrades.filter(t => new Date(t.date) >= new Date(filters.dateStart));
        if (filters.dateEnd) cachedFilteredTrades = cachedFilteredTrades.filter(t => new Date(t.date) <= new Date(filters.dateEnd));
        if (filters.balanceMin) cachedFilteredTrades = cachedFilteredTrades.filter(t => t.balance >= filters.balanceMin);
        if (filters.balanceMax) cachedFilteredTrades = cachedFilteredTrades.filter(t => t.balance <= filters.balanceMax);
        if (filters.tags?.length) {
            cachedFilteredTrades = cachedFilteredTrades.filter(t => {
                const tradeTags = [...(t.mistakes || []), ...(t.emotions || [])];
                return filters.tags.every(tag => tradeTags.includes(tag));
            });
        }

        // Apply sorting
        if (filters.sort === 'date') {
            cachedFilteredTrades.sort((a, b) => new Date(b.date) - new Date(a.date));
        } else if (filters.sort === 'profitLoss') {
            cachedFilteredTrades.sort((a, b) => (b.profitLoss || 0) - (a.profitLoss || 0));
        } else {
            cachedFilteredTrades.sort((a, b) => new Date(a.date) - new Date(b.date));
            console.log('Applied default sort: date ascending');
        }

        lastFilters = { ...filters, activeAccountId };
    } else {
        console.log('Using cached filtered trades:', cachedFilteredTrades.length);
    }

    loadedTrades = cachedFilteredTrades || [];
    console.log('loadedTrades set to:', loadedTrades.length);

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, loadedTrades.length);
    const paginatedTrades = loadedTrades.slice(start, end);
    console.log('Paginated trades:', paginatedTrades.length, 'from index', start, 'to', end);

    // Precompute balances for paginated trades
    let balanceMap = {};
    if (effectiveColumns.includes('balance')) {
        console.log('Precomputing balances for paginated trades:', paginatedTrades.length);
        try {
            await Promise.all(paginatedTrades.map(async (trade) => {
                try {
                    const result = await calculateAccountBalance({
                        accountId: activeAccountId,
                        tradeId: trade.id,
                        useCache: true,
                        validate: false
                    });
                    balanceMap[trade.id] = result.balance;
                    console.log(`Calculated balance for trade ${trade.id}: $${result.balance.toFixed(2)}`);
                } catch (err) {
                    console.error(`Error calculating balance for trade ${trade.id}:`, err);
                    balanceMap[trade.id] = null; // Fallback to null if calculation fails
                }
            }));
        } catch (err) {
            console.error('Error precomputing balances:', err);
            showToast('Error calculating balances for trade log.', 'error');
        }
    }
    console.log('Balance map:', balanceMap);

    domCache.tradeHeader.innerHTML = tradeColumns
        .filter(col => effectiveColumns.includes(col.key))
        .map(col => `<th scope="col" data-sort="${col.key === 'date' || col.key === 'profit-loss' ? col.key : ''}">${col.label}</th>`)
        .join('');
    console.log('Rendered headers:', domCache.tradeHeader.innerHTML);

    if (!clusterize) {
        clusterize = new Clusterize({
            scrollId: 'trade-table-scroll-area',
            contentId: 'trade-body',
            rows_in_block: 20,
            tag: 'tr'
        });
    }

    const rows = paginatedTrades.map((trade, index) => {
        const globalIndex = loadedTrades.indexOf(trade);
        if (globalIndex === -1) {
            console.warn(`Trade ${trade.id} not found in global trades array`);
            return '';
        }
        console.log(`Rendering trade ${trade.id} with data-index: ${globalIndex}`);
        return `<tr>${tradeColumns
            .filter(col => effectiveColumns.includes(col.key))
            .map(col => {
                const value = col.render(trade, index, start, settings, loadedTrades, balanceMap);
                if (col.editable) {
                    return `<td class="editable" data-trade-id="${trade.id}" data-field="${col.key}" data-type="${col.type}">${value}</td>`;
                }
                return `<td>${value}</td>`;
            })
            .join('')}</tr>`;
    }).filter(row => row !== '');

    clusterize.update(rows.length ? rows : [`<tr><td colspan="${effectiveColumns.length}" class="text-center">No trades available.</td></tr>`]);
    console.log('Rendered rows:', rows.length, 'Paginated trades:', paginatedTrades.length);

    const filterCount = Object.keys(filters).filter(k => k !== 'activeAccountId' && filters[k] && (Array.isArray(filters[k]) ? filters[k].length : true)).length;
    const totalTrades = loadedTrades.length;
    const totalPages = Math.ceil(totalTrades / pageSize) || 1;
    const winRate = totalTrades ? (loadedTrades.filter(t => t.outcome === 'Win').length / totalTrades * 100).toFixed(2) : 0;
    const netPnL = loadedTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0).toFixed(2);
    domCache.filterSummary.innerHTML = filterCount > 0 
        ? `Showing ${paginatedTrades.length} of ${totalTrades} trades | Win Rate: ${winRate}% | Net PnL: $${netPnL}`
        : `Showing ${paginatedTrades.length} of ${totalTrades} trades | Win Rate: ${winRate}% | Net PnL: $${netPnL}`;

    // Render pagination controls with ARIA attributes
    let paginationHTML = `
        <nav aria-label="Trade log pagination">
            <ul class="pagination justify-content-center">
                <li class="page-item ${page === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="1" aria-label="First Page" ${page === 1 ? 'aria-disabled="true"' : ''}>
                        <span aria-hidden="true">««</span>
                    </a>
                </li>
                <li class="page-item ${page === 1 ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="${page - 1}" aria-label="Previous Page" ${page === 1 ? 'aria-disabled="true"' : ''}>
                        <span aria-hidden="true">«</span>
                    </a>
                </li>
    `;
    const maxVisiblePages = 5;
    const halfVisible = Math.floor(maxVisiblePages / 2);
    let startPage = Math.max(1, page - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage < maxVisiblePages - 1) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <li class="page-item ${i === page ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${i}" aria-label="Page ${i}" ${i === page ? 'aria-current="page"' : ''}>${i}</a>
            </li>
        `;
    }

    paginationHTML += `
                <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="${page + 1}" aria-label="Next Page" ${page === totalPages ? 'aria-disabled="true"' : ''}>
                        <span aria-hidden="true">»</span>
                    </a>
                </li>
                <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                    <a class="page-link" href="#" data-page="${totalPages}" aria-label="Last Page" ${page === totalPages ? 'aria-disabled="true"' : ''}>
                        <span aria-hidden="true">»»</span>
                    </a>
                </li>
            </ul>
        </nav>
    `;

    domCache.pagination.innerHTML = paginationHTML;
    console.log('Rendered pagination HTML:', domCache.pagination.innerHTML);

    const dailyLoss = calculateDailyLoss(loadedTrades, new Date(), activeAccountId);
    if (domCache.currentProfit && activeAccount) {
        const currentBalance = balanceMap[paginatedTrades[paginatedTrades.length - 1]?.id] || activeAccount.initialBalance;
        domCache.currentProfit.textContent = `$${(currentBalance - activeAccount.initialBalance).toFixed(2)}`;
    }
    if (domCache.dailyLoss) {
        domCache.dailyLoss.textContent = `$${dailyLoss.toFixed(2)}`;
    }
    if (domCache.consecutiveLosses) {
        domCache.consecutiveLosses.textContent = consecutiveLosses;
    }

    const avgScore = loadedTrades.length ? loadedTrades.reduce((sum, t) => sum + (t.disciplineScore || 0), 0) / loadedTrades.length : 0;
    if (domCache.disciplineScore) {
        domCache.disciplineScore.textContent = `${Math.round(avgScore)}/100`;
    }
    if (domCache.disciplineProgress) {
        domCache.disciplineProgress.style.width = `${avgScore}%`;
        domCache.disciplineProgress.setAttribute('aria-valuenow', Math.round(avgScore));
    }

    if (domCache.tradeForm && activeAccount) {
        const button = domCache.tradeForm.querySelector('button[type="submit"]');
        const dailyLossLimit = activeAccount.initialBalance * (activeAccount.maxLossPerDay / 100);
        const dailyTrades = loadedTrades.filter(t => 
            t.accountId === activeAccount.id && 
            new Date(t.date).toDateString() === new Date().toDateString()
        ).length;
        if (dailyLoss <= -dailyLossLimit || dailyTrades >= activeAccount.maxTradesPerDay || consecutiveLosses >= 2) {
            button.disabled = true;
            button.classList.add('btn-secondary');
            button.classList.remove('btn-primary');
            showToast('Stop trading: Daily loss, max trades, or consecutive losses exceeded.', 'error');
        } else {
            button.disabled = false;
            button.classList.add('btn-primary');
            button.classList.remove('btn-secondary');
        }
    }

    if (domCache.bestTrade && domCache.worstTrade) {
        const options = loadedTrades.map((t, i) => `<option value="${i}">Trade #${i + 1} (${t.date}, ${t.pair})</option>`).join('');
        domCache.bestTrade.innerHTML = '<option value="">Select Trade</option>' + options;
        domCache.worstTrade.innerHTML = '<option value="">Select Trade</option>' + options;
    }

    renderWeeklyReviews(weeklyReviews, activeAccountId);
    console.timeEnd('renderTrades');
}

export function renderDailyStats(trades, selectedDate, activeAccountId) {
    if (!domCache.dailyStats || !domCache.dailyTradesBody) return;

    const dailyTrades = trades.filter(t => t.accountId === activeAccountId && new Date(t.date).toDateString() === new Date(selectedDate).toDateString());
    const tradeCount = dailyTrades.length;
    const wins = dailyTrades.filter(t => t.outcome === 'Win').length;
    const losses = dailyTrades.filter(t => t.outcome === 'Loss').length;
    const netPnL = dailyTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const winRate = tradeCount ? ((wins / tradeCount) * 100).toFixed(2) : 0;

    const dailyTradeCount = document.getElementById('daily-trade-count');
    const dailyWins = document.getElementById('daily-wins');
    const dailyLosses = document.getElementById('daily-losses');
    const dailyPnl = document.getElementById('daily-pnl');
    const dailyWinRate = document.getElementById('daily-win-rate');

    if (dailyTradeCount) dailyTradeCount.textContent = tradeCount;
    if (dailyWins) dailyWins.textContent = wins;
    if (dailyLosses) dailyLosses.textContent = losses;
    if (dailyPnl) dailyPnl.textContent = netPnL.toFixed(2);
    if (dailyWinRate) dailyWinRate.textContent = winRate;

    domCache.dailyTradesBody.innerHTML = dailyTrades.map((trade, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${trade.pair}</td>
            <td>${trade.strategy || '-'}</td>
            <td>${trade.risk?.toFixed(2) || '-'}</td>
            <td>${trade.outcome}</td>
            <td>${trade.profitLoss?.toFixed(2) || '-'}</td>
        </tr>
    `).join('');
}

export function renderWeeklyReviews(weeklyReviews, activeAccountId) {
    if (!domCache.weeklyReviewBody) return;
    const filteredReviews = weeklyReviews.filter(r => r.accountId === activeAccountId);
    domCache.weeklyReviewBody.innerHTML = filteredReviews.map(review => `
        <tr>
            <td>${review.accountName || '-'}</td>
            <td>${review.weekStartDate}</td>
            <td>${review.weekEndDate}</td>
            <td>${review.totalWins}</td>
            <td>${review.totalLosses}</td>
            <td>${review.netPnL.toFixed(2)}</td>
            <td>${review.lessonsLearned}</td>
        </tr>
    `).join('');
}
// Function to validate DOM elements
function validateDomElements() {
    const elements = [
        { name: 'tradingCalendar', element: domCache.tradingCalendar },
        { name: 'yearlyOverview', element: domCache.yearlyOverview },
        { name: 'yearlyOverviewYear', element: domCache.yearlyOverviewYear },
        { name: 'yearlyStatsPnl', element: domCache.yearlyStatsPnl },
        { name: 'yearlyStatsTrades', element: domCache.yearlyStatsTrades },
        { name: 'yearlyStatsWinrate', element: domCache.yearlyStatsWinrate },
        { name: 'dailyPlanModal', element: domCache.dailyPlanModal },
        { name: 'dailyPlanContent', element: domCache.dailyPlanContent },
        { name: 'dailyPlanAccount', element: domCache.dailyPlanAccount },
        { name: 'dailyPlanDate', element: domCache.dailyPlanDate },
        { name: 'dailyPlanGamePlan', element: domCache.dailyPlanGamePlan },
        { name: 'dailyPlanMarketBias', element: domCache.dailyPlanMarketBias },
        { name: 'dailyPlanEmotions', element: domCache.dailyPlanEmotions },
        { name: 'dailyPlanConfidence', element: domCache.dailyPlanConfidence },
        { name: 'dailyPlanTrades', element: domCache.dailyPlanTrades },
        { name: 'tradeDetailsSection', element: domCache.tradeDetailsSection },
        { name: 'tradeDetailTime', element: domCache.tradeDetailTime },
        { name: 'tradeDetailPair', element: domCache.tradeDetailPair },
        { name: 'tradeDetailStrategy', element: domCache.tradeDetailStrategy },
        { name: 'tradeDetailType', element: domCache.tradeDetailType },
        { name: 'tradeDetailTimeframe', element: domCache.tradeDetailTimeframe },
        { name: 'tradeDetailScore', element: domCache.tradeDetailScore },
        { name: 'tradeDetailOutcome', element: domCache.tradeDetailOutcome },
        { name: 'tradeDetailPnl', element: domCache.tradeDetailPnl },
        { name: 'tradeDetailBalance', element: domCache.tradeDetailBalance },
        { name: 'tradeDetailPlannedRisk', element: domCache.tradeDetailPlannedRisk },
        { name: 'tradeDetailActualRisk', element: domCache.tradeDetailActualRisk },
        { name: 'tradeDetailPlannedRr', element: domCache.tradeDetailPlannedRr },
        { name: 'tradeDetailActualRr', element: domCache.tradeDetailActualRr },
        { name: 'tradeDetailLotSize', element: domCache.tradeDetailLotSize },
        { name: 'tradeDetailStopLoss', element: domCache.tradeDetailStopLoss },
        { name: 'tradeDetailEntryPrice', element: domCache.tradeDetailEntryPrice },
        { name: 'tradeDetailSlPrice', element: domCache.tradeDetailSlPrice },
        { name: 'tradeDetailExitPrice', element: domCache.tradeDetailExitPrice },
        { name: 'tradeDetailHoldTime', element: domCache.tradeDetailHoldTime },
        { name: 'tradeDetailExitReason', element: domCache.tradeDetailExitReason },
        { name: 'tradeDetailSession', element: domCache.tradeDetailSession },
        { name: 'tradeDetailMood', element: domCache.tradeDetailMood },
        { name: 'tradeDetailDisciplineScore', element: domCache.tradeDetailDisciplineScore },
        { name: 'tradeDetailOutsideWindow', element: domCache.tradeDetailOutsideWindow },
        { name: 'tradeDetailMistakes', element: domCache.tradeDetailMistakes },
        { name: 'tradeDetailEmotions', element: domCache.tradeDetailEmotions },
        { name: 'tradeDetailCustomTags', element: domCache.tradeDetailCustomTags },
        { name: 'tradeDetailNotes', element: domCache.tradeDetailNotes },
        { name: 'tradeDetailScreenshots', element: domCache.tradeDetailScreenshots },
        { name: 'fullScreenImageModal', element: domCache.fullScreenImageModal },
        { name: 'fullScreenImage', element: domCache.fullScreenImage }
    ];

    const missingElements = elements.filter(item => !item.element);
    if (missingElements.length > 0) {
        console.error('Missing DOM elements:', missingElements.map(item => item.name));
        return false;
    }
    return true;
}

// render.js
export async function renderAnalytics(trades, strategies, activeAccountId) {
    console.log('renderAnalytics called with:', { tradesLength: trades.length, activeAccountId });
// Check if on dashboard page
    const isDashboardPage = document.getElementById('dashboard')?.classList.contains('active');
    if (isDashboardPage && !validateDomElements()) {
        console.error('One or more dashboard elements are missing in the DOM.');
        showToast('Dashboard elements missing. Analytics skipped.', 'warning');
        return;
    }
    
    if (!validateDomElements()) {
        console.error('One or more dashboard elements are missing in the DOM.');
        return;
    }

    // Get current month and year for filtering
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-based (0 = January, 11 = December)

    // Filter trades by active account and current month
    const filteredTrades = trades
        .filter(t => t.accountId === activeAccountId)
        .filter(t => {
            const tradeDate = new Date(t.date);
            return tradeDate.getFullYear() === currentYear && tradeDate.getMonth() === currentMonth;
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log('Filtered trades for current month in renderAnalytics:', filteredTrades.length);

    if (filteredTrades.length === 0) {
        console.warn('No trades found for activeAccountId in current month:', activeAccountId);
        // Update widgets to show zero values
        if (domCache.accountBalance) {
            const activeAccount = (await loadFromStore('accounts')).find(a => a.id === activeAccountId);
            domCache.accountBalance.textContent = `$${activeAccount.initialBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (domCache.currentProfit) domCache.currentProfit.textContent = `P&L: $0.00`;
        if (domCache.tradeWinCircle && domCache.tradeWinText) {
            domCache.tradeWinCircle.setAttribute('stroke-dasharray', '0 100');
            domCache.tradeWinText.textContent = '0%';
        }
        if (domCache.dailyWinCircle && domCache.dailyWinText) {
            domCache.dailyWinCircle.setAttribute('stroke-dasharray', '0 100');
            domCache.dailyWinText.textContent = '0%';
        }
        if (domCache.profitFactor) domCache.profitFactor.textContent = '0.00';
        if (domCache.streakDays) domCache.streakDays.textContent = '0';
        if (domCache.streakWeeks) domCache.streakWeeks.textContent = '0';
        if (domCache.streakTrades) domCache.streakTrades.textContent = '0 trades';
        if (domCache.recentTrades) {
            domCache.recentTrades.innerHTML = '<tr><td colspan="3" class="text-center">No trades this month.</td></tr>';
        }
        // Clear charts
        const chartInstances = [
            drawdownChartInstance,
            balanceChartInstance,
            dailyCumulativePnLChartInstance,
            dailyNetCumulativePnLChartInstance,
            dailyNetPnLChartInstance,
            zellaChartInstance
        ];
        chartInstances.forEach(instance => {
            if (instance) {
                instance.data.labels = [];
                instance.data.datasets.forEach(dataset => dataset.data = []);
                instance.update();
            }
        });
        if (domCache.zellaScoreValue) domCache.zellaScoreValue.textContent = '0.0';
        if (domCache.zellaWinRate) domCache.zellaWinRate.textContent = '0%';
        if (domCache.zellaProfitFactor) domCache.zellaProfitFactor.textContent = '0.00';
        if (domCache.zellaAvgWinLoss) domCache.zellaAvgWinLoss.textContent = '0.00';
        return;
    }

    // Calculate Metrics
    const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0).toFixed(2);
    const winRate = calculateWinRate(filteredTrades);
    const dailyWinRate = calculateWinRateForDate(filteredTrades, today);
    const profitFactor = calculateProfitFactor(filteredTrades);
    const streaks = calculateStreaks(filteredTrades);
    const avgWinLoss = calculateAvgWinLoss(filteredTrades);
    const filteredStrategies = strategies.filter(s => s.accountId === activeAccountId);
    const strategyPerformance = filteredStrategies.map(s => ({
        name: s.name,
        winRate: calculateWinRate(filteredTrades.filter(t => t.strategy === s.name))
    }));
    const bestStrategy = strategyPerformance.reduce((best, s) => s.winRate > (best.winRate || 0) ? s : best, {});
    const outsideWindowTrades = filteredTrades.filter(t => t.outsideWindow);
    const mistakesCount = filteredTrades.reduce((acc, t) => {
        (t.mistakes || []).forEach(m => acc[m] = (acc[m] || 0) + 1);
        return acc;
    }, {});
    const topMistakes = Object.entries(mistakesCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m, c]) => `${m}: ${c}`).join(', ') || '-';

    // Update Top Metrics
    if (domCache.accountBalance) {
        const lastBalance = filteredTrades.length ? filteredTrades[filteredTrades.length - 1].balance : (await loadFromStore('accounts')).find(a => a.id === activeAccountId).initialBalance;
        domCache.accountBalance.textContent = `$${lastBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (domCache.currentProfit) {
        domCache.currentProfit.textContent = `P&L: $${totalPnL}`;
    }
    if (domCache.tradeWinCircle && domCache.tradeWinText) {
        const circumference = 2 * Math.PI * 15.91549430918954;
        const dashArray = (winRate / 100) * circumference + ' ' + circumference;
        domCache.tradeWinCircle.setAttribute('stroke-dasharray', dashArray);
        domCache.tradeWinText.textContent = `${winRate}%`;
    }
    if (domCache.dailyWinCircle && domCache.dailyWinText) {
        const circumference = 2 * Math.PI * 15.91549430918954;
        const dashArray = (dailyWinRate / 100) * circumference + ' ' + circumference;
        domCache.dailyWinCircle.setAttribute('stroke-dasharray', dashArray);
        domCache.dailyWinText.textContent = `${dailyWinRate}%`;
    }
    if (domCache.profitFactor) {
        domCache.profitFactor.textContent = profitFactor === 'Infinity' ? '∞' : profitFactor;
    }
    if (domCache.streakDays) {
        domCache.streakDays.textContent = streaks.days;
    }
    if (domCache.streakWeeks) {
        domCache.streakWeeks.textContent = streaks.weeks;
    }
    if (domCache.streakTrades) {
        domCache.streakTrades.textContent = `${streaks.trades} trades`;
    }

    // Update Recent Trades
    if (domCache.recentTrades) {
        const recentTrades = filteredTrades
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        domCache.recentTrades.innerHTML = recentTrades.length
            ? recentTrades.map(trade => `
                <tr>
                    <td>${trade.date}</td>
                    <td>${trade.pair}</td>
                    <td class="${trade.profitLoss >= 0 ? 'text-success' : 'text-danger'}">
                        $${trade.profitLoss?.toFixed(2) || '0.00'}
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="3" class="text-center">No trades this month.</td></tr>';
    }

    // Load trading window settings
    let tradingWindowStart = '08:00';
    let tradingWindowEnd = '17:00';
    try {
        const settingsData = await loadFromStore('settings');
        const settings = settingsData[0] || { tradingWindow: { start: '08:00', end: '17:00' } };
        tradingWindowStart = settings.tradingWindow.start || '08:00';
        tradingWindowEnd = settings.tradingWindow.end || '17:00';
    } catch (err) {
        console.error('Failed to load settings from IndexedDB:', err);
        console.warn('Using default trading window: 08:00–17:00');
    }

    const openDailyPlanModal = (dateString, dailyPlan, dailyTrades) => {
        console.log(`Opening modal for date: ${dateString}`);
        console.log('Daily plan passed to modal:', dailyPlan);
        console.log('Daily trades passed to modal:', dailyTrades);
        try {
            domCache.dailyPlanContent.innerHTML = `
                <p><strong>Account:</strong> <span id="daily-plan-account"></span></p>
                <p><strong>Date:</strong> <span id="daily-plan-date"></span></p>
                <p><strong>Game Plan:</strong> <span id="daily-plan-game-plan"></span></p>
                <p><strong>Market Bias:</strong> <span id="daily-plan-market-bias"></span></p>
                <p><strong>Emotions Before Trading:</strong> <span id="daily-plan-emotions"></span></p>
                <p><strong>Confidence Level (1–10):</strong> <span id="daily-plan-confidence"></span></p>
            `;
            domCache.dailyPlanTrades.innerHTML = '';
            domCache.tradeDetailsSection.style.display = 'none';

            domCache.dailyPlanAccount = document.getElementById('daily-plan-account');
            domCache.dailyPlanDate = document.getElementById('daily-plan-date');
            domCache.dailyPlanGamePlan = document.getElementById('daily-plan-game-plan');
            domCache.dailyPlanMarketBias = document.getElementById('daily-plan-market-bias');
            domCache.dailyPlanEmotions = document.getElementById('daily-plan-emotions');
            domCache.dailyPlanConfidence = document.getElementById('daily-plan-confidence');

            if (dailyPlan) {
                console.log('Daily plan found:', dailyPlan);
                domCache.dailyPlanAccount.textContent = dailyPlan.account || 'N/A';
                domCache.dailyPlanDate.textContent = dailyPlan.date;
                domCache.dailyPlanGamePlan.textContent = dailyPlan.gamePlan || 'No game plan set';
                domCache.dailyPlanMarketBias.textContent = dailyPlan.marketBias || 'No market bias set';
                domCache.dailyPlanEmotions.textContent = dailyPlan.emotions || 'No emotions recorded';
                domCache.dailyPlanConfidence.textContent = dailyPlan.confidenceLevel || 'N/A';

                console.log('After population:');
                console.log('Account:', domCache.dailyPlanAccount.textContent);
                console.log('Date:', domCache.dailyPlanDate.textContent);
                console.log('Game Plan:', domCache.dailyPlanGamePlan.textContent);
                console.log('Market Bias:', domCache.dailyPlanMarketBias.textContent);
                console.log('Emotions:', domCache.dailyPlanEmotions.textContent);
                console.log('Confidence:', domCache.dailyPlanConfidence.textContent);
            } else {
                console.log(`No daily plan found for ${dateString}`);
                domCache.dailyPlanContent.innerHTML = `
                    <p>No daily plan found for ${dateString}.</p>
                `;
            }

            if (dailyTrades.length === 0) {
                domCache.dailyPlanTrades.innerHTML = '<tr><td colspan="6" class="text-center">No trades on this day.</td></tr>';
            } else {
                domCache.dailyPlanTrades.innerHTML = dailyTrades.map((trade, index) => `
                    <tr class="trade-row" data-trade-id="${trade.id}">
                        <td>${index + 1}</td>
                        <td>${trade.pair || '-'}</td>
                        <td>${trade.strategy || '-'}</td>
                        <td>$${trade.actualRisk?.toFixed(2) || '0.00'}</td>
                        <td><span class="badge ${trade.outcome === 'Win' ? 'bg-success' : 'bg-danger'}">${trade.outcome}</span></td>
                        <td class="${trade.profitLoss >= 0 ? 'text-success' : 'text-danger'}">$${trade.profitLoss?.toFixed(2) || '0.00'}</td>
                    </tr>
                `).join('');
            }

            const tradeRows = domCache.dailyPlanTrades.querySelectorAll('.trade-row');
            tradeRows.forEach(row => {
                row.addEventListener('click', () => {
                    const tradeId = row.getAttribute('data-trade-id');
                    const trade = dailyTrades.find(t => t.id === Number(tradeId));

                    if (trade) {
                        const isOutsideWindow = trade.tradeTime ? isTimeOutsideWindow(trade.tradeTime, tradingWindowStart, tradingWindowEnd) : false;

                        domCache.tradeDetailTime.textContent = trade.tradeTime || '-';
                        domCache.tradeDetailPair.textContent = trade.pair || '-';
                        domCache.tradeDetailStrategy.textContent = trade.strategy || '-';
                        domCache.tradeDetailType.textContent = trade.tradeType || '-';
                        domCache.tradeDetailTimeframe.textContent = trade.timeframe || '-';
                        domCache.tradeDetailScore.textContent = trade.setupScore || '-';
                        domCache.tradeDetailOutcome.textContent = trade.outcome || '-';
                        domCache.tradeDetailOutcome.className = `badge ${trade.outcome === 'Win' ? 'bg-success' : 'bg-danger'}`;
                        domCache.tradeDetailPnl.textContent = `$${trade.profitLoss?.toFixed(2) || '0.00'}`;
                        domCache.tradeDetailPnl.className = trade.profitLoss >= 0 ? 'text-success' : 'text-danger';
                        domCache.tradeDetailBalance.textContent = `$${trade.balance?.toFixed(2) || '0.00'}`;
                        domCache.tradeDetailPlannedRisk.textContent = `$${trade.plannedRisk?.toFixed(2) || '0.00'}`;
                        domCache.tradeDetailActualRisk.textContent = `$${trade.actualRisk?.toFixed(2) || '0.00'}`;
                        domCache.tradeDetailPlannedRr.textContent = trade.plannedRR?.toFixed(2) || '-';
                        domCache.tradeDetailActualRr.textContent = trade.actualRR?.toFixed(2) || '-';
                        domCache.tradeDetailLotSize.textContent = trade.lotSize?.toFixed(2) || '-';
                        domCache.tradeDetailStopLoss.textContent = trade.stopLoss || '-';
                        domCache.tradeDetailEntryPrice.textContent = trade.entryPrice?.toFixed(2) || '-';
                        domCache.tradeDetailSlPrice.textContent = trade.slPrice?.toFixed(2) || '-';
                        domCache.tradeDetailExitPrice.textContent = trade.exitPrice?.toFixed(2) || '-';
                        domCache.tradeDetailHoldTime.textContent = trade.holdTime ? formatHoldTime(parseInt(trade.holdTime)) : '-';
                        domCache.tradeDetailExitReason.textContent = trade.exitReason || '-';
                        domCache.tradeDetailSession.textContent = trade.session || '-';
                        domCache.tradeDetailMood.textContent = trade.mood || '-';
                        domCache.tradeDetailDisciplineScore.textContent = trade.disciplineScore || '-';
                        domCache.tradeDetailOutsideWindow.textContent = isOutsideWindow ? 'Yes (Outside Trading Time)' : 'No';
                        domCache.tradeDetailOutsideWindow.className = `badge ${isOutsideWindow ? 'bg-warning text-dark' : 'bg-secondary'}`;
                        domCache.tradeDetailMistakes.textContent = trade.mistakes?.length ? trade.mistakes.join(', ') : 'None';
                        domCache.tradeDetailEmotions.textContent = trade.emotions?.length ? trade.emotions.join(', ') : 'None';
                        domCache.tradeDetailCustomTags.textContent = trade.customTags?.length ? trade.customTags.join(', ') : 'None';
                        domCache.tradeDetailNotes.textContent = trade.notes || 'None';
                        console.log('trade.screenshots:', trade.screenshots);
                        if (trade.screenshots?.length) {
                            domCache.tradeDetailScreenshots.innerHTML = trade.screenshots.map((screenshot, index) => {
                                const screenshotUrl = typeof screenshot === 'object' && screenshot.url ? screenshot.url : screenshot || '';
                                return screenshotUrl ? `
                                    <div class="me-2 mb-2">
                                        <img src="${screenshotUrl}" alt="Screenshot ${index + 1}" class="screenshot-thumbnail" data-url="${screenshotUrl}" data-index="${index}" data-caption="${screenshot.caption || ''}" style="width: 50px; height: 50px; object-fit: cover; cursor: pointer; border: 1px solid #ddd; border-radius: 4px;">
                                    </div>
                                ` : `
                                    <div class="me-2 mb-2 text-muted">
                                        Invalid Screenshot
                                    </div>
                                `;
                            }).join('');
                        } else {
                            domCache.tradeDetailScreenshots.innerHTML = 'None';
                        }

                        const screenshotThumbnails = domCache.tradeDetailScreenshots.querySelectorAll('.screenshot-thumbnail');
                        screenshotThumbnails.forEach(thumbnail => {
                            thumbnail.addEventListener('click', (e) => {
                                e.preventDefault();
                                const imageUrl = thumbnail.getAttribute('data-url');
                                const imageCaption = thumbnail.getAttribute('data-caption') || 'Screenshot';
                                domCache.fullScreenImage.src = imageUrl;
                                document.getElementById('fullScreenImageModalLabel').textContent = imageCaption;
                                const fullScreenModal = new bootstrap.Modal(domCache.fullScreenImageModal);
                                fullScreenModal.show();
                            });
                        });

                        domCache.tradeDetailsSection.style.display = 'block';
                    } else {
                        domCache.tradeDetailsSection.style.display = 'none';
                    }

                    tradeRows.forEach(r => r.classList.remove('table-active'));
                    row.classList.add('table-active');
                });
            });

            const modalElement = document.getElementById('dailyPlanModal');
            if (!modalElement) {
                console.error('Modal element not found in DOM');
                return;
            }

            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        } catch (err) {
            console.error('Error in opening modal:', err);
        }
    };

    // Update Calendars (unchanged to preserve monthly calendar)
    const updateCalendars = async (newYear, newMonth) => {
        calendarYear = newYear;
        calendarMonth = newMonth;

        await renderCalendar({
            containerId: 'trading-calendar',
            trades: trades, // Use all trades for calendar
            year: calendarYear,
            month: calendarMonth,
            activeAccountId,
            showBackgroundColors: true,
            showTradeDetails: true,
            showWeeklyStats: true,
            showMonthlyStats: true,
            showHeaderIcons: true,
            showNoteIcon: true,
            enableCellClick: true,
            onDayClick: (dayNumber, dateString, dailyTrades, dailyPlan) => {
                openDailyPlanModal(dateString, dailyPlan, dailyTrades);
            },
            onNoteClick: (dateString, dailyPlan, dailyTrades) => {
                openDailyPlanModal(dateString, dailyPlan, dailyTrades);
            },
            onMonthSelect: (selectedYear, selectedMonth) => {
                calendarYear = selectedYear;
                calendarMonth = selectedMonth;
                yearlyOverviewYear = selectedYear;
                updateYearlyOverviewLabel();
                updateYearlyOverview();
            }
        });

        await updateYearlyOverview();
    };

    const updateYearlyOverview = async () => {
        domCache.yearlyOverviewYear.textContent = `Yearly Overview - ${yearlyOverviewYear}`;
        const yearlyStats = calculateYearlyStats(trades, yearlyOverviewYear);
        const yearlyStatsColor = yearlyStats.totalPnL >= 0 ? '#28a745' : '#dc3545';

        if (domCache.yearlyStatsPnl) {
            domCache.yearlyStatsPnl.innerHTML = `
                <span style="color: ${yearlyStatsColor};">
                    Yearly P&L: $${yearlyStats.totalPnL.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
            `;
        }
        if (domCache.yearlyStatsTrades) {
            domCache.yearlyStatsTrades.innerHTML = `
                Trades: ${yearlyStats.totalTrades}
            `;
        }
        if (domCache.yearlyStatsWinrate) {
            domCache.yearlyStatsWinrate.innerHTML = `
                Win Rate: ${yearlyStats.winRate}%
            `;
        }

        await renderYearlyOverview({
            containerId: 'yearly-overview',
            trades: trades,
            year: yearlyOverviewYear,
            activeAccountId,
            showBackgroundColors: true,
            onMonthClick: (selectedYear, selectedMonth) => {
                updateCalendars(selectedYear, selectedMonth);
            }
        });
    };

    const updateYearlyOverviewLabel = () => {
        domCache.yearlyOverviewYear.textContent = `Yearly Overview - ${yearlyOverviewYear}`;
    };

    await updateCalendars(calendarYear, calendarMonth);

    const prevYearButton = document.querySelector('.prev-year');
    const nextYearButton = document.querySelector('.next-year');

    if (prevYearButton) {
        prevYearButton.addEventListener('click', async () => {
            yearlyOverviewYear--;
            updateYearlyOverviewLabel();
            await updateYearlyOverview();
        });
    }

    if (nextYearButton) {
        nextYearButton.addEventListener('click', async () => {
            yearlyOverviewYear++;
            updateYearlyOverviewLabel();
            await updateYearlyOverview();
        });
    }

    // Render Charts
    const dates = filteredTrades.map(t => t.date);
    const balances = filteredTrades.map(t => t.balance);
    const dailyPnLs = filteredTrades.map(t => t.profitLoss || 0);
    const cumulativePnLs = dailyPnLs.reduce((acc, curr, idx) => {
        acc.push((acc[idx - 1] || 0) + curr);
        return acc;
    }, []);
    const drawdowns = calculateDrawdown(filteredTrades);

    if (domCache.drawdownChart) {
        if (drawdownChartInstance) drawdownChartInstance.destroy();
        drawdownChartInstance = new Chart(domCache.drawdownChart.getContext('2d'), {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Drawdown (%)',
                    data: drawdowns,
                    borderColor: '#dc3545',
                    fill: true,
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.1
                }]
            },
            options: {
                scales: {
                    y: { 
                        beginAtZero: true, // Start at 0
                        max: 0, // Drawdown should be negative, so max is 0
                        min: -100, // Cap at -100% for display
                        title: { display: true, text: 'Drawdown (%)' }
                    },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    }

    if (domCache.balanceChart) {
        if (balanceChartInstance) balanceChartInstance.destroy();
        balanceChartInstance = new Chart(domCache.balanceChart.getContext('2d'), {
            type: 'line',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Balance',
                        data: balances,
                        borderColor: '#4A90E2',
                        fill: false,
                        tension: 0.1,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Drawdown',
                        data: drawdowns,
                        borderColor: '#dc3545',
                        fill: false,
                        tension: 0.1,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                scales: {
                    y1: {
                        position: 'left',
                        beginAtZero: false,
                        title: { display: true, text: 'Balance ($)' }
                    },
                    y2: {
                        position: 'right',
                        beginAtZero: false,
                        title: { display: true, text: 'Drawdown ($)' }
                    },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    }

    if (domCache.dailyCumulativePnLChart) {
        if (dailyCumulativePnLChartInstance) dailyCumulativePnLChartInstance.destroy();
        dailyCumulativePnLChartInstance = new Chart(domCache.dailyCumulativePnLChart.getContext('2d'), {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Daily P&L',
                        data: dailyPnLs,
                        backgroundColor: dailyPnLs.map(pnl => pnl >= 0 ? '#28a745' : '#dc3545'),
                        type: 'bar'
                    },
                    {
                        label: 'Cumulative P&L',
                        data: cumulativePnLs,
                        borderColor: '#4A90E2',
                        fill: false,
                        type: 'line',
                        yAxisID: 'y2',
                        tension: 0.1
                    }
                ]
            },
            options: {
                scales: {
                    y: { position: 'left', title: { display: true, text: 'Daily P&L ($)' } },
                    y2: { position: 'right', title: { display: true, text: 'Cumulative P&L ($)' } },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    }

    if (domCache.dailyNetCumulativePnLChart) {
        if (dailyNetCumulativePnLChartInstance) dailyNetCumulativePnLChartInstance.destroy();
        dailyNetCumulativePnLChartInstance = new Chart(domCache.dailyNetCumulativePnLChart.getContext('2d'), {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Cumulative P&L',
                    data: cumulativePnLs,
                    backgroundColor: cumulativePnLs.map(pnl => pnl >= 0 ? 'rgba(40, 167, 69, 0.5)' : 'rgba(220, 53, 69, 0.5)'),
                    borderColor: cumulativePnLs.map(pnl => pnl >= 0 ? '#28a745' : '#dc3545'),
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: { title: { display: true, text: 'Cumulative P&L ($)' } },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    }

    if (domCache.dailyNetPnLChart) {
        if (dailyNetPnLChartInstance) dailyNetPnLChartInstance.destroy();
        dailyNetPnLChartInstance = new Chart(domCache.dailyNetPnLChart.getContext('2d'), {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Daily P&L',
                    data: dailyPnLs,
                    backgroundColor: dailyPnLs.map(pnl => pnl >= 0 ? '#28a745' : '#dc3545'),
                }]
            },
            options: {
                scales: {
                    y: { title: { display: true, text: 'Daily P&L ($)' } },
                    x: { title: { display: true, text: 'Date' } }
                }
            }
        });
    }

    if (domCache.zellaChart) {
        if (zellaChartInstance) zellaChartInstance.destroy();
        const winRateValue = parseFloat(winRate) / 100; // Normalize to 0-1
        const profitFactorValue = Math.min(parseFloat(profitFactor) / 5, 1); // Normalize to 0-1 (assuming max profit factor of 5)
        const avgWinLossValue = Math.min(parseFloat(avgWinLoss) / 5, 1); // Normalize to 0-1 (assuming max avg win/loss of 5)
        const zellaScore = ((winRateValue + profitFactorValue + avgWinLossValue) / 3 * 100).toFixed(1);

        zellaChartInstance = new Chart(domCache.zellaChart.getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['Win %', 'Profit Factor', 'Avg Win/Loss'],
                datasets: [{
                    label: 'Zella Score',
                    data: [winRateValue * 100, profitFactorValue * 100, avgWinLossValue * 100],
                    backgroundColor: 'rgba(74, 144, 226, 0.2)',
                    borderColor: '#4A90E2',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: { display: false },
                        grid: { color: '#e9ecef' },
                        angleLines: { color: '#e9ecef' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        if (domCache.zellaScoreValue) {
            domCache.zellaScoreValue.textContent = zellaScore;
        }
        if (domCache.zellaWinRate) {
            domCache.zellaWinRate.textContent = `${winRate}%`;
        }
        if (domCache.zellaProfitFactor) {
            domCache.zellaProfitFactor.textContent = profitFactor === 'Infinity' ? '∞' : profitFactor;
        }
        if (domCache.zellaAvgWinLoss) {
            domCache.zellaAvgWinLoss.textContent = avgWinLoss === 'Infinity' ? '∞' : avgWinLoss;
        }
    }
}

function calculateDailyStats(trades, year, month) {
    const stats = {};
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateString = date.toISOString().split('T')[0];
        const dailyTrades = trades.filter(t => t.date === dateString);

        const profitLoss = dailyTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
        const tradeCount = dailyTrades.length;
        const wins = dailyTrades.filter(t => t.outcome === 'Win').length;
        const winRate = tradeCount ? (wins / tradeCount * 100).toFixed(1) : '0.0';

        stats[day] = { profitLoss, tradeCount, winRate, trades: dailyTrades };
    }

    return stats;
}

function calculateWeeklyAndMonthlyStats(dailyStats, year, month) {
    const weeklyStats = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let currentWeek = [];
    let weekNumber = 1;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();

        currentWeek.push({ day, stats: dailyStats[day] });

        if (dayOfWeek === 6 || day === daysInMonth) { // Saturday or last day of month
            const weekProfitLoss = currentWeek.reduce((sum, d) => sum + d.stats.profitLoss, 0);
            const tradingDays = currentWeek.filter(d => d.stats.tradeCount > 0).length;
            weeklyStats.push({ weekNumber, profitLoss: weekProfitLoss, tradingDays });
            currentWeek = [];
            weekNumber++;
        }
    }

    const monthlyProfitLoss = Object.values(dailyStats).reduce((sum, d) => sum + d.profitLoss, 0);
    const monthlyTradingDays = Object.values(dailyStats).filter(d => d.tradeCount > 0).length;

    return { weeklyStats, monthlyStats: { profitLoss: monthlyProfitLoss, tradingDays: monthlyTradingDays } };
}


export function showTradeDetails(index, trades, reflections, strategies, riskPlans, settings, saveCallback, activeAccountId) {
    if (index < 0 || index >= trades.length || !trades[index]) {
        showToast('Error: Invalid trade selected.', 'error');
        console.error(`Invalid trade index: ${index}, trades length: ${trades.length}`);
        return;
    }

    const trade = trades[index];
    const reflection = reflections.find(r => r.tradeId === trade.id && r.accountId === activeAccountId) || { notes: '', lessons: '', checklist: {} };
    const modal = new bootstrap.Modal(document.getElementById('reflectionModal'));
    const modalBody = document.querySelector('#reflectionModal .modal-body');

    if (!modalBody) {
        showToast('Error: Reflection modal not found.', 'error');
        return;
    }

    console.log(`Showing trade details for trade ID: ${trade.id}, index: ${index}`);

 const numberEl = document.getElementById('trade-detail-number');
const directionEl = document.getElementById('direction-badge');

// Show pair name
if (numberEl) numberEl.textContent = `${trade.pair}`;

// Normalize and map position to a standard label and style
if (directionEl) {
    const rawPosition = (trade.position || '').toLowerCase().trim();

    // Mapping position to direction
    const positionMap = {
        long: 'Long',
        buy: 'Long',
        'long buy': 'Long',
        'buy long': 'Long',
        short: 'Short',
        sell: 'Short',
        'short sell': 'Short',
        'sell short': 'Short',
        'short position': 'Short',
        'long position': 'Long',
    };

    const normalizedDirection = positionMap[rawPosition] || null;

    if (normalizedDirection) {
        const badgeClass = normalizedDirection === 'Long' ? 'bg-success' : 'bg-danger';
        directionEl.className = `badge ms-2 ${badgeClass}`;
        directionEl.textContent = normalizedDirection;
    } else {
        directionEl.className = 'badge bg-secondary ms-2';
        directionEl.textContent = '-';
    }
}


    const form = document.getElementById('trade-details-form');
    if (!form) {
        showToast('Error: Trade details form not found.', 'error');
        return;
    }

    form.dataset.tradeIndex = index;
    form.dataset.tradeId = trade.id;

        // Reset form and clear adherence radio buttons
    form.reset();
    document.querySelectorAll('#detail-adherence-rating input[name="detail-adherence"]').forEach(input => {
        input.checked = false;
    });
    document.getElementById('detail-adherence-value').value = '';

    const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = value !== undefined && value !== null ? value : '';
        } else {
            console.warn(`Element with ID ${id} not found in trade details modal`);
        }
    };

    setValue('detail-trade-type', trade.tradeType);
    setValue('trade-position', trade.position);
    setValue('detail-timeframe', trade.timeframe);
    setValue('detail-session', trade.session);
    setValue('detail-strategy', trade.strategyId); // Pre-select strategyId
    const setupScoreElement = document.getElementById('detail-setup-score');
    const setupScoreValueElement = document.getElementById('detail-setup-score-value');
    if (setupScoreElement) {
        setupScoreElement.value = trade.setupScore || 8;
        if (setupScoreValueElement) {
            setupScoreValueElement.textContent = `Score: ${trade.setupScore || 8}`;
        }
        setupScoreElement.addEventListener('input', () => {
            setupScoreValueElement.textContent = `Score: ${setupScoreElement.value}`;
        });
    }
    setValue('detail-planned-risk', trade.plannedRisk);
    setValue('detail-actual-risk', trade.actualRisk);
    setValue('detail-planned-rr', trade.plannedRR);
    setValue('detail-actual-rr', trade.actualRR);
    setValue('detail-lot-size', trade.lotSize);
    setValue('detail-stop-loss', trade.stopLoss);
    setValue('detail-entry-price', trade.entryPrice);
    setValue('detail-sl-price', trade.slPrice);
    setValue('detail-exit-price', trade.exitPrice);
    // Ensure holdTime is formatted correctly for the input field
    setValue('detail-hold-time', trade.holdTime ? formatHoldTime(parseInt(trade.holdTime)) : '');

    const exitReasonSelect = document.getElementById('detail-exit-reason');
    const exitReasonCustom = document.getElementById('detail-exit-reason-custom');
    const predefinedReasons = ['3R Hit', 'Structure', 'Manual'];
    if (exitReasonSelect && exitReasonCustom) {
        if (trade.exitReason && predefinedReasons.includes(trade.exitReason)) {
            exitReasonSelect.value = trade.exitReason;
            exitReasonCustom.value = '';
        } else if (trade.exitReason) {
            exitReasonSelect.value = 'Other';
            exitReasonCustom.value = trade.exitReason;
        } else {
            exitReasonSelect.value = '';
            exitReasonCustom.value = '';
        }
    }

    setValue('detail-mood', trade.mood);
    setValue('detail-emotion-tags-value', trade.emotions?.join(','));
    setValue('detail-mistakes-tags-value', trade.mistakes?.join(','));
    setValue('detail-trade-notes', trade.notes);

     // Populate adherence star rating
    const adherenceValue = trade.adherence ? String(trade.adherence) : '';
    if (adherenceValue && ['1', '2', '3', '4', '5'].includes(adherenceValue)) {
        const adherenceInput = document.getElementById(`detail-adherence-${adherenceValue}`);
        if (adherenceInput) {
            adherenceInput.checked = true;
            document.getElementById('detail-adherence-value').value = adherenceValue;
            console.log('Adherence value set:', adherenceValue);
        } else {
            console.warn(`Adherence input #detail-adherence-${adherenceValue} not found`);
        }
    } else if (adherenceValue) {
        console.warn(`Invalid adherence value: ${adherenceValue}`);
    }

    const predefinedEmotions = ['Fearful', 'Confident', 'Greedy', 'Frustrated', 'Calm', 'Anxious'];
    const emotionTagManager = new TagManager(
        'emotion-tags-container', 
        'detail-emotion-tags-value', 
        predefinedEmotions, 
        'detail-emotion-new-tag'
    );
    const allEmotions = [...new Set([...predefinedEmotions, ...(trade.emotions || [])])];
    emotionTagManager.init(trade.emotions || [], allEmotions);

    const predefinedMistakes = ['Overtrading', 'No Stop Loss', 'Chasing', 'Ignoring Plan', 'Poor Timing', 'Overleveraging'];
    const mistakesTagManager = new TagManager(
        'mistakes-tags-container', 
        'detail-mistakes-tags-value', 
        predefinedMistakes, 
        'detail-mistakes-new-tag'
    );
    const allMistakes = [...new Set([...predefinedMistakes, ...(trade.mistakes || [])])];
    mistakesTagManager.init(trade.mistakes || [], allMistakes);

    const imageUploads = document.getElementById('detail-image-uploads');
    let imageIndex = trade.screenshots?.length || 0;
    if (imageUploads) {
        imageUploads.innerHTML = trade.screenshots?.length ? trade.screenshots.map((img, i) => `
            <div class="image-row mb-3" data-index="${i}">
                <div class="mb-2">
                    <label for="detail-image-file-${i + 1}" class="form-label">Upload Image</label>
                    <input type="file" class="form-control image-file" id="detail-image-file-${i + 1}" accept="image/*">
                </div>
                <div class="mb-2">
                    <label for="detail-image-caption-${i + 1}" class="form-label">Caption</label>
                    <input type="text" class="form-control image-caption" id="detail-image-caption-${i + 1}" value="${img.caption || ''}" placeholder="Optional caption">
                </div>
                <img class="image-preview mb-2" src="${img.url}" alt="Screenshot ${i + 1}" style="display: block;">
                <button type="button" class="btn btn-clean-danger btn-sm remove-image">Remove</button>
            </div>
        `).join('') : `
            <div class="image-row mb-3" data-index="0">
                <div class="mb-2">
                    <label for="detail-image-file-1" class="form-label">Upload Image</label>
                    <input type="file" class="form-control image-file" id="detail-image-file-1" accept="image/*">
                </div>
                <div class="mb-2">
                    <label for="detail-image-caption-1" class="form-label">Caption</label>
                    <input type="text" class="form-control image-caption" id="detail-image-caption-1" placeholder="Optional caption">
                </div>
                <img class="image-preview d-none mb-2" alt="Preview">
                <button type="button" class="btn btn-clean-danger btn-sm remove-image">Remove</button>
            </div>
        `;
    }

    // Attach event listeners to existing remove buttons
    const attachRemoveListeners = () => {
        const removeButtons = document.querySelectorAll('#detail-image-uploads .remove-image');
        removeButtons.forEach(button => {
            button.removeEventListener('click', button._removeHandler); // Prevent duplicate listeners
            button._removeHandler = () => {
                const imageRow = button.closest('.image-row');
                if (imageRow) {
                    imageRow.remove();
                    console.log(`Removed image upload field: ${imageRow.querySelector('.image-file')?.id || 'new'}`);
                }
            };
            button.addEventListener('click', button._removeHandler);
        });
    };

    attachRemoveListeners();

    const addImageButton = document.getElementById('add-image-upload');
    if (addImageButton) {
        addImageButton.removeEventListener('click', addImageButton._addHandler); // Prevent duplicate listeners
        addImageButton._addHandler = () => {
            const currentImageRows = imageUploads.querySelectorAll('.image-row').length;
            if (currentImageRows >= 5) {
                showToast('Maximum 5 images allowed.', 'warning');
                console.log('Add Image: Maximum limit of 5 images reached');
                return;
            }
            imageIndex++;
            const newImageRow = `
                <div class="image-row mb-3" data-index="${imageIndex}">
                    <div class="mb-2">
                        <label for="detail-image-file-${imageIndex + 1}" class="form-label">Upload Image</label>
                        <input type="file" class="form-control image-file" id="detail-image-file-${imageIndex + 1}" accept="image/*">
                    </div>
                    <div class="mb-2">
                        <label for="detail-image-caption-${imageIndex + 1}" class="form-label">Caption</label>
                        <input type="text" class="form-control image-caption" id="detail-image-caption-${imageIndex + 1}" placeholder="Optional caption">
                    </div>
                    <img class="image-preview d-none mb-2" alt="Preview">
                    <button type="button" class="btn btn-clean-danger btn-sm remove-image">Remove</button>
                </div>
            `;
            imageUploads.insertAdjacentHTML('beforeend', newImageRow);
            console.log(`Added new image upload field with index ${imageIndex}, total images: ${currentImageRows + 1}`);
            attachRemoveListeners(); // Re-attach listeners to include new remove button
        };
        addImageButton.addEventListener('click', addImageButton._addHandler);
    }

    const allFields = form.querySelectorAll('input:not(.image-file), select, textarea');
    allFields.forEach(field => {
        if (field.id !== 'detail-emotion-new-tag' && field.id !== 'detail-mistakes-new-tag') {
            validateField(field);
        }
    });

    cachedFilteredTrades = null;
    lastFilters = null;
    console.log('Reset cachedFilteredTrades and lastFilters for Trade Log refresh');

    modal.show();
}