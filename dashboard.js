
import {getStrategyNameById,isTimeOutsideWindow,normalizeAccountID,validateAccountId,calculateAccountBalance,indexTradesByMonth,createGradient,showLoader, hideLoader,debounce,filterTradesByDateRange,getDateRangeForFilter,renderTopMetric,filterTradesByAccount,calculateTradeCounts,renderChart,showToast, calculateWinRate, calculateWinRateForDate, calculateFullStreaks , calculateDrawdown, calculateProfitFactor, calculateAvgWinLoss } from './utils.js';
import { saveToStore, loadFromStore, getDB } from './data.js';
import { renderCalendar, renderYearlyOverview, downloadYearlyCalendarPDF, calculateYearlyStats } from './calendar.js';
import { createChartRenderer, chartConfigs } from './chartConfigs.js';
import { loadTradesWithEmotions } from './dashboardDataHelper.js';

// Widget configuration
const widgetConfig = [
    { id: 'account-balance', section: 'metrics', type: 'metric', title: 'Account Balance', render: renderAccountBalance, settings: { format: ['currency', 'currency-short'], color: ['green', 'red'] } },
    { id: 'trade-win', section: 'metrics', type: 'metric', title: 'Trade Win %', render: renderTradeWin, settings: { format: ['percentage', 'percentage-short'], color: ['green', 'red'] } },
    { id: 'daily-win', section: 'metrics', type: 'metric', title: 'Daily Win %', render: renderDailyWin, settings: { format: ['percentage', 'percentage-short'], color: ['green', 'red'] } },
    { id: 'current-streak', section: 'metrics', type: 'metric', title: 'Current Streak', render: renderCurrentStreak, settings: { color: ['green', 'red'] } },
    { id: 'summary', section: 'metrics', type: 'metric', title: 'Trade Summary', render: renderSummaryWidget, settings: { format: ['number', 'number-short'], color: ['green', 'red'] } },
    { id: 'recent-trades', section: 'tables', type: 'table', title: 'Recent Trades', render: renderRecentTrades, settings: { color: ['green', 'red'] } },
    { id: 'trading-calendar', section: 'tables', type: 'table', title: 'Trading Calendar', render: renderTradingCalendar, settings: { color: ['green', 'red'] } },
    { id: 'yearly-overview', section: 'tables', type: 'table', title: 'Yearly Overview', render: renderYearlyOverviewWidget, settings: { color: ['green', 'red'] } },
    { id: 'balance', section: 'charts', type: 'chart', title: 'Balance', render: createChartRenderer('balance'), settings: { color: ['green', 'red'] } },
    { id: 'drawdown', section: 'charts', type: 'chart', title: 'Drawdown', render: createChartRenderer('drawdown'), settings: { color: ['green', 'red'] } },
    { id: 'daily-net-pnl', section: 'charts', type: 'chart', title: 'Daily Net P&L', render: createChartRenderer('dailyNetPnL'), settings: { color: ['green', 'red'] } },
    { id: 'net-cumulative', section: 'charts', type: 'chart', title: 'Net Cumulative', render: createChartRenderer('netCumulative'), settings: { color: ['green', 'red'], grid: true } },
    { id: 'cumulative-daily-net', section: 'charts', type: 'chart', title: 'Cumulative Daily Net', render: createChartRenderer('cumulativeDailyNet'), settings: { color: ['green', 'red'] } },
    { id: 'trade-count', section: 'charts', type: 'chart', title: 'Daily Trade Count', render: createChartRenderer('tradeCount'), settings: { color: ['green', 'red'] } },
    { id: 'averageRRR', section: 'charts', type: 'chart', title: 'Average RRR per Day', render: createChartRenderer('averageRRR'), settings: { color: ['green', 'red'] } },
    { id: 'winRateOverTime', section: 'charts', type: 'chart', title: 'Win Rate Over Time', render: createChartRenderer('winRateOverTime'), settings: { color: ['green', 'red'] } },
    { id: 'strategyPnL', section: 'charts', type: 'chart', title: 'Strategy Performance', render: createChartRenderer('strategyPnL'), settings: { color: ['green', 'red'] } },
    { id: 'sessionPnL', section: 'charts', type: 'chart', title: 'Session-Based PnL', render: createChartRenderer('sessionPnL'), settings: { color: ['green', 'red'] } },
    { id: 'timeframeDistribution', section: 'charts', type: 'chart', title: 'Timeframe Distribution', render: createChartRenderer('timeframeDistribution'), settings: { color: ['green', 'red'] } },
    { id: 'pnlByWeekday', section: 'charts', type: 'chart', title: 'PnL by Weekday', render: createChartRenderer('pnlByWeekday'), settings: { color: ['green', 'red'] } },
    { id: 'holdTimeAnalysis', section: 'charts', type: 'chart', title: 'Hold Time Analysis', render: createChartRenderer('holdTimeAnalysis'), settings: { color: ['green', 'red'] } },
    { id: 'pnlByPair', section: 'charts', type: 'chart', title: 'PnL by Pair', render: createChartRenderer('pnlByPair'), settings: { color: ['green', 'red'] } },
    { id: 'emotion-performance', section: 'charts', type: 'chart', title: 'Emotion-Based Performance', render: createChartRenderer('emotionPerformance'), settings: { color: ['green', 'red'] } },
    { id: 'mistake-analysis', section: 'charts', type: 'chart', title: 'Trade Mistake Analysis', render: createChartRenderer('mistakeAnalysis'), settings: { color: ['yellow'] } }
];

// Default dashboard layout
let defaultDashboard = {
    metrics: ['account-balance', 'trade-win', 'daily-win', 'current-streak'],
    tables: ['recent-trades', 'trading-calendar'],
    charts: [
        ['drawdown', 'balance'],
        ['daily-net-pnl', 'net-cumulative'],
        ['cumulative-daily-net', 'trade-count']
    ]
};

// Current dashboard state
let currentDashboard = { ...defaultDashboard };
let isEditMode = false;
let widgetSettings = {};

// Store dashboard data for use in event handlers
let dashboardData = {
    trades: [],
    allTrades: [],
    strategies: [],
    activeAccountId: null,
    accounts: [],
    dateFilter: { type: 'current-month', startDate: null, endDate: null }
};

// DOM cache
const domCache = {
    dashboard: document.getElementById('dashboard'),
    metricsSection: document.querySelector('[data-section="metrics"]'),
    tablesSection: document.querySelector('[data-section="tables"]'),
    chartsSection: document.querySelector('[data-section="charts"]'),
    saveButton: document.getElementById('save-dashboard'),
    templateSelect: document.getElementById('template-select'),
    templateDropdownContainer: document.querySelector('.template-dropdown-container'),
    editModeMessage: document.getElementById('edit-mode-message'),
    dailyPlanModal: document.getElementById('dailyPlanModal'),
    dailyPlanContent: document.getElementById('daily-plan-content'),
    dailyPlanTrades: document.getElementById('daily-plan-trades'),
    tradeDetailsSection: document.getElementById('trade-details-section'),
    dailyPlanAccount: document.getElementById('daily-plan-account'),
    dailyPlanDate: document.getElementById('daily-plan-date'),
    dailyPlanGamePlan: document.getElementById('daily-plan-game-plan'),
    dailyPlanMarketBias: document.getElementById('daily-plan-market-bias'),
    dailyPlanEmotions: document.getElementById('daily-plan-emotions'),
    dailyPlanConfidence: document.getElementById('daily-plan-confidence'),
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
    fullScreenImage: document.getElementById('full-screen-image'),
    fullScreenImageModal: document.getElementById('fullScreenImageModal'),
    dateRangeFilter: document.getElementById('dateRangeFilter'),
    customRangePicker: document.getElementById('customRangePicker'),
    tradeDetailDirection: document.getElementById('trade-detail-direction'),
};

// Initialize indexed trades with async handling
let indexedTrades = {};
async function initializeIndexedTrades() {
    try {
        if (Array.isArray(dashboardData.allTrades) && dashboardData.allTrades.length > 0) {
            indexedTrades = indexTradesByMonth(dashboardData.allTrades);
        } else {
            console.warn('dashboardData.allTrades is not ready or empty, retrying in 100ms');
            await new Promise(resolve => setTimeout(resolve, 100));
            if (Array.isArray(dashboardData.allTrades)) {
                indexedTrades = indexTradesByMonth(dashboardData.allTrades);
            } else {
                console.error('Failed to initialize indexedTrades: allTrades still invalid');
            }
        }
    } catch (err) {
        console.error('Error initializing indexed trades:', err);
    }
}

export async function initializeDashboard(trades, strategies, activeAccountId, accounts, dateFilter = { type: 'current-month', startDate: null, endDate: null }) {
    showLoader('dashboard');
    const missingElements = [];
    Object.entries(domCache).forEach(([key, element]) => {
        if (!element) missingElements.push(key);
    });
    if (missingElements.length > 0) {
        showToast(`Dashboard initialization failed: Missing DOM elements: ${missingElements.join(', ')}.`, 'error');
        console.error('Missing dashboard DOM elements:', missingElements);
        hideLoader('dashboard');
        return;
    }

    // Validate inputs
    if (!Array.isArray(trades)) {
        console.error('Invalid trades parameter:', trades);
        showToast('Error: Invalid trades data.', 'error');
        hideLoader('dashboard');
        return;
    }
    if (!activeAccountId || !accounts.some(a => a.id === activeAccountId)) {
        console.error('Invalid activeAccountId:', activeAccountId);
        showToast('Error: Invalid active account ID.', 'error');
        hideLoader('dashboard');
        return;
    }

    let filteredChartTrades = trades;
    if (dateFilter.type === 'custom' && dateFilter.startDate && dateFilter.endDate) {
        filteredChartTrades = filterTradesByDateRange(trades, dateFilter.startDate, dateFilter.endDate);
        console.log(`Applied custom date range filter: ${dateFilter.startDate} to ${dateFilter.endDate}, ${filteredChartTrades.length} trades`);
    } else {
        const range = getDateRangeForFilter(dateFilter.type);
        if (range.startDate && range.endDate) {
            filteredChartTrades = filterTradesByDateRange(trades, range.startDate, range.endDate);
            console.log(`Applied ${dateFilter.type} filter: ${range.startDate} to ${range.endDate}, ${filteredChartTrades.length} trades`);
        } else {
            console.log(`Applied ${dateFilter.type} filter (all-time), ${filteredChartTrades.length} trades`);
        }
    }

    dashboardData = { trades: filteredChartTrades, allTrades: trades, strategies, activeAccountId, accounts, dateFilter };

    try {
        const savedConfig = await loadFromStore('dashboard');
        const templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
        if (templates.length === 0) {
            const defaultTemplate = { name: 'Default', layout: currentDashboard, settings: widgetSettings };
            await saveToStore('dashboard', { id: 'templates', data: [defaultTemplate] });
            await saveToStore('dashboard', { id: 'activeTemplate', data: { name: 'Default' } });
            console.log('Created and set Default template:', defaultTemplate);
            renderTemplateOptions([defaultTemplate], filteredChartTrades, strategies, activeAccountId, accounts);
            domCache.templateSelect.textContent = 'Default';
            showToast('Created Default template.', 'success');
        }

        await loadDashboardConfig(filteredChartTrades, strategies, activeAccountId, accounts);
        isEditMode = false;
        console.log('Initial isEditMode state:', isEditMode);
        const updatedConfig = await loadFromStore('dashboard');
        const activeTemplateName = updatedConfig?.find(d => d.id === 'activeTemplate')?.data?.name;
        if (activeTemplateName) {
            const templates = updatedConfig?.find(d => d.id === 'templates')?.data || [];
            const activeTemplate = templates.find(t => t.name === activeTemplateName);
            if (activeTemplate) {
                currentDashboard = activeTemplate.layout;
                widgetSettings = activeTemplate.settings;
                console.log(`Loaded active template: ${activeTemplateName}`, { layout: currentDashboard, settings: widgetSettings });
                domCache.templateSelect.textContent = activeTemplateName;
                console.log(`Set template button to active template: ${activeTemplateName}`);
            } else {
                console.warn(`Active template ${activeTemplateName} not found, falling back to saved config`);
                const savedLayout = updatedConfig?.find(d => d.id === 'config')?.layout;
                const savedSettings = updatedConfig?.find(d => d.id === 'config')?.settings || {};
                if (savedLayout) {
                    currentDashboard = savedLayout;
                    widgetSettings = savedSettings;
                    console.log('Loaded saved dashboard config:', { layout: currentDashboard, settings: widgetSettings });
                } else {
                    console.log('No saved config, using default');
                    currentDashboard = { ...defaultDashboard };
                    widgetSettings = {};
                }
            }
        } else {
            const savedLayout = updatedConfig?.find(d => d.id === 'config')?.layout;
            const savedSettings = updatedConfig?.find(d => d.id === 'config')?.settings || {};
            if (savedLayout) {
                currentDashboard = savedLayout;
                widgetSettings = savedSettings;
                console.log('Loaded saved dashboard config:', { layout: currentDashboard, settings: widgetSettings });
            } else {
                console.log('No active template or saved config, using default');
                currentDashboard = { ...defaultDashboard };
                widgetSettings = {};
            }
        }
        console.log('Template button text after init:', domCache.templateSelect.textContent);
        initializeIndexedTrades();
        renderDashboard(filteredChartTrades, strategies, activeAccountId, accounts);
        setTimeout(() => {
            bindEvents(filteredChartTrades, strategies, activeAccountId, accounts);
            console.log('Events bound after delay');
            hideLoader('dashboard');
        }, 100);
        if (domCache.saveButton) domCache.saveButton.classList.add('d-none');
    } catch (err) {
        showToast('Error initializing dashboard.', 'error');
        console.error('Dashboard initialization error:', err);
        hideLoader('dashboard');
    }
}

async function loadDashboardConfig(trades, strategies, activeAccountId, accounts) {
    try {
        const savedConfig = await loadFromStore('dashboard');
        console.log('Loaded date filter:', dashboardData.dateFilter);
        console.log('Loaded dashboard store:', savedConfig);

        if (savedConfig && savedConfig.find(d => d.id === 'config')) {
            const config = savedConfig.find(d => d.id === 'config');
            currentDashboard = config.layout;
            widgetSettings = config.settings || {};
            console.log('Loaded dashboard config:', config);
        } else {
            console.warn('No dashboard config found, using default');
            currentDashboard = { ...defaultDashboard };
            widgetSettings = {};
        }

        const templates = savedConfig && savedConfig.find(d => d.id === 'templates')?.data || [];
        console.log('Loaded templates:', templates);
        renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts);
    } catch (err) {
        showToast('Error loading dashboard configuration. Using default.', 'error');
        console.error('Load dashboard config error:', err);
        currentDashboard = { ...defaultDashboard };
        widgetSettings = {};
        renderTemplateOptions([], trades, strategies, activeAccountId, accounts);
    }
}

async function saveDashboardConfig() {
    try {
        await saveToStore('dashboard', { id: 'config', layout: currentDashboard, settings: widgetSettings });
        console.log('Saved dashboard config:', { layout: currentDashboard, settings: widgetSettings });
        defaultDashboard = { ...currentDashboard };
        console.log('Updated defaultDashboard:', defaultDashboard);
        const savedConfig = await loadFromStore('dashboard');
        const activeTemplateName = savedConfig?.find(d => d.id === 'activeTemplate')?.data?.name;
        if (activeTemplateName) {
            let templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
            const templateIndex = templates.findIndex(t => t.name === activeTemplateName);
            if (templateIndex !== -1) {
                templates[templateIndex] = {
                    ...templates[templateIndex],
                    layout: currentDashboard,
                    settings: widgetSettings
                };
                await saveToStore('dashboard', { id: 'templates', data: templates });
                console.log(`Updated active template ${activeTemplateName} in templates store:`, templates[templateIndex]);
            } else {
                console.warn(`Active template ${activeTemplateName} not found in templates store`);
            }
        }
        showToast('Dashboard saved successfully.', 'success');
    } catch (err) {
        showToast('Error saving dashboard configuration.', 'error');
        console.error('Save dashboard config error:', err);
    }
}

export function renderDashboard(trades, strategies, activeAccountId, accounts) {
    try {
        const dashboard = domCache.dashboard;
        if (!dashboard) {
            throw new Error('Dashboard container element not found');
        }

        domCache.metricsSection = document.querySelector('[data-section="metrics"]');
        domCache.tablesSection = document.querySelector('[data-section="tables"]');
        domCache.chartsSection = document.querySelector('[data-section="charts"]');
        ['metricsSection', 'tablesSection', 'chartsSection'].forEach(section => {
            if (!domCache[section]) {
                const sectionElement = document.createElement('div');
                sectionElement.setAttribute('data-section', section.replace('Section', ''));
                sectionElement.id = section.replace('Section', '-section');
                dashboard.appendChild(sectionElement);
                domCache[section] = sectionElement;
                console.log(`Created missing section element: ${section}`);
            }
        });

        dashboard.style.transition = 'opacity 0.3s ease';
        dashboard.style.opacity = '0';
        dashboard.style.visibility = 'hidden';

        const filteredTrades = trades.filter(t => t.accountId === activeAccountId);
        console.log(`Rendering dashboard for account ${activeAccountId}: ${filteredTrades.length} trades, dateFilter:`, dashboardData.dateFilter);

        dashboardData.trades = filteredTrades;
        dashboardData.allTrades = dashboardData.allTrades || [];
        dashboardData.strategies = strategies;
        dashboardData.activeAccountId = activeAccountId;
        dashboardData.accounts = accounts;
        dashboardData.dateFilter = dashboardData.dateFilter || { type: 'current-month', startDate: null, endDate: null };

        const updateSections = () => {
            console.log(`Passing ${filteredTrades.length} trades to metrics section`);
            updateSection('metrics', currentDashboard.metrics, filteredTrades, strategies, activeAccountId, accounts);
            console.log(`Passing ${filteredTrades.length} trades to tables section`);
            updateSection('tables', currentDashboard.tables, filteredTrades, strategies, activeAccountId, accounts);
            console.log(`Passing ${filteredTrades.length} trades to charts section`);
            updateSection('charts', currentDashboard.charts.flat(), filteredTrades, strategies, activeAccountId, accounts, true);
        };

        initializeIndexedTrades();

        setTimeout(() => {
            if (isEditMode) {
                bindWidgetEvents(filteredTrades, strategies, activeAccountId, accounts);
                requestAnimationFrame(() => bindDragAndDrop(filteredTrades, strategies, activeAccountId, accounts, domCache.dashboard));
            } else {
                bindWidgetEvents(filteredTrades, strategies, activeAccountId, accounts);
            }
        }, 50);

        updateSections();
        dashboard.style.visibility = 'visible';
        dashboard.style.opacity = '1';
    } catch (err) {
        showToast('Error rendering dashboard.', 'error');
        console.error('Dashboard rendering error:', err);
    }
}

function updateSection(section, widgetIds, trades, strategies, activeAccountId, accounts, isChartSection = false, rowIndex = null) {
    const sectionElement = domCache[`${section}Section`];
    console.log(`Updating section: ${section}, widgetIds:`, widgetIds, `trades count: ${trades.length}`, 'isChartSection:', isChartSection, 'rowIndex:', rowIndex, 'isEditMode:', isEditMode);

    if (!sectionElement) {
        console.warn(`Section element for ${section} not found`);
        return;
    }

    try {
        sectionElement.innerHTML = '';

        if (isChartSection) {
            if (rowIndex !== null) {
                const rowElement = document.createElement('div');
                rowElement.className = 'row charts-row';
                rowElement.style.minHeight = '200px';
                rowElement.style.transition = 'opacity 0.3s ease';
                rowElement.style.opacity = '0.9';
                rowElement.dataset.rowIndex = rowIndex;

                const fragment = document.createDocumentFragment();
                const chartRow = currentDashboard.charts[rowIndex] || [];

                chartRow.forEach((widgetId, index) => {
                    if (widgetId === 'placeholder' && isEditMode) {
                        const flatIndex = rowIndex * 2 + index;
                        const addButtonElement = createAddWidgetButton(section, flatIndex, widgetId);
                        addButtonElement.style.transition = 'opacity 0.3s ease';
                        addButtonElement.style.opacity = '0';
                        fragment.appendChild(addButtonElement);
                        setTimeout(() => { addButtonElement.style.opacity = '1'; }, 100);
                    } else {
                        const widget = widgetConfig.find(w => w.id === widgetId);
                        if (widget) {
                            const widgetTrades = trades;
                            console.log(`Rendering widget ${widget.id} with ${widgetTrades.length} trades`);
                            const widgetElement = renderWidget(widget, widgetTrades, strategies, activeAccountId, accounts);
                            widgetElement.style.transition = 'opacity 0.3s ease';
                            widgetElement.style.opacity = '0';
                            fragment.appendChild(widgetElement);
                            setTimeout(() => { widgetElement.style.opacity = '1'; }, 100);
                        } else {
                            console.warn(`Widget ${widgetId} not found in widgetConfig, skipping`);
                        }
                    }
                });

                rowElement.appendChild(fragment);
                sectionElement.appendChild(rowElement);

                setTimeout(() => {
                    rowElement.style.opacity = '1';
                }, 300);
            } else {
                const fragment = document.createDocumentFragment();
                let flatIndex = 0;

                const chartsRows = currentDashboard.charts.length > 0 ? currentDashboard.charts : [['placeholder', 'placeholder']];

                chartsRows.forEach((rowWidgets, rowIdx) => {
                    const rowElement = document.createElement('div');
                    rowElement.className = 'row charts-row';
                    rowElement.style.minHeight = '200px';
                    rowElement.style.transition = 'opacity 0.3s ease';
                    rowElement.style.opacity = '0.9';
                    rowElement.dataset.rowIndex = rowIdx;

                    rowWidgets.forEach((widgetId, colIdx) => {
                        if (widgetId === 'placeholder' && isEditMode) {
                            const addButtonElement = createAddWidgetButton(section, flatIndex, widgetId);
                            addButtonElement.style.transition = 'opacity 0.3s ease';
                            addButtonElement.style.opacity = '0';
                            rowElement.appendChild(addButtonElement);
                            setTimeout(() => { addButtonElement.style.opacity = '1'; }, 100);
                        } else {
                            const widget = widgetConfig.find(w => w.id === widgetId);
                            if (widget) {
                                const widgetTrades = trades;
                                console.log(`Rendering widget ${widget.id} with ${widgetTrades.length} trades`);
                                const widgetElement = renderWidget(widget, widgetTrades, strategies, activeAccountId, accounts);
                                widgetElement.style.transition = 'opacity 0.3s ease';
                                widgetElement.style.opacity = '0';
                                rowElement.appendChild(widgetElement);
                                setTimeout(() => { widgetElement.style.opacity = '1'; }, 100);
                            } else {
                                console.warn(`Widget ${widgetId} not found in widgetConfig, skipping`);
                            }
                        }
                        flatIndex++;
                    });

                    if (isEditMode && rowWidgets.length < 2) {
                        const addButtonElement = createAddWidgetButton(section, flatIndex, 'placeholder');
                        addButtonElement.style.transition = 'opacity 0.3s ease';
                        addButtonElement.style.opacity = '0';
                        rowElement.appendChild(addButtonElement);
                        setTimeout(() => { addButtonElement.style.opacity = '1'; }, 100);
                        flatIndex++;
                    }

                    fragment.appendChild(rowElement);
                    setTimeout(() => {
                        rowElement.style.opacity = '1';
                    }, 300);
                });

                sectionElement.appendChild(fragment);
            }
        } else {
            const rowElement = document.createElement('div');
            rowElement.className = 'row';
            rowElement.style.transition = 'opacity 0.3s ease';
            rowElement.style.opacity = '0.9';
            rowElement.dataset.rowIndex = 0;

            let adjustedWidgetIds = [...widgetIds];
            if (isEditMode) {
                if (section === 'metrics' && widgetIds.length < 4) {
                    while (adjustedWidgetIds.length < 4) adjustedWidgetIds.push('placeholder');
                } else if (section === 'tables' && widgetIds.length < 2) {
                    while (adjustedWidgetIds.length < 2) adjustedWidgetIds.push('placeholder');
                }
            }

            adjustedWidgetIds.forEach((widgetId, index) => {
                if (widgetId === 'placeholder' && isEditMode) {
                    const addButtonElement = createAddWidgetButton(section, index, widgetId);
                    addButtonElement.style.transition = 'opacity 0.3s ease';
                    addButtonElement.style.opacity = '0';
                    rowElement.appendChild(addButtonElement);
                    setTimeout(() => { addButtonElement.style.opacity = '1'; }, 100);
                } else {
                    const widget = widgetConfig.find(w => w.id === widgetId);
                    if (widget) {
                        console.log(`Rendering widget ${widget.id} with ${trades.length} trades`);
                        const widgetElement = renderWidget(widget, trades, strategies, activeAccountId, accounts);
                        widgetElement.style.transition = 'opacity 0.3s ease';
                        widgetElement.style.opacity = '0';
                        rowElement.appendChild(widgetElement);
                        setTimeout(() => { widgetElement.style.opacity = '1'; }, 100);
                    } else {
                        console.warn(`Widget ${widgetId} not found in widgetConfig, skipping`);
                    }
                }
            });

            sectionElement.appendChild(rowElement);
            setTimeout(() => {
                rowElement.style.opacity = '1';
            }, 300);
        }

        console.log(`Finished updating section: ${section}`);
    } catch (err) {
        showToast(`Error updating ${section} section.`, 'error');
        console.error(`Error in updateSection (${section}):`, err);
    }
}

function renderSection(section, widgetIds, trades, strategies, activeAccountId, accounts, isChartSection = false, rowIndex = null) {
    const sectionElement = domCache[`${section}Section`];
    console.log(`Rendering section: ${section}, widgetIds:`, widgetIds, 'isChartSection:', isChartSection, 'rowIndex:', rowIndex, 'sectionElement:', sectionElement);

    if (!sectionElement) {
        console.warn(`Section element for ${section} not found`);
        return;
    }

    try {
        if (isChartSection) {
            if (rowIndex !== null) {
                const rowElement = sectionElement.children[rowIndex];
                if (!rowElement) {
                    console.warn(`Row ${rowIndex} not found in charts section`);
                    return;
                }
                rowElement.innerHTML = '';
                rowElement.className = 'row charts-row';
                rowElement.style.minHeight = '200px';
                rowElement.dataset.rowIndex = rowIndex;
                currentDashboard.charts[rowIndex].forEach((widgetId, index) => {
                    if (widgetId === 'placeholder' && isEditMode) {
                        const flatIndex = rowIndex * 2 + index;
                        const addButtonElement = createAddWidgetButton(section, flatIndex, widgetId);
                        console.log(`Created add button for placeholder: section=${section}, flatIndex=${flatIndex}, buttonHTML:`, addButtonElement.outerHTML);
                        rowElement.appendChild(addButtonElement);
                    } else {
                        const widget = widgetConfig.find(w => w.id === widgetId);
                        if (widget) {
                            const widgetTrades = trades;
                            const widgetElement = renderWidget(widget, widgetTrades, strategies, activeAccountId, accounts);
                            rowElement.appendChild(widgetElement);
                        } else {
                            console.warn(`Widget ${widgetId} not found in widgetConfig`);
                        }
                    }
                });
                if (isEditMode && currentDashboard.charts[rowIndex].length < 2) {
                    const flatIndex = rowIndex * 2 + currentDashboard.charts[rowIndex].length;
                    const addButtonElement = createAddWidgetButton(section, flatIndex, 'placeholder');
                    console.log(`Added extra placeholder for charts: section=${section}, flatIndex=${flatIndex}, buttonHTML:`, addButtonElement.outerHTML);
                    rowElement.appendChild(addButtonElement);
                }
            } else {
                sectionElement.innerHTML = '';
                let flatIndex = 0;

                if (currentDashboard.charts.length === 0) {
                    currentDashboard.charts = [['placeholder', 'placeholder']];
                }

                currentDashboard.charts.forEach((row, rowIdx) => {
                    const rowElement = document.createElement('div');
                    rowElement.className = 'row charts-row';
                    rowElement.style.minHeight = '200px';
                    rowElement.dataset.rowIndex = rowIdx;
                    row.forEach((widgetId, colIdx) => {
                        if (widgetId === 'placeholder' && isEditMode) {
                            const addButtonElement = createAddWidgetButton(section, flatIndex, widgetId);
                            console.log(`Created add button for placeholder: section=${section}, flatIndex=${flatIndex}, buttonHTML:`, addButtonElement.outerHTML);
                            rowElement.appendChild(addButtonElement);
                        } else {
                            const widget = widgetConfig.find(w => w.id === widgetId);
                            if (widget) {
                                const widgetTrades = trades;
                                const widgetElement = renderWidget(widget, widgetTrades, strategies, activeAccountId, accounts);
                                rowElement.appendChild(widgetElement);
                            } else {
                                console.warn(`Widget ${widgetId} not found in widgetConfig`);
                            }
                        }
                        flatIndex++;
                    });
                    if (isEditMode && row.length < 2) {
                        const addButtonElement = createAddWidgetButton(section, flatIndex, 'placeholder');
                        console.log(`Added extra placeholder for charts: section=${section}, flatIndex=${flatIndex}, buttonHTML:`, addButtonElement.outerHTML);
                        rowElement.appendChild(addButtonElement);
                        flatIndex++;
                    }
                    sectionElement.appendChild(rowElement);
                });
            }
        } else {
            sectionElement.innerHTML = '';
            const rowElement = document.createElement('div');
            rowElement.className = 'row';
            rowElement.dataset.rowIndex = 0;
            widgetIds.forEach((widgetId, index) => {
                if (widgetId === 'placeholder' && isEditMode) {
                    const addButtonElement = createAddWidgetButton(section, index, widgetId);
                    console.log(`Created add button for placeholder: section=${section}, index=${index}, buttonHTML:`, addButtonElement.outerHTML);
                    rowElement.appendChild(addButtonElement);
                } else {
                    const widget = widgetConfig.find(w => w.id === widgetId);
                    if (widget) {
                        let widgetTrades = dashboardData.allTrades;
                        if (widget.id === 'daily-win') {
                            const today = new Date();
                            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                            widgetTrades = dashboardData.allTrades.filter(trade => trade.date === todayStr);
                        }
                        const widgetElement = renderWidget(widget, widgetTrades, strategies, activeAccountId, accounts);
                        rowElement.appendChild(widgetElement);
                    } else {
                        console.warn(`Widget ${widgetId} not found in widgetConfig`);
                    }
                }
            });
            if (isEditMode && widgetIds.length < 4 && section === 'metrics') {
                const addButtonElement = createAddWidgetButton(section, widgetIds.length, 'placeholder');
                console.log(`Added extra placeholder for ${section}: index=${widgetIds.length}, buttonHTML:`, addButtonElement.outerHTML);
                rowElement.appendChild(addButtonElement);
            }
            sectionElement.appendChild(rowElement);
        }
        console.log(`Finished rendering section: ${section}`);
    } catch (err) {
        showToast(`Error rendering ${section} section.`, 'error');
        console.error(`Error in renderSection (${section}):`, err);
    }
}

function createAddWidgetButton(section, index, deletedWidgetId) {
    const col = document.createElement('div');
    let colClass = '';
    if (section === 'tables') {
        const originalWidgetId = defaultDashboard.tables[index];
        colClass = originalWidgetId === 'recent-trades' ? 'col-md-3 col-12 mb-3' : 'col-md-9 col-12 mb-3';
    } else if (section === 'charts') {
        colClass = 'col-md-6 col-12 mb-3';
    } else {
        colClass = 'col-md-3 col-12 mb-3';
    }
    col.className = colClass;
    col.dataset.section = section;
    col.dataset.index = index;
    col.innerHTML = `
        <div class="card top-metrics-card h-100 add-widget-placeholder" style="min-height: 150px;">
            <div class="card-body d-flex justify-content-center align-items-center">
                <button class="btn btn-outline-primary add-widget" data-section="${section}" data-index="${index}">
                    <i class="bi bi-plus-circle"></i> Add Widget
                </button>
            </div>
        </div>
    `;
    console.log(`Created Add Widget button for section: ${section}, index: ${index}, colClass: ${colClass}`);
    return col;
}

function renderWidget(widget, trades, strategies, activeAccountId, accounts) {
    const col = document.createElement('div');
    if (widget.section === 'tables') {
        col.className = widget.id === 'recent-trades' ? 'col-md-3 col-12 mb-3' : 'col-md-9 col-12 mb-3';
    } else {
        col.className = widget.section === 'metrics' ? 'col-md-3 col-12 mb-3' : 'col-md-6 col-12 mb-3';
    }
    col.dataset.widgetId = widget.id;
    col.dataset.section = widget.section;
    col.style.position = 'relative';
    col.innerHTML = `
        <div class="card top-metrics-card h-100" style="min-height: 150px;">
            <div class="card-body ${widget.section === 'metrics' ? 'top-matrics-card-body' : ''} position-relative">
                <h6 class="card-title ${widget.section === 'metrics' ? 'text-center' : ''}">${widget.title}</h6>
                <div id="${widget.id}" style="min-height: 100px;"></div>
            </div>
        </div>
        ${isEditMode ? `
            <button class="btn btn-icon-only btn-clean-danger delete-widget" data-widget-id="${widget.id}" title="Remove this widget"><i class="bi bi-trash"></i></button>
            <button class="btn btn-icon-only btn-clean-secondary settings-widget" data-widget-id="${widget.id}" title="Configure widget settings"><i class="bi bi-gear"></i></button>
        ` : ''}
    `;
    try {
        const widgetTrades = (widget.id === 'current-streak' || widget.id === 'trading-calendar' || widget.id === 'yearly-overview') ? dashboardData.allTrades : trades;
        console.log(`Rendering widget ${widget.id} with ${widgetTrades.length} trades in ${widget.section} section`);
        widget.render(widget.id, col.querySelector(`#${widget.id}`), widgetTrades, strategies, activeAccountId, accounts, widgetSettings[widget.id] || {});
    } catch (err) {
        showToast(`Error rendering widget: ${widget.title}`, 'error');
        console.error(`Error rendering widget ${widget.id}:`, err);
        col.querySelector(`#${widget.id}`).innerHTML = `<div>Error rendering ${widget.title}</div>`;
    }
    return col;
}

async function renderAccountBalance(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        console.log(`Starting renderAccountBalance for accountId: ${activeAccountId}, trades: ${trades.length}`, 
            trades.map(t => ({ id: t.id, accountId: t.accountId, profitLoss: t.profitLoss, date: t.date })));
        
        if (!Array.isArray(accounts) || accounts.length === 0) {
            console.error('Accounts data is not available:', accounts);
            container.innerHTML = '<div class="text-danger">No accounts available</div>';
            showToast('No accounts available.', 'error');
            return;
        }

        if (!validateAccountId(activeAccountId, 'renderAccountBalance')) {
            console.error('Invalid activeAccountId, attempting fallback to first account');
            activeAccountId = accounts[0]?.id;
            if (!validateAccountId(activeAccountId, 'renderAccountBalance fallback')) {
                console.error('No valid account ID available:', accounts);
                container.innerHTML = '<div class="text-danger">No valid account ID</div>';
                showToast('No valid account ID.', 'error');
                return;
            }
        }

        const numericId = normalizeAccountID(activeAccountId);

        try {
            const result = await calculateAccountBalance({
                accountId: numericId,
                useCache: false,
                validate: true
            });
            const { balance, initialBalance, account } = result || {};
            console.log(`Balance calculated for account ${numericId}: ${balance}, initialBalance: ${initialBalance}`);

            if (typeof balance !== 'number' || typeof initialBalance !== 'number') {
                console.error('Invalid balance or initialBalance:', { balance, initialBalance });
                container.innerHTML = '<div class="text-danger">Balance unavailable</div>';
                showToast('Invalid balance data.', 'error');
                return;
            }

            const totalPnL = balance - initialBalance;
            const isBalancePositive = balance >= initialBalance;
            const isPnLPositive = totalPnL >= 0;

            const formattedBalance = settings.format === 'currency-short'
                ? `$${balance.toFixed(0)}`
                : `$${balance.toFixed(2)}`;
            const textColor = settings.textColor || (isBalancePositive ? '#28a745' : '#dc3545');
            const pnlColor = settings.textColor || (isPnLPositive ? '#28a745' : '#dc3545');
            const formattedPnL = `${isPnLPositive ? '+' : ''}$${totalPnL.toFixed(2)}`;

            requestAnimationFrame(() => {
                console.log(`Updating DOM for account-balance with balance: ${formattedBalance}`);
                container.innerHTML = `
                    <div class="d-flex flex-column align-items-center text-center w-100">
                        <h4 class="fw-bold" style="color: ${textColor};">${formattedBalance}</h4>
                        <div class="small mt-1" style="color: ${pnlColor};">Total PnL: ${formattedPnL}</div>
                    </div>
                `;
            });
        } catch (err) {
            console.error('Error calculating balance for widget:', err, err.stack);
            container.innerHTML = '<div class="text-danger">Balance unavailable</div>';
            showToast('Unable to calculate balance. Please check account data.', 'error');
        }
    } catch (err) {
        console.error('Error rendering Account Balance widget:', err, err.stack);
        container.innerHTML = '<div class="text-danger">Error rendering Account Balance</div>';
        showToast('Error rendering Account Balance widget.', 'error');
    }
}

function renderTradeWin(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        const winRate = calculateWinRate(trades);
        renderTopMetric(container, {
            value: winRate,
            format: settings?.format || 'percentage',
            colorFn: (val) => settings.textColor || (val >= 50 ? '#28a745' : '#dc3545')
        });
    } catch (err) {
        console.error('Trade Win rendering error:', err);
        container.innerHTML = '<div class="text-danger">Error rendering Trade Win %</div>';
        showToast('Error rendering Trade Win %', 'error');
    }
}

function renderDailyWin(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const todayTrades = trades.filter(trade => trade.date === todayStr);
        const winRate = calculateWinRate(todayTrades);
        renderTopMetric(container, {
            value: winRate,
            format: settings?.format || 'percentage',
            colorFn: (val) => settings.textColor || (val >= 50 ? '#28a745' : '#dc3545')
        });
    } catch (err) {
        console.error('Daily Win rendering error:', err);
        container.innerHTML = '<div class="text-danger">Error rendering Daily Win %</div>';
        showToast('Error rendering Daily Win %', 'error');
    }
}

const formatCurrency = (value, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
};

function renderCurrentStreak(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        console.log(`Rendering Current Streak for account ${activeAccountId}, trades count: ${trades.length}`);
        console.log('Input Trades:', trades.map(t => ({
            id: t.id,
            date: t.date,
            outcome: t.outcome,
            accountId: t.accountId
        })));

        if (!container) {
            console.error('Container element not found for rendering Current Streak widget');
            return;
        }

        container.innerHTML = '';

        if (!Array.isArray(trades) || trades.length === 0) {
            console.log('No trades available, rendering zero streaks');
            const radius = 24;
            const circumference = 2 * Math.PI * radius;

            const createRing = (value, max) => {
                const safeMax = Math.max(max, 1);
                const percent = Math.min(value / safeMax, 1);
                return {
                    dashArray: `${(percent * circumference).toFixed(2)} ${circumference.toFixed(2)}`,
                    percent: Math.round(percent * 100)
                };
            };

            const currentDayRing = createRing(0, 10);
            const previousDayRing = createRing(0, 10);
            const currentTradeWinRing = createRing(0, 10);
            const currentTradeLossRing = createRing(0, 10);

            const circleColorWin = settings.circleColorWin || '#28a745';
            const circleColorLoss = settings.circleColorLoss || '#dc3545';

            container.innerHTML = `
                <div class="d-flex flex-column align-items-start justify-content-start w-100">
                    <div class="d-flex justify-content-center align-items-center text-center w-100 gap-3 gap-md-5">
                        <div class="d-flex flex-column align-items-center gap-2">
                            <div class="small text-muted">DAYS</div>
                            <div class="d-flex align-items-center gap-2">
                                <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" title="Current Streak: 0 days">
                                    <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                        <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                        <circle cx="30" cy="30" r="${radius}" stroke="${circleColorWin}" stroke-width="6" fill="none"
                                            stroke-dasharray="${currentDayRing.dashArray}"
                                            stroke-dashoffset="0"/>
                                        <text x="30" y="35" text-anchor="middle" font-size="14" fill="${circleColorWin}" style="transform: rotate(90deg); transform-origin: center;">0</text>
                                    </svg>
                                </div>
                                <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" title="Previous Streak: 0 days">
                                    <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-91deg);">
                                        <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                        <circle cx="30" cy="30" r="${radius}" stroke="${circleColorLoss}" stroke-width="6" fill="none"
                                            stroke-dasharray="${previousDayRing.dashArray}"
                                            stroke-dashoffset="0"/>
                                        <text x="30" y="35" text-anchor="middle" font-size="14" fill="${circleColorLoss}" style="transform: rotate(90deg); transform-origin: center;">0</text>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div class="d-flex flex-column align-items-center gap-2">
                            <div class="small text-muted">TRADES</div>
                            <div class="d-flex align-items-center gap-2">
                                <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" title="Current Streak: 0 winning trades">
                                    <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                        <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                        <circle cx="30" cy="30" r="${radius}" stroke="${circleColorWin}" stroke-width="6" fill="none"
                                            stroke-dasharray="${currentTradeWinRing.dashArray}"
                                            stroke-dashoffset="0"/>
                                        <text x="30" y="35" text-anchor="middle" font-size="14" fill="${circleColorWin}" style="transform: rotate(90deg); transform-origin: center;">0</text>
                                    </svg>
                                </div>
                                <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" title="Current Streak: 0 losing trades">
                                    <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                        <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                        <circle cx="30" cy="30" r="${radius}" stroke="${circleColorLoss}" stroke-width="6" fill="none"
                                            stroke-dasharray="${currentTradeLossRing.dashArray}"
                                            stroke-dashoffset="0"/>
                                        <text x="30" y="35" text-anchor="middle" font-size="14" fill="${circleColorLoss}" style="transform: rotate(90deg); transform-origin: center;">0</text>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
            console.log('Found tooltips (no trades):', tooltipTriggerList.length);
            tooltipTriggerList.forEach(tooltipTriggerEl => {
                new bootstrap.Tooltip(tooltipTriggerEl);
            });

            return;
        }

        const accountTrades = dashboardData.allTrades.filter(t => t.accountId === activeAccountId);
        const streaks = calculateFullStreaks(accountTrades, 'outcome', 'date', false, 'lenient');

        const radius = 24;
        const circumference = 2 * Math.PI * radius;

        const createRing = (value, max) => {
            const safeMax = Math.max(max, 1);
            const percent = Math.min(value / safeMax, 1);
            return {
                dashArray: `${(percent * circumference).toFixed(2)} ${circumference.toFixed(2)}`,
                percent: Math.round(percent * 100)
            };
        };

        let currentStreakDays, previousStreakDays, currentTradeWins, currentTradeLosses,
            currentDayRingColor, previousDayRingColor, currentTradeWinRingColor, currentTradeLossRingColor,
            currentDayTextColor, previousDayTextColor, currentTradeWinTextColor, currentTradeLossTextColor;

        const circleColorWin = settings.circleColorWin || '#28a745';
        const circleColorLoss = settings.circleColorLoss || '#dc3545';

        if (streaks.mostRecentStreak === 'winning') {
            currentStreakDays = streaks.winDays;
            previousStreakDays = streaks.lossDays;
            currentTradeWins = streaks.winTrades;
            currentTradeLosses = streaks.lossTrades;
            currentDayRingColor = circleColorWin;
            previousDayRingColor = circleColorLoss;
            currentTradeWinRingColor = circleColorWin;
            currentTradeLossRingColor = circleColorLoss;
            currentDayTextColor = circleColorWin;
            previousDayTextColor = circleColorLoss;
            currentTradeWinTextColor = circleColorWin;
            currentTradeLossTextColor = circleColorLoss;
        } else {
            currentStreakDays = streaks.lossDays;
            previousStreakDays = streaks.winDays;
            currentTradeWins = streaks.winTradesLosingStreak;
            currentTradeLosses = streaks.lossTradesLosingStreak;
            currentDayRingColor = circleColorLoss;
            previousDayRingColor = circleColorWin;
            currentTradeWinRingColor = circleColorWin;
            currentTradeLossRingColor = circleColorLoss;
            currentDayTextColor = circleColorLoss;
            previousDayTextColor = circleColorWin;
            currentTradeWinTextColor = circleColorWin;
            currentTradeLossTextColor = circleColorLoss;
        }

        console.log('currentDayRingColor:', currentDayRingColor);
        console.log('previousDayRingColor:', previousDayRingColor);
        console.log('currentTradeWinRingColor:', currentTradeWinRingColor);
        console.log('currentTradeLossRingColor:', currentTradeLossRingColor);

        const currentDayRing = createRing(currentStreakDays, 10);
        const previousDayRing = createRing(previousStreakDays, 10);
        console.log('currentDayRing:', currentDayRing);
        console.log('previousDayRing:', previousDayRing);

        const currentTradeWinRing = createRing(currentTradeWins, 10);
        const currentTradeLossRing = createRing(currentTradeLosses, 10);
        console.log('currentTradeWins:', currentTradeWins);
        console.log('currentTradeLosses:', currentTradeLosses);
        console.log('currentTradeWinRing:', currentTradeWinRing);
        console.log('currentTradeLossRing:', currentTradeLossRing);

        const currentDayTooltip = streaks.mostRecentStreak === 'winning' ? `Current Streak: ${currentStreakDays} winning days` : `Current Streak: ${currentStreakDays} losing days`;
        const previousDayTooltip = streaks.mostRecentStreak === 'winning' ? `Previous Streak: ${previousStreakDays} losing days` : `Previous Streak: ${previousStreakDays} winning days`;
        const currentTradeWinTooltip = `Current Streak: ${currentTradeWins} winning trades`;
        const currentTradeLossTooltip = `Current Streak: ${currentTradeLosses} losing trades`;

        const tooltipContent = `
            During Winning Days:<br>
            - Win Rate: ${streaks.winningStreakWinRate}%<br>
            - Net PnL: ${formatCurrency(streaks.winningStreakNetPnL, 'USD')}<br>
            During Losing Days:<br>
            - Wins: ${streaks.winTradesLosingStreak} trades<br>
            - Losses: ${streaks.lossTradesLosingStreak} trades<br>
            - Win Rate: ${streaks.losingStreakWinRate}%<br>
            - Net PnL: ${formatCurrency(streaks.losingStreakNetPnL, 'USD')}
        `;

        container.innerHTML = `
            <div class="d-flex flex-column align-items-start justify-content-start w-100">
                <div class="d-flex justify-content-center align-items-center text-center w-100 gap-3 gap-md-5">
                    <div class="d-flex flex-column align-items-center gap-2">
                        <div class="small text-muted">DAYS</div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" >
                                <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                    <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                    <circle cx="30" cy="30" r="${radius}" stroke="${currentDayRingColor}" stroke-width="6" fill="none"
                                        stroke-dasharray="${currentDayRing.dashArray}"
                                        stroke-dashoffset="0"/>
                                    <text x="30" y="35" text-anchor="middle" font-size="14" fill="${currentDayTextColor}" style="transform: rotate(90deg); transform-origin: center;">${currentStreakDays}</text>
                                </svg>
                            </div>
                            <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" title="${previousDayTooltip}">
                                <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                    <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                    <circle cx="30" cy="30" r="${radius}" stroke="${previousDayRingColor}" stroke-width="6" fill="none"
                                        stroke-dasharray="${previousDayRing.dashArray}"
                                        stroke-dashoffset="0"/>
                                    <text x="30" y="35" text-anchor="middle" font-size="14" fill="${previousDayTextColor}" style="transform: rotate(90deg); transform-origin: center;">${previousStreakDays}</text>
                                </svg>
                            </div>
                        </div>
                    </div>
                    <div class="d-flex flex-column align-items-center gap-2 position-relative" data-bs-toggle="tooltip" data-bs-html="true" title="${tooltipContent}">
                        <div class="small text-muted">TRADES</div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" >
                                <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                    <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                    <circle cx="30" cy="30" r="${radius}" stroke="${currentTradeWinRingColor}" stroke-width="6" fill="none"
                                        stroke-dasharray="${currentTradeWinRing.dashArray}"
                                        stroke-dashoffset="0"/>
                                    <text x="30" y="35" text-anchor="middle" font-size="14" fill="${currentTradeWinTextColor}" style="transform: rotate(90deg); transform-origin: center;">${currentTradeWins}</text>
                                </svg>
                            </div>
                            <div class="position-relative" style="width: clamp(40px, 5vw, 60px); height: clamp(40px, 5vw, 60px);" data-bs-toggle="tooltip" data-bs-html="true" >
                                <svg width="100%" height="100%" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
                                    <circle cx="30" cy="30" r="${radius}" stroke="#e9ecef" stroke-width="6" fill="none"></circle>
                                    <circle cx="30" cy="30" r="${radius}" stroke="${currentTradeLossRingColor}" stroke-width="6" fill="none"
                                        stroke-dasharray="${currentTradeLossRing.dashArray}"
                                        stroke-dashoffset="0"/>
                                    <text x="30" y="35" text-anchor="middle" font-size="14" fill="${currentTradeLossTextColor}" style="transform: rotate(90deg); transform-origin: center;">${currentTradeLosses}</text>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
            console.log('Found tooltips (with trades):', tooltipTriggerList.length);
            tooltipTriggerList.forEach(tooltipTriggerEl => {
                new bootstrap.Tooltip(tooltipTriggerEl);
            });

            console.log('Current Streak widget rendered with visual rings.');
        } catch (err) {
            showToast('Error rendering Current Streak widget.', 'error');
            console.error('Current Streak rendering error:', err);
            container.innerHTML = '<div class="text-danger">Error rendering Current Streak</div>';
        }
    }

function renderSummaryWidget(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        if (!Array.isArray(trades) || !activeAccountId) {
            container.innerHTML = '<div class="text-danger">No trades available.</div>';
            return;
        }

        const { total, wins, losses } = calculateTradeCounts(trades, activeAccountId);

        if (total === 0) {
            container.innerHTML = '<div class="text-muted text-center">No trades found.</div>';
            return;
        }

        const winRate = ((wins / total) * 100).toFixed(1);
        const lossRate = ((losses / total) * 100).toFixed(1);

        const totalColor = settings?.circleColorNeutral || '#007bff';
        const winColor = settings?.circleColorWin || '#28a745';
        const lossColor = settings?.circleColorLoss || '#dc3545';

        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center w-100">
                ${createCircleSummary(total, 100, totalColor, 'Total')}
                ${createCircleSummary(wins, winRate, winColor, 'Wins')}
                ${createCircleSummary(losses, lossRate, lossColor, 'Losses')}
            </div>
        `;
    } catch (err) {
        console.error('Error rendering Trade Summary widget:', err);
        container.innerHTML = '<div class="text-danger">Error rendering Trade Summary</div>';
        showToast('Error rendering Trade Summary widget.', 'error');
    }
}

function createCircleSummary(value, percent, color, label) {
    const radius = 20;
    const circumference = 2 * Math.PI * radius;
    const dashArray = `${(percent / 100) * circumference} ${circumference}`;

    return `
        <div class="d-flex flex-column align-items-center" style="width: 90px;">
            <div class="position-relative" style="width: 70px; height: 70px;">
                <svg width="70" height="70" viewBox="0 0 70 70">
                    <circle cx="35" cy="35" r="${radius}" fill="none" stroke="#e9ecef" stroke-width="4"/>
                    <circle cx="35" cy="35" r="${radius}" fill="none" stroke="${color}" stroke-width="4"
                        stroke-dasharray="${dashArray}" stroke-dashoffset="0" transform="rotate(-90 35 35)"/>
                </svg>
                <div class="position-absolute top-50 start-50 translate-middle fw-bold" style="font-size: 1rem; color: ${color};">${value}</div>
            </div>
            <small class="mt-1 text-muted">${label}</small>
        </div>
    `;
}

function renderRecentTrades(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        if (!Array.isArray(trades)) {
            throw new Error('Trades data is not available');
        }

        const filteredTrades = trades.filter(t => t.accountId === activeAccountId);

        const recentTrades = filteredTrades
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5);
        container.innerHTML = `
            <table class="table table-sm">
                <thead><tr><th>Date</th><th>Pair</th><th>P&L</th></tr></thead>
                <tbody>
                    ${recentTrades.map(t => `
                        <tr>
                            <td>${t.date || 'N/A'}</td>
                            <td>${t.pair || 'N/A'}</td>
                            <td style="color: ${t.profitLoss < 0 ? '#dc3545' : '#28a745'}">${t.profitLoss?.toFixed(2) || '0.00'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        showToast('Error rendering Recent Trades widget.', 'error');
        console.error('Recent Trades rendering error:', err);
        container.innerHTML = '<div>Error rendering Recent Trades</div>';
    }
}

function renderTradingCalendar(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        if (!Array.isArray(dashboardData.allTrades)) {
            throw new Error('Trades data is not available');
        }
        console.log(`Rendering Trading Calendar with total trades: ${dashboardData.allTrades.length}, container ID: ${id}, accountId: ${activeAccountId}`);
        container.innerHTML = `<div id="${id}" class="calendar-container" style="min-height: 400px;"></div>`;
        setTimeout(async () => {
            const calendarContainer = document.getElementById(id);
            if (!calendarContainer) {
                console.error(`Calendar container with ID ${id} not found after DOM update`);
                container.innerHTML = '<div>Error: Calendar container not found.</div>';
                showToast('Error: Calendar container not found.', 'error');
                return;
            }
            let calendarSettings = { showWeeklyStats: true, showTradeDetails: true };
            try {
                const savedConfig = await loadFromStore('dashboard');
                const savedSettings = savedConfig?.find(d => d.id === 'calendarSettings')?.data;
                if (savedSettings) {
                    calendarSettings = savedSettings;
                    console.log('Loaded calendar settings from IndexedDB:', calendarSettings);
                } else {
                    console.log('No calendar settings found in IndexedDB, using defaults');
                }
            } catch (err) {
                console.error('Error loading calendar settings:', err);
                showToast('Error loading calendar settings.', 'error');
            }
            const today = new Date();
            renderCalendar({
                containerId: id,
                indexedTrades,
                allTrades: dashboardData.allTrades,
                year: today.getFullYear(),
                month: today.getMonth(),
                activeAccountId,
                showBackgroundColors: true,
                showTradeDetails: calendarSettings.showTradeDetails,
                showWeeklyStats: calendarSettings.showWeeklyStats,
                showMonthlyStats: true,
                showHeaderIcons: true,
                showNoteIcon: true,
                enableCellClick: true,
                onDayClick: (dayNumber, dateString, dailyTrades, dailyPlan) => {
                    console.log(`Calendar day clicked: ${dateString}, trades: ${dailyTrades.length}`);
                    openDailyPlanModal(dateString, dailyPlan, dailyTrades);
                },
                onNoteClick: (dateString, dailyPlan, dailyTrades) => {
                    console.log(`Calendar note clicked: ${dateString}`);
                    openDailyPlanModal(dateString, dailyPlan, dailyTrades);
                },
                onMonthSelect: (selectedYear, selectedMonth) => {
                    console.log(`Calendar month selected: ${selectedYear}-${selectedMonth + 1}`);
                }
            });
        }, 0);
    } catch (err) {
        showToast('Error rendering Trading Calendar widget.', 'error');
        console.error('Trading Calendar rendering error:', err);
        container.innerHTML = '<div>Error rendering Trading Calendar</div>';
    }
}

function renderYearlyOverviewWidget(id, container, trades, strategies, activeAccountId, accounts, settings) {
    try {
        if (!Array.isArray(dashboardData.allTrades)) {
            throw new Error('Trades data is not available');
        }
        console.log(`Rendering Yearly Overview with total trades: ${dashboardData.allTrades.length}, container ID: ${id}, accountId: ${activeAccountId}`);
        container.innerHTML = `<div id="${id}" class="yearly-overview-container" style="min-height: 400px;"></div>`;
        setTimeout(() => {
            const overviewContainer = document.getElementById(id);
            if (!overviewContainer) {
                console.error(`Yearly overview container with ID ${id} not found after DOM update`);
                container.innerHTML = '<div>Error: Yearly overview container not found.</div>';
                showToast('Error: Yearly overview container not found.', 'error');
                return;
            }
            const yearlyStats = calculateYearlyStats(dashboardData.allTrades, activeAccountId);
            renderYearlyOverview(overviewContainer, yearlyStats, {
                onDownloadPDF: () => downloadYearlyCalendarPDF(yearlyStats, activeAccountId)
            });
        }, 0);
    } catch (err) {
        showToast('Error rendering Yearly Overview widget.', 'error');
        console.error('Yearly Overview rendering error:', err);
        container.innerHTML = '<div>Error rendering Yearly Overview</div>';
    }
}

function renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts) {
    try {
        if (!domCache.templateDropdownContainer || !domCache.templateSelect) {
            console.warn('Template dropdown container or select element not found');
            return;
        }
        domCache.templateDropdownContainer.innerHTML = '';
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        templates.forEach(template => {
            const templateItem = document.createElement('a');
            templateItem.className = 'dropdown-item';
            templateItem.href = '#';
            templateItem.textContent = template.name;
            templateItem.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await saveToStore('dashboard', { id: 'activeTemplate', data: { name: template.name } });
                    currentDashboard = template.layout;
                    widgetSettings = template.settings || {};
                    domCache.templateSelect.textContent = template.name;
                    console.log(`Switched to template: ${template.name}`);
                    renderDashboard(trades, strategies, activeAccountId, accounts);
                    showToast(`Switched to ${template.name} template.`, 'success');
                } catch (err) {
                    showToast('Error switching template.', 'error');
                    console.error('Error switching template:', err);
                }
            });
            dropdownMenu.appendChild(templateItem);
        });
        domCache.templateDropdownContainer.appendChild(dropdownMenu);
        console.log('Rendered template options:', templates.map(t => t.name));
    } catch (err) {
        showToast('Error rendering template options.', 'error');
        console.error('Error rendering template options:', err);
    }
}

function bindEvents(trades, strategies, activeAccountId, accounts) {
    try {
        if (domCache.saveButton) {
            domCache.saveButton.removeEventListener('click', saveDashboardConfig);
            domCache.saveButton.addEventListener('click', saveDashboardConfig);
        }

        if (domCache.dateRangeFilter) {
            domCache.dateRangeFilter.removeEventListener('change', handleDateRangeChange);
            domCache.dateRangeFilter.addEventListener('change', handleDateRangeChange);
        }

        if (domCache.customRangePicker) {
            domCache.customRangePicker.removeEventListener('change', handleCustomRangeChange);
            domCache.customRangePicker.addEventListener('change', handleCustomRangeChange);
        }

        function handleDateRangeChange(e) {
            const filterType = e.target.value;
            dashboardData.dateFilter = { type: filterType, startDate: null, endDate: null };
            console.log(`Date range filter changed to: ${filterType}`);
            if (filterType === 'custom') {
                if (domCache.customRangePicker) {
                    domCache.customRangePicker.classList.remove('d-none');
                }
            } else {
                if (domCache.customRangePicker) {
                    domCache.customRangePicker.classList.add('d-none');
                }
                let filteredTrades = trades;
                if (filterType !== 'all-time') {
                    const range = getDateRangeForFilter(filterType);
                    filteredTrades = filterTradesByDateRange(trades, range.startDate, range.endDate);
                }
                dashboardData.trades = filteredTrades;
                renderDashboard(filteredTrades, strategies, activeAccountId, accounts);
            }
        }

        function handleCustomRangeChange(e) {
            const [startDate, endDate] = e.target.value.split(' to ');
            if (startDate && endDate) {
                dashboardData.dateFilter = { type: 'custom', startDate, endDate };
                console.log(`Custom date range selected: ${startDate} to ${endDate}`);
                const filteredTrades = filterTradesByDateRange(trades, startDate, endDate);
                dashboardData.trades = filteredTrades;
                renderDashboard(filteredTrades, strategies, activeAccountId, accounts);
            }
        }

        bindWidgetEvents(trades, strategies, activeAccountId, accounts);
    } catch (err) {
        showToast('Error binding events.', 'error');
        console.error('Error binding events:', err);
    }
}
// Binds event listeners to widget-related buttons (add, delete, settings) for dynamic dashboard interactions.
// Purpose: Enables user interaction with widgets by attaching event handlers for adding, removing, or configuring widgets,
// ensuring the dashboard remains responsive and interactive.
function bindWidgetEvents(trades, strategies, activeAccountId, accounts) {
    try {
        // Select all buttons for adding, deleting, and configuring widgets
        const deleteButtons = document.querySelectorAll('.delete-widget');
        const settingsButtons = document.querySelectorAll('.settings-widget');
        const addButtons = document.querySelectorAll('.add-widget');

        // Filter trades to include only those for the active account
        const filteredTrades = trades.filter(t => t.accountId === activeAccountId);

        // Log the number of buttons found for debugging
        console.log(`Binding widget events: ${deleteButtons.length} delete buttons, ${settingsButtons.length} settings buttons, ${addButtons.length} add buttons`);

        // Warn if no add buttons are found, and log additional context for debugging
        if (addButtons.length === 0) {
            console.warn('No add buttons found, checking placeholders:', document.querySelectorAll('.add-widget-placeholder').length);
            console.log('Current dashboard layout:', JSON.stringify(currentDashboard));
            console.log('isEditMode:', isEditMode);
        }

        // Log details of each add button for debugging
        addButtons.forEach(btn => {
            console.log(`Add button: section=${btn.dataset.section}, index=${btn.dataset.index}`);
        });

        // Bind delete button events: remove existing listeners and add new ones to prevent duplicates
        deleteButtons.forEach(btn => {
            btn.removeEventListener('click', handleDeleteClick);
            btn.addEventListener('click', handleDeleteClick);
        });

        // Bind settings button events: remove existing listeners and add new ones
        settingsButtons.forEach(btn => {
            btn.removeEventListener('click', handleSettingsClick);
            btn.addEventListener('click', handleSettingsClick);
        });

        // Bind add button events: define handler inline to capture section and index
        addButtons.forEach(btn => {
            const handleAddClick = () => {
                const section = btn.dataset.section;
                const index = btn.dataset.index;
                console.log(`Add widget button clicked for section: ${section}, index: ${index}`);
                showAddWidgetModal(section, parseInt(index));
            };
            btn.removeEventListener('click', handleAddClick);
            btn.addEventListener('click', handleAddClick);
        });

        // Handles the click event for deleting a widget
        // Purpose: Initiates the deletion process by showing a confirmation modal
        function handleDeleteClick() {
            const widgetId = this.dataset.widgetId;
            console.log(`Delete button clicked for widget: ${widgetId}`);
            showDeleteConfirmation(widgetId, filteredTrades, strategies, activeAccountId, accounts);
        }

        // Handles the click event for opening widget settings
        // Purpose: Opens a modal to allow configuration of widget-specific settings
        function handleSettingsClick() {
            const widgetId = this.dataset.widgetId;
            console.log(`Settings button clicked for widget: ${widgetId}`);
            showSettingsModal(widgetId);
        }
    } catch (err) {
        // Display error toast and log error if event binding fails
        showToast('Error binding widget events.', 'error');
        console.error('Widget event binding error:', err);
    }
}

// Displays a confirmation modal for deleting a widget
// Purpose: Provides a user confirmation step before removing a widget to prevent accidental deletions,
// and updates the dashboard layout upon confirmation
function showDeleteConfirmation(widgetId, trades, strategies, activeAccountId, accounts) {
    try {
        // Dispose of any existing delete modal instance to prevent memory leaks
        const existingModal = bootstrap.Modal.getInstance(document.getElementById('deleteWidgetModal'));
        if (existingModal) {
            existingModal.hide();
            existingModal.dispose();
            console.log('Disposed existing deleteWidgetModal instance');
        }

        // Find the widget configuration by ID
        const widget = widgetConfig.find(w => w.id === widgetId);
        if (!widget) {
            throw new Error(`Widget not found: ${widgetId}`);
        }

        // Get the modal element
        const modalElement = document.getElementById('deleteWidgetModal');
        if (!modalElement) {
            throw new Error('Delete widget modal element not found');
        }

        // Clear and populate modal content to ensure no stale data
        const modalDialog = modalElement.querySelector('.modal-dialog');
        if (modalDialog) {
            modalDialog.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="deleteWidgetTitle">Delete ${widget.title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        Are you sure you want to delete this widget?
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-danger" id="deleteWidgetConfirm">Delete</button>
                    </div>
                </div>
            `;
        }

        // Initialize Bootstrap modal with standard options
        const modal = new bootstrap.Modal(modalElement, {
            backdrop: true,
            keyboard: true,
            focus: true
        });

        // Flag to prevent multiple confirm clicks
        let isConfirming = false;

        // Attach event listeners when the modal is shown to ensure DOM stability
        modalElement.addEventListener('shown.bs.modal', () => {
            const confirmButton = modalElement.querySelector('#deleteWidgetConfirm');
            const cancelButton = modalElement.querySelector('.btn-secondary[data-bs-dismiss="modal"]');
            if (!confirmButton || !cancelButton) {
                throw new Error('Delete widget modal buttons missing after modal shown');
            }

            // Clone buttons to remove existing listeners and prevent event duplication
            const newConfirmButton = confirmButton.cloneNode(true);
            confirmButton.parentNode.replaceChild(newConfirmButton, confirmButton);
            const newCancelButton = cancelButton.cloneNode(true);
            cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

            // Handle confirm button click
            newConfirmButton.addEventListener('click', () => {
                if (isConfirming) {
                    console.log(`Confirm click for widget ${widgetId} already in progress, ignoring`);
                    return;
                }
                isConfirming = true;
                console.log(`Confirm delete clicked for widget: ${widgetId}`);
                try {
                    // Apply fade-out animation to the widget being deleted
                    const widgetElement = document.querySelector(`.col[data-widget-id="${widgetId}"]`);
                    if (widgetElement) {
                        widgetElement.style.transition = 'opacity 0.3s ease';
                        widgetElement.style.opacity = '0';
                        console.log('Applied fade-out animation to widget:', widgetId);
                    }

                    let rowIndex = null;
                    let sectionData = null;

                    // Update the dashboard layout based on the widget's section
                    if (widget.section === 'metrics') {
                        const index = currentDashboard.metrics.indexOf(widgetId);
                        if (index !== -1) currentDashboard.metrics[index] = 'placeholder';
                        sectionData = currentDashboard.metrics;
                    } else if (widget.section === 'tables') {
                        const index = currentDashboard.tables.indexOf(widgetId);
                        if (index !== -1) currentDashboard.tables[index] = 'placeholder';
                        sectionData = currentDashboard.tables;
                    } else if (widget.section === 'charts') {
                        currentDashboard.charts = currentDashboard.charts.map((row, idx) => {
                            const index = row.indexOf(widgetId);
                            if (index !== -1) {
                                row[index] = 'placeholder';
                                rowIndex = idx;
                            }
                            return row;
                        });
                        sectionData = currentDashboard.charts.flat();
                    }
                    console.log(`Deleted widget ${widgetId} from section: ${widget.section}, new layout:`, currentDashboard[widget.section]);
                    showToast(`Widget ${widget.title} deleted.`, 'success');

                    // Clear focus to avoid accessibility conflicts
                    if (document.activeElement === newConfirmButton) {
                        newConfirmButton.blur();
                        console.log('Blurred confirm button to prevent aria-hidden conflict');
                    }

                    // Delay modal hide to allow animation to complete
                    setTimeout(() => {
                        modal.hide();

                        // Update only the affected section
                        if (widget.section === 'charts' && rowIndex !== null) {
                            renderSection(widget.section, null, trades, strategies, activeAccountId, accounts, true, rowIndex);
                        } else {
                            renderSection(widget.section, sectionData, trades, strategies, activeAccountId, accounts);
                        }

                        // Rebind events after DOM update to ensure interactivity
                        setTimeout(() => {
                            // Clear existing delete button listeners
                            const deleteButtons = document.querySelectorAll('.delete-widget');
                            deleteButtons.forEach(btn => {
                                const newBtn = btn.cloneNode(true);
                                btn.parentNode.replaceChild(newBtn, btn);
                            });
                            bindWidgetEvents(trades, strategies, activeAccountId, accounts);
                            // Debug drag-and-drop elements
                            const draggableElements = document.querySelectorAll('.col[data-widget-id], .col[data-section][data-index]');
                            console.log(`Found ${draggableElements.length} draggable elements for drag-and-drop`);
                            bindDragAndDrop(trades, strategies, activeAccountId, accounts, domCache.dashboard);
                            console.log('Widget and drag-and-drop events rebound after deletion');
                        }, 100);
                    }, 300); // Match animation duration

                    // Clean up modal after it is hidden
                    modalElement.addEventListener('hidden.bs.modal', () => {
                        // Remove modal-related classes and styles
                        modalElement.classList.remove('show', 'modal-open', 'fade');
                        modalElement.style.display = 'none';
                        modalElement.removeAttribute('aria-modal');
                        modalElement.setAttribute('aria-hidden', 'true');
                        // Reset body styles
                        document.body.classList.remove('modal-open');
                        document.body.style.overflow = '';
                        document.body.style.paddingRight = '';
                        // Remove modal backdrops
                        const backdrops = document.querySelectorAll('.modal-backdrop');
                        backdrops.forEach(backdrop => {
                            backdrop.remove();
                            console.log('Modal backdrop removed');
                        });
                        modal.dispose();
                        console.log('Delete modal fully closed and disposed');
                        isConfirming = false;
                    }, { once: true });
                } catch (err) {
                    showToast('Error deleting widget.', 'error');
                    console.error('Delete widget error:', err);
                    isConfirming = false;
                }
            }, { once: true });

            // Handle cancel button click
            newCancelButton.addEventListener('click', () => {
                console.log('Cancel delete clicked');
                if (document.activeElement === newCancelButton) {
                    newCancelButton.blur();
                    console.log('Blurred cancel button');
                }
                modal.hide();
                modalElement.addEventListener('hidden.bs.modal', () => {
                    // Clean up modal classes and styles
                    modalElement.classList.remove('show', 'modal-open', 'fade');
                    modalElement.style.display = 'none';
                    modalElement.removeAttribute('aria-modal');
                    modalElement.setAttribute('aria-hidden', 'true');
                    // Reset body styles
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.body.style.paddingRight = '';
                    // Remove modal backdrops
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    backdrops.forEach(backdrop => {
                        backdrop.remove();
                        console.log('Modal backdrop removed');
                    });
                    modal.dispose();
                    console.log('Delete modal fully closed and disposed (cancel)');
                }, { once: true });
            }, { once: true });

            newConfirmButton.focus();
            console.log('Delete modal shown, confirm button focused, listener attached');
        }, { once: true });

        console.log(`Showing delete confirmation modal for widget: ${widgetId}`);
        modal.show();
    } catch (err) {
        showToast('Error showing delete confirmation.', 'error');
        console.error('Delete confirmation error:', err);
    }
}

// Displays a modal for configuring widget settings
// Purpose: Allows users to customize widget appearance (e.g., colors, grid visibility) and save preferences
function showSettingsModal(widgetId) {
    try {
        // Find the widget configuration by ID
        const widget = widgetConfig.find(w => w.id === widgetId);
        if (!widget) throw new Error(`Widget not found: ${widgetId}`);

        // Initialize the modal
        const modalElement = document.getElementById('widgetSettingsModal');
        const modal = new bootstrap.Modal(modalElement, { backdrop: true, keyboard: true, focus: true });
        const modalBody = document.getElementById('widgetSettingsForm');
        const saveButton = document.getElementById('widgetSettingsSave');
        const cancelButton = document.querySelector('#widgetSettingsModal .btn-secondary');
        const resetButton = document.getElementById('widgetSettingsReset');

        // Determine chart type for chart widgets
        const chartKey = widget.id.replace(/-[a-z]/g, m => m[1].toUpperCase());
        const chartType = widget.section === 'charts' ? chartConfigs[chartKey]?.chartType : null;

        // Default color settings for widgets
        const defaultColors = {
            textColor: '#28a745',
            circleColorWin: '#28a745',
            circleColorLoss: '#dc3545',
            circleColorNeutral: '#007bff',
            lineColor: '#4466ff',
            dotColor: '#4466ff',
            fillStartColor: 'rgba(68, 102, 255, 0.3)',
            fillEndColor: 'rgba(68, 102, 255, 0.05)',
            annotationColor: '#adb5bd'
        };

        // Load existing widget settings or use empty object
        const setting = widgetSettings[widgetId] || {};

        // Generate format options for the widget
        const formatOptions = widget.settings.format?.map(f => `<option value="${f}" ${setting.format === f ? 'selected' : ''}>${f}</option>`).join('') || '<option>N/A</option>';

        // HTML for metrics section settings (color pickers)
        const metricsSection = widget.section === 'metrics' ? `
            <div class="mb-3"><label>Text Color</label><div class="color-picker-container" id="textColorPicker"></div></div>
            ${['current-streak', 'summary'].includes(widget.id) ? `
                <div class="mb-3"><label>Circle Win Color</label><div class="color-picker-container" id="circleColorWinPicker"></div></div>
                <div class="mb-3"><label>Circle Loss Color</label><div class="color-picker-container" id="circleColorLossPicker"></div></div>
                <div class="mb-3"><label>Circle Neutral Color</label><div class="color-picker-container" id="circleColorNeutralPicker"></div></div>
            ` : ''}` : '';

        // HTML for charts section settings (color pickers and grid toggles)
        const chartsSection = widget.section === 'charts' ? `
            <div class="accordion" id="chartSettingsAccordion">
                ${chartType === 'line' ? `
                    <div class="accordion-item">
                        <h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseLineSettings">Line Settings</button></h2>
                        <div id="collapseLineSettings" class="accordion-collapse collapse">
                            <div class="accordion-body">
                                <div class="mb-3"><label>Line Color</label><div class="color-picker-container" id="lineColorPicker"></div></div>
                                <div class="mb-3"><label>Dot Color</label><div class="color-picker-container" id="dotColorPicker"></div></div>
                            </div>
                        </div>
                    </div>
                    <div class="accordion-item">
                        <h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFillSettings">Fill Settings</button></h2>
                        <div id="collapseFillSettings" class="accordion-collapse collapse">
                            <div class="accordion-body">
                                <div class="mb-3"><label>Fill Start Color</label><div class="color-picker-container" id="fillStartColorPicker"></div></div>
                                <div class="mb-3"><label>Fill End Color</label><div class="color-picker-container" id="fillEndColorPicker"></div></div>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="mb-3"><label>Bar Color</label><div class="color-picker-container" id="dotColorPicker"></div></div>
                `}
                <div class="accordion-item">
                    <h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseAnnotationSettings">Annotation Settings</button></h2>
                    <div id="collapseAnnotationSettings" class="accordion-collapse collapse">
                        <div class="accordion-body">
                            <div class="mb-3"><label>Annotation Color</label><div class="color-picker-container" id="annotationColorPicker"></div></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="form-check form-switch mt-3">
                <input type="checkbox" class="form-check-input" id="widget-x-grid" ${setting.xGrid ? 'checked' : ''}>
                <label class="form-check-label" for="widget-x-grid">Show X Grid</label>
            </div>
            <div class="form-check form-switch">
                <input type="checkbox" class="form-check-input" id="widget-y-grid" ${setting.yGrid ? 'checked' : ''}>
                <label class="form-check-label" for="widget-y-grid">Show Y Grid</label>
            </div>
        ` : '';

        // Populate modal body with settings form
        modalBody.innerHTML = `
            <div class="mb-3">
                <label class="form-label">Format</label>
                <select class="form-select" id="widget-format">
                    ${formatOptions}
                </select>
            </div>
            ${metricsSection}
            ${chartsSection}
        `;

        // Delay initialization of color pickers to ensure DOM is ready
        setTimeout(() => {
            // Object to store color picker instances
            const pickers = {};

            // Helper function to create a color picker
            const createPicker = (containerId, settingKey, fallback) => {
                pickers[settingKey] = new iro.ColorPicker(`#${containerId}`, {
                    width: 220,
                    color: setting[settingKey] || fallback,
                    layout: [
                        { component: iro.ui.Box },
                        { component: iro.ui.Slider, options: { sliderType: 'hue' } },
                        { component: iro.ui.Slider, options: { sliderType: 'saturation' } },
                        { component: iro.ui.Slider, options: { sliderType: 'value' } },
                        { component: iro.ui.Slider, options: { sliderType: 'alpha' } }
                    ]
                });
            };

            // Initialize color pickers based on widget type
            if (widget.section === 'metrics') {
                createPicker('textColorPicker', 'textColor', defaultColors.textColor);
                if (['current-streak', 'summary'].includes(widget.id)) {
                    createPicker('circleColorWinPicker', 'circleColorWin', defaultColors.circleColorWin);
                    createPicker('circleColorLossPicker', 'circleColorLoss', defaultColors.circleColorLoss);
                    createPicker('circleColorNeutralPicker', 'circleColorNeutral', defaultColors.circleColorNeutral);
                }
            } else {
                createPicker('annotationColorPicker', 'annotationColor', defaultColors.annotationColor);
                if (chartType === 'line') {
                    createPicker('lineColorPicker', 'lineColor', defaultColors.lineColor);
                    createPicker('dotColorPicker', 'dotColor', defaultColors.dotColor);
                    createPicker('fillStartColorPicker', 'fillStartColor', defaultColors.fillStartColor);
                    createPicker('fillEndColorPicker', 'fillEndColor', defaultColors.fillEndColor);
                } else {
                    createPicker('dotColorPicker', 'dotColor', defaultColors.dotColor);
                }
            }

            // Clone and replace reset button to clear existing listeners
            const newResetBtn = resetButton.cloneNode(true);
            resetButton.parentNode.replaceChild(newResetBtn, resetButton);

            // Handle reset button click: restore default settings
            newResetBtn.addEventListener('click', () => {
                delete widgetSettings[widgetId];
                saveDashboardConfig();
                renderDashboard(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
                showToast(`Reset to default for ${widget.title}.`, 'success');
                modal.hide();
                modalElement.addEventListener('hidden.bs.modal', () => {
                    modalElement.classList.remove('show', 'modal-open');
                    document.body.classList.remove('modal-open');
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) backdrop.remove();
                    modal.dispose();
                }, { once: true });
            });

            // Clone and replace save button to clear existing listeners
            const newSaveBtn = saveButton.cloneNode(true);
            saveButton.parentNode.replaceChild(newSaveBtn, saveButton);

            // Handle save button click: save widget settings
            newSaveBtn.addEventListener('click', () => {
                const format = document.getElementById('widget-format')?.value;
                const xGrid = document.getElementById('widget-x-grid')?.checked;
                const yGrid = document.getElementById('widget-y-grid')?.checked;

                widgetSettings[widgetId] = {
                    format,
                    ...(widget.section === 'metrics' ? {
                        textColor: pickers.textColor?.color?.rgbaString,
                        ...(['current-streak', 'summary'].includes(widget.id) ? {
                            circleColorWin: pickers.circleColorWin?.color?.rgbaString,
                            circleColorLoss: pickers.circleColorLoss?.color?.rgbaString,
                            circleColorNeutral: pickers.circleColorNeutral?.color?.rgbaString
                        } : {})
                    } : {
                        annotationColor: pickers.annotationColor?.color?.rgbaString,
                        ...(chartType === 'line' ? {
                            lineColor: pickers.lineColor?.color?.rgbaString,
                            dotColor: pickers.dotColor?.color?.rgbaString,
                            fillStartColor: pickers.fillStartColor?.color?.rgbaString,
                            fillEndColor: pickers.fillEndColor?.color?.rgbaString
                        } : {
                            dotColor: pickers.dotColor?.color?.rgbaString
                        }),
                        xGrid,
                        yGrid
                    })
                };

                saveDashboardConfig();
                renderDashboard(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
                showToast(`Settings saved for ${widget.title}.`, 'success');
                modal.hide();
            });

            // Handle cancel button click
            cancelButton.addEventListener('click', () => modal.hide());
        }, 10);

        modal.show();
    } catch (err) {
        console.error(err);
        showToast('Error showing settings modal', 'error');
    }
}

// Displays a modal to add a new widget to the dashboard
// Purpose: Allows users to select and preview available widgets before adding them to a specific section
function showAddWidgetModal(section, index) {
    try {
        // Get the modal element
        const modalElement = document.getElementById('addWidgetModal');
        if (!modalElement) throw new Error('Add widget modal element not found');

        // Initialize Bootstrap modal
        const modal = new bootstrap.Modal(modalElement, { backdrop: true, keyboard: true, focus: true });

        // Get the modal body for widget list
        const modalBody = document.getElementById('addWidgetList');
        if (!modalBody) throw new Error('Add widget modal body element not found');

        // Determine which widgets are available (not already added)
        const addedWidgets = section === 'charts' ? currentDashboard.charts.flat() : currentDashboard[section];
        const availableWidgets = widgetConfig.filter(w => w.section === section && !addedWidgets.includes(w.id));

        // Dummy account ID for preview rendering
        const dummyAccountId = dashboardData.activeAccountId;

        // Sample trades data for widget previews
        const dummyTrades = [
            {
                id: 1,
                date: '2025-04-01',
                tradeTime: '08:00',
                profitLoss: 100,
                outcome: 'Win',
                balance: 10100,
                accountId: dummyAccountId,
                emotions: ['Confidence', 'Excitement'],
                mistakes: [],
                pair: 'EURUSD',
                holdTime: 60,
                actualRR: 2.5,
                plannedRR: 2.5
            },
            {
                id: 2,
                date: '2025-04-01',
                tradeTime: '09:00',
                profitLoss: -50,
                outcome: 'Loss',
                balance: 10050,
                accountId: dummyAccountId,
                emotions: ['Fear', 'Frustration'],
                mistakes: ['Overtrading', 'Ignoring Stop Loss'],
                pair: 'XAUUSD',
                holdTime: 120,
                actualRR: -1,
                plannedRR: 2.0
            },
            {
                id: 3,
                date: '2025-04-02',
                tradeTime: '08:00',
                profitLoss: 150,
                outcome: 'Win',
                balance: 10200,
                accountId: dummyAccountId,
                emotions: ['Greed', 'Hope'],
                mistakes: [],
                pair: 'EURUSD',
                holdTime: 90,
                actualRR: 3.0,
                plannedRR: 3.0
            },
            {
                id: 4,
                date: '2025-04-02',
                tradeTime: '09:00',
                profitLoss: -75,
                outcome: 'Loss',
                balance: 10125,
                accountId: dummyAccountId,
                emotions: ['Fear', 'Frustration'],
                mistakes: ['Chasing Trades'],
                pair: 'XAUUSD',
                holdTime: 150,
                actualRR: -1.5,
                plannedRR: 2.5
            }
        ];

        // Populate modal with widget previews
        modalBody.innerHTML = `
            <div class="mb-3">
                <input type="text" id="searchWidgetInput" class="form-control" placeholder="Search widgets..." />
            </div>
            <div id="widgetPreviewContainer" class="row g-3"></div>
        `;

        const previewContainer = modalBody.querySelector('#widgetPreviewContainer');

        // Render preview for each available widget
        availableWidgets.forEach(w => {
            const widgetCol = document.createElement('div');
            widgetCol.className = 'col-md-6 col-12';

            widgetCol.innerHTML = `
                <div class="card h-100 widget-preview p-2" data-widget-id="${w.id}" style="cursor: pointer; border: 1px solid #ddd;">
                    <div class="card-body d-flex flex-column justify-content-between">
                        <h6 class="card-title text-center mb-2">${w.title}</h6>
                        <div id="preview-${w.id}" class="widget-preview-frame" style="transform: scale(0.7); transform-origin: top left; width: 140%; height: 180px; overflow: hidden; pointer-events: none;"></div>
                    </div>
                </div>
            `;
            previewContainer.appendChild(widgetCol);

            const previewTarget = widgetCol.querySelector(`#preview-${w.id}`);
            try {
                w.render(`preview-${w.id}`, previewTarget, dummyTrades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts, widgetSettings[w.id] || {});
            } catch (err) {
                console.error(`Error rendering preview for widget ${w.id}:`, err);
                previewTarget.innerHTML = `<div class="text-danger small">Preview error</div>`;
            }
        });

        // Bind click events to widget preview cards
        previewContainer.querySelectorAll('.widget-preview').forEach(card => {
            card.addEventListener('click', () => {
                const widgetId = card.dataset.widgetId;
                addWidget(section, widgetId, index);
                modal.hide();
                ensureModalCloses('addWidgetModal');
            });
        });

        // Add search functionality for widget previews
        const searchInput = document.getElementById('searchWidgetInput');
        searchInput.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            previewContainer.querySelectorAll('.widget-preview').forEach(card => {
                const title = card.querySelector('.card-title').textContent.toLowerCase();
                card.parentElement.style.display = title.includes(term) ? 'block' : 'none';
            });
        });

        // Clean up modal when hidden
        modalElement.addEventListener('hidden.bs.modal', () => {
            ensureModalCloses('addWidgetModal');
        }, { once: true });

        console.log(`Add Widget Modal ready: ${availableWidgets.length} widgets`);
        modal.show();
    } catch (err) {
        console.error('Error showing Add Widget Modal:', err);
        showToast('Error showing Add Widget Modal.', 'error');
    }
}

// Adds a widget to the specified section and index in the dashboard
// Purpose: Updates the dashboard layout to include a new widget and re-renders the affected section
function addWidget(section, widgetId, index) {
    try {
        // Helper function to count non-placeholder widgets in a section
        const widgetCount = (section, rowIndex) => {
            if (section === 'charts') {
                return currentDashboard.charts[rowIndex]?.filter(id => id !== 'placeholder').length || 0;
            }
            return currentDashboard[section].filter(id => id !== 'placeholder').length;
        };

        console.log(`Attempting to add widget ${widgetId} to section: ${section}, index: ${index}, current count: ${section === 'charts' ? widgetCount(section, 0) : widgetCount(section, 0)}, layout:`, currentDashboard[section]);

        // Enforce maximum widget limits for metrics and tables sections
        if (section === 'metrics' && widgetCount('metrics') >= 4) {
            showToast('Maximum 4 widgets in metrics section.', 'error');
            return;
        }
        if (section === 'tables' && widgetCount('tables') >= 2) {
            showToast('Maximum 2 widgets in tables section.', 'error');
            return;
        }

        // Validate dashboard data
        if (!Array.isArray(dashboardData.accounts)) {
            console.error('dashboardData.accounts is not an array:', dashboardData.accounts);
            showToast('Error: Accounts data unavailable. Cannot add widget.', 'error');
            return;
        }
        if (!Array.isArray(dashboardData.trades)) {
            console.error('dashboardData.trades is not an array:', dashboardData.trades);
            showToast('Error: Trades data unavailable. Cannot add widget.', 'error');
            return;
        }
        if (!Array.isArray(dashboardData.strategies)) {
            console.error('dashboardData.strategies is not an array:', dashboardData.strategies);
            showToast('Error: Strategies data unavailable. Cannot add widget.', 'error');
            return;
        }
        if (!dashboardData.activeAccountId) {
            console.error('dashboardData.activeAccountId is not defined:', dashboardData.activeAccountId);
            showToast('Error: Active account ID unavailable. Cannot add widget.', 'error');
            return;
        }

        if (section === 'charts') {
            // Define chart section structure: 3 rows, 2 widgets per row
            const widgetsPerRow = 2;
            const totalRows = 3;
            const targetRowIndex = Math.floor(index / widgetsPerRow);
            const positionInRow = index % widgetsPerRow;

            // Ensure the charts array has enough rows
            while (currentDashboard.charts.length < totalRows) {
                currentDashboard.charts.push(['placeholder', 'placeholder']);
            }

            // Ensure the target row has enough slots
            while (currentDashboard.charts[targetRowIndex].length < widgetsPerRow) {
                currentDashboard.charts[targetRowIndex].push('placeholder');
            }

            // Check for maximum widgets in the row
            if (widgetCount('charts', targetRowIndex) >= widgetsPerRow) {
                showToast('Maximum 2 widgets per chart row.', 'error');
                return;
            }

            // Add the widget to the specified position
            if (currentDashboard.charts[targetRowIndex][positionInRow] === 'placeholder') {
                currentDashboard.charts[targetRowIndex][positionInRow] = widgetId;
            } else {
                currentDashboard.charts[targetRowIndex].splice(positionInRow, 0, widgetId);
                if (currentDashboard.charts[targetRowIndex].length > widgetsPerRow) {
                    currentDashboard.charts[targetRowIndex].pop();
                }
            }

            // Ensure all rows have exactly 2 slots
            currentDashboard.charts.forEach((row, rowIndex) => {
                while (row.length < widgetsPerRow) row.push('placeholder');
                while (row.length > widgetsPerRow) {
                    if (row[row.length - 1] === 'placeholder') {
                        row.pop();
                    } else {
                        row.pop();
                        console.warn(`Removed excess widget from row ${rowIndex} to maintain 2 slots`);
                    }
                }
            });

            // Ensure 3 rows exist
            while (currentDashboard.charts.length < totalRows) {
                currentDashboard.charts.push(['placeholder', 'placeholder']);
            }

            renderSection(section, currentDashboard.charts.flat(), dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts, true);
            console.log(`Charts section DOM after render:`, domCache.chartsSection.innerHTML);
            bindWidgetEvents(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            bindDragAndDrop(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            console.log('🔄 Rebound Sortable.js after adding widget');
        } else if (section === 'metrics') {
            // Add widget to metrics section
            if (index !== undefined && currentDashboard.metrics[index] === 'placeholder') {
                currentDashboard.metrics[index] = widgetId;
            } else {
                currentDashboard.metrics.push(widgetId);
            }
            renderSection(section, currentDashboard.metrics, dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            console.log(`Metrics section DOM after render:`, domCache.metricsSection.innerHTML);
            bindWidgetEvents(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            bindDragAndDrop(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            console.log('🔄 Rebound Sortable.js after adding widget');
        } else if (section === 'tables') {
            // Add widget to tables section
            if (index !== undefined && currentDashboard.tables[index] === 'placeholder') {
                currentDashboard.tables[index] = widgetId;
            } else {
                currentDashboard.tables.push(widgetId);
            }
            renderSection(section, currentDashboard.tables, dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            console.log(`Tables section DOM after render:`, domCache.tablesSection.innerHTML);
            bindWidgetEvents(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            bindDragAndDrop(dashboardData.trades, dashboardData.strategies, dashboardData.activeAccountId, dashboardData.accounts);
            console.log('🔄 Rebound Sortable.js after adding widget');
        }
        console.log(`Added widget ${widgetId} to section: ${section}, index: ${index}, new layout:`, currentDashboard[section]);
        showToast(`Added ${widgetConfig.find(w => w.id === widgetId).title}.`, 'success');
    } catch (err) {
        showToast('Error adding widget.', 'error');
        console.error('Add widget error:', err);
    }
}

// Ensures a modal is fully closed and cleaned up
// Purpose: Prevents modal-related artifacts (e.g., backdrops) from persisting in the DOM
function ensureModalCloses(modalId) {
    try {
        const modalElement = document.getElementById(modalId);
        if (modalElement) {
            const modalInstance = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
            modalInstance.hide();

            // Clean up modal after a delay to match Bootstrap's animation
            setTimeout(() => {
                modalElement.classList.remove('show', 'modal-open', 'fade');
                modalElement.style.display = 'none';
                modalElement.removeAttribute('aria-modal');
                modalElement.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(backdrop => {
                    backdrop.remove();
                    console.log('Modal backdrop removed');
                });
                console.log(`Modal ${modalId} fully closed and removed from DOM`);
            }, 300);
        } else {
            console.warn(`Modal element ${modalId} not found`);
        }
    } catch (err) {
        console.error(`Error closing modal ${modalId}:`, err);
    }
}

// Saves a new dashboard template
// Purpose: Allows users to save the current dashboard layout and settings as a reusable template
async function saveTemplate(trades, strategies, activeAccountId, accounts) {
    const templateName = prompt('Enter template name:');
    if (!templateName) return;
    try {
        // Load existing templates from storage
        const savedConfig = await loadFromStore('dashboard');
        const templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
        templates.push({ name: templateName, layout: currentDashboard, settings: widgetSettings });
        await saveToStore('dashboard', { id: 'templates', data: templates });
        console.log('Saved template:', { name: templateName, layout: currentDashboard, settings: widgetSettings });
        renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts);
        showToast(`Template ${templateName} saved.`, 'success');
    } catch (err) {
        showToast('Error saving template.', 'error');
        console.error('Save template error:', err);
    }
}

// Renders the template dropdown with options to select, edit, or delete templates
// Purpose: Provides a user interface for managing dashboard templates
function renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts) {
    try {
        // Get the template dropdown element
        const templateDropdown = document.getElementById('template-dropdown');
        if (!templateDropdown) {
            throw new Error('Template dropdown element not found');
        }
        templateDropdown.innerHTML = '<li class="dropdown-item template-option" data-template-name="">Select Template</li>';

        // Create a document fragment for efficient DOM updates
        const fragment = document.createDocumentFragment();
        templates.forEach(t => {
            const li = document.createElement('li');
            li.className = 'dropdown-item d-flex align-items-center justify-content-between';
            li.innerHTML = `
                <span class="template-option" data-template-name="${t.name}" style="cursor: pointer; flex-grow: 1;">${t.name}</span>
                <div>
                    <button class="btn btn-sm btn-outline-primary edit-template me-1" data-template-name="${t.name}" title="Edit ${t.name}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-template" data-template-name="${t.name}" title="Delete ${t.name}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
            fragment.appendChild(li);
        });

        // Add "Create New Template" button
        const createLi = document.createElement('li');
        createLi.className = 'dropdown-item';
        createLi.innerHTML = `
            <button class="btn btn-primary btn-sm w-100 create-new-template">
                <i class="bi bi-plus-circle me-1"></i>Create New Template
            </button>
        `;
        fragment.appendChild(createLi);

        templateDropdown.appendChild(fragment);
        console.log('Rendered template options:', templates.map(t => t.name));

        // Bind template selection events
        templateDropdown.querySelectorAll('.template-option').forEach(option => {
            option.addEventListener('click', () => {
                const templateName = option.dataset.templateName;
                console.log(`Selected template: ${templateName}`);
                domCache.templateSelect.textContent = templateName || 'Select Template';
                if (templateName) {
                    loadTemplate(trades, strategies, activeAccountId, accounts, templateName);
                }
                // Close the dropdown
                const dropdown = bootstrap.Dropdown.getInstance(domCache.templateSelect);
                if (dropdown) dropdown.hide();
            });
        });

        // Bind edit template button events
        templateDropdown.querySelectorAll('.edit-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const templateName = btn.dataset.templateName;
                console.log(`Edit template clicked: ${templateName}`);
                isEditMode = true;
                loadTemplate(trades, strategies, activeAccountId, accounts, templateName);
                domCache.saveButton.classList.remove('d-none');
                domCache.templateDropdownContainer.classList.add('d-none');
                if (domCache.editModeMessage) {
                    domCache.editModeMessage.textContent = `Editing: ${templateName}`;
                    domCache.editModeMessage.classList.remove('d-none');
                }
                bindWidgetEvents(trades, strategies, activeAccountId, accounts);
                requestAnimationFrame(() => bindDragAndDrop(trades, strategies, activeAccountId, accounts, domCache.dashboard));
                const dropdown = bootstrap.Dropdown.getInstance(domCache.templateSelect);
                if (dropdown) dropdown.hide();
            });
        });

        // Bind delete template button events
        templateDropdown.querySelectorAll('.delete-template').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const templateName = btn.dataset.templateName;
                console.log(`Delete template clicked: ${templateName}`);
                deleteTemplate(templateName, trades, strategies, activeAccountId, accounts);
                const dropdown = bootstrap.Dropdown.getInstance(domCache.templateSelect);
                if (dropdown) dropdown.hide();
            });
        });

        // Bind create new template button event
        templateDropdown.querySelector('.create-new-template').addEventListener('click', async () => {
            console.log('Create new template clicked');
            const templateName = prompt('Enter template name:');
            if (!templateName) return;

            try {
                // Reset dashboard to placeholders
                currentDashboard = {
                    metrics: ['placeholder', 'placeholder', 'placeholder', 'placeholder'],
                    tables: ['placeholder', 'placeholder'],
                    charts: [
                        ['placeholder', 'placeholder'],
                        ['placeholder', 'placeholder'],
                        ['placeholder', 'placeholder']
                    ]
                };
                widgetSettings = {};

                // Save the new template
                const savedConfig = await loadFromStore('dashboard');
                const templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
                templates.push({ name: templateName, layout: currentDashboard, settings: widgetSettings });
                await saveToStore('dashboard', { id: 'templates', data: templates });
                console.log('Saved new template with placeholders:', { name: templateName, layout: currentDashboard, settings: widgetSettings });

                // Refresh template options
                renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts);

                // Load the new template and enter edit mode
                isEditMode = true;
                await loadTemplate(trades, strategies, activeAccountId, accounts, templateName);
                domCache.saveButton.classList.remove('d-none');
                domCache.templateDropdownContainer.classList.add('d-none');
                if (domCache.editModeMessage) {
                    domCache.editModeMessage.textContent = `Editing: ${templateName}`;
                    domCache.editModeMessage.classList.remove('d-none');
                }
                bindWidgetEvents(trades, strategies, activeAccountId, accounts);
                requestAnimationFrame(() => bindDragAndDrop(trades, strategies, activeAccountId, accounts, domCache.dashboard));

                // Close the dropdown
                const dropdown = bootstrap.Dropdown.getInstance(domCache.templateSelect);
                if (dropdown) dropdown.hide();

                showToast(`Template ${templateName} created with placeholders.`, 'success');
            } catch (err) {
                showToast('Error creating new template.', 'error');
                console.error('Create new template error:', err);
            }
        });

    } catch (err) {
        showToast('Error rendering template options.', 'error');
        console.error('Render template options error:', err);
    }
}

// Deletes a template from the saved templates
// Purpose: Removes a template and updates the template dropdown
async function deleteTemplate(templateName, trades, strategies, activeAccountId, accounts) {
    try {
        // Load existing templates
        const savedConfig = await loadFromStore('dashboard');
        let templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
        const activeTemplate = savedConfig?.find(d => d.id === 'activeTemplate')?.data?.name;

        // Prevent deletion of the active template
        if (activeTemplate === templateName) {
            showToast('Cannot delete the active template.', 'error');
            return;
        }

        // Remove the template
        templates = templates.filter(t => t.name !== templateName);
        await saveToStore('dashboard', { id: 'templates', data: templates });
        console.log(`Deleted template: ${templateName}, remaining templates:`, templates.map(t => t.name));

        // Refresh template options
        renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts);
        showToast(`Template ${templateName} deleted.`, 'success');
    } catch (err) {
        showToast('Error deleting template.', 'error');
        console.error('Delete template error:', err);
    }
}

// Loads a saved template and applies it to the dashboard
// Purpose: Switches the dashboard to a previously saved layout and settings
async function loadTemplate(trades, strategies, activeAccountId, accounts, templateName, enterEditMode = false) {
    if (!templateName) return;
    try {
        // Load templates from storage
        const savedConfig = await loadFromStore('dashboard');
        console.log('Loaded dashboard store for templates:', savedConfig);
        const templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
        const template = templates.find(t => t.name === templateName);
        if (template) {
            // Apply the template's layout and settings
            currentDashboard = template.layout;
            widgetSettings = template.settings;
            await saveToStore('dashboard', { id: 'activeTemplate', data: { name: templateName } });
            console.log(`Saved active template: ${templateName}`);
            renderDashboard(trades, strategies, activeAccountId, accounts);
            console.log('Loaded template:', template);
            showToast(`Loaded template ${templateName}.`, 'success');
            domCache.templateSelect.textContent = templateName;
        } else {
            showToast(`Template ${templateName} not found.`, 'error');
            console.warn('Template not found:', templateName);
            renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts);
        }
    } catch (err) {
        showToast('Error loading template.', 'error');
        console.error('Load template error:', err);
        const savedConfig = await loadFromStore('dashboard');
        const templates = savedConfig?.find(d => d.id === 'templates')?.data || [];
        renderTemplateOptions(templates, trades, strategies, activeAccountId, accounts);
    }
}