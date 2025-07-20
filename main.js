import { openDB, saveToStore, deleteFromStore, loadFromStore, getDB } from './data.js';
import { validateRisk, validateTradingWindow, calculateLoss, updateConsecutiveLosses, calculateDisciplineScore, validateTrade, validateDailyPlan, validateWeeklyReview, calculateDailyLoss } from './trade.js';
import { renderBrokers ,lastFilters, cachedFilteredTrades, renderTrades, renderStrategies, renderDailyStats, renderWeeklyReviews, showTradeDetails, renderAccounts, renderPairs, renderPairList, resetTradeCache,selectedStrategyIds, updateCopyButtonState } from './render.js';
import {calculateStrategyMetrics ,getDateRangeForFilter,filterTradesByDateRange,showToast, compressImage,compressImageMainThread, TagManager, debounce, parseHoldTime, base64ToBlob } from './utils.js';
import { backupData, importData, autoBackup } from './backup.js';
import { populateTrades } from './populateTrades.js';
import { initializeDashboard, renderDashboard } from './dashboard.js';
import { initImportModal } from './import.js';
import { initializeDailyPlanPage } from './dailyPlan.js'; // New import
import { initializeWeeklyReviewPage } from './weeklyReview.js'; // New import
import { initTradeTransfers } from './trade-transfers.js'; // Add this line
import { initReports } from './reports.js';
// Add at the top of main.js
import { isAuthenticated, logout, getUserInfo, isUserApproved } from './auth.js';



(function disableConsole() {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
  console.debug = noop;
  console.trace = noop;
  console.timeEnd = noop;
  console.time = noop;
})();


let trades = [];
let strategies = [];
let reflections = [];
let dailyPlans = [];
let weeklyReviews = [];
let conditionTypes = [];
let editingStrategyId = null;
let strategyTagManager = null; // Global reference

// Update default account initialization
let accounts = [
    {
        id: 1746605411154,
        name: 'Default Account',
        initialBalance: 10000,
        maxDrawdown: 10, // Existing
        dailyDrawdown: 5, // Existing
        maxTradesPerDay: 5, // New
        maxLossPerDay: 5, // New (% of initialBalance)
        profitSplit: 80, // Existing
        isPropFirm: false, // Existing
        createdAt: new Date()
    }
];
let pairs = [];
export let settings = {
    tradingWindow: { start: null, end: null },
    activeAccountId: 1746605411154,
    backupFrequency: { type: 'daily', interval: 1 },// Default: backup daily
    autoBackupDownload: true // Default: download auto-backup files function initializeData()
    // Removed riskPlans and customExitReasons
};
let balance = 50000;
let consecutiveLosses = 0;
let visibleColumns = JSON.parse(localStorage.getItem('tradeListColumns')) || [
    'trade-num', 'date', 'time', 'pair', 'type', 'timeframe',
    'direction', // ← Add this line
    'lot-size', 'outcome', 'profit-loss', 'balance',
    'tags', 'images', 'actions'
];
let recordsPerPage = 20;
let currentPage = 1;
let currentFilters = {};
let globalDateFilter = { type: 'current-month', startDate: null, endDate: null };


const tradeColumns = [
    { key: 'trade-num', label: 'Trade #', render: (trade, index, start) => start + index + 1 },
    { key: 'date', label: 'Date', render: trade => trade.date || '-' },
    { key: 'trade-time', label: 'Time', render: trade => trade.tradeTime || '-' },
    { key: 'pair', label: 'Pair', render: trade => trade.pair || '-' },
    { key: 'risk', label: 'Risk', render: trade => trade.risk ? `$${trade.risk.toFixed(2)}` : '-' },
    { key: 'outcome', label: 'Outcome', render: trade => trade.outcome || '-' },
    { key: 'profit-loss', label: 'Profit/Loss', render: trade => trade.profitLoss ? `$${trade.profitLoss.toFixed(2)}` : '-' },
    {
        key: 'balance',
        label: 'Balance',
        render: (trade, index, start, settings, trades, balanceMap) => {
            const balance = balanceMap && balanceMap[trade.id];
            return balance !== undefined ? `$${balance.toFixed(2)}` : '-';
        }
    }
];

function initializeConditionTypes() {
    if (conditionTypes.length > 0) {
        console.log('conditionTypes already initialized, skipping:', conditionTypes);
        return;
    }
    const uniqueTypes = new Set([
        'Price Action',
        'Indicator',
        'Fundamental',
        'Time-Based',
        'Other',
        ...strategies.flatMap(s => [
            ...s.entryConditions.map(c => c.type),
            ...s.exitConditions.map(c => c.type)
        ]).filter(t => t)
    ]);
    conditionTypes = Array.from(uniqueTypes);
    settings.conditionTypes = [...conditionTypes];
    console.log('Initialized condition types from strategies:', conditionTypes, 'settings.conditionTypes:', settings.conditionTypes);
}


const updateConditionDropdowns = () => {
    console.log('Updating condition type dropdowns, using settings.conditionTypes:', settings.conditionTypes);
    const entrySelects = document.querySelectorAll('#entry-conditions select.condition-type');
    const exitSelects = document.querySelectorAll('#exit-conditions select.condition-type');
    const allSelects = [...entrySelects, ...exitSelects];
    console.log('Found dropdowns:', { entryCount: entrySelects.length, exitCount: exitSelects.length });
    allSelects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = `
            <option value="">Select Type</option>
            ${settings.conditionTypes.map(type => `<option value="${type}" ${type === currentValue ? 'selected' : ''}>${type}</option>`).join('')}
        `;
        console.log(`Updated dropdown with ID ${select.id || 'unknown'}, options: ${select.options.length}, values:`, Array.from(select.options).map(opt => opt.value));
    });
    if (allSelects.length === 0) {
        console.warn('No condition type dropdowns found; ensure conditions are added via "Add Entry/Exit Condition" buttons');
    }
    conditionTypes = [...settings.conditionTypes];
    console.log('Synced global conditionTypes:', conditionTypes);
};

async function initializeData() {
    console.time('initializeData');
    try {
        await openDB();
        const [tradeData, strategyData, reflectionData, dailyPlanData, weeklyReviewData, settingsData, backupData, columnPrefsData, accountData, pairData, dateFilterData] = await Promise.all([
            loadFromStore('trades').catch(err => { console.error('Error loading trades:', err); return []; }),
            loadFromStore('strategies').catch(err => { console.error('Error loading strategies:', err); return []; }),
            loadFromStore('reflections').catch(err => { console.error('Error loading reflections:', err); return []; }),
            loadFromStore('dailyPlans').catch(err => { console.error('Error loading dailyPlans:', err); return []; }),
            loadFromStore('weeklyReviews').catch(err => { console.error('Error loading weeklyReviews:', err); return []; }),
            loadFromStore('settings').catch(err => { console.error('Error loading settings:', err); return []; }),
            loadFromStore('backups').catch(err => { console.error('Error loading backups:', err); return []; }),
            loadFromStore('columnPrefs').catch(err => { console.error('Error loading columnPrefs:', err); return []; }),
            loadFromStore('accounts').catch(err => { console.error('Error loading accounts:', err); return []; }),
            loadFromStore('pairs').catch(err => { console.error('Error loading pairs:', err); return []; }),
            Promise.resolve({ type: 'current-month', startDate: null, endDate: null })
        ]);

        console.log('Raw tradeData from IndexedDB:', tradeData);
        trades = Array.isArray(tradeData) ? tradeData.map(trade => ({
            ...trade,
            screenshots: trade.screenshots?.map(img => ({
                url: img.url || '',
                caption: img.caption || ''
            })) || []
        })) : [];
        console.log('Processed trades:', trades.length, 'Trade details:', trades.map(t => ({ id: t.id, accountId: t.accountId, strategyId: t.strategyId })));
        strategies = Array.isArray(strategyData) ? strategyData : [];
        console.log('Loaded strategies:', strategies.length, 'Strategy details:', strategies.map(s => ({ id: s.id, name: s.name, accountId: s.accountId, marketType: s.marketType })));
        reflections = Array.isArray(reflectionData) ? reflectionData.map(reflection => ({
            ...reflection,
            reviewScreenshot: reflection.reviewScreenshot instanceof Blob ? URL.createObjectURL(reflection.reviewScreenshot) : ''
        })) : [];
        dailyPlans = Array.isArray(dailyPlanData) ? dailyPlanData : [];
        weeklyReviews = Array.isArray(weeklyReviewData) ? weeklyReviewData : [];
        accounts = Array.isArray(accountData) ? accountData : [];
        console.log('Loaded accounts:', accounts.length, 'Account details:', accounts.map(a => ({ id: a.id, name: a.name })));
        pairs = Array.isArray(pairData) ? pairData : [];

        // Define default settings after loading accounts
        const defaultSettings = {
            tradingWindow: { start: null, end: null },
            activeAccountId: accounts[0]?.id || 1746605411154, // Fallback to first account or known ID
            backupFrequency: { type: 'daily', interval: 1 },
            autoBackupDownload: true,
            conditionTypes: ['Price Action']
        };
        console.log('Raw settingsData from IndexedDB:', settingsData);

        // Load settings
        Object.assign(settings, settingsData[0] || {});
        console.log('Settings before validation:', settings);

        // Ensure default account exists
        if (!Array.isArray(accounts) || !accounts.some(a => a.id === 1746605411154)) {
            console.warn('Default account ID 1746605411154 not found in accounts, creating it');
            const defaultAccount = {
                id: 1746605411154,
                name: 'Default Account',
                initialBalance: 50000,
                maxDrawdown: 10,
                dailyDrawdown: 5,
                maxTradesPerDay: 5,
                maxLossPerDay: 5,
                profitSplit: 80,
                isPropFirm: false
            };
            accounts.push(defaultAccount);
            await saveToStore('accounts', defaultAccount);
            console.log('Created default account:', defaultAccount);
        }

        // Validate activeAccountId
        const loadedActiveAccountId = settings.activeAccountId;
        const isValidActiveAccountId = loadedActiveAccountId && Array.isArray(accounts) && accounts.some(a => a.id === loadedActiveAccountId);
        if (!isValidActiveAccountId && loadedActiveAccountId) {
            console.warn('Saved activeAccountId is invalid or not found in accounts:', loadedActiveAccountId, 'Accounts:', accounts.map(a => a.id));
            settings.activeAccountId = defaultSettings.activeAccountId;
        } else if (!loadedActiveAccountId) {
            console.warn('No activeAccountId in settings, using default:', defaultSettings.activeAccountId);
            settings.activeAccountId = defaultSettings.activeAccountId;
        }
        console.log('Settings after activeAccountId validation:', settings);

        // Save settings if activeAccountId was updated
        if (!isValidActiveAccountId || !loadedActiveAccountId) {
            console.log('Saving updated settings with activeAccountId:', settings.activeAccountId);
            await saveToStore('settings', { id: 'settings', ...settings });
            console.log('Settings saved successfully:', settings);
        }

        // Set active account
        let activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        if (!activeAccount && Array.isArray(accounts) && accounts.length > 0) {
            activeAccount = accounts[0];
            settings.activeAccountId = activeAccount.id;
            console.log('No valid active account found, defaulting to:', activeAccount);
            await saveToStore('settings', { id: 'settings', ...settings });
            console.log('Saved settings with default activeAccountId:', settings.activeAccountId);
        }

        balance = activeAccount.initialBalance;
        console.log('Set balance for active account:', balance, 'Active account:', activeAccount);

        const updatedAccounts = accounts.map(account => ({
            ...account,
            maxTradesPerDay: account.maxTradesPerDay !== undefined ? account.maxTradesPerDay : 5,
            maxLossPerDay: account.maxLossPerDay !== undefined ? account.maxLossPerDay : 5,
            maxDrawdown: account.maxDrawdown !== undefined ? account.maxDrawdown : 10,
            dailyDrawdown: account.dailyDrawdown !== undefined ? account.dailyDrawdown : 5,
            profitSplit: account.profitSplit !== undefined ? account.profitSplit : 80,
            isPropFirm: account.isPropFirm !== undefined ? account.isPropFirm : false
        }));

        if (JSON.stringify(accounts) !== JSON.stringify(updatedAccounts)) {
            accounts = updatedAccounts;
            await Promise.all(accounts.map(account => saveToStore('accounts', account)));
            console.log('Migrated accounts to include maxTradesPerDay and maxLossPerDay');
        }

        if (!pairs.length) {
            const defaultPairs = [
                { id: Date.now(), name: 'EURUSD', market_type: 'forex' },
                { id: Date.now() + 1, name: 'USDJPY', market_type: 'forex' },
                { id: Date.now() + 2, name: 'NAS100', market_type: 'indices' },
                { id: Date.now() + 3, name: 'US30', market_type: 'indices' },
                { id: Date.now() + 4, name: 'GBPUSD', market_type: 'forex' },
                { id: Date.now() + 5, name: 'AUDUSD', market_type: 'forex' },
                { id: Date.now() + 6, name: 'XAUUSD', market_type: 'commodities' }
            ];
            pairs.push(...defaultPairs);
            await Promise.all(defaultPairs.map(p => saveToStore('pairs', p)));
            console.log('Created default pairs:', defaultPairs);
        }

        // Set default visible columns if no user preferences exist
        visibleColumns = columnPrefsData[0]?.visibleColumns || [
            'trade-num', 'date', 'time', 'pair', 'lot-size', 'outcome', 'profit-loss', 'balance', 'actions'
        ];
        recordsPerPage = columnPrefsData[0]?.recordsPerPage || 20;

        // Save default column preferences if none exist
        if (!columnPrefsData[0]) {
            await saveToStore('columnPrefs', { id: 'columnPrefs', visibleColumns, recordsPerPage });
            console.log('Saved default column preferences:', visibleColumns);
        }

        if (localStorage.getItem('trades')) {
            await migrateLocalStorage();
            console.log('Migrated localStorage to IndexedDB');
        }

        const restoreSelect = document.getElementById('restore-backup');
        if (restoreSelect) {
            restoreSelect.innerHTML = '<option value="">Select Auto-Backup</option>' + 
                backupData.map(b => `<option value="${b.timestamp}">${new Date(b.timestamp).toLocaleString()}</option>`).join('');
        } else {
            console.warn('Restore backup select not found in DOM');
        }

        const dropdownCheckboxes = document.querySelectorAll('#columnFilterDropdown .form-check-input');
        dropdownCheckboxes.forEach(checkbox => {
            checkbox.checked = visibleColumns.includes(checkbox.dataset.column);
            console.log(`Checkbox ${checkbox.dataset.column}: ${checkbox.checked}`);
        });

        updateColumnFilterModal();

        const recordsSelect = document.getElementById('records-per-page');
        if (recordsSelect) {
            recordsSelect.value = recordsPerPage;
        } else {
            console.warn('Records per page select not found in DOM');
        }

        console.log('Populating strategies with trades:', trades.length, 'activeAccountId:', settings.activeAccountId);
        const filteredTrades = trades.filter(t => t.accountId === settings.activeAccountId);
        console.log('Filtered trades for active account:', filteredTrades.length, 'Filtered trade details:', filteredTrades.map(t => ({ id: t.id, strategyId: t.strategyId, accountId: t.accountId })));
        if (!Array.isArray(accounts)) {
            console.error('Accounts array is invalid before rendering:', accounts);
            accounts = [];
        }
        renderStrategies(strategies, settings.activeAccountId, accounts, filteredTrades);
        renderPairs(pairs);
        renderAccounts(accounts, settings.activeAccountId);
        renderPairList(pairs);
        renderTradingWindowForm();
        try {
            await initializeDashboard(trades, strategies, settings.activeAccountId, accounts, dateFilterData);
        } catch (err) {
            showToast('Error initializing dashboard.', 'error');
            console.error('Dashboard initialization error:', err);
        }

        // Reset filters and cache for initial trade log render
        currentFilters = { sort: 'date' };
        currentPage = 1;
        resetTradeCache();
        console.log('Reset filters and cache for initial render:', currentFilters);
        await renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
        console.log('Initial renderTrades called');
    } catch (err) {
        showToast('Error initializing app data.', 'error');
        console.error('Initialize data error:', err);
        throw err;
    } finally {
        console.timeEnd('initializeData');
    }
}

function updateColumnFilterModal() {
    const form = document.getElementById('column-filter-form');
    if (!form) {
        console.warn('Column filter form not found in DOM');
        return;
    }
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.checked = visibleColumns.includes(cb.id.replace('col-', ''));
    });
    console.log('Updated modal checkboxes, visibleColumns:', visibleColumns);
}

// Helper function to initialize bulk copy event listeners
function initializeBulkCopyListeners() {
    if (typeof selectedStrategyIds === 'undefined' || typeof updateCopyButtonState === 'undefined') {
        console.error('Bulk copy dependencies not loaded:', {
            selectedStrategyIds: typeof selectedStrategyIds,
            updateCopyButtonState: typeof updateCopyButtonState
        });
        showToast('Error: Bulk copy feature not initialized.', 'error');
        return;
    }

    const strategyList = document.getElementById('strategy-list');
    const copyTargetAccount = document.getElementById('copy-target-account');
    const copyStrategiesBtn = document.getElementById('copy-strategies-btn');
    const confirmCopyStrategies = document.getElementById('confirm-copy-strategies');

    // Remove existing listeners to prevent duplicates
    if (strategyList && strategyList.__changeHandler) {
        strategyList.removeEventListener('change', strategyList.__changeHandler);
    }
    if (copyTargetAccount && copyTargetAccount.__changeHandler) {
        copyTargetAccount.removeEventListener('change', copyTargetAccount.__changeHandler);
    }
    if (copyStrategiesBtn && copyStrategiesBtn.__clickHandler) {
        copyStrategiesBtn.removeEventListener('click', copyStrategiesBtn.__clickHandler);
    }
    if (confirmCopyStrategies && confirmCopyStrategies.__clickHandler) {
        confirmCopyStrategies.removeEventListener('click', confirmCopyStrategies.__clickHandler);
    }

    // Checkbox change handler
    strategyList.__changeHandler = (e) => {
        if (e.target.classList.contains('strategy-select')) {
            const id = parseInt(e.target.dataset.id);
            if (e.target.checked) {
                selectedStrategyIds.add(id);
            } else {
                selectedStrategyIds.delete(id);
            }
            updateCopyButtonState();
        }
    };
    strategyList?.addEventListener('change', strategyList.__changeHandler);

    // Account dropdown change handler
    copyTargetAccount.__changeHandler = () => {
        updateCopyButtonState();
    };
    copyTargetAccount?.addEventListener('change', copyTargetAccount.__changeHandler);

    // Copy button click handler
    copyStrategiesBtn.__clickHandler = () => {
        const targetAccountId = parseInt(document.getElementById('copy-target-account').value);
        console.log('Copy button clicked, targetAccountId:', targetAccountId, 'accounts:', accounts);
        const targetAccount = accounts.find(a => a.id === targetAccountId);
        if (!targetAccount || isNaN(targetAccountId)) {
            showToast('Please select a valid target account.', 'error');
            console.error('Invalid target account ID:', targetAccountId);
            return;
        }
        if (selectedStrategyIds.size === 0) {
            showToast('Please select at least one strategy to copy.', 'error');
            return;
        }
        const selectedStrategies = strategies.filter(s => selectedStrategyIds.has(s.id));
        if (selectedStrategies.some(s => s.accountId === targetAccountId)) {
            showToast('Cannot copy strategies to their own account.', 'error');
            return;
        }

        const modal = new bootstrap.Modal(document.getElementById('copyStrategiesModal'), { backdrop: 'static' });
        document.getElementById('copy-target-account-name').textContent = targetAccount.name;
        document.getElementById('copy-strategies-list').innerHTML = selectedStrategies.map(s => `<li>${s.name}</li>`).join('');
        modal.show();
    };
    copyStrategiesBtn?.addEventListener('click', copyStrategiesBtn.__clickHandler);

    // Confirm copy click handler
    confirmCopyStrategies.__clickHandler = async () => {
        const targetAccountId = parseInt(document.getElementById('copy-target-account').value);
        console.log('Confirm copy clicked, targetAccountId:', targetAccountId, 'accounts:', accounts);
        const targetAccount = accounts.find(a => a.id === targetAccountId);
        if (!targetAccount || isNaN(targetAccountId)) {
            showToast('Invalid target account.', 'error');
            console.error('Invalid target account ID on confirm:', targetAccountId);
            return;
        }

        const selectedStrategies = strategies.filter(s => selectedStrategyIds.has(s.id));
        const baseId = Date.now();
        const newStrategies = [];
        const skippedStrategies = [];

        selectedStrategies.forEach((strategy, index) => {
            // Check if a strategy with the original name already exists in the target account
            if (strategies.some(s => s.name === strategy.name && s.accountId === targetAccountId)) {
                skippedStrategies.push(strategy.name);
                console.log(`Skipping strategy "${strategy.name}" as it already exists in account ${targetAccountId}`);
            } else {
                newStrategies.push({
                    ...strategy,
                    id: baseId + index, // Unique numeric ID for each strategy
                    name: strategy.name, // Use original name
                    accountId: targetAccountId,
                    createdAt: new Date().toISOString(),
                    lastUsed: null
                });
            }
        });

        // Validate unique IDs
        const strategyIds = new Set(newStrategies.map(s => s.id));
        if (strategyIds.size !== newStrategies.length) {
            showToast('Error: Duplicate strategy IDs detected.', 'error');
            console.error('Duplicate IDs in newStrategies:', newStrategies);
            return;
        }

        console.log('New strategies to copy:', newStrategies);
        if (skippedStrategies.length > 0) {
            showToast(`Skipped copying ${skippedStrategies.length} strategy(ies) already existing in target account: ${skippedStrategies.join(', ')}`, 'warning');
        }

        if (newStrategies.length === 0) {
            showToast('No strategies copied: All selected strategies already exist in the target account.', 'warning');
            const modalElement = document.getElementById('copyStrategiesModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.hide();
            document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            return;
        }

        try {
            strategies.push(...newStrategies);
            await saveData();
            renderStrategies(strategies, settings.activeAccountId, accounts, trades);
            selectedStrategyIds.clear();
            document.querySelectorAll('.strategy-select').forEach(checkbox => checkbox.checked = false);
            if (copyTargetAccount) {
                copyTargetAccount.value = ''; // Reset dropdown
            }
            updateCopyButtonState();
            const modalElement = document.getElementById('copyStrategiesModal');
            const modal = new bootstrap.Modal(modalElement);
            modal.hide();
            // Ensure backdrop is removed
            document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
            modalElement.classList.remove('show');
            modalElement.style.display = 'none';
            showToast(`${newStrategies.length} strategy(ies) copied successfully!`, 'success');
        } catch (err) {
            console.error('Error during strategy copy:', err);
            showToast('Error copying strategies. Please try again.', 'error');
        }
    };
    confirmCopyStrategies?.addEventListener('click', confirmCopyStrategies.__clickHandler);

    console.log('Initialized bulk copy event listeners');
}

function initializeStrategyForm() {
    const form = document.getElementById('strategy-form');
    if (!form) {
        console.warn('Strategy form not found in DOM');
        return;
    }

    const tagContainer = document.getElementById('strategy-tags');
    const tagInput = document.getElementById('strategy-tags-value');
    const newTagInput = document.getElementById('strategy-new-tag');
    if (tagContainer && tagInput) {
        tagContainer.innerHTML = '';
        tagInput.value = '';
        console.log('Cleared tags in strategy form');
    } else {
        console.warn('Tag elements missing:', {
            tagContainer: !!tagContainer,
            tagInput: !!tagInput,
            newTagInput: !!newTagInput
        });
    }

    const accountSelect = document.getElementById('account');
    if (accountSelect) {
        accountSelect.innerHTML = '<option value="">Select Account</option>' + 
            accounts.map(a => `<option value="${a.id}" ${a.id === settings.activeAccountId ? 'selected' : ''}>${a.name}</option>`).join('');
        console.log('Populated account dropdown with', accounts.length, 'options');
    } else {
        console.warn('Account select element not found in DOM');
    }

    let entryConditionsContainer = document.getElementById('entry-conditions');
    let exitConditionsContainer = document.getElementById('exit-conditions');
    let addEntryButton = document.getElementById('add-entry-condition');
    let addExitButton = document.getElementById('add-exit-condition');

    if (entryConditionsContainer) {
        entryConditionsContainer.innerHTML = '';
        console.log('Cleared entry-conditions container');
    }
    if (exitConditionsContainer) {
        exitConditionsContainer.innerHTML = '';
        console.log('Cleared exit-conditions container');
    }

    if (!entryConditionsContainer) {
        console.warn('Creating fallback entry-conditions container');
        entryConditionsContainer = document.createElement('div');
        entryConditionsContainer.id = 'entry-conditions';
        form.appendChild(entryConditionsContainer);
    }
    if (!exitConditionsContainer) {
        console.warn('Creating fallback exit-conditions container');
        exitConditionsContainer = document.createElement('div');
        exitConditionsContainer.id = 'exit-conditions';
        form.appendChild(exitConditionsContainer);
    }

    // Add one default row for entry and exit conditions
    addCondition(entryConditionsContainer, 'entry');
    addCondition(exitConditionsContainer, 'exit');
    console.log('Added default entry and exit condition rows');

    if (!addEntryButton) {
        console.warn('Creating fallback add-entry-condition button');
        addEntryButton = document.createElement('button');
        addEntryButton.id = 'add-entry-condition';
        addEntryButton.type = 'button';
        addEntryButton.className = 'btn btn-secondary btn-sm';
        addEntryButton.textContent = 'Add Entry Condition';
        form.appendChild(addEntryButton);
    }
    if (!addExitButton) {
        console.warn('Creating fallback add-exit-condition button');
        addExitButton = document.createElement('button');
        addExitButton.id = 'add-exit-condition';
        addExitButton.type = 'button';
        addExitButton.className = 'btn btn-secondary btn-sm';
        addExitButton.textContent = 'Add Exit Condition';
        form.appendChild(addExitButton);
    }

    // Ensure strategy form elements
    const formElements = [
        { id: 'strategy-name', type: 'text', placeholder: 'Strategy Name', label: 'Strategy Name', required: true },
        { id: 'strategy-description', type: 'textarea', placeholder: 'Description', label: 'Description', required: true },
        { id: 'strategy-market-type', type: 'select', options: ['forex', 'indices', 'commodities', 'crypto'], label: 'Market Type', required: true },
        { id: 'strategy-timeframes', type: 'select', multiple: true, options: ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'], label: 'Timeframes', required: true },
        { id: 'risk-percent', type: 'number', placeholder: 'Risk %', step: '0.1', min: '0', value: '0.5', label: 'Risk Percent' },
        { id: 'stop-loss-pips', type: 'number', placeholder: 'SL Pips', min: '0', value: '10', label: 'Stop Loss Pips' },
        { id: 'risk-reward', type: 'number', placeholder: 'RR', step: '0.1', min: '0', value: '2', label: 'Risk Reward' }
    ];

    const formContainer = document.createElement('div');
    formContainer.className = 'mb-3';
    formContainer.innerHTML = '<div class="row g-2"></div>';
    const formRow = formContainer.querySelector('.row');

    formElements.forEach(input => {
        let element = document.getElementById(input.id);
        if (!element) {
            console.warn(`Creating fallback ${input.label} element #${input.id}`);
            const col = document.createElement('div');
            col.className = 'col-md-4';
            if (input.type === 'select') {
                col.innerHTML = `
                    <label for="${input.id}" class="form-label">${input.label}</label>
                    <select class="form-control" id="${input.id}" ${input.multiple ? 'multiple' : ''} ${input.required ? 'required' : ''}>
                        <option value="">Select ${input.label}</option>
                        ${input.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
                    </select>
                `;
            } else if (input.type === 'textarea') {
                col.innerHTML = `
                    <label for="${input.id}" class="form-label">${input.label}</label>
                    <textarea class="form-control" id="${input.id}" placeholder="${input.placeholder}" ${input.required ? 'required' : ''}></textarea>
                `;
            } else {
                col.innerHTML = `
                    <label for="${input.id}" class="form-label">${input.label}</label>
                    <input type="${input.type}" class="form-control" id="${input.id}" 
                           placeholder="${input.placeholder}" step="${input.step || ''}" 
                           min="${input.min || ''}" value="${input.value || ''}" ${input.required ? 'required' : ''}>
                `;
            }
            formRow.appendChild(col);
            element = col.querySelector(`#${input.id}`);
        }
        console.log(`${input.label} element found or created:`, !!element, 'Value:', element?.value);
    });

    if (!form.querySelector('#strategy-name')) {
        form.prepend(formContainer);
        console.log('Appended form elements container to strategy form');
    }

    const isFirstConditionValid = (container) => {
        const rows = container.querySelectorAll('.condition-row');
        // Allow adding new rows if there’s one empty default row
        if (rows.length <= 1) return true;
        return validateConditionRow(rows[0]);
    };

    const updateAddButtonStates = () => {
        const entryValid = isFirstConditionValid(entryConditionsContainer);
        const exitValid = isFirstConditionValid(exitConditionsContainer);
        addEntryButton.disabled = !entryValid;
        addExitButton.disabled = !exitValid;
        console.log('Updated add button states:', { entryValid, exitValid });
    };

    const removeListeners = (element, event, handler) => {
        element.removeEventListener(event, handler);
    };

    const debouncedAddEntry = debounce(() => addCondition(entryConditionsContainer, 'entry'), 300);
    const debouncedAddExit = debounce(() => addCondition(exitConditionsContainer, 'exit'), 300);

    if (addEntryButton.__entryHandler) {
        removeListeners(addEntryButton, 'click', addEntryButton.__entryHandler);
    }
    if (addExitButton.__exitHandler) {
        removeListeners(addExitButton, 'click', addExitButton.__exitHandler);
    }

    addEntryButton.__entryHandler = () => {
        if (isFirstConditionValid(entryConditionsContainer)) {
            debouncedAddEntry();
        } else {
            showToast('Please complete the first entry condition.', 'error');
            console.warn('Blocked adding entry condition: First condition invalid');
        }
    };
    addExitButton.__exitHandler = () => {
        if (isFirstConditionValid(exitConditionsContainer)) {
            debouncedAddExit();
        } else {
            showToast('Please complete the first exit condition.', 'error');
            console.warn('Blocked adding exit condition: First condition invalid');
        }
    };
    addEntryButton.addEventListener('click', addEntryButton.__entryHandler);
    addExitButton.addEventListener('click', addExitButton.__exitHandler);
    console.log('Attached condition button listeners');

    if (tagContainer && tagInput && newTagInput) {
        // Log all tags in strategies for debugging
        const allTags = strategies.flatMap(s => s.tags || []);
        console.log('All tags in strategies:', allTags);

        // Initialize TagManager with empty tags and no valid tags on page load
        if (!strategyTagManager) {
            strategyTagManager = new TagManager('strategy-tags', 'strategy-tags-value', [], 'strategy-new-tag');
        }
        // Use empty validTags to prevent other strategy tags from showing
        const validTags = [];
        console.log('Initialized TagManager with valid tags:', validTags);
        strategyTagManager.init([], validTags); // Initialize with empty current and valid tags

        if (newTagInput.__keypressHandler) {
            removeListeners(newTagInput, 'keypress', newTagInput.__keypressHandler);
        }

        const debouncedAddTag = debounce((tag) => {
            const currentTags = tagInput.value ? tagInput.value.split(',').filter(t => t.trim()) : [];
            if (!currentTags.includes(tag)) {
                currentTags.push(tag);
                tagInput.value = currentTags.join(',');
                // Update validTags with all strategy tags when adding a new tag
                const updatedValidTags = [...new Set([...strategies.flatMap(s => s.tags || []), ...currentTags])];
                strategyTagManager.init(currentTags, updatedValidTags);
                showToast(`Tag "${tag}" added!`, 'success');
                console.log(`Added tag: ${tag}`, currentTags);
            }
        }, 300);

        newTagInput.__keypressHandler = (e) => {
            if (e.key === 'Enter' && e.target.value.trim()) {
                e.preventDefault();
                debouncedAddTag(e.target.value.trim());
                e.target.value = '';
            }
        };
        newTagInput.addEventListener('keypress', newTagInput.__keypressHandler);
        console.log('Initialized TagManager for strategy tags with single listener');
    } else {
        console.warn('Tag elements missing:', {
            tagContainer: !!tagContainer,
            tagInput: !!tagInput,
            newTagInput: !!newTagInput
        });
    }

    const manageTypesButton = document.getElementById('manage-condition-types');
    if (manageTypesButton) {
        // Remove any existing listeners to prevent duplicates
        manageTypesButton.removeEventListener('click', manageTypesButton.__manageTypesHandler);
        manageTypesButton.__manageTypesHandler = () => {
            const modal = new bootstrap.Modal(document.getElementById('manageConditionTypesModal'));
            const listBody = document.getElementById('condition-types-list-body');
            listBody.innerHTML = settings.conditionTypes.map(type => `
                <tr>
                    <td>${type}</td>
                    <td>
                        <button class="btn btn-primary btn-sm edit-condition-type" data-name="${type}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-condition-type" data-name="${type}">Delete</button>
                    </td>
                </tr>
            `).join('');
            console.log('Rendered condition types modal:', settings.conditionTypes);
            modal.show();
        };
        manageTypesButton.addEventListener('click', manageTypesButton.__manageTypesHandler);
    } else {
        console.warn('Manage condition types button not found in DOM');
    }

    const conditionTypesForm = document.getElementById('condition-types-form');
    if (conditionTypesForm) {
        let editingConditionTypeId = null;

        // Remove any existing submit listeners
        conditionTypesForm.removeEventListener('submit', conditionTypesForm.__submitHandler);
        conditionTypesForm.__submitHandler = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Condition types form submitted');
            const name = document.getElementById('condition-type-name').value.trim();
            if (!name) {
                showToast('Condition type name is required.', 'error');
                console.warn('Validation failed: Condition type name is empty');
                return;
            }
            if (settings.conditionTypes.includes(name) && name !== editingConditionTypeId) {
                showToast('Condition type already exists.', 'error');
                console.warn(`Validation failed: Condition type "${name}" already exists`);
                return;
            }

            if (editingConditionTypeId) {
                const oldName = editingConditionTypeId;
                const index = settings.conditionTypes.indexOf(oldName);
                settings.conditionTypes[index] = name;
                console.log(`Updated condition type: ${oldName} -> ${name}, settings.conditionTypes:`, settings.conditionTypes);
                editingConditionTypeId = null;
                document.getElementById('update-condition-type')?.classList.add('d-none');
                document.getElementById('cancel-condition-type-update')?.classList.add('d-none');
                conditionTypesForm.querySelector('button[type="submit"]').classList.remove('d-none');
            } else {
                settings.conditionTypes.push(name);
                console.log(`Added condition type: ${name}, settings.conditionTypes:`, settings.conditionTypes);
            }

            await saveToStore('settings', { id: 'settings', ...settings });
            console.log('Saved condition types to database:', settings.conditionTypes);
            const listBody = document.getElementById('condition-types-list-body');
            if (listBody) {
                listBody.innerHTML = settings.conditionTypes.map(type => `
                    <tr>
                        <td>${type}</td>
                        <td>
                            <button class="btn btn-primary btn-sm edit-condition-type" data-name="${type}">Edit</button>
                            <button class="btn btn-danger btn-sm delete-condition-type" data-name="${type}">Delete</button>
                        </td>
                    </tr>
                `).join('');
            }
            conditionTypesForm.reset();
            updateAddButtonStates();
            updateConditionDropdowns();
            const modalElement = document.getElementById('manageConditionTypesModal');
            const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
            if (!modal._isShown) {
                console.warn('Modal not shown after submission, showing again');
                modal.show();
            }
            const strategiesPage = document.getElementById('strategies');
            if (strategiesPage && !strategiesPage.classList.contains('active')) {
                console.warn('Strategies page not active after saving condition type, restoring');
                document.querySelectorAll('.page').forEach(p => {
                    p.classList.remove('active');
                    p.style.display = 'none';
                    p.style.opacity = '0';
                });
                strategiesPage.classList.add('active');
                strategiesPage.style.display = 'block';
                setTimeout(() => strategiesPage.style.opacity = '1', 50);
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                const strategiesLink = document.querySelector('.nav-link[data-page="strategies"]');
                if (strategiesLink) strategiesLink.classList.add('active');
            }
            console.log('Updated condition types form after save, modal shown:', modal._isShown);
            showToast('Condition type saved successfully!', 'success');
        };
        conditionTypesForm.addEventListener('submit', conditionTypesForm.__submitHandler);

        const listBody = document.getElementById('condition-types-list-body');
        if (listBody) {
            listBody.removeEventListener('click', listBody.__clickHandler);
            listBody.__clickHandler = async (e) => {
                if (e.target.classList.contains('edit-condition-type')) {
                    const name = e.target.dataset.name;
                    editingConditionTypeId = name;
                    document.getElementById('condition-type-name').value = name;
                    document.getElementById('update-condition-type')?.classList.remove('d-none');
                    document.getElementById('cancel-condition-type-update')?.classList.remove('d-none');
                    conditionTypesForm.querySelector('button[type="submit"]').classList.add('d-none');
                    console.log(`Editing condition type: ${name}`);
                } else if (e.target.classList.contains('delete-condition-type')) {
                    const name = e.target.dataset.name;
                    if (strategies.some(s => s.entryConditions.some(c => c.type === name) || s.exitConditions.some(c => c.type === name))) {
                        showToast('Cannot delete condition type used in strategies.', 'error');
                        console.warn(`Cannot delete condition type "${name}": Used in strategies`);
                        return;
                    }
                    settings.conditionTypes = settings.conditionTypes.filter(t => t !== name);
                    conditionTypes = [...settings.conditionTypes];
                    await saveToStore('settings', { id: 'settings', ...settings });
                    console.log('Deleted condition type:', name, 'Updated condition types:', settings.conditionTypes, 'Global conditionTypes:', conditionTypes);
                    listBody.innerHTML = settings.conditionTypes.map(type => `
                        <tr>
                            <td>${type}</td>
                            <td>
                                <button class="btn btn-primary btn-sm edit-condition-type" data-name="${type}">Edit</button>
                                <button class="btn btn-danger btn-sm delete-condition-type" data-name="${type}">Delete</button>
                            </td>
                        </tr>
                    `).join('');
                    updateAddButtonStates();
                    updateConditionDropdowns();
                    console.log('Updated condition types list after delete');
                    showToast('Condition type deleted successfully!', 'success');
                }
            };
            listBody.addEventListener('click', listBody.__clickHandler);
        }

        const cancelButton = document.getElementById('cancel-condition-type-update');
        if (cancelButton) {
            cancelButton.removeEventListener('click', cancelButton.__cancelHandler);
            cancelButton.__cancelHandler = () => {
                editingConditionTypeId = null;
                conditionTypesForm.reset();
                document.getElementById('update-condition-type')?.classList.add('d-none');
                document.getElementById('cancel-condition-type-update')?.classList.add('d-none');
                conditionTypesForm.querySelector('button[type="submit"]').classList.remove('d-none');
                console.log('Cancelled condition type update');
            };
            cancelButton.addEventListener('click', cancelButton.__cancelHandler);
        }

        const updateButton = document.getElementById('update-condition-type');
        if (updateButton) {
            updateButton.removeEventListener('click', updateButton.__updateHandler);
            updateButton.__updateHandler = async () => {
                console.log('Update condition type button clicked');
                conditionTypesForm.dispatchEvent(new Event('submit'));
            };
            updateButton.addEventListener('click', updateButton.__updateHandler);
        }
    } else {
        console.warn('Condition types form not found in DOM');
    }

    // Form submission handler with number validation
    if (form) {
        // Remove any existing submit listeners
        form.removeEventListener('submit', form.__submitHandler);
        form.__submitHandler = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Strategy form submitted');

            // Validate form fields
            const name = document.getElementById('strategy-name')?.value.trim();
            const description = document.getElementById('strategy-description')?.value.trim();
            const marketType = document.getElementById('strategy-market-type')?.value;
            const timeframes = Array.from(document.getElementById('strategy-timeframes')?.selectedOptions || []).map(opt => opt.value);
            const accountId = parseInt(document.getElementById('account')?.value);
            const riskPercent = document.getElementById('risk-percent')?.value;
            const stopLossPips = document.getElementById('stop-loss-pips')?.value;
            const riskReward = document.getElementById('risk-reward')?.value;
            const tags = document.getElementById('strategy-tags-value')?.value.split(',').map(t => t.trim()).filter(t => t);

            // Validate required fields
            if (!validateRequired(name, 'Strategy Name')) return;
            if (!validateRequired(description, 'Description')) return;
            if (!validateRequired(marketType, 'Market Type')) return;
            if (!validateRequired(timeframes.length, 'Timeframes')) return;
            if (!validateRequired(accountId, 'Account') || isNaN(accountId)) {
                showToast('Please select a valid account.', 'error');
                return;
            }

            // Validate number fields
            if (!validateNumber(parseFloat(riskPercent), 'Risk Percent', 0)) return;
            if (!validateNumber(parseInt(stopLossPips), 'Stop Loss Pips', 0)) return;
            if (!validateNumber(parseFloat(riskReward), 'Risk Reward', 0)) return;

            // Additional validation for step (decimal places)
            if (riskPercent && !Number.isFinite(parseFloat(riskPercent)) || (parseFloat(riskPercent) * 10) % 1 !== 0) {
                showToast('Risk Percent must be a number with up to one decimal place (e.g., 0.5).', 'error');
                return;
            }
            if (riskReward && !Number.isFinite(parseFloat(riskReward)) || (parseFloat(riskReward) * 10) % 1 !== 0) {
                showToast('Risk Reward must be a number with up to one decimal place (e.g., 2.0).', 'error');
                return;
            }

            // Validate conditions
            const entryConditions = Array.from(document.querySelectorAll('#entry-conditions .condition-row')).map(row => {
                const type = row.querySelector('.condition-type')?.value;
                const description = row.querySelector('.condition-description')?.value.trim();
                return { type, description, params: { value: row.querySelector('.condition-params')?.value.trim() } };
            });
            const exitConditions = Array.from(document.querySelectorAll('#exit-conditions .condition-row')).map(row => {
                const type = row.querySelector('.condition-type')?.value;
                const description = row.querySelector('.condition-description')?.value.trim();
                return { type, description, params: { value: row.querySelector('.condition-params')?.value.trim() } };
            });

            if (!entryConditions.length) {
                showToast('At least one entry condition is required.', 'error');
                return;
            }
            if (!exitConditions.length) {
                showToast('At least one exit condition is required.', 'error');
                return;
            }

            const invalidEntryCondition = entryConditions.find(c => !validateConditionRow(c));
            const invalidExitCondition = exitConditions.find(c => !validateConditionRow(c));
            if (invalidEntryCondition) {
                showToast('Please complete all entry condition fields.', 'error');
                return;
            }
            if (invalidExitCondition) {
                showToast('Please complete all exit condition fields.', 'error');
                return;
            }

            const strategy = {
                id: editingStrategyId || Date.now(),
                name,
                description,
                marketType,
                timeframes,
                accountId,
                tags,
                entryConditions,
                exitConditions,
                riskSettings: {
                    riskPercent: parseFloat(riskPercent),
                    stopLossPips: parseInt(stopLossPips),
                    rr: parseFloat(riskReward)
                },
                createdAt: editingStrategyId ? strategies.find(s => s.id === editingStrategyId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
                lastUsed: editingStrategyId ? strategies.find(s => s.id === editingStrategyId)?.lastUsed : null
            };

            try {
                if (editingStrategyId) {
                    const index = strategies.findIndex(s => s.id === editingStrategyId);
                    strategies[index] = strategy;
                    editingStrategyId = null;
                    document.getElementById('update-strategy')?.classList.add('d-none');
                    document.getElementById('cancel-strategy-update')?.classList.add('d-none');
                    form.querySelector('button[type="submit"]').classList.remove('d-none');
                    showToast('Strategy updated successfully!', 'success');
                } else {
                    strategies.push(strategy);
                    showToast('Strategy added successfully!', 'success');
                }

                await saveData();
                form.reset();
                document.getElementById('entry-conditions').innerHTML = '';
                document.getElementById('exit-conditions').innerHTML = '';
                document.getElementById('strategy-tags-value').value = '';
                strategyTagManager.init([], strategies.flatMap(s => s.tags));

                // Force re-render of strategy list
                const strategyListContainer = document.getElementById('strategy-list');
                if (strategyListContainer) {
                    // Clear existing content to ensure fresh render
                    strategyListContainer.innerHTML = '';
                    // Call renderStrategies with current filters and sort
                    const filterInputs = {
                        search: document.getElementById('strategy-search')?.value || '',
                        marketType: document.getElementById('strategy-market-type')?.value || '',
                        timeframe: document.getElementById('strategy-timeframe')?.value || '',
                        tag: document.getElementById('strategy-tag-filter')?.value || ''
                    };
                    const sortSelect = document.getElementById('strategy-sort');
                    const sort = sortSelect ? sortSelect.value : 'name';
                    renderStrategies(strategies, settings.activeAccountId, accounts, filterInputs, sort);
                    console.log('Strategy list re-rendered with strategies:', strategies);
                } else {
                    console.warn('Strategy list container not found for re-render');
                }

                updateAddButtonStates();
                console.log('Strategy saved:', strategy);
            } catch (err) {
                console.error('Error saving strategy:', err);
                showToast('Error saving strategy. Please try again.', 'error');
            }
        };
        form.addEventListener('submit', form.__submitHandler);
    } else {
        console.warn('Strategy form not found in DOM');
    }

    // Update condition dropdowns after adding default rows
    updateConditionDropdowns();
    console.log('Updated condition type dropdowns after adding default rows');

    updateAddButtonStates();
    console.log('Updated button states after initializing form');

    // Initialize bulk copy event listeners
    initializeBulkCopyListeners();

    console.log('initializeStrategyForm completed:', {
        form: !!form,
        accountSelect: !!accountSelect,
        entryConditionsContainer: !!entryConditionsContainer,
        exitConditionsContainer: !!exitConditionsContainer,
        addEntryButton: !!addEntryButton,
        addExitButton: !!addExitButton,
        tagContainer: !!tagContainer,
        tagInput: !!tagInput,
        newTagInput: !!newTagInput,
        strategyName: !!document.getElementById('strategy-name'),
        strategyDescription: !!document.getElementById('strategy-description'),
        strategyMarketType: !!document.getElementById('strategy-market-type'),
        strategyTimeframes: !!document.getElementById('strategy-timeframes'),
        riskPercent: !!document.getElementById('risk-percent'),
        stopLossPips: !!document.getElementById('stop-loss-pips'),
        riskReward: !!document.getElementById('risk-reward'),
        conditionTypes: settings.conditionTypes
    });
}




  document.addEventListener('DOMContentLoaded', () => {
        const isPropFirmCheckbox = document.getElementById('is-propfirm');
        const propFirmFields = document.querySelectorAll('.prop-firm-field');

        function togglePropFirmFields() {
            propFirmFields.forEach(field => {
                field.classList.toggle('d-none', !isPropFirmCheckbox.checked);
                const input = field.querySelector('input');
                if (input) {
                    input.required = isPropFirmCheckbox.checked;
                }
            });
        }

        if (isPropFirmCheckbox) {
            isPropFirmCheckbox.addEventListener('change', togglePropFirmFields);
            togglePropFirmFields(); // Initialize visibility
        }
    });

    
const columnFilterDropdown = document.getElementById('columnFilterDropdown');
if (columnFilterDropdown) {
    columnFilterDropdown.addEventListener('click', (e) => {
        const checkbox = e.target.closest('.form-check-input');
        if (checkbox) {
            e.preventDefault();
            const column = checkbox.dataset.column;
            checkbox.checked = !checkbox.checked;
            console.log('Column toggle:', column, 'Checked:', checkbox.checked);
            visibleColumns = checkbox.checked
                ? [...new Set([...visibleColumns, column])]
                : visibleColumns.filter(col => col !== column);
            localStorage.setItem('tradeListColumns', JSON.stringify(visibleColumns));
            updateColumnFilterModal();
            saveData();
            const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
            showToast(`Column "${column}" ${checkbox.checked ? 'shown' : 'hidden'}`, 'success');
        }
    });
} else {
    console.warn('Column filter dropdown not found in DOM');
}

const columnFilterBtn = document.getElementById('column-filter-btn');
if (columnFilterBtn) {
    columnFilterBtn.addEventListener('click', () => {
        console.log('Opening column filter modal');
        updateColumnFilterModal();
        new bootstrap.Modal(document.getElementById('columnFilterModal')).show();
    });
} else {
    console.warn('Column filter button not found in DOM');
}

const saveColumnFilter = document.getElementById('save-column-filter');
if (saveColumnFilter) {
    saveColumnFilter.addEventListener('click', debounce(async () => {
        const form = document.getElementById('column-filter-form');
        const checkboxes = form.querySelectorAll('input[type="checkbox"]');
        visibleColumns = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.id.replace('col-', ''));
        console.log('Saved visibleColumns from modal:', visibleColumns);
        localStorage.setItem('tradeListColumns', JSON.stringify(visibleColumns));
        await saveData();
        const dropdownCheckboxes = document.querySelectorAll('#columnFilterDropdown .form-check-input');
        dropdownCheckboxes.forEach(checkbox => {
            checkbox.checked = visibleColumns.includes(checkbox.dataset.column);
        });
        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
        bootstrap.Modal.getInstance(document.getElementById('columnFilterModal')).hide();
        showToast('Column visibility updated', 'success');
    }, 1000));
} else {
    console.warn('Save column filter button not found in DOM');
}

const populateTradesButton = document.getElementById('populate-trades');
if (populateTradesButton) {
    populateTradesButton.addEventListener('click', async () => {
        console.log('Populating 1,000 trades');
        try {
            await populateTrades(settings.activeAccountId);
            console.log('Trades populated, refreshing data');
            await initializeData();
            currentPage = 1;
            const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
            console.log('Calling renderTrades after populate');
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
            showToast('1,000 trades populated successfully!', 'success');
        } catch (err) {
            showToast('Error populating trades.', 'error');
            console.error('Populate trades error:', err);
        }
    });
} else {
    console.warn('Populate trades button not found in DOM');
}

const tradeTableScrollArea = document.getElementById('trade-table-scroll-area');
if (tradeTableScrollArea) {
    tradeTableScrollArea.addEventListener('dblclick', (e) => {
        const td = e.target.closest('td.editable');
        if (!td) return;
        const tradeId = td.dataset.tradeId;
        const field = td.dataset.field;
        const type = td.dataset.type;
        const trade = trades.find(t => t.id === parseInt(tradeId));
        if (!trade) return;

        const column = tradeColumns.find(col => col.key === field);
        let input;
        if (type === 'select') {
            input = document.createElement('select');
            input.className = 'form-select';
            input.innerHTML = `<option value="">Select</option>` + 
                column.options.map(opt => `<option value="${opt}" ${trade[field] === opt ? 'selected' : ''}>${opt}</option>`).join('');
        } else {
            input = document.createElement('input');
            input.className = 'form-control';
            input.type = type === 'number' ? 'number' : type;
            input.value = trade[field] || '';
            if (type === 'number') input.step = '0.01';
        }
        input.style.fontSize = '0.8rem';
        input.style.height = '32px';

        td.innerHTML = '';
        td.appendChild(input);
        input.focus();

        const saveEdit = async () => {
            const newValue = input.value;
            if (newValue !== trade[field]) {
                trade[field] = type === 'number' ? parseFloat(newValue) || 0 : newValue;
                try {
                    await saveToStore('trades', trade);
                    showToast('Trade updated', 'success');
                    const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
                    renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
                } catch (err) {
                    showToast('Error updating trade', 'error');
                    td.innerHTML = column.render(trade, trades.indexOf(trade), (currentPage - 1) * recordsPerPage, settings, trades);
                }
            } else {
                td.innerHTML = column.render(trade, trades.indexOf(trade), (currentPage - 1) * recordsPerPage, settings, trades);
            }
        };

        input.addEventListener('blur', saveEdit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveEdit();
        });
    });

    tradeTableScrollArea.addEventListener('click', (e) => {
        const detailBtn = e.target.closest('.detail-btn');
        if (detailBtn) {
            e.preventDefault();

            const tradeId = parseInt(detailBtn.dataset.id);
const tradeIndex = trades.findIndex(t => t.id === tradeId);
if (tradeIndex !== -1) {
    const trade = trades[tradeIndex];
    console.log(`Opening trade details for trade ID: ${tradeId}, index: ${tradeIndex}`);

    showTradeDetails(tradeIndex, trades, reflections, strategies, settings.riskPlans, settings, async (updatedTrade, updatedReflection) => {
        if (!updatedTrade.id) {
            console.warn(`Updated trade missing id, assigning new id`);
            updatedTrade.id = trade.id || Date.now();
        }
        console.log(`Saving trade ${updatedTrade.id} with emotions: ${updatedTrade.emotions}, mistakes: ${updatedTrade.mistakes}`);
        const i = trades.findIndex(t => t.id === updatedTrade.id);
        trades[i] = updatedTrade;

        const reflectionIndex = reflections.findIndex(r => r.tradeId === updatedTrade.id && r.accountId === settings.activeAccountId);
        if (reflectionIndex !== -1) {
            reflections[reflectionIndex] = updatedReflection;
        } else {
            reflections.push({ ...updatedReflection, accountId: settings.activeAccountId });
        }

        balance = updatedTrade.balance || balance;
        await saveData();

        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
        showToast('Trade updated successfully!', 'success');
        new bootstrap.Modal(document.getElementById('reflectionModal')).hide();
    }, settings.activeAccountId);
} else {
    showToast('Error: Trade not found.', 'error');
    console.error(`Trade with ID ${tradeId} not found.`);
}

        }

        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const id = parseInt(deleteBtn.dataset.id);
            deleteTradeById(id);
        }
    });
} else {
    console.warn('Trade table scroll area not found in DOM');
}

const filterInputs = ['filter-pair', 'filter-outcome', 'filter-strategy', 'filter-date-start', 'filter-date-end'];
filterInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
        input.addEventListener('change', debounce(() => {
            currentFilters = {
                pair: document.getElementById('filter-pair').value,
                outcome: document.getElementById('filter-outcome').value,
                strategy: document.getElementById('filter-strategy').value,
                dateStart: document.getElementById('filter-date-start').value,
                dateEnd: document.getElementById('filter-date-end').value
            };
            currentPage = 1;
            const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
        }, 500));
    }
});

const clearFilters = document.getElementById('clear-filters');
if (clearFilters) {
    clearFilters.addEventListener('click', () => {
        filterInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
        currentFilters = {};
        currentPage = 1;
        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
    });
}

const exportButton = document.getElementById('export-trades');
if (exportButton) {
    exportButton.addEventListener('click', async () => {
        console.time('exportTrades');
        try {
            const csvRows = [];
            const headers = tradeColumns
                .filter(col => visibleColumns.includes(col.key))
                .map(col => col.label);
            csvRows.push(headers.join(','));

            console.log('Exporting filtered trades:', cachedFilteredTrades.length);
            for (const trade of cachedFilteredTrades) {
                const row = tradeColumns
                    .filter(col => visibleColumns.includes(col.key))
                    .map(col => {
                        const value = col.render(trade, cachedFilteredTrades.indexOf(trade), 0, settings, trades);
                        return `"${String(value).replace(/"/g, '""')}"`;
                    });
                csvRows.push(row.join(','));
            }

            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `trade_log_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            console.log('Filtered trades exported successfully');
        } catch (err) {
            showToast('Error exporting trades', 'error');
            console.error('Export error:', err);
        } finally {
            console.timeEnd('exportTrades');
        }
    });
} else {
    console.warn('Export trades button not found in DOM');
}

async function migrateLocalStorage() {
    const localData = {
        trades: JSON.parse(localStorage.getItem('trades')) || [],
        strategies: JSON.parse(localStorage.getItem('strategies')) || [],
        reflections: JSON.parse(localStorage.getItem('reflections')) || [],
        dailyPlans: JSON.parse(localStorage.getItem('dailyPlans')) || [],
        weeklyReviews: JSON.parse(localStorage.getItem('weeklyReviews')) || [],
        settings: JSON.parse(localStorage.getItem('settings')) || settings
    };

    await Promise.all([
        ...localData.trades.map(trade => saveToStore('trades', {
            ...trade,
            accountId: settings.activeAccountId,
            screenshot: trade.screenshot && typeof trade.screenshot === 'string' ? base64ToBlob(trade.screenshot) : null
        })),
        ...localData.strategies.map(strategy => saveToStore('strategies', { ...strategy, accountId: settings.activeAccountId })),
        ...localData.reflections.map(reflection => saveToStore('reflections', { ...reflection, accountId: settings.activeAccountId })),
        ...localData.dailyPlans.map(plan => saveToStore('dailyPlans', { ...plan, accountId: settings.activeAccountId })),
        ...localData.weeklyReviews.map(review => saveToStore('weeklyReviews', { ...review, accountId: settings.activeAccountId })),
        saveToStore('settings', { id: 'settings', ...localData.settings, activeAccountId: settings.activeAccountId })
    ]);
    localStorage.clear();
}


// Lightweight function to save only settings
async function saveSettings() {
    console.time('saveSettings');
    try {
        await saveToStore('settings', { id: 'settings', ...settings });
        console.log('Settings saved successfully, activeAccountId:', settings.activeAccountId);
    } catch (err) {
        console.error('Save settings error:', err);
        showToast('Error saving settings.', 'error');
        throw err;
    } finally {
        console.timeEnd('saveSettings');
    }
}

// Define debounceSaveSettings if not already defined
const debounceSaveSettings = debounce(async () => {
    try {
        console.log('Saving settings to IndexedDB:', settings);
        await saveToStore('settings', { id: 'settings', ...settings });
        console.log('Settings saved successfully:', settings);
    } catch (err) {
        console.error('Error saving settings:', err);
        showToast('Error saving account selection. Please try again.', 'error');
    }
}, 1000);




// main.js (update the saveData function)
async function saveData() {
    console.time('saveData');
        const timerLabel = `saveData_${Date.now()}`; // Unique timer label
    console.time(timerLabel);
    try {
        const db = getDB();
        console.log('Saving data to IndexedDB');
        const transaction = db.transaction(['trades', 'strategies', 'reflections', 'dailyPlans', 'weeklyReviews', 'settings', 'columnPrefs', 'accounts', 'pairs'], 'readwrite');
        
        const stores = {
            trades: transaction.objectStore('trades'),
            strategies: transaction.objectStore('strategies'),
            reflections: transaction.objectStore('reflections'),
            dailyPlans: transaction.objectStore('dailyPlans'),
            weeklyReviews: transaction.objectStore('weeklyReviews'),
            settings: transaction.objectStore('settings'),
            columnPrefs: transaction.objectStore('columnPrefs'),
            accounts: transaction.objectStore('accounts'),
            pairs: transaction.objectStore('pairs')
        };

        const promises = [];
        trades.forEach((trade, index) => {
            if (!trade.id) {
                console.warn(`Trade at index ${index} missing id, assigning new id`);
                trade.id = Date.now() + index;
            }
            promises.push(new Promise((resolve, reject) => {
                const request = stores.trades.put({
                    ...trade,
                    screenshots: trade.screenshots?.map(img => ({
                        url: img.url, // Preserve the base64 string
                        caption: img.caption || ''
                    })) || []
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        strategies.forEach(strategy => {
            promises.push(new Promise((resolve, reject) => {
                const request = stores.strategies.put(strategy);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        reflections.forEach(reflection => {
            promises.push(new Promise((resolve, reject) => {
                const request = stores.reflections.put({
                    ...reflection,
                    reviewScreenshot: reflection.reviewScreenshot instanceof Blob ? reflection.reviewScreenshot : null
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        dailyPlans.forEach(plan => {
            promises.push(new Promise((resolve, reject) => {
                const request = stores.dailyPlans.put(plan);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        weeklyReviews.forEach(review => {
            promises.push(new Promise((resolve, reject) => {
                const request = stores.weeklyReviews.put(review);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        accounts.forEach(account => {
            promises.push(new Promise((resolve, reject) => {
                const request = stores.accounts.put(account);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        pairs.forEach(pair => {
            promises.push(new Promise((resolve, reject) => {
                const request = stores.pairs.put(pair);
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }));
        });

        promises.push(new Promise((resolve, reject) => {
            const request = stores.settings.put({ id: 'settings', ...settings });
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        }));

        promises.push(new Promise((resolve, reject) => {
            const request = stores.columnPrefs.put({ id: 'columnPrefs', visibleColumns, recordsPerPage });
            request.onsuccess = resolve;
            request.onerror = () => reject(request.error);
        }));

        await Promise.all(promises);

        // Check if auto-backup is due based on frequency
        const lastBackup = await loadFromStore('backups');
        const lastBackupTime = lastBackup.length ? new Date(lastBackup.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0].timestamp) : null;
        const now = new Date();
        let shouldBackup = false;

        if (settings.backupFrequency.type === 'every-save') {
            shouldBackup = true;
        } else if (settings.backupFrequency.type === 'daily') {
            shouldBackup = !lastBackupTime || (now - lastBackupTime) >= 24 * 60 * 60 * 1000; // 24 hours
        } else if (settings.backupFrequency.type === 'weekly') {
            shouldBackup = !lastBackupTime || (now - lastBackupTime) >= 7 * 24 * 60 * 60 * 1000; // 7 days
        } else if (settings.backupFrequency.type === 'custom') {
            const intervalMs = settings.backupFrequency.interval * 24 * 60 * 60 * 1000; // Days to milliseconds
            shouldBackup = !lastBackupTime || (now - lastBackupTime) >= intervalMs;
        }

        if (shouldBackup) {
            console.log('Calling autoBackup with accounts:', accounts, 'Frequency:', settings.backupFrequency);
            await autoBackup(trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs);
        }
    } catch (err) {
        showToast('Error saving data to database.', 'error');
        console.error('Save data error:', err);
        throw err;
    } finally {
             console.timeEnd(timerLabel);
    }
}
async function deleteTradeById(id) {
    console.time('deleteTradeById');
    console.log('Initiating delete for trade id:', id);
    const trade = trades.find(t => t.id === id);
    if (!trade) {
        showToast('Error: Invalid trade selected for deletion.', 'error');
        console.timeEnd('deleteTradeById');
        return;
    }

    const modal = new bootstrap.Modal(document.getElementById('deleteModal'));
    const confirmButton = document.getElementById('confirm-delete');
    let isSaving = false;

    confirmButton.onclick = async () => {
        try {
            isSaving = true;
            const deletedTrade = { ...trade, deletedAt: Date.now() };
            const deletedReflection = reflections.find(r => r.tradeId === id && r.accountId === settings.activeAccountId);

            const db = getDB();
            const transaction = db.transaction(['trades', 'reflections', 'deleted'], 'readwrite');
            const stores = {
                trades: transaction.objectStore('trades'),
                reflections: transaction.objectStore('reflections'),
                deleted: transaction.objectStore('deleted')
            };

            const promises = [
                new Promise((resolve, reject) => {
                    const request = stores.deleted.put({ id: `trade_${id}`, data: deletedTrade });
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                }),
                new Promise((resolve, reject) => {
                    const request = stores.trades.delete(id);
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                })
            ];

            if (deletedReflection) {
                promises.push(new Promise((resolve, reject) => {
                    const request = stores.deleted.put({ id: `reflection_${id}`, data: deletedReflection });
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                }));
                promises.push(new Promise((resolve, reject) => {
                    const request = stores.reflections.delete(id);
                    request.onsuccess = resolve;
                    request.onerror = () => reject(request.error);
                }));
            }

            await Promise.all(promises);

            trades = trades.filter(t => t.id !== id);
            reflections = reflections.filter(r => r.tradeId !== id || r.accountId !== settings.activeAccountId);
            const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
            balance = activeAccount.initialBalance;

            setTimeout(() => {
                renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
                showToast('Trade deleted successfully! Click Undo to restore.', 'success', {
                    duration: 5000,
                    callback: async () => {
                        if (isSaving) {
                            console.warn('Restore attempted while deletion is still saving');
                            showToast('Please wait and try again.', 'error');
                            return;
                        }
                        try {
                            console.time('restoreTrade');
                            const restorePromises = [
                                saveToStore('trades', deletedTrade),
                                deleteFromStore('deleted', `trade_${id}`)
                            ];
                            if (deletedReflection) {
                                restorePromises.push(saveToStore('reflections', deletedReflection));
                                restorePromises.push(deleteFromStore('deleted', `reflection_${id}`));
                            }
                            await Promise.all(restorePromises);
                            trades.push(deletedTrade);
                            if (deletedReflection) reflections.push(deletedReflection);
                            trades.sort((a, b) => a.id - b.id);
                            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
                            showToast('Trade restored successfully!', 'success');
                            console.timeEnd('restoreTrade');
                        } catch (err) {
                            showToast('Error restoring trade. Please try again.', 'error');
                            console.error('Restore error:', err);
                        }
                    }
                });
            }, 0);

            modal.hide();
            console.log('Delete modal closed');
        } catch (err) {
            showToast('Error deleting trade.', 'error');
            console.error('Delete error:', err);
        } finally {
            isSaving = false;
            console.timeEnd('deleteTradeById');
        }
    };
    modal.show();
    console.log('Delete modal opened');
}

function initializeNavigation() {
    console.log('Initializing navigation');

    // Function to hide all pages with robust CSS properties
    function hideAllPages() {
        const pages = document.querySelectorAll('.page');
        pages.forEach(p => {
            p.classList.remove('active');
            p.style.display = 'none';
            p.style.opacity = '0';
            p.style.visibility = 'hidden';
            p.style.zIndex = '-1';
            console.log(`Hiding page: ${p.id}, classes: ${p.classList}, display: ${p.style.display}, visibility: ${p.style.visibility}, zIndex: ${p.style.zIndex}`);
        });
        // Explicitly ensure Reports page is hidden
        const reportsPage = document.getElementById('reports');
        if (reportsPage) {
            reportsPage.classList.remove('active');
            reportsPage.style.display = 'none';
            reportsPage.style.opacity = '0';
            reportsPage.style.visibility = 'hidden';
            reportsPage.style.zIndex = '-1';
            console.log('Explicitly hid Reports page');
        }
    }

    // Function to show a specific page
    function showPage(pageId) {
        console.log(`Showing page: ${pageId}`);
        hideAllPages();

        const page = document.getElementById(pageId);
        if (!page) {
            showToast(`Page "${pageId}" not found.`, 'error');
            console.error('Page not found:', pageId);
            console.log('Available page IDs:', Array.from(document.querySelectorAll('.page')).map(p => p.id));
            console.log('DOM state:', {
                navLinks: Array.from(document.querySelectorAll('.nav-link')).map(l => l.dataset.page),
                pages: Array.from(document.querySelectorAll('.page')).map(p => ({ id: p.id, display: p.style.display, visibility: p.style.visibility }))
            });
            return;
        }

        page.classList.add('active');
        page.style.display = 'block';
        page.style.opacity = '1';
        page.style.visibility = 'visible';
        page.style.zIndex = '1';
        setTimeout(() => {
            console.log(`Page ${pageId} fully shown, display: ${page.style.display}, opacity: ${page.style.opacity}, visibility: ${page.style.visibility}, zIndex: ${page.style.zIndex}`);
        }, 50);

        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(l => l.classList.remove('active'));
        const activeLink = Array.from(navLinks).find(l => l.dataset.page === pageId);
        if (activeLink) {
            activeLink.classList.add('active');
        } else {
            console.warn(`No nav link found for page: ${pageId}`);
        }
        console.log('Switched to page:', pageId);

        // Initialize page-specific logic only for active page
        const activeAccount = Array.isArray(accounts) && settings.activeAccountId 
            ? accounts.find(a => a.id === settings.activeAccountId) || accounts[0] 
            : null;
        if (!activeAccount) {
            showToast('No active account selected.', 'error');
            console.error('No active account for rendering');
            return;
        }

        let filteredTrades = trades;
        if (globalDateFilter.type === 'custom' && globalDateFilter.startDate && globalDateFilter.endDate) {
            filteredTrades = filterTradesByDateRange(trades, globalDateFilter.startDate, globalDateFilter.endDate);
            console.log(`Applied custom date filter: ${globalDateFilter.startDate} to ${globalDateFilter.endDate}, ${filteredTrades.length} trades`);
        } else {
            const range = getDateRangeForFilter(globalDateFilter.type);
            if (range.startDate && range.endDate) {
                filteredTrades = filterTradesByDateRange(trades, range.startDate, range.endDate);
                console.log(`Applied ${globalDateFilter.type} filter: ${range.startDate} to ${range.endDate}, ${filteredTrades.length} trades`);
            } else {
                console.log(`Applied ${globalDateFilter.type} filter (all-time), ${filteredTrades.length} trades`);
            }
        }
        filteredTrades = filteredTrades.filter(t => t.accountId === settings.activeAccountId);
        console.log('Filtered trades for rendering:', filteredTrades.length, 'Details:', filteredTrades.map(t => ({ id: t.id, strategyId: t.strategyId, accountId: t.accountId })));

        if (pageId === 'dashboard') {
            try {
                renderDashboard(filteredTrades, strategies, settings.activeAccountId, accounts);
            } catch (err) {
                console.error('Error rendering dashboard:', err);
                showToast('Error loading Dashboard.', 'error');
            }
        } else if (pageId === 'trade-log') {
            try {
                renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
            } catch (err) {
                console.error('Error rendering Trade Log:', err);
                showToast('Error loading Trade Log.', 'error');
            }
        } else if (pageId === 'daily-plan') {
            console.log('Initializing Daily Plan page via navigation');
            try {
                initializeDailyPlanPage(dailyPlans, settings, accounts, filteredTrades);
            } catch (err) {
                console.error('Error initializing Daily Plan page:', err);
                showToast('Error loading Daily Plan page.', 'error');
            }
        } else if (pageId === 'weekly-review') {
            try {
                initializeWeeklyReviewPage(dailyPlans, settings, accounts, filteredTrades);
            } catch (err) {
                console.error('Error initializing Weekly Review page:', err);
                showToast('Error loading Weekly Review page.', 'error');
            }
        } else if (pageId === 'strategies') {
            try {
                initializeStrategyForm();
                renderStrategies(strategies, settings.activeAccountId, accounts, filteredTrades);
            } catch (err) {
                console.error('Error initializing Strategies page:', err);
                showToast('Error loading Strategies page.', 'error');
            }
        } else if (pageId === 'trade-transfers') {
            console.log('Initializing Trade Transfers page via navigation');
            try {
                initTradeTransfers();
            } catch (err) {
                console.error('Error initializing Trade Transfers page:', err);
                showToast('Error loading Trade Transfers page.', 'error');
            }
        } else if (pageId === 'reports') {
            try {
                initReports();
            } catch (err) {
                console.error('Error initializing Reports page:', err);
                showToast('Error loading Reports page.', 'error');
            }
        } else if (pageId === 'settings') {
            try {
                renderAccounts(accounts, settings.activeAccountId);
                renderPairs(pairs);
                renderTradingWindowForm();
            } catch (err) {
                console.error('Error initializing Settings page:', err);
                showToast('Error loading Settings page.', 'error');
            }
        } else if (pageId === 'add-trade') {
            try {
                initializeTradeForm();
            } catch (err) {
                console.error('Error initializing Add Trade page:', err);
                showToast('Error loading Add Trade page.', 'error');
            }
        }
    }

    // Ensure DOM is ready before manipulating pages
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        hideAllPages();
        showPage('dashboard');
    } else {
        console.log('DOM not ready, waiting for DOMContentLoaded');
        document.addEventListener('DOMContentLoaded', () => {
            hideAllPages();
            showPage('dashboard');
        });
    }

    // Add event listener for navigation clicks with retry hide
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (link) {
            if (link.dataset.bsToggle === 'tab') {
                console.log('Tab click ignored:', link.id);
                return;
            }
            e.preventDefault();
            const pageId = link.dataset.page;
            if (pageId) {
                showPage(pageId);
                // Retry hiding Reports after a short delay to catch overrides
                setTimeout(() => {
                    const reportsPage = document.getElementById('reports');
                    if (reportsPage && pageId !== 'reports' && reportsPage.style.display !== 'none') {
                        reportsPage.style.display = 'none';
                        reportsPage.style.opacity = '0';
                        reportsPage.style.visibility = 'hidden';
                        reportsPage.style.zIndex = '-1';
                        console.log('Retry hid Reports page after navigation');
                    }
                }, 100);
            } else {
                console.warn('Nav link missing data-page attribute:', link);
            }
        }
    });
}

function updateFormProgress() {
    const form = document.getElementById('trade-form');
    if (!form) {
        console.warn('Trade form not found in DOM');
        return;
    }
    const requiredFields = form.querySelectorAll('input[required], select[required]');
    const filledFields = Array.from(requiredFields).filter(field => field.value.trim() !== '').length;
    const progress = (filledFields / requiredFields.length) * 100;
    console.log(`Updating form progress: ${filledFields}/${requiredFields.length} fields filled, progress: ${progress}%`);
    const progressBar = document.getElementById('form-progress');
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        progressBar.setAttribute('aria-valuenow', progress);
        progressBar.classList.remove('progress-bar-animated', 'progress-bar-striped', 'bg-success', 'bg-warning');
        progressBar.classList.add('bg-primary');
        progressBar.offsetWidth;
    } else {
        console.warn('Form progress bar not found in DOM');
    }
}

export function validateField(field) {
    console.log(`Validating field: ${field.id}, value: "${field.value}", required: ${field.required}`);

    // Handle hidden tag inputs
    if (field.id === 'detail-emotion-tags-value' || field.id === 'detail-mistakes-tags-value') {
        const isRequired = field.id === 'detail-emotion-tags-value'; // Emotions required, mistakes optional
        const isValid = isRequired ? field.value.trim() !== '' : true;
        field.classList.toggle('is-valid', isValid);
        field.classList.toggle('is-invalid', !isValid);
        // Update visible tag container
        const tagContainer = document.getElementById(field.id.replace('-value', ''));
        if (tagContainer) {
            tagContainer.classList.toggle('is-valid', isValid);
            tagContainer.classList.toggle('is-invalid', !isValid);
        }
        console.log(`Tag input ${field.id} validation: ${isValid ? 'valid' : 'invalid'}`);
        return isValid;
    }

    // Handle exit reason with custom input
    if (field.id === 'detail-exit-reason') {
        const customInput = document.getElementById('detail-exit-reason-custom');
        if (field.value === 'Other') {
            const isValid = customInput && customInput.value.trim() !== '';
            field.classList.toggle('is-valid', isValid);
            field.classList.toggle('is-invalid', !isValid);
            customInput.classList.toggle('is-valid', isValid);
            customInput.classList.toggle('is-invalid', !isValid);
            console.log(`Exit Reason (Other) validation: ${isValid ? 'valid' : 'invalid'}, Custom Value: "${customInput.value}"`);
            return isValid;
        }
        // For non-"Other" selections, validate as usual
        if (field.required && !field.value.trim()) {
            field.classList.remove('is-valid');
            field.classList.add('is-invalid');
            console.log(`Required field ${field.id} invalid: empty`);
            return false;
        }
        field.classList.remove('is-invalid');
        field.classList.add('is-valid');
        console.log(`Field ${field.id} valid`);
        return true;
    }

    // Handle adherence rating (used in add-trade form)
    if (field.id === 'adherence-value' && !field.value.trim()) {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        console.log('Adherence rating invalid: empty');
        return false;
    }

    // Handle required fields
    if (field.required && !field.value.trim()) {
        field.classList.remove('is-valid');
        field.classList.add('is-invalid');
        console.log(`Required field ${field.id} invalid: empty`);
        return false;
    }

    // Handle number fields
    if (field.type === 'number' && field.value) {
        if (isNaN(field.value) || (field.min && parseFloat(field.value) < field.min)) {
            field.classList.remove('is-valid');
            field.classList.add('is-invalid');
            console.log(`Number field ${field.id} invalid: value ${field.value}`);
            return false;
        }
    }

    // Handle setup score
    if (field.id === 'detail-setup-score') {
        const score = parseInt(field.value);
        if (score < 1 || score > 10) {
            field.classList.remove('is-valid');
            field.classList.add('is-invalid');
            console.log(`Setup score ${field.id} invalid: value ${field.value}`);
            return false;
        }
    }

    // For optional fields: only mark as valid if they have a value
    if (!field.required && !field.value.trim()) {
        field.classList.remove('is-valid');
        field.classList.remove('is-invalid');
        console.log(`Optional field ${field.id} empty: no validation border`);
        return true; // Still considered "valid" for progress purposes
    }

    // If field passes all checks, mark as valid
    field.classList.remove('is-invalid');
    field.classList.add('is-valid');
    console.log(`Field ${field.id} valid`);
    return true;
}

function initializeStarRating() {
    const starContainer = document.querySelector('div#adherence.star-rating');
    const adherenceValue = document.getElementById('adherence-value');

    if (!starContainer) {
        console.error('Star rating container not found: div#adherence.star-rating');
        return;
    }
    if (!adherenceValue) {
        console.error('Adherence value input not found: #adherence-value');
        return;
    }

    const stars = starContainer.querySelectorAll('.bi');
    if (stars.length === 0) {
        console.error('No star elements found in star-rating container');
        return;
    }

    adherenceValue.value = '';
    stars.forEach(s => {
        s.classList.add('bi-star');
        s.classList.remove('bi-star-fill');
    });

    stars.forEach(star => {
        const newStar = star.cloneNode(true);
        star.parentNode.replaceChild(newStar, star);
    });

    const newStars = starContainer.querySelectorAll('.bi');
    newStars.forEach(star => {
        star.addEventListener('click', () => {
            const value = parseInt(star.dataset.value);
            adherenceValue.value = '★'.repeat(value);
            newStars.forEach(s => {
                const starValue = parseInt(s.dataset.value);
                s.classList.toggle('bi-star-fill', starValue <= value);
                s.classList.toggle('bi-star', starValue > value);
            });
            validateField(adherenceValue);
            updateFormProgress();
        });
    });
}
export function updateModalProgress() {
    const form = document.getElementById('trade-details-form');
    if (!form) {
        console.error('Trade details form not found for progress update');
        return;
    }

    console.log('Updating modal progress');

    // Define progress items and their validation logic
    const progressItems = {
        summary: () => {
            const fields = [
                'detail-trade-type',
                'detail-timeframe',
                'detail-session',
                'detail-strategy',
                'detail-risk-plan',
                'detail-risk',
                'detail-lot-size',
                'detail-stop-loss',
                'detail-exit-reason',
                'detail-mood'
            ].map(id => document.getElementById(id));
            const setupScore = document.getElementById('detail-setup-score');
            const isValid = fields.every(field => field && validateField(field)) &&
                           setupScore && parseInt(setupScore.value) >= 1 && parseInt(setupScore.value) <= 10;
            console.log(`Summary section valid: ${isValid}`);
            return isValid;
        },
        emotions: () => {
            const field = document.getElementById('detail-emotion-tags-value');
            const isValid = field && validateField(field);
            console.log(`Emotions section valid: ${isValid}`);
            return isValid;
        },
        mistakes: () => {
            const field = document.getElementById('detail-mistakes-tags-value');
            const isValid = field && field.value.trim() !== ''; // Optional, valid if non-empty
            console.log(`Mistakes section valid: ${isValid}`);
            return isValid;
        },
        notes: () => {
            const notesField = document.getElementById('detail-trade-notes');
            const isValid = notesField && notesField.value.trim() !== '';
            console.log(`Notes section valid: ${isValid}`);
            return isValid;
        },
        screenshots: () => {
            const isValid = Array.from(document.querySelectorAll('#detail-image-uploads .image-row')).some(row => {
                const fileInput = row.querySelector('.image-file');
                const preview = row.querySelector('.image-preview');
                return (fileInput && fileInput.files?.length > 0) || (preview && !preview.classList.contains('d-none'));
            });
            console.log(`Screenshots section valid: ${isValid}`);
            return isValid;
        }
    };

    // Update progress circles
    Object.keys(progressItems).forEach(section => {
        const item = document.querySelector(`#progress-tracker .progress-item[data-section="${section}"] .progress-circle`);
        if (item) {
            const isCompleted = progressItems[section]();
            item.classList.toggle('completed', isCompleted);
            item.classList.toggle('incomplete', !isCompleted);
            console.log(`Progress item "${section}": ${isCompleted ? 'completed' : 'incomplete'}`);
        } else {
            console.warn(`Progress item for section "${section}" not found`);
        }
    });
}

window.updateModalProgress = updateModalProgress;

async function saveSingleTrade(trade) {
    console.time('saveSingleTrade');
    let retries = 0;
    const maxRetries = 2;
    while (retries <= maxRetries) {
        try {
            const db = getDB();
            const transaction = db.transaction(['trades'], 'readwrite');
            const tradesStore = transaction.objectStore('trades');

            await new Promise((resolve, reject) => {
                const request = tradesStore.put({
                    ...trade,
                    screenshots: trade.screenshots?.map(img => ({ ...img, url: undefined }))
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            });

            console.log('Single trade saved successfully');
            break;
        } catch (err) {
            retries++;
            if (retries > maxRetries) {
                console.error('Save single trade failed after retries:', err);
                throw err;
            }
            console.warn(`Retry ${retries}/${maxRetries} for saveSingleTrade`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    console.timeEnd('saveSingleTrade');
}

// Star Rating Logic for Adherence
const adherenceRating = document.querySelector('#adherence-rating');
if (adherenceRating) {
    const adherenceInputs = adherenceRating.querySelectorAll('input[name="adherence"]');
    const adherenceValueInput = document.getElementById('adherence-value');
    adherenceInputs.forEach(input => {
        input.addEventListener('change', () => {
            adherenceValueInput.value = input.value;
            console.log('Adherence rating set to:', input.value);
        });
    });
} else {
    console.warn('Adherence rating element not found in DOM');
}

function resetTradeForm() {
    const tradeForm = document.getElementById('trade-form');
    if (tradeForm) {
        tradeForm.reset(); // Reset all form inputs
        // Clear Adherence star rating
        const adherenceInputs = tradeForm.querySelectorAll('#adherence-rating input[name="adherence"]');
        adherenceInputs.forEach(input => input.checked = false);
        const adherenceValueInput = tradeForm.querySelector('#adherence-value');
        if (adherenceValueInput) adherenceValueInput.value = '';
        // Remove validation classes
        tradeForm.querySelectorAll('.is-invalid, .is-valid').forEach(el => {
            el.classList.remove('is-invalid', 'is-valid');
        });
        console.log('Trade form reset');
    } else {
        console.warn('Trade form not found during reset');
    }
}

let tradeFormInitialized = false;

function initializeTradeForm() {
    if (tradeFormInitialized) return;
    tradeFormInitialized = true;
    
    const tradeForm = document.getElementById('trade-form');
    const pairSelect = document.getElementById('pair');
    const strategySelect = document.getElementById('strategy');
    const accountSelect = document.getElementById('account');

    if (!tradeForm || !pairSelect || !strategySelect || !accountSelect) {
        console.error('Trade form elements missing:', {
            tradeForm: !!tradeForm,
            pairSelect: !!pairSelect,
            strategySelect: !!strategySelect,
            accountSelect: !!accountSelect
        });
        showToast('Error: Trade form elements not found. Please check index.html.', 'error');
        return;
    }

    // Function to update strategy dropdown based on pair's market type and account
    const updateStrategyOptions = () => {
        const accountId = parseInt(accountSelect.value);
        const pair = pairSelect.value;
        const pairMarketType = pairs.find(p => p.name === pair)?.market_type || 'forex';
        const filteredStrategies = strategies.filter(s => 
            s.accountId === accountId && s.marketType === pairMarketType
        );

        strategySelect.innerHTML = '<option value="">Select Strategy</option>' +
            filteredStrategies.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        console.log(`Updated strategy dropdown for pair "${pair}" (marketType: ${pairMarketType}, accountId: ${accountId}) with ${filteredStrategies.length} options`);
    };

    // Pair dropdown change listener
    pairSelect.addEventListener('change', () => {
        console.log('Pair dropdown changed:', pairSelect.value);
        updateStrategyOptions();
    });

    // Account dropdown change listener
    accountSelect.addEventListener('change', () => {
        console.log('Account dropdown changed:', accountSelect.value);
        updateStrategyOptions();
    });

    // Pre-fill trade form based on strategy
    strategySelect.addEventListener('change', () => {
        const strategyId = parseInt(strategySelect.value);
        const strategy = strategies.find(s => s.id === strategyId && s.accountId === parseInt(accountSelect.value));
        if (strategy) {
            const account = accounts.find(a => a.id === parseInt(accountSelect.value));
            if (account) {
                const plannedRiskInput = document.getElementById('detail-planned-risk');
                const stopLossInput = document.getElementById('detail-stop-loss');
                const plannedRrInput = document.getElementById('detail-planned-rr');
                if (plannedRiskInput) plannedRiskInput.value = strategy.riskSettings.riskPercent * account.initialBalance / 100;
                if (stopLossInput) stopLossInput.value = strategy.riskSettings.stopLossPips;
                if (plannedRrInput) plannedRrInput.value = strategy.riskSettings.rr;
            }
        }
    });

    // Initial population of strategy dropdown
    updateStrategyOptions();

    tradeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.time('tradeFormSubmit');
        console.log('Trade form submitted');
        const spinner = document.getElementById('trade-submit-spinner');
        if (spinner) spinner.classList.remove('d-none');

        tradeForm.querySelectorAll('.is-invalid, .is-valid').forEach(el => {
            el.classList.remove('is-invalid', 'is-valid');
        });

        try {
            const accountId = document.getElementById('account').value;
            console.log('Selected accountId:', accountId);
            const activeAccount = Array.isArray(accounts) ? accounts.find(a => a.id === parseInt(accountId)) : null;
            if (!activeAccount) {
                console.error('No valid account selected');
                showToast('Please select a valid account.', 'error');
                if (spinner) spinner.classList.add('d-none');
                return;
            }
            console.log('Active account:', activeAccount);

            const strategyId = parseInt(document.getElementById('strategy').value);
            const strategy = strategies.find(s => s.id === strategyId && s.accountId === parseInt(accountId));
            if (!strategy) {
                console.error('No valid strategy selected:', strategyId);
                showToast('Please select a valid strategy.', 'error');
                if (spinner) spinner.classList.add('d-none');
                return;
            }
            const pair = document.getElementById('pair').value;
            const pairMarketType = pairs.find(p => p.name === pair)?.market_type || 'forex';

            if (strategy && strategy.marketType !== pairMarketType) {
                showToast(`Strategy '${strategy.name}' is for ${strategy.marketType}, but pair '${pair}' is ${pairMarketType}.`, 'warning');
            }


            const trade = {
                id: Date.now(),
                accountId: parseInt(accountId),
                date: document.getElementById('date').value,
                tradeTime: document.getElementById('trade-time').value,
                pair,
                adherence: parseInt(document.getElementById('adherence-value').value) || 0,
                strategyId: strategy.id,
                tradeType: null,
                timeframe: null,
                setupScore: null,
                risk: strategy?.riskSettings.riskPercent * activeAccount.initialBalance / 100 || 0,
                plannedRisk: strategy?.riskSettings.riskPercent * activeAccount.initialBalance / 100 || 0,
                actualRisk: 0,
                plannedRR: strategy?.riskSettings.rr || 0,
                actualRR: 0,
                lotSize: null,
                stopLoss: strategy?.riskSettings.stopLossPips || 0,
                entryPrice: null,
                slPrice: null,
                exitPrice: null,
                holdTime: null,
                exitReason: null,
                session: null,
                mood: null,
                mistakes: [],
                emotions: [],
                customTags: [],
                notes: '',
                screenshots: [],
                outsideWindow: false,
                profitLoss: 0,
                balance: null,
                disciplineScore: 0,
            };

            console.log('Trade data:', trade);

            // Validate required fields
            const requiredFields = tradeForm.querySelectorAll('input[required], select[required]');
            let hasError = false;
            requiredFields.forEach(field => {
                if (!field.value.trim()) {
                    field.classList.add('is-invalid');
                    console.warn(`Validation failed for field: ${field.id}`);
                    hasError = true;
                } else {
                    field.classList.add('is-valid');
                }
            });

            if (!trade.adherence || trade.adherence < 1 || trade.adherence > 5) {
                const adherenceRating = document.getElementById('adherence-rating');
                if (adherenceRating) {
                    adherenceRating.classList.add('is-invalid');
                    console.warn('Adherence rating is missing or invalid');
                    hasError = true;
                }
            }

            if (hasError) {
                console.error('Form validation failed');
                showToast('Please fill all required fields.', 'error');
                if (spinner) spinner.classList.add('d-none');
                return;
            }

            console.log('Adding trade to trades array');
            trades.push(trade);
            console.log('Saving trade to IndexedDB');
            await saveSingleTrade(trade);
            console.log('Trade saved, updating UI');

            // Update strategy lastUsed if applicable
            if (strategy) {
                strategy.lastUsed = trade.date;
                await saveData();
            }

            // Update active account ID to match the trade's account
            settings.activeAccountId = parseInt(accountId);
            await saveData();
            console.log('Updated activeAccountId:', settings.activeAccountId);

            const filteredTrades = trades.filter(t => t.accountId === settings.activeAccountId);
            renderAccounts(accounts, settings.activeAccountId);
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);

            resetTradeForm();

            showToast('Trade added successfully! Add details next.', 'success');
            console.log('Opening trade details modal');
            showTradeDetails(filteredTrades.length - 1, filteredTrades, reflections, strategies, [], settings, async (updatedTrade, updatedReflection) => {
                if (!updatedTrade.id) {
                    console.warn(`Updated trade missing id, assigning new id`);
                    updatedTrade.id = filteredTrades[filteredTrades.length - 1].id || Date.now();
                }
                updatedTrade.accountId = parseInt(accountId);
                updatedTrade.strategyId = strategy.id;
                updatedReflection.accountId = parseInt(accountId);
                console.log('Saving updated trade and reflection:', updatedTrade, updatedReflection);
                trades[trades.findIndex(t => t.id === updatedTrade.id)] = updatedTrade;
                const reflectionIndex = reflections.findIndex(r => r.tradeId === updatedTrade.id && r.accountId === settings.activeAccountId);
                if (reflectionIndex !== -1) {
                    reflections[reflectionIndex] = updatedReflection;
                } else {
                    reflections.push(updatedReflection);
                }
                balance = null;
                await saveSingleTradeAndReflection(updatedTrade, updatedReflection);
                const sortSelect = document.getElementById('sort-select');
                const preservedFilters = {
                    sort: sortSelect?.value || currentFilters.sort || 'date'
                };
                const start = (currentPage - 1) * recordsPerPage;
                const end = Math.min(start + recordsPerPage, cachedFilteredTrades.length);
                if ((filteredTrades.length - 1) >= start && (filteredTrades.length - 1) < end) {
                    renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, preservedFilters, activeAccount, settings.activeAccountId);
                }
                currentFilters = preservedFilters;
                if (sortSelect) sortSelect.value = preservedFilters.sort;
                renderAccounts(accounts, settings.activeAccountId);
                showToast('Trade details updated successfully!', 'success');
                new bootstrap.Modal(document.getElementById('reflectionModal')).hide();
            }, settings.activeAccountId);
        } catch (err) {
            console.error('Trade submission error:', err);
            showToast(`Error saving trade: ${err.message}`, 'error');
        } finally {
            if (spinner) spinner.classList.add('d-none');
            console.timeEnd('tradeFormSubmit');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderStrategies(strategies, settings.activeAccountId);
    renderPairs(pairs);
});





const statsDate = document.getElementById('stats-date');
if (statsDate) {
    statsDate.addEventListener('change', (e) => {
        const selectedDate = e.target.value;
        if (selectedDate) {
            renderDailyStats(trades, selectedDate, settings.activeAccountId);
            console.log('Rendered daily stats for:', selectedDate);
        }
    });
} else {
    console.warn('Stats date input not found in DOM');
}

function validateConditionRow(row) {
    if (!row || typeof row !== 'object') {
        console.warn('Invalid row passed to validateConditionRow:', row);
        return false;
    }
    if (row instanceof HTMLElement) {
        const type = row.querySelector('.condition-type')?.value?.trim();
        const description = row.querySelector('.condition-description')?.value?.trim();
        const isValid = !!type && !!description;
        console.log('Validated condition row:', { type, description, isValid });
        return isValid;
    }
    const isValid = !!row.type?.trim() && !!row.description?.trim();
    console.log('Validated condition row:', { type: row.type, description: row.description, isValid });
    return isValid;
}

function addCondition(container, type) {
    const row = document.createElement('div');
    row.className = 'condition-row mb-3';
    const index = container.querySelectorAll('.condition-row').length;
    row.innerHTML = `
        <div class="row g-2 align-items-end">
            <div class="col-md-3">
                <label class="form-label">${type === 'entry' ? 'Entry' : 'Exit'} Condition Type</label>
                <select class="form-control condition-type" id="${type}-condition-type-${index}">
                    <option value="">Select Type</option>
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label">Description</label>
                <input type="text" class="form-control condition-description" id="${type}-condition-description-${index}">
            </div>
            <div class="col-md-3">
                <label class="form-label">Parameters</label>
                <input type="text" class="form-control condition-params" id="${type}-condition-params-${index}">
            </div>
            <div class="col-md-2">
                <button type="button" class="btn btn-danger btn-sm remove-condition">Remove</button>
            </div>
        </div>
    `;
    container.appendChild(row);
    updateConditionDropdowns(); // Populate dropdowns after adding row
    console.log(`Added ${type} condition row, index: ${index}`);
    
    // Add remove button listener
    row.querySelector('.remove-condition').addEventListener('click', () => {
        row.remove();
        updateAddButtonStates();
        updateConditionDropdowns();
        console.log(`Removed ${type} condition row, index: ${index}`);
    });
    
    // Add validation listeners
    row.querySelectorAll('.condition-type, .condition-description').forEach(input => {
        input.addEventListener('input', () => {
            updateAddButtonStates();
            console.log(`Input changed in ${type} condition row: ${input.id}`);
        });
    });
}

const strategyForm = document.getElementById('strategy-form');
if (strategyForm) {
    strategyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Strategy form submitted');

        strategyForm.querySelectorAll('.is-invalid, .is-valid').forEach(el => {
            el.classList.remove('is-invalid', 'is-valid');
        });

        const accountId = parseInt(document.getElementById('account')?.value || '');
        const activeAccount = accounts.find(a => a.id === accountId);
        if (!activeAccount) {
            showToast('Please select a valid account.', 'error');
            console.warn('Validation failed: No active account');
            return;
        }

        const name = document.getElementById('strategy-name')?.value.trim() || '';
        const description = document.getElementById('strategy-description')?.value.trim() || '';
        const marketType = document.getElementById('strategy-market-type')?.value || '';
        const timeframesSelect = document.getElementById('strategy-timeframes');
        const timeframes = timeframesSelect ? Array.from(timeframesSelect.selectedOptions).map(opt => opt.value) : [];
        const tags = document.getElementById('strategy-tags-value')?.value.split(',').filter(t => t.trim()) || [];
        const entryConditions = Array.from(document.querySelectorAll('#entry-conditions .condition-row')).map(row => ({
            id: `cond${Date.now()}${Math.random()}`,
            type: row.querySelector('.condition-type')?.value || '',
            description: row.querySelector('.condition-description')?.value.trim() || '',
            params: row.querySelector('.condition-params')?.value.trim() ? { value: row.querySelector('.condition-params').value.trim() } : {}
        }));
        const exitConditions = Array.from(document.querySelectorAll('#exit-conditions .condition-row')).map(row => ({
            id: `cond${Date.now()}${Math.random()}`,
            type: row.querySelector('.condition-type')?.value || '',
            description: row.querySelector('.condition-description')?.value.trim() || '',
            params: row.querySelector('.condition-params')?.value.trim() ? { value: row.querySelector('.condition-params').value.trim() } : {}
        }));
        const riskSettings = {
            riskPercent: parseFloat(document.getElementById('risk-percent')?.value) || 0.5,
            stopLossPips: parseInt(document.getElementById('stop-loss-pips')?.value) || 10,
            rr: parseFloat(document.getElementById('risk-reward')?.value) || 2
        };

        console.log('Form values:', {
            accountId,
            name,
            description,
            marketType,
            timeframes,
            tags,
            entryConditions,
            exitConditions,
            riskSettings,
            conditionTypes: settings.conditionTypes
        });

        const requiredFields = [
            { id: 'account', value: accountId, label: 'Account' },
            { id: 'strategy-name', value: name, label: 'Strategy Name' },
            { id: 'strategy-description', value: description, label: 'Description' },
            { id: 'strategy-market-type', value: marketType, label: 'Market Type' },
            { id: 'strategy-timeframes', value: timeframes.length ? 'valid' : '', label: 'Timeframes' }
        ];
        let hasError = false;
        requiredFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (!field.value) {
                if (element) {
                    element.classList.add('is-invalid');
                    console.warn(`Validation failed for ${field.label}: Value is empty`);
                    showToast(`${field.label} is required.`, 'error');
                } else {
                    console.warn(`Validation failed for ${field.label}: Element #${field.id} not found`);
                }
                hasError = true;
            } else if (element) {
                element.classList.add('is-valid');
                console.log(`Validation passed for ${field.label}: Value = ${field.value}`);
            }
        });

        if (!entryConditions.length) {
            showToast('At least one entry condition is required.', 'error');
            console.warn('Validation failed: No entry conditions');
            hasError = true;
        } else {
            entryConditions.forEach((cond, i) => {
                if (!cond.type || !cond.description) {
                    showToast(`Entry condition ${i + 1} is incomplete.`, 'error');
                    console.warn(`Validation failed: Entry condition ${i + 1} incomplete`, cond);
                    hasError = true;
                    const row = document.querySelectorAll('#entry-conditions .condition-row')[i];
                    if (row) {
                        if (!cond.type) row.querySelector('.condition-type')?.classList.add('is-invalid');
                        if (!cond.description) row.querySelector('.condition-description')?.classList.add('is-invalid');
                    }
                }
            });
            console.log('Entry conditions validated:', entryConditions.length);
        }
        if (!exitConditions.length) {
            showToast('At least one exit condition is required.', 'error');
            console.warn('Validation failed: No exit conditions');
            hasError = true;
        } else {
            exitConditions.forEach((cond, i) => {
                if (!cond.type || !cond.description) {
                    showToast(`Exit condition ${i + 1} is incomplete.`, 'error');
                    console.warn(`Validation failed: Exit condition ${i + 1} incomplete`, cond);
                    hasError = true;
                    const row = document.querySelectorAll('#exit-conditions .condition-row')[i];
                    if (row) {
                        if (!cond.type) row.querySelector('.condition-type')?.classList.add('is-invalid');
                        if (!cond.description) row.querySelector('.condition-description')?.classList.add('is-invalid');
                    }
                }
            });
            console.log('Exit conditions validated:', exitConditions.length);
        }

        const invalidEntryTypes = entryConditions.filter(c => c.type && !settings.conditionTypes.includes(c.type));
        const invalidExitTypes = exitConditions.filter(c => c.type && !settings.conditionTypes.includes(c.type));
        if (invalidEntryTypes.length || invalidExitTypes.length) {
            showToast('Invalid condition types detected.', 'error');
            console.warn('Validation failed: Invalid condition types', { invalidEntryTypes, invalidExitTypes });
            hasError = true;
        }

        if (hasError) {
            console.error('Form validation failed');
            showToast('Please fill all required fields and conditions.', 'error');
            return;
        }

        if (strategies.some(s => s.name === name && s.accountId === accountId && s.id !== editingStrategyId)) {
            showToast('Strategy name already exists for this account.', 'error');
            console.warn(`Validation failed: Strategy name "${name}" already exists`);
            return;
        }

        const strategy = {
            id: editingStrategyId || Date.now(),
            accountId,
            name,
            description,
            marketType,
            timeframes,
            tags,
            entryConditions,
            exitConditions,
            riskSettings,
            createdAt: editingStrategyId ? strategies.find(s => s.id === editingStrategyId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
            lastUsed: editingStrategyId ? strategies.find(s => s.id === editingStrategyId)?.lastUsed || null : null
        };

        if (editingStrategyId) {
            const index = strategies.findIndex(s => s.id === editingStrategyId);
            strategies[index] = strategy;
            editingStrategyId = null;
            document.getElementById('update-strategy')?.classList.add('d-none');
            document.getElementById('cancel-strategy-update')?.classList.add('d-none');
            strategyForm.querySelector('button[type="submit"]').classList.remove('d-none');
            showToast('Strategy updated successfully!', 'success');
        } else {
            strategies.push(strategy);
            showToast('Strategy added successfully!', 'success');
        }

        await saveData();
        renderStrategies(strategies, settings.activeAccountId,accounts,trades);

        strategyForm.reset();
        document.getElementById('entry-conditions').innerHTML = '';
        document.getElementById('exit-conditions').innerHTML = '';
        const timeframesSelectReset = document.getElementById('strategy-timeframes');
        Array.from(timeframesSelectReset.options).forEach(opt => opt.selected = false);
      
        initializeStrategyForm();
        console.log('Form reset after submission');
    });

    document.getElementById('update-strategy')?.addEventListener('click', async () => {
        console.log('Update strategy button clicked');
        strategyForm.dispatchEvent(new Event('submit'));
    });

    document.getElementById('cancel-strategy-update')?.addEventListener('click', () => {
        console.log('Cancel strategy update clicked');
        editingStrategyId = null;
        strategyForm.reset();
        document.getElementById('entry-conditions').innerHTML = '';
        document.getElementById('exit-conditions').innerHTML = '';
        const timeframesSelect = document.getElementById('strategy-timeframes');
        Array.from(timeframesSelect.options).forEach(opt => opt.selected = false);
        const tagContainer = document.getElementById('strategy-tags');
        const tagInput = document.getElementById('strategy-tags-value');
        if (tagContainer && tagInput) {
            tagContainer.innerHTML = '';
            tagInput.value = '';
            const tagManager = new TagManager('strategy-tags', 'strategy-tags-value', [], 'strategy-new-tag');
            tagManager.init([], strategies.flatMap(s => s.tags));
            console.log('Cleared and reinitialized tags on cancel');
        }
        initializeStrategyForm();
        document.getElementById('update-strategy')?.classList.add('d-none');
        document.getElementById('cancel-strategy-update')?.classList.add('d-none');
        strategyForm.querySelector('button[type="submit"]').classList.remove('d-none');
        console.log('Form reset after cancel');
    });
} else {
    console.warn('Strategy form element not found in DOM');
}


document.getElementById('strategy-list')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-strategy');
    const deleteBtn = e.target.closest('.delete-strategy');
    const viewBtn = e.target.closest('.view-strategy');
    const duplicateBtn = e.target.closest('.duplicate-strategy');

    if (editBtn) {
        const id = parseInt(editBtn.dataset.id);
        editingStrategyId = id;
        const strategy = strategies.find(s => s.id === id);
        if (!strategy) {
            showToast('Error: Strategy not found.', 'error');
            console.error('Strategy not found for edit, ID:', id);
            return;
        }

        // Ensure strategy form is initialized
        const form = document.getElementById('strategy-form');
        if (!form) {
            showToast('Error: Strategy form not found.', 'error');
            console.error('Strategy form element not found in DOM');
            return;
        }
        initializeStrategyForm(); // Re-initialize form to ensure elements are present

        // Populate form fields
        const elements = {
            'strategy-name': document.getElementById('strategy-name'),
            'strategy-description': document.getElementById('strategy-description'),
            'strategy-market-type': document.getElementById('strategy-market-type'),
            'strategy-timeframes': document.getElementById('strategy-timeframes'),
            account: document.getElementById('account'),
            'risk-percent': document.getElementById('risk-percent'),
            'stop-loss-pips': document.getElementById('stop-loss-pips'),
            'risk-reward': document.getElementById('risk-reward'),
            'strategy-tags-value': document.getElementById('strategy-tags-value')
        };

        // Log missing elements
        for (const [key, element] of Object.entries(elements)) {
            if (!element) {
                console.error(`Form element not found: ${key}`);
            }
        }

        // Set form values with null checks
        if (elements['strategy-name']) elements['strategy-name'].value = strategy.name || '';
        if (elements['strategy-description']) elements['strategy-description'].value = strategy.description || '';
        if (elements['strategy-market-type']) elements['strategy-market-type'].value = strategy.marketType || '';
        if (elements['strategy-timeframes']) {
            Array.from(elements['strategy-timeframes'].options).forEach(opt => {
                opt.selected = strategy.timeframes?.includes(opt.value) || false;
            });
        }
        if (elements.account) elements.account.value = strategy.accountId || '';
        if (elements['risk-percent']) elements['risk-percent'].value = strategy.riskSettings?.riskPercent || 0.5;
        if (elements['stop-loss-pips']) elements['stop-loss-pips'].value = strategy.riskSettings?.stopLossPips || 10;
        if (elements['risk-reward']) elements['risk-reward'].value = strategy.riskSettings?.rr || 2;
        if (elements['strategy-tags-value']) {
            elements['strategy-tags-value'].value = strategy.tags?.join(',') || '';
            strategyTagManager.init(strategy.tags || [], strategies.flatMap(s => s.tags));
        }

        const entryConditionsContainer = document.getElementById('entry-conditions');
        const exitConditionsContainer = document.getElementById('exit-conditions');
        if (!entryConditionsContainer || !exitConditionsContainer) {
            showToast('Error: Condition containers not found.', 'error');
            console.error('Missing condition containers:', {
                entryConditionsContainer: !!entryConditionsContainer,
                exitConditionsContainer: !!exitConditionsContainer
            });
            return;
        }

        entryConditionsContainer.innerHTML = '';
        exitConditionsContainer.innerHTML = '';
        strategy.entryConditions.forEach(cond => {
            const row = document.createElement('div');
            row.className = 'condition-row mb-3';
            row.innerHTML = `
                <div class="row g-2">
                    <div class="col-md-3">
                        <select class="form-select condition-type" required>
                            <option value="">Select Type</option>
                            ${settings.conditionTypes.map(type => `<option value="${type}" ${cond.type === type ? 'selected' : ''}>${type}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <input type="text" class="form-control condition-description" value="${cond.description || ''}" required>
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control condition-params" value="${cond.params?.value || ''}">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-danger btn-sm remove-condition"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            `;
            entryConditionsContainer.appendChild(row);
            row.querySelector('.remove-condition').addEventListener('click', () => row.remove());
        });
        strategy.exitConditions.forEach(cond => {
            const row = document.createElement('div');
            row.className = 'condition-row mb-3';
            row.innerHTML = `
                <div class="row g-2">
                    <div class="col-md-3">
                        <select class="form-select condition-type" required>
                            <option value="">Select Type</option>
                            ${settings.conditionTypes.map(type => `<option value="${type}" ${cond.type === type ? 'selected' : ''}>${type}</option>`).join('')}
                        </select>
                    </div>
                    <div class="col-md-6">
                        <input type="text" class="form-control condition-description" value="${cond.description || ''}" required>
                    </div>
                    <div class="col-md-2">
                        <input type="text" class="form-control condition-params" value="${cond.params?.value || ''}">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-danger btn-sm remove-condition"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
            `;
            exitConditionsContainer.appendChild(row);
            row.querySelector('.remove-condition').addEventListener('click', () => row.remove());
        });

        if (form.querySelector('button[type="submit"]')) {
            form.querySelector('button[type="submit"]').classList.add('d-none');
        }
        if (document.getElementById('update-strategy')) {
            document.getElementById('update-strategy').classList.remove('d-none');
        }
        if (document.getElementById('cancel-strategy-update')) {
            document.getElementById('cancel-strategy-update').classList.remove('d-none');
        }

        // Auto-scroll to strategy form and update dropdowns
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        console.log(`Editing strategy: ${id}, scrolled to form`);
        updateConditionDropdowns(); // Call global function
    }

    if (deleteBtn) {
        const id = parseInt(deleteBtn.dataset.id);
        const strategy = strategies.find(s => s.id === id);
        if (!strategy) {
            showToast('Error: Strategy not found.', 'danger');
            console.error('Strategy not found for deletion, ID:', id);
            return;
        }
        if (trades.some(t => t.strategyId === strategy.id && t.accountId === strategy.accountId)) {
            showToast('Cannot delete strategy used in trades.', 'danger');
            console.warn(`Cannot delete strategy ${id}: Used in trades`);
            return;
        }
        const modalElement = document.getElementById('deleteStrategyModal');
        const modal = new bootstrap.Modal(modalElement);
        console.log('Opened delete modal for strategy:', id);
        const confirmButton = document.getElementById('confirm-delete-strategy');
        confirmButton.onclick = async () => {
            let isSaving = false;
            try {
                isSaving = true;
                // Save strategy to deleted store for undo
                const deletedStrategy = { ...strategy, deletedAt: Date.now() };
                const db = getDB();
                const transaction = db.transaction(['strategies', 'deleted'], 'readwrite');
                const stores = {
                    strategies: transaction.objectStore('strategies'),
                    deleted: transaction.objectStore('deleted')
                };

                // Delete from strategies store
                await new Promise((resolve, reject) => {
                    const request = stores.strategies.delete(id);
                    request.onsuccess = () => {
                        console.log('Strategy deleted from strategies store:', id);
                        resolve();
                    };
                    request.onerror = () => reject(request.error);
                });

                // Save to deleted store
                await new Promise((resolve, reject) => {
                    const request = stores.deleted.put({ id: `strategy_${id}`, data: deletedStrategy });
                    request.onsuccess = () => {
                        console.log('Strategy saved to deleted store:', id);
                        resolve();
                    };
                    request.onerror = () => reject(request.error);
                });

                // Update in-memory array
                strategies = strategies.filter(s => s.id !== id);
                console.log('Updated in-memory strategies, remaining:', strategies.length);

                // Save other data to ensure consistency
                await saveData();

                // Render updated strategy list
                console.log('Rendering strategies after deletion:', strategies.length);
                renderStrategies(strategies, settings.activeAccountId, accounts, trades);

                // Show toast with undo option
                setTimeout(() => {
                    showToast('Strategy deleted successfully! Click Undo to restore.', 'success', {
                        duration: 5000,
                        callback: async () => {
                            if (isSaving) {
                                console.warn('Restore attempted while deletion is still saving');
                                showToast('Please wait and try again.', 'error');
                                return;
                            }
                            try {
                                console.time('restoreStrategy');
                                const restoreTransaction = db.transaction(['strategies', 'deleted'], 'readwrite');
                                const restoreStores = {
                                    strategies: restoreTransaction.objectStore('strategies'),
                                    deleted: restoreTransaction.objectStore('deleted')
                                };

                                // Restore to strategies store
                                await new Promise((resolve, reject) => {
                                    const request = restoreStores.strategies.put(deletedStrategy);
                                    request.onsuccess = () => {
                                        console.log('Strategy restored to strategies store:', id);
                                        resolve();
                                    };
                                    request.onerror = () => reject(request.error);
                                });

                                // Remove from deleted store
                                await new Promise((resolve, reject) => {
                                    const request = restoreStores.deleted.delete(`strategy_${id}`);
                                    request.onsuccess = () => {
                                        console.log('Strategy removed from deleted store:', id);
                                        resolve();
                                    };
                                    request.onerror = () => reject(request.error);
                                });

                                // Update in-memory array
                                strategies.push(deletedStrategy);
                                strategies.sort((a, b) => a.id - b.id);
                                console.log('Restored strategy, updated strategies:', strategies.length);

                                await saveData();
                                console.log('Rendering strategies after restore:', strategies.length);
                                renderStrategies(strategies, settings.activeAccountId, accounts, trades);
                                showToast('Strategy restored successfully!', 'success');
                                console.timeEnd('restoreStrategy');
                            } catch (err) {
                                showToast('Error restoring strategy.', 'error');
                                console.error('Restore error:', err);
                            }
                        }
                    });
                }, 100);
            } catch (err) {
                showToast('Error deleting strategy.', 'error');
                console.error('Delete error:', err);
                strategies.push(strategy);
                strategies.sort((a, b) => a.id - b.id);
                console.log('Restored strategy due to deletion error:', strategies.length);
                renderStrategies(strategies, settings.activeAccountId, accounts, trades);
            } finally {
                isSaving = false;
                try {
                    modal.hide();
                    console.log('Closed delete modal for strategy:', id);
                } catch (modalErr) {
                    console.warn('Error hiding modal, forcing closure:', modalErr);
                    modalElement.classList.remove('show', 'fade');
                    modalElement.style.display = 'none';
                    modalElement.style.opacity = '0';
                    modalElement.removeAttribute('aria-modal');
                    modalElement.setAttribute('aria-hidden', 'true');
                    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.body.style.paddingRight = '';
                }
            }
        };
        modal.show();
    }

    if (viewBtn) {
        const id = parseInt(viewBtn.dataset.id);
        const strategy = strategies.find(s => s.id === id);
        if (strategy) {
            const modal = document.getElementById('strategyDetailsModal');
            const body = modal.querySelector('.modal-body');
            const strategyTrades = trades.filter(t => t.strategyId === strategy.id && t.accountId === settings.activeAccountId);
            const metrics = calculateStrategyMetrics(strategyTrades, strategy.name);
            console.log(`View strategy modal: Strategy "${strategy.name}" (ID: ${id}), Trades:`, strategyTrades.length, strategyTrades.map(t => ({ id: t.id, strategyId: t.strategyId, accountId: t.accountId, outcome: t.outcome, profitLoss: t.profitLoss })));

            body.innerHTML = `<div class="stratdetail-container">
                <h6 class="stratdetail-title"><i class="bi bi-bar-chart-line me-2"></i>${strategy.name}</h6>
                <div class="stratdetail-section">
                    <h6 class="stratdetail-section-title">General Information</h6>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-person-circle me-1"></i>Account:</span>
                        <span class="stratdetail-value">${accounts.find(a => a.id === strategy.accountId)?.name || 'Unknown'}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-text-paragraph me-1"></i>Description:</span>
                        <span class="stratdetail-value">${strategy.description || 'None'}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-globe me-1"></i>Market Type:</span>
                        <span class="stratdetail-value">${strategy.marketType}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-clock me-1"></i>Timeframes:</span>
                        <span class="stratdetail-value">${strategy.timeframes.join(', ')}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-tags-fill me-1"></i>Tags:</span>
                        <span class="stratdetail-value">${strategy.tags.join(', ') || 'None'}</span>
                    </div>
                </div>
                <div class="stratdetail-section">
                    <h6 class="stratdetail-section-title">Conditions</h6>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-box-arrow-in-right me-1"></i>Entry Conditions:</span>
                        <span class="stratdetail-value">${strategy.entryConditions.map(c => `${c.type}: ${c.description} ${c.params?.value ? `(${c.params.value})` : ''}`).join('; ')}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-box-arrow-right me-1"></i>Exit Conditions:</span>
                        <span class="stratdetail-value">${strategy.exitConditions.map(c => `${c.type}: ${c.description} ${c.params?.value ? `(${c.params.value})` : ''}`).join('; ')}</span>
                    </div>
                </div>
                <div class="stratdetail-section">
                    <h6 class="stratdetail-section-title">Risk and Performance</h6>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-shield-check me-1"></i>Risk Settings:</span>
                        <span class="stratdetail-value">Risk: ${strategy.riskSettings.riskPercent}%, SL: ${strategy.riskSettings.stopLossPips} pips, RR: ${strategy.riskSettings.rr}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-graph-up me-1"></i>Performance:</span>
                        <span class="stratdetail-value">Trades: ${metrics.totalTrades}, Win Rate: ${metrics.winRate}%, Net P&L: $${metrics.netPnL}</span>
                    </div>
                </div>
                <div class="stratdetail-section">
                    <h6 class="stratdetail-section-title">Timeline</h6>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-calendar me-1"></i>Created:</span>
                        <span class="stratdetail-value">${new Date(strategy.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="stratdetail-row">
                        <span class="stratdetail-label"><i class="bi bi-clock-history me-1"></i>Last Used:</span>
                        <span class="stratdetail-value">${strategy.lastUsed ? new Date(strategy.lastUsed).toLocaleDateString() : 'Never'}</span>
                    </div>
                </div>
            </div>`;
            new bootstrap.Modal(modal).show();
            console.log(`Opened view modal for strategy: ${id}`);
        } else {
            showToast('Error: Strategy not found.', 'error');
            console.error('Strategy not found for view, ID:', id);
        }
    }

    if (duplicateBtn) {
        const id = parseInt(duplicateBtn.dataset.id);
        const strategy = strategies.find(s => s.id === id);
        if (strategy) {
            const newStrategy = {
                ...strategy,
                id: Date.now(),
                name: `${strategy.name} (Copy)`,
                createdAt: new Date().toISOString(),
                lastUsed: null
            };
            strategies.push(newStrategy);
            await saveData();
            console.log('Rendering strategies after duplication:', strategies.length);
            renderStrategies(strategies, settings.activeAccountId,accounts,trades);
            showToast('Strategy duplicated successfully!', 'success');
            console.log(`Duplicated strategy: ${id} to ${newStrategy.id}`);
        } else {
            showToast('Error: Strategy not found.', 'error');
            console.error('Strategy not found for duplicate, ID:', id);
        }
    }
});

// New function to render Trading Window form
function renderTradingWindowForm() {
    const startInput = document.getElementById('window-start');
    const endInput = document.getElementById('window-end');
    if (startInput && endInput) {
        startInput.value = settings.tradingWindow.start || '';
        endInput.value = settings.tradingWindow.end || '';
        console.log('Rendered Trading Window form:', settings.tradingWindow);
    } else {
        console.warn('Trading Window form inputs not found in DOM');
    }
}

// Update tradingWindowForm event listener
const tradingWindowForm = document.getElementById('trading-window-form');
if (tradingWindowForm) {
    tradingWindowForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Trading window form submitted');
        settings.tradingWindow = {
            start: document.getElementById('window-start').value || null,
            end: document.getElementById('window-end').value || null
        };
        await saveData();
        renderTradingWindowForm(); // Update form with saved values
        showToast('Trading window saved successfully!', 'success');
    });
} else {
    console.warn('Trading window form not found in DOM');
}

const accountForm = document.getElementById('account-form');
    if (accountForm) {
        let editingAccountId = null;

        // processAccount function
        async function processAccount(account, isUpdate) {
            console.log('Processing account:', { account, isUpdate, editingAccountId });
            if (!account.name || isNaN(account.initialBalance) || account.initialBalance <= 0 ||
                isNaN(account.dailyDrawdown) || account.dailyDrawdown < 0 || account.dailyDrawdown > 100 ||
                isNaN(account.maxTradesPerDay) || account.maxTradesPerDay < 1 ||
                isNaN(account.maxLossPerDay) || account.maxLossPerDay < 0 || account.maxLossPerDay > 100) {
                showToast('Please fill all required fields with valid values.', 'error');
                return false;
            }

            if (account.isPropFirm) {
                if (isNaN(account.maxDrawdown) || account.maxDrawdown < 0 || account.maxDrawdown > 100 ||
                    isNaN(account.profitSplit) || account.profitSplit < 0 || account.profitSplit > 100) {
                    showToast('Please fill prop firm fields with valid values.', 'error');
                    return false;
                }
            } else {
                account.maxDrawdown = 0;
                account.profitSplit = 0;
            }

            if (account.brokerId && isNaN(account.brokerId)) {
                showToast('Invalid broker selected.', 'error');
                return false;
            }

            const accountsList = await loadFromStore('accounts');
            if (accountsList.some(a => a.name.toLowerCase() === account.name.toLowerCase() && a.id !== editingAccountId)) {
                showToast('Account name already exists.', 'error');
                return false;
            }

            try {
                if (isUpdate && editingAccountId) {
                    const existingAccountIndex = accounts.findIndex(a => a.id === editingAccountId);
                    if (existingAccountIndex === -1) {
                        showToast('Error: Account not found for update.', 'error');
                        return false;
                    }
                    accounts[existingAccountIndex] = {
                        ...accounts[existingAccountIndex],
                        ...account,
                        id: editingAccountId,
                        createdAt: accounts[existingAccountIndex].createdAt
                    };
                    editingAccountId = null;
                    document.getElementById('update-account')?.classList.add('d-none');
                    document.getElementById('cancel-update')?.classList.add('d-none');
                    accountForm.querySelector('button[type="submit"]')?.classList.remove('d-none');
                    showToast('Account updated successfully!', 'success');
                } else {
                    account.id = Date.now();
                    account.createdAt = new Date();
                    accounts.push(account);
                    if (!settings.activeAccountId) {
                        settings.activeAccountId = account.id;
                        await saveToStore('settings', { id: 'settings', ...settings });
                    }
                    showToast('Account added successfully!', 'success');
                }

                await saveData();
                await renderAccounts(accounts, settings.activeAccountId, trades, strategies, settings, consecutiveLosses, dailyPlans, weeklyReviews, visibleColumns, recordsPerPage, currentFilters, currentPage);
                accountForm.reset();
                document.querySelectorAll('.prop-firm-field').forEach(field => field.classList.add('d-none'));
                return true;
            } catch (err) {
                showToast('Error saving account. Please try again.', 'error');
                console.error('Error processing account:', err);
                return false;
            }
        }

        // Form submission handler
        if (document.__accountFormSubmitHandler) {
            document.removeEventListener('submit', document.__accountFormSubmitHandler);
        }

        document.__accountFormSubmitHandler = async (e) => {
            const form = e.target.closest('#account-form');
            if (!form) return;

            e.preventDefault();
            e.stopPropagation();
            const isUpdate = !!editingAccountId;
            console.log('Account form submitted', { mode: isUpdate ? 'update' : 'add', editingAccountId });
            try {
                const account = {
                    name: document.getElementById('account-name')?.value.trim() || '',
                    initialBalance: parseFloat(document.getElementById('initial-balance')?.value) || 0,
                    dailyDrawdown: parseFloat(document.getElementById('daily-drawdown')?.value) || 0,
                    maxTradesPerDay: parseInt(document.getElementById('max-trades-per-day')?.value) || 0,
                    maxLossPerDay: parseFloat(document.getElementById('max-loss-per-day')?.value) || 0,
                    isPropFirm: document.getElementById('is-propfirm')?.checked || false,
                    brokerId: document.getElementById('broker-id')?.value ? parseInt(document.getElementById('broker-id').value) : null,
                    maxDrawdown: parseFloat(document.getElementById('max-drawdown')?.value) || 0,
                    profitSplit: parseFloat(document.getElementById('profit-split')?.value) || 0
                };

                console.log('Account data for submission:', account);
                const result = await processAccount(account, isUpdate);
                if (result) {
                    console.log(isUpdate ? 'Account update successful' : 'Account addition successful');
                } else {
                    console.warn(isUpdate ? 'Account update failed' : 'Account addition failed');
                }
            } catch (err) {
                showToast(`Error ${isUpdate ? 'updating' : 'adding'} account. Please try again.`, 'error');
                console.error(`${isUpdate ? 'Update' : 'Add'} account error:`, err);
            }
        };

        document.addEventListener('submit', document.__accountFormSubmitHandler);
        console.log('Attached submit handler to document for #account-form');

        // Updated update-account button handler
        if (document.__updateAccountClickHandler) {
            document.removeEventListener('click', document.__updateAccountClickHandler);
        }

        document.__updateAccountClickHandler = async (e) => {
            const button = e.target.closest('#update-account');
            if (!button) return;

            e.preventDefault();
            e.stopPropagation();
            console.log('Update account button clicked via delegation, editingAccountId:', editingAccountId);
            console.log('Button state:', {
                outerHTML: button.outerHTML,
                disabled: button.disabled,
                visible: !button.classList.contains('d-none'),
                computedStyle: window.getComputedStyle(button).display
            });
            try {
                if (!editingAccountId) {
                    showToast('No account selected for update.', 'error');
                    console.warn('Update attempted without editingAccountId');
                    return;
                }

                const account = {
                    name: document.getElementById('account-name')?.value.trim() || '',
                    initialBalance: parseFloat(document.getElementById('initial-balance')?.value) || 0,
                    dailyDrawdown: parseFloat(document.getElementById('daily-drawdown')?.value) || 0,
                    maxTradesPerDay: parseInt(document.getElementById('max-trades-per-day')?.value) || 0,
                    maxLossPerDay: parseFloat(document.getElementById('max-loss-per-day')?.value) || 0,
                    isPropFirm: document.getElementById('is-propfirm')?.checked || false,
                    brokerId: document.getElementById('broker-id')?.value ? parseInt(document.getElementById('broker-id').value) : null,
                    maxDrawdown: parseFloat(document.getElementById('max-drawdown')?.value) || 0,
                    profitSplit: parseFloat(document.getElementById('profit-split')?.value) || 0
                };

                console.log('Account data for update:', account);
                const result = await processAccount(account, true);
                if (result) {
                    console.log('Account update successful via button');
                } else {
                    console.warn('Account update failed via button');
                }
            } catch (err) {
                showToast('Error updating account. Please try again.', 'error');
                console.error('Update account error:', err);
            }
        };

        document.addEventListener('click', document.__updateAccountClickHandler);
        console.log('Attached click handler to document for #update-account');

        // Fallback direct listener for update-account
        const updateAccountButton = document.getElementById('update-account');
        if (updateAccountButton) {
            if (updateAccountButton.__directClickHandler) {
                updateAccountButton.removeEventListener('click', updateAccountButton.__directClickHandler);
            }

            updateAccountButton.__directClickHandler = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Direct update account button clicked, editingAccountId:', editingAccountId);
                try {
                    if (!editingAccountId) {
                        showToast('No account selected for update.', 'error');
                        console.warn('Direct update attempted without editingAccountId');
                        return;
                    }

                    const account = {
                        name: document.getElementById('account-name')?.value.trim() || '',
                        initialBalance: parseFloat(document.getElementById('initial-balance')?.value) || 0,
                        dailyDrawdown: parseFloat(document.getElementById('daily-drawdown')?.value) || 0,
                        maxTradesPerDay: parseInt(document.getElementById('max-trades-per-day')?.value) || 0,
                        maxLossPerDay: parseFloat(document.getElementById('max-loss-per-day')?.value) || 0,
                        isPropFirm: document.getElementById('is-propfirm')?.checked || false,
                        brokerId: document.getElementById('broker-id')?.value ? parseInt(document.getElementById('broker-id').value) : null,
                        maxDrawdown: parseFloat(document.getElementById('max-drawdown')?.value) || 0,
                        profitSplit: parseFloat(document.getElementById('profit-split')?.value) || 0
                    };

                    console.log('Direct account data for update:', account);
                    const result = await processAccount(account, true);
                    if (result) {
                        console.log('Direct account update successful');
                    } else {
                        console.warn('Direct account update failed');
                    }
                } catch (err) {
                    showToast('Error updating account (direct). Please try again.', 'error');
                    console.error('Direct update account error:', err);
                }
            };

            updateAccountButton.addEventListener('click', updateAccountButton.__directClickHandler);
            console.log('Attached direct click handler to #update-account');
        }

        // account-list-body click handler
        const accountListBody = document.getElementById('account-list-body');
        if (accountListBody) {
            if (accountListBody.__clickHandler) {
                accountListBody.removeEventListener('click', accountListBody.__clickHandler);
            }

            accountListBody.__clickHandler = async (e) => {
                const target = e.target.closest('.edit-account, .delete-account');
                if (!target) return;

                e.stopPropagation();
                const id = parseInt(target.dataset.id);
                if (isNaN(id)) {
                    showToast('Invalid account ID.', 'error');
                    console.error('Invalid account ID:', target.dataset.id);
                    return;
                }

                if (target.classList.contains('edit-account')) {
                    console.log('Edit account clicked, ID:', id);
                    try {
                        const account = accounts.find(a => a.id === id);
                        if (!account) {
                            showToast('Account not found.', 'error');
                            console.error('Account not found for ID:', id);
                            return;
                        }

                        editingAccountId = id;
                        const formElements = {
                            'account-name': account.name || '',
                            'initial-balance': account.initialBalance || '',
                            'daily-drawdown': account.dailyDrawdown || '',
                            'max-trades-per-day': account.maxTradesPerDay || 5,
                            'max-loss-per-day': account.maxLossPerDay || 5,
                            'is-propfirm': account.isPropFirm || false,
                            'broker-id': account.brokerId || '',
                            'max-drawdown': account.maxDrawdown || '',
                            'profit-split': account.profitSplit || ''
                        };

                        for (const [id, value] of Object.entries(formElements)) {
                            const element = document.getElementById(id);
                            if (element) {
                                if (id === 'is-propfirm') {
                                    element.checked = value;
                                } else {
                                    element.value = value;
                                }
                            } else {
                                console.warn(`Form element #${id} not found`);
                            }
                        }

                        document.querySelectorAll('.prop-firm-field').forEach(field => {
                            field.classList.toggle('d-none', !account.isPropFirm);
                        });

                        const updateButton = document.getElementById('update-account');
                        const cancelButton = document.getElementById('cancel-update');
                        const submitButton = accountForm?.querySelector('button[type="submit"]');
                        if (updateButton && cancelButton && submitButton) {
                            updateButton.classList.remove('d-none');
                            cancelButton.classList.remove('d-none');
                            submitButton.classList.add('d-none');
                            console.log('Edit handler set button states:', {
                                updateButtonVisible: !updateButton.classList.contains('d-none'),
                                cancelButtonVisible: !cancelButton.classList.contains('d-none'),
                                submitButtonVisible: !submitButton.classList.contains('d-none')
                            });
                        } else {
                            showToast('Error: Form buttons not found.', 'error');
                            console.error('Missing form buttons:', { updateButton, cancelButton, submitButton });
                        }
                    } catch (err) {
                        showToast('Error loading account for edit.', 'error');
                        console.error('Edit account error:', err);
                    }
                } else if (target.classList.contains('delete-account')) {
                    console.log('Delete account clicked, ID:', id);
                    if (accounts.length === 1) {
                        showToast('Cannot delete the last account.', 'error');
                        return;
                    }

                    try {
                        const relatedTrades = trades.filter(t => t.accountId === id);
                        const relatedStrategies = strategies.filter(s => s.accountId === id);
                        const relatedDailyPlans = dailyPlans.filter(p => p.accountId === id);
                        const relatedWeeklyReviews = weeklyReviews.filter(r => r.accountId === id);
                        const relatedReflections = reflections.filter(r => r.accountId === id);

                        if (relatedTrades.length === 0) {
                            console.log('No trades, deleting account and related records');
                            trades = trades.filter(t => t.accountId !== id);
                            strategies = strategies.filter(s => s.accountId !== id);
                            dailyPlans = dailyPlans.filter(p => p.accountId !== id);
                            weeklyReviews = weeklyReviews.filter(r => r.accountId !== id);
                            reflections = reflections.filter(r => r.accountId !== id);
                            accounts = accounts.filter(a => a.id !== id);

                            if (settings.activeAccountId === id) {
                                settings.activeAccountId = accounts[0]?.id || null;
                                await saveToStore('settings', { id: 'settings', ...settings });
                            }

                            const db = getDB();
                            const deleteTransaction = db.transaction(['accounts', 'trades', 'strategies', 'dailyPlans', 'weeklyReviews', 'reflections'], 'readwrite');
                            await Promise.all([
                                deleteFromStore('accounts', id),
                                ...relatedTrades.map(t => deleteFromStore('trades', t.id)),
                                ...relatedStrategies.map(s => deleteFromStore('strategies', s.id)),
                                ...relatedDailyPlans.map(p => deleteFromStore('dailyPlans', p.id)),
                                ...relatedWeeklyReviews.map(r => deleteFromStore('weeklyReviews', r.id)),
                                ...relatedReflections.map(r => deleteFromStore('reflections', r.tradeId))
                            ]);

                            const saveTransaction = db.transaction(['accounts', 'trades', 'strategies', 'dailyPlans', 'weeklyReviews', 'reflections'], 'readwrite');
                            const stores = ['accounts', 'trades', 'strategies', 'dailyPlans', 'weeklyReviews', 'reflections'];
                            for (const storeName of stores) {
                                const store = saveTransaction.objectStore(storeName);
                                await new Promise((resolve, reject) => {
                                    const request = store.clear();
                                    request.onsuccess = resolve;
                                    request.onerror = () => reject(request.error);
                                });
                            }

                            await Promise.all([
                                ...accounts.map(account => saveToStore('accounts', account)),
                                ...trades.map(trade => saveToStore('trades', { ...trade, screenshots: trade.screenshots?.map(img => ({ ...img, url: undefined })) })),
                                ...strategies.map(strategy => saveToStore('strategies', strategy)),
                                ...dailyPlans.map(plan => saveToStore('dailyPlans', plan)),
                                ...weeklyReviews.map(review => saveToStore('weeklyReviews', review)),
                                ...reflections.map(reflection => saveToStore('reflections', {
                                    ...reflection,
                                    reviewScreenshot: reflection.reviewScreenshot instanceof Blob ? reflection.reviewScreenshot : null
                                }))
                            ]);

                            await renderAccounts(accounts, settings.activeAccountId, trades, strategies, settings, consecutiveLosses, dailyPlans, weeklyReviews, visibleColumns, recordsPerPage, currentFilters, currentPage);
                            resetTradeCache();
                            const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
                            await renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);

                            showToast('Account deleted successfully!', 'success');
                        } else {
                            console.log('Trades found, preparing confirmation modal');
                            const modalElement = document.createElement('div');
                            modalElement.innerHTML = `
                                <div class="modal fade" id="confirmDeleteAccountModal" tabindex="-1" aria-labelledby="confirmDeleteAccountModalLabel" aria-hidden="true">
                                    <div class="modal-dialog">
                                        <div class="modal-content">
                                            <div class="modal-header">
                                                <h5 class="modal-title" id="confirmDeleteAccountModalLabel">Confirm Account Deletion</h5>
                                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                                            </div>
                                            <div class="modal-body">
                                                This account has ${relatedTrades.length} associated trade(s) and possibly other records:<br>
                                                - ${relatedStrategies.length} strategy(ies)<br>
                                                - ${relatedDailyPlans.length} daily plan(s)<br>
                                                - ${relatedWeeklyReviews.length} weekly review(s)<br>
                                                - ${relatedReflections.length} reflection(s)<br>
                                                Deleting this account will permanently remove it and all these related records. Are you sure you want to proceed?
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                                <button type="button" class="btn btn-danger" id="confirm-delete-account">Delete</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                            document.body.appendChild(modalElement);
                            const confirmModal = new bootstrap.Modal(modalElement.querySelector('#confirmDeleteAccountModal'), { backdrop: 'static' });
                            confirmModal.show();

                            const confirmDelete = modalElement.querySelector('#confirm-delete-account');
                            confirmDelete.addEventListener('click', async () => {
                                try {
                                    console.log('Confirm delete clicked, filtering records for account ID:', id);
                                    trades = trades.filter(t => t.accountId !== id);
                                    strategies = strategies.filter(s => s.accountId !== id);
                                    dailyPlans = dailyPlans.filter(p => p.accountId !== id);
                                    weeklyReviews = weeklyReviews.filter(r => r.accountId !== id);
                                    reflections = reflections.filter(r => r.accountId !== id);
                                    accounts = accounts.filter(a => a.id !== id);

                                    if (settings.activeAccountId === id) {
                                        settings.activeAccountId = accounts[0]?.id || null;
                                        await saveToStore('settings', { id: 'settings', ...settings });
                                    }

                                    const db = getDB();
                                    const deleteTransaction = db.transaction(['accounts', 'trades', 'strategies', 'dailyPlans', 'weeklyReviews', 'reflections'], 'readwrite');
                                    await Promise.all([
                                        deleteFromStore('accounts', id),
                                        ...relatedTrades.map(t => deleteFromStore('trades', t.id)),
                                        ...relatedStrategies.map(s => deleteFromStore('strategies', s.id)),
                                        ...relatedDailyPlans.map(p => deleteFromStore('dailyPlans', p.id)),
                                        ...relatedWeeklyReviews.map(r => deleteFromStore('weeklyReviews', r.id)),
                                        ...relatedReflections.map(r => deleteFromStore('reflections', r.tradeId))
                                    ]);

                                    const saveTransaction = db.transaction(['accounts', 'trades', 'strategies', 'dailyPlans', 'weeklyReviews', 'reflections'], 'readwrite');
                                    const stores = ['accounts', 'trades', 'strategies', 'dailyPlans', 'weeklyReviews', 'reflections'];
                                    for (const storeName of stores) {
                                        const store = saveTransaction.objectStore(storeName);
                                        await new Promise((resolve, reject) => {
                                            const request = store.clear();
                                            request.onsuccess = resolve;
                                            request.onerror = () => reject(request.error);
                                        });
                                    }

                                    await Promise.all([
                                        ...accounts.map(account => saveToStore('accounts', account)),
                                        ...trades.map(trade => saveToStore('trades', { ...trade, screenshots: trade.screenshots?.map(img => ({ ...img, url: undefined })) })),
                                        ...strategies.map(strategy => saveToStore('strategies', strategy)),
                                        ...dailyPlans.map(plan => saveToStore('dailyPlans', plan)),
                                        ...weeklyReviews.map(review => saveToStore('weeklyReviews', review)),
                                        ...reflections.map(reflection => saveToStore('reflections', {
                                            ...reflection,
                                            reviewScreenshot: reflection.reviewScreenshot instanceof Blob ? reflection.reviewScreenshot : null
                                        }))
                                    ]);

                                    await renderAccounts(accounts, settings.activeAccountId, trades, strategies, settings, consecutiveLosses, dailyPlans, weeklyReviews, visibleColumns, recordsPerPage, currentFilters, currentPage);
                                    resetTradeCache();
                                    const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
                                    await renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);

                                    showToast('Account and related records deleted successfully!', 'success');
                                    confirmModal.hide();
                                    modalElement.remove();
                                } catch (err) {
                                    showToast('Error deleting account and related records. Please try again.', 'error');
                                    console.error('Error deleting account:', err);
                                }
                            });

                            modalElement.querySelector('#confirmDeleteAccountModal').addEventListener('hidden.bs.modal', () => {
                                modalElement.remove();
                            });
                        }
                    } catch (err) {
                        showToast('Error processing account deletion. Please try again.', 'error');
                        console.error('Error checking account deletion:', err);
                    }
                }
            };
            accountListBody.addEventListener('click', accountListBody.__clickHandler);
        } else {
            console.warn('Account list body (#account-list-body) not found in DOM');
            showToast('Account list table not found. Please check the settings page.', 'error');
        }

        // Cancel update handler
        if (document.__cancelUpdateClickHandler) {
            document.removeEventListener('click', document.__cancelUpdateClickHandler);
        }

        document.__cancelUpdateClickHandler = (e) => {
            const button = e.target.closest('#cancel-update');
            if (!button) return;

            e.preventDefault();
            e.stopPropagation();
            console.log('Cancel update button clicked');
            editingAccountId = null;
            accountForm?.reset();
            const isPropFirmCheckbox = document.getElementById('is-propfirm');
            if (isPropFirmCheckbox) isPropFirmCheckbox.checked = false;
            document.querySelectorAll('.prop-firm-field').forEach(field => field.classList.add('d-none'));
            const updateButton = document.getElementById('update-account');
            const cancelButton = document.getElementById('cancel-update');
            const submitButton = accountForm?.querySelector('button[type="submit"]');
            if (updateButton) updateButton.classList.add('d-none');
            if (cancelButton) cancelButton.classList.add('d-none');
            if (submitButton) submitButton.classList.remove('d-none');
        };

        document.addEventListener('click', document.__cancelUpdateClickHandler);
        console.log('Attached click handler to document for #cancel-update');
    } else {
        console.warn('Account form (#account-form) not found in DOM');
        showToast('Account form not found. Please check the settings page.', 'error');
    }

const pairForm = document.getElementById('pair-form');
if (pairForm) {
    let editingPairId = null;

 pairForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Pair form submitted');

    const name = document.getElementById('pair-name').value.trim().toUpperCase();
    const marketType = document.getElementById('market-type').value.toLowerCase();

    if (!name || !marketType) {
        showToast('Pair name and market type are required.', 'error');
        return;
    }

    if (pairs.some(p => p.name === name && p.id !== editingPairId)) {
        showToast('Pair name already exists.', 'error');
        return;
    }

    if (editingPairId) {
        console.log('Updating existing pair with ID:', editingPairId);
        const existingPair = pairs.find(p => p.id === editingPairId);
        if (existingPair) {
            existingPair.name = name;
            existingPair.market_type = marketType;

            await saveToStore('pairs', existingPair); // ✅ Save to IndexedDB
            showToast('Pair updated successfully!', 'success');
        } else {
            console.warn('Could not find pair to update');
        }

        editingPairId = null;
        document.getElementById('update-pair').classList.add('d-none');
        document.getElementById('cancel-pair-update').classList.add('d-none');
        pairForm.querySelector('button[type="submit"]').classList.remove('d-none');
    } else {
        const newPair = { id: Date.now(), name, market_type: marketType };
        pairs.push(newPair);
        await saveToStore('pairs', newPair);
        showToast('Pair added successfully!', 'success');
    }

    await saveData(); // Optional if saveToStore is used per item
    renderPairs(pairs);
    renderPairList(pairs);
    e.target.reset();
});


document.getElementById('pair-list-body')?.addEventListener('click', async (e) => {
    if (e.target.classList.contains('edit-pair')) {
        const id = parseInt(e.target.dataset.id);
        const pair = pairs.find(p => p.id === id);
        if (pair) {
            editingPairId = id;
            document.getElementById('pair-name').value = pair.name;

            const marketTypeSelect = document.getElementById('market-type');
            const marketType = (pair.market_type || '').toLowerCase();
            console.log('Editing Pair:', pair, 'Setting market_type:', marketType);

            // ✅ Make sure value exists in the dropdown
            if ([...marketTypeSelect.options].some(opt => opt.value === marketType)) {
                marketTypeSelect.value = marketType;
            } else {
                marketTypeSelect.value = '';
                console.warn('Market type not found in dropdown options:', marketType);
            }

            document.getElementById('update-pair').classList.remove('d-none');
            document.getElementById('cancel-pair-update').classList.remove('d-none');
            pairForm.querySelector('button[type="submit"]').classList.add('d-none');
        }
    }
 else if (e.target.classList.contains('delete-pair')) {
        const id = parseInt(e.target.dataset.id);
        if (pairs.length === 1) {
            showToast('Cannot delete the last pair.', 'error');
            return;
        }
        if (trades.some(t => t.pair === pairs.find(p => p.id === id).name)) {
            showToast('Cannot delete pair used in trades.', 'error');
            return;
        }
        const pairToDelete = pairs.find(p => p.id === id);
pairs = pairs.filter(p => p.id !== id);
await deleteFromStore('pairs', pairToDelete.id); // <- delete from IndexedDB
await saveData();
        renderPairs(pairs);
        renderPairList(pairs);
        showToast('Pair deleted successfully!', 'success');
    }
});


    document.getElementById('cancel-pair-update')?.addEventListener('click', () => {
        editingPairId = null;
        pairForm.reset();
        document.getElementById('update-pair').classList.add('d-none');
        document.getElementById('cancel-pair-update').classList.add('d-none');
        pairForm.querySelector('button[type="submit"]').classList.remove('d-none');
    });
}


const activeAccountSelect = document.getElementById('active-account');
if (activeAccountSelect) {
    activeAccountSelect.addEventListener('change', async (e) => {
        const newActiveAccountId = parseInt(e.target.value);
        console.log('Switching to account ID:', newActiveAccountId);
        if (newActiveAccountId && Array.isArray(accounts) && accounts.some(a => a.id === newActiveAccountId)) {
            settings.activeAccountId = newActiveAccountId;
            const activeAccount = accounts.find(a => a.id === newActiveAccountId);
            const accountTrades = trades.filter(t => t.accountId === newActiveAccountId);
            balance = activeAccount.initialBalance;
            console.log('Set balance for new account:', balance);
            // Reset filters and page
            currentFilters = { sort: 'date' };
            currentPage = 1;
            console.log('Reset currentFilters and currentPage:', currentFilters, currentPage);
            // Update dashboardData
            if (window.dashboardData) {
                window.dashboardData.trades = accountTrades;
                window.dashboardData.activeAccountId = newActiveAccountId;
                window.dashboardData.strategies = strategies;
                window.dashboardData.accounts = accounts;
                console.log('Updated dashboardData:', window.dashboardData);
            }
            // Save settings with debounce
            await debounceSaveSettings();
            renderAccounts(accounts, settings.activeAccountId);
            renderStrategies(strategies, settings.activeAccountId, accounts, accountTrades);
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
            // Check if dashboard page is active and DOM is ready
            const dashboardPage = document.getElementById('dashboard');
            if (dashboardPage && dashboardPage.classList.contains('active') && document.getElementById('dashboard')) {
                console.log('Dashboard page is active and DOM ready, re-rendering');
                if (window.initializeDomCache) {
                    window.initializeDomCache();
                    console.log('Re-initialized domCache before rendering dashboard');
                }
                renderDashboard(accountTrades, strategies, settings.activeAccountId, accounts);
            } else {
                console.log('Dashboard page not active or DOM not ready, storing pending update');
                window.pendingDashboardUpdate = { trades: accountTrades, strategies, activeAccountId: settings.activeAccountId, accounts };
            }
            showToast('Active account changed successfully!', 'success');
        } else {
            console.error('Invalid account selected:', newActiveAccountId);
            showToast('Invalid account selected.', 'error');
        }
    });
}


const activeAccountSettingsSelect = document.getElementById('active-account-settings');
if (activeAccountSettingsSelect) {
    activeAccountSettingsSelect.addEventListener('change', async (e) => {
        const newActiveAccountId = parseInt(e.target.value);
        if (newActiveAccountId && Array.isArray(accounts) && accounts.some(a => a.id === newActiveAccountId)) {
            settings.activeAccountId = newActiveAccountId;
            const activeAccount = accounts.find(a => a.id === newActiveAccountId);
            const accountTrades = trades.filter(t => t.accountId === newActiveAccountId);
            balance = activeAccount.initialBalance;
            // Update dashboardData
            if (window.dashboardData) {
                window.dashboardData.trades = accountTrades;
                window.dashboardData.activeAccountId = newActiveAccountId;
                window.dashboardData.strategies = strategies;
                window.dashboardData.accounts = accounts;
                console.log('Updated dashboardData:', window.dashboardData);
            }
            // Save only settings with debounce
            await debounceSaveSettings();
            renderAccounts(accounts, settings.activeAccountId);
            renderStrategies(strategies, settings.activeAccountId,accounts,trades);
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
            // Check if dashboard page is active and DOM is ready
            const dashboardPage = document.getElementById('dashboard');
            if (dashboardPage && dashboardPage.classList.contains('active') && document.getElementById('dashboard')) {
                console.log('Dashboard page is active and DOM ready, re-rendering');
                if (window.initializeDomCache) {
                    window.initializeDomCache();
                    console.log('Re-initialized domCache before rendering dashboard');
                }
                renderDashboard(accountTrades, strategies, settings.activeAccountId, accounts);
            } else {
                console.log('Dashboard page not active or DOM not ready, storing pending update');
                window.pendingDashboardUpdate = { trades: accountTrades, strategies, activeAccountId: settings.activeAccountId, accounts };
            }
            showToast('Active account changed successfully!', 'success');
        } else {
            showToast('Invalid account selected.', 'error');
        }
    });
}


const backupDataButton = document.getElementById('backup-data');
if (backupDataButton) {
    backupDataButton.addEventListener('click', () => {
        console.log('Initiating backup');
        backupData();
    });
} else {
    console.warn('Backup data button not found in DOM');
}

const importDataInput = document.getElementById('import-data');
if (importDataInput) {
    importDataInput.addEventListener('change', (e) => {
        console.log('Importing data');
        const file = e.target.files[0];
        if (file && file.type === 'application/json') {
            importData(file, trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs, initializeData);
        } else {
            showToast('Please select a valid JSON file.', 'error');
        }
        e.target.value = '';
    });
} else {
    console.warn('Import data input not found in DOM');
}

// Updated restoreBackupSelect event listener
const restoreBackupSelect = document.getElementById('restore-backup');
if (restoreBackupSelect) {
    restoreBackupSelect.addEventListener('change', async (e) => {
        console.log('Restoring backup');
        const timestamp = e.target.value;
        if (timestamp) {
            try {
                const backups = await loadFromStore('backups');
                const backup = backups.find(b => b.timestamp === timestamp);
                if (!backup) {
                    throw new Error('Backup not found.');
                }

                const data = JSON.parse(backup.data);
                console.log('Backup data:', Object.keys(data));
                const requiredStores = ['trades', 'strategies', 'reflections', 'dailyPlans', 'weeklyReviews', 'settings', 'accounts', 'pairs'];
                for (const store of requiredStores) {
                    if (!data[store]) {
                        throw new Error(`Invalid backup: Missing ${store} data`);
                    }
                }

                // Clear existing data
                trades.length = 0;
                strategies.length = 0;
                reflections.length = 0;
                dailyPlans.length = 0;
                weeklyReviews.length = 0;
                accounts.length = 0;
                pairs.length = 0;

                // Restore data
                trades.push(...data.trades.map(t => ({
                    ...t,
                    screenshots: t.screenshots?.map(s => ({
                        ...s,
                        blob: s.base64 ? base64ToBlob(s.base64) : null,
                        url: s.base64 ? URL.createObjectURL(base64ToBlob(s.base64)) : ''
                    }))
                })));
                strategies.push(...data.strategies);
                reflections.push(...data.reflections.map(r => ({
                    ...r,
                    reviewScreenshot: r.reviewScreenshot?.base64 ? URL.createObjectURL(base64ToBlob(r.reviewScreenshot.base64)) : ''
                })));
                dailyPlans.push(...data.dailyPlans);
                weeklyReviews.push(...data.weeklyReviews);
                accounts.push(...data.accounts);
                pairs.push(...data.pairs);
                Object.assign(settings, data.settings[0] || settings);

                // Save additional stores
                await Promise.all([
                    ...data.columnPrefs?.map(p => saveToStore('columnPrefs', p)) || [],
                    ...data.deleted?.map(d => saveToStore('deleted', d)) || [],
                    ...data.analytics?.map(a => saveToStore('analytics', a)) || []
                ]);

                // Update balance and UI
                const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
                if (!activeAccount) {
                    throw new Error('Active account not found after restore.');
                }
                balance = activeAccount.initialBalance;

                await saveData();
                renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
                renderStrategies(strategies, settings.activeAccountId,accounts,trades);
                renderAccounts(accounts, settings.activeAccountId);
                renderPairs(pairs);
                renderPairList(pairs);
                showToast('Backup restored successfully!', 'success');
            } catch (err) {
                showToast(`Error restoring backup: ${err.message}`, 'error');
                console.error('Restore error:', err);
            }
        }
        e.target.value = '';
    });
} else {
    console.warn('Restore backup select not found in DOM');
}

const clearDataButton = document.getElementById('clear-data');
if (clearDataButton) {
    clearDataButton.addEventListener('click', () => {
        console.log('Clearing data');
        const modal = new bootstrap.Modal(document.getElementById('clearDataModal'));
        const confirmButton = document.getElementById('confirm-clear-data');
        if (!confirmButton) {
            console.warn('Confirm clear data button not found in DOM');
            showToast('Error: Confirm button not found.', 'error');
            return;
        }
        confirmButton.onclick = async () => {
            try {
                // Step 1: Create a backup before clearing
                await backupData();
                console.log('Backup created successfully');

                // Step 2: Clear all IndexedDB stores
                const db = getDB();
                const stores = [
                    'trades',
                    'strategies',
                    'reflections',
                    'dailyPlans',
                    'weeklyReviews',
                    'strategyVersions',
                    'planTemplates',
                    'preMarketTemplates',
                    'afterMarketTemplates',
                    'weeklyReviewTemplates',
                    'reportTemplates',
                    'analytics',
                    'deleted',
                    'backups',
                    'images',
                    'columnPrefs',
                    'dashboard'
                    // Note: 'accounts', 'brokers', 'pairs', 'settings' are handled separately
                ];
                const transaction = db.transaction(stores, 'readwrite');
                await Promise.all(stores.map(storeName => {
                    return new Promise((resolve, reject) => {
                        const store = transaction.objectStore(storeName);
                        const request = store.clear();
                        request.onsuccess = () => {
                            console.log(`Cleared store: ${storeName}`);
                            resolve();
                        };
                        request.onerror = () => {
                            console.error(`Error clearing store ${storeName}:`, request.error);
                            reject(request.error);
                        };
                    });
                }));
                console.log('All specified stores cleared');

                // Step 3: Reset in-memory data
                trades.length = 0;
                strategies.length = 0;
                reflections.length = 0;
                dailyPlans.length = 0;
                weeklyReviews.length = 0;
                consecutiveLosses = 0;
                visibleColumns = [
                    'trade-num', 'date', 'time', 'pair', 'type', 'timeframe', 'strategy',
                    'risk-plan', 'risk', 'lot-size', 'outcome', 'profit-loss', 'balance',
                    'tags', 'images', 'actions'
                ];
                recordsPerPage = 20;
                currentPage = 1;
                currentFilters = {};
                globalDateFilter = { type: 'current-month', startDate: null, endDate: null };

                // Step 4: Reset settings to default
                const defaultSettings = {
                    tradingWindow: { start: null, end: null },
                    activeAccountId: 1746605411154, // Default account ID
                    backupFrequency: { type: 'daily', interval: 1 },
                    backupRetention: { maxBackups: 10, maxAgeDays: 30 },
                    autoBackupDownload: true,
                    conditionTypes: ['Price Action']
                };
                settings = { ...defaultSettings };
                await saveToStore('settings', { id: 'settings', ...settings });
                console.log('Settings reset and saved:', settings);

                // Step 5: Ensure default account exists
                const defaultAccount = {
                    id: 1746605411154,
                    name: 'Default Account',
                    initialBalance: 50000,
                    maxDrawdown: 10,
                    dailyDrawdown: 5,
                    maxTradesPerDay: 5,
                    maxLossPerDay: 5,
                    profitSplit: 80,
                    isPropFirm: false,
                    createdAt: new Date()
                };
                accounts = [defaultAccount];
                await saveToStore('accounts', defaultAccount);
                console.log('Default account ensured:', defaultAccount);

                // Step 6: Clear other stores but retain brokers and pairs
                // Optionally clear 'brokers' and 'pairs' if desired
                const retainStores = ['brokers', 'pairs'];
                console.log('Retaining stores:', retainStores);

                // Step 7: Reset balance
                const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
                balance = activeAccount ? activeAccount.initialBalance : 50000;
                console.log('Balance reset to:', balance);

                // Step 8: Update UI
                const activeAccountForRender = accounts.find(a => a.id === settings.activeAccountId);
                await renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccountForRender, settings.activeAccountId);
                renderStrategies(strategies, settings.activeAccountId, accounts, trades);
                renderWeeklyReviews(weeklyReviews, settings.activeAccountId, trades);
                renderAccounts(accounts, settings.activeAccountId);
                renderPairs(pairs);
                renderPairList(pairs);

                // Step 9: Update dashboard
                window.dashboardData = {
                    trades: [],
                    allTrades: [],
                    strategies: [],
                    activeAccountId: settings.activeAccountId,
                    accounts,
                    dateFilter: { ...globalDateFilter }
                };
                window.pendingDashboardUpdate = null;
                await renderDashboard(trades, strategies, settings.activeAccountId, accounts, globalDateFilter);

                showToast('All data cleared and backup created!', 'success');
                modal.hide();
            } catch (err) {
                console.error('Error clearing data:', err);
                showToast('Error clearing data. Please try again.', 'error');
            }
        };
        modal.show();
    });
} else {
    console.warn('Clear data button not found in DOM');
}

const filterInput = document.getElementById('filter-input');
if (filterInput) {
    filterInput.addEventListener('input', debounce((e) => {
        currentFilters.quickSearch = e.target.value.toLowerCase();
        currentPage = 1;
        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
    }, 500));
} else {
    console.warn('Filter input not found in DOM');
}

const sortSelect = document.getElementById('sort-select');
if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
        currentFilters.sort = e.target.value || 'date';
        console.log(`Sort order changed to: ${currentFilters.sort}`);
        currentPage = 1;
        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
    });
} else {
    console.warn('Sort select not found in DOM');
}

const recordsPerPageSelect = document.getElementById('records-per-page');
if (recordsPerPageSelect) {
    recordsPerPageSelect.addEventListener('change', async (e) => {
        recordsPerPage = parseInt(e.target.value) || 20;
        console.log(`Records per page changed to: ${recordsPerPage}`);
        currentPage = 1;
        await saveData();
        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
        showToast(`Records per page set to ${recordsPerPage}`, 'success');
    });
} else {
    console.warn('Records per page select not found in DOM');
}

const toggleThemeButton = document.getElementById('toggle-theme');
if (toggleThemeButton) {
    toggleThemeButton.addEventListener('click', () => {
        console.log('Toggling theme');
        document.body.classList.toggle('dark-mode');
        const isDarkMode = document.body.classList.contains('dark-mode');
        toggleThemeButton.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        showToast(`Switched to ${isDarkMode ? 'Dark' : 'Light'} Mode`, 'success');
    });

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        toggleThemeButton.textContent = 'Light Mode';
    } else {
        document.body.classList.remove('dark-mode');
        toggleThemeButton.textContent = 'Dark Mode';
    }
} else {
    console.warn('Toggle theme button not found in DOM');
}

// Modified section in main.js for reflectionModal event listener
const reflectionModal = document.getElementById('reflectionModal');

// Bind custom tags events directly on modal show
if (reflectionModal) {
    reflectionModal.addEventListener('shown.bs.modal', () => {
        console.log('Trade Details modal shown');
        // Trigger initial progress update
        updateModalProgress();
    
        // Add real-time validation
        const form = document.getElementById('trade-details-form');
        if (form) {
            // Handle input, change, and select events for all fields
            form.addEventListener('input', (e) => {
                const field = e.target;
                if (field.matches('input:not(.image-file), select, textarea') && 
                    field.id !== 'detail-emotion-new-tag' && 
                    field.id !== 'detail-mistakes-new-tag') {
                    validateField(field);
                    updateModalProgress();
                    console.log(`Input event on ${field.id}, value: "${field.value}"`);
                }
            });
    
            // Handle star rating for adherence
            const adherenceRating = document.getElementById('detail-adherence-rating');
            if (adherenceRating) {
                adherenceRating.addEventListener('change', (e) => {
                    const value = e.target.value;
                    document.getElementById('detail-adherence-value').value = value;
                    validateField(e.target);
                    updateModalProgress();
                    console.log(`Adherence rating changed to: ${value}`);
                });
            }
    
            // Handle tag container changes
            ['detail-emotion-tags-value', 'detail-mistakes-tags-value'].forEach(id => {
                const tagInput = document.getElementById(id);
                if (tagInput) {
                    tagInput.addEventListener('change', () => {
                        validateField(tagInput);
                        updateModalProgress();
                        console.log(`Tag input ${id} changed, value: "${tagInput.value}"`);
                    });
                }
            });
    
            // Handle setup score slider
            const setupScore = document.getElementById('detail-setup-score');
            if (setupScore) {
                setupScore.addEventListener('input', () => {
                    const scoreValue = document.getElementById('detail-setup-score-value');
                    if (scoreValue) {
                        scoreValue.textContent = `Score: ${setupScore.value}`;
                    }
                    validateField(setupScore);
                    updateModalProgress();
                    console.log(`Setup score changed to: ${setupScore.value}`);
                });
            }
    
            // Handle exit reason custom input visibility
            const exitReasonSelect = document.getElementById('detail-exit-reason');
            const exitReasonCustom = document.getElementById('detail-exit-reason-custom');
            if (exitReasonSelect && exitReasonCustom) {
                const toggleCustomInput = () => {
                    const isOtherSelected = exitReasonSelect.value === 'Other';
                    exitReasonCustom.classList.toggle('d-none', !isOtherSelected);
                    if (isOtherSelected) {
                        exitReasonCustom.focus();
                    }
                    validateField(exitReasonSelect);
                    updateModalProgress();
                    console.log(`Exit Reason changed to: "${exitReasonSelect.value}", Custom Input Visible: ${isOtherSelected}`);
                };
                exitReasonSelect.addEventListener('change', toggleCustomInput);
    
                // Handle custom input changes
                exitReasonCustom.addEventListener('input', () => {
                    validateField(exitReasonSelect);
                    updateModalProgress();
                    console.log(`Custom Exit Reason input: "${exitReasonCustom.value}"`);
                });
    
                // Initialize visibility based on current value
                toggleCustomInput();
            }
    
            // Handle image uploads
            form.addEventListener('change', (e) => {
                if (e.target.matches('.image-file')) {
                    updateModalProgress();
                    console.log(`Image file input changed: ${e.target.id}`);
                }
            });
    
            // Handle "Add Image" button click
            const addImageButton = document.getElementById('detail-add-image');
            if (addImageButton) {
                addImageButton.addEventListener('click', () => {
                    const imageUploads = document.getElementById('detail-image-uploads');
                    const currentImageCount = imageUploads.querySelectorAll('.image-row').length;
    
                    // Enforce max 5 images
                    if (currentImageCount >= 5) {
                        showToast('Maximum 5 images allowed.', 'warning');
                        console.log('Add Image: Maximum limit of 5 images reached');
                        return;
                    }
    
                    // Create new image upload field
                    const newIndex = currentImageCount + 1;
                    const newImageRow = document.createElement('div');
                    newImageRow.className = 'image-row mb-3';
                    newImageRow.setAttribute('data-index', newIndex - 1);
                    newImageRow.innerHTML = `
                        <div class="mb-2">
                            <label for="detail-image-file-${newIndex}" class="form-label">Upload Image</label>
                            <input type="file" class="form-control image-file" id="detail-image-file-${newIndex}" accept="image/*">
                        </div>
                        <div class="mb-2">
                            <label for="detail-image-caption-${newIndex}" class="form-label">Caption</label>
                            <input type="text" class="form-control image-caption" id="detail-image-caption-${newIndex}" placeholder="Optional caption">
                        </div>
                        <img class="image-preview d-none mb-2" alt="Preview">
                        <button type="button" class="btn btn-clean-danger btn-sm remove-image">Remove</button>
                    `;
                    imageUploads.appendChild(newImageRow);
                    console.log(`Added new image upload field: detail-image-file-${newIndex}`);
    
                    // Update progress after adding new field
                    updateModalProgress();
    
                    // Add event listener for the new remove button
                    const removeButton = newImageRow.querySelector('.remove-image');
                    removeButton.addEventListener('click', () => {
                        newImageRow.remove();
                        console.log(`Removed image upload field: detail-image-file-${newIndex}`);
                        updateModalProgress();
                    });
                });
            }
    
            // Handle remove buttons for existing image rows
            const removeButtons = form.querySelectorAll('.remove-image');
            removeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const imageRow = button.closest('.image-row');
                    imageRow.remove();
                    console.log(`Removed image upload field: ${imageRow.querySelector('.image-file').id}`);
                    updateModalProgress();
                });
            });
    
            // Initialize validation for all fields
            const allFields = form.querySelectorAll('input:not(.image-file), select, textarea');
            allFields.forEach(field => {
                if (field.id !== 'detail-emotion-new-tag' && field.id !== 'detail-mistakes-new-tag') {
                    validateField(field);
                }
            });
        } else {
            console.error('Trade details form not found');
        }
    });
    
    reflectionModal.addEventListener('hidden.bs.modal', () => {
        console.log('Trade Details modal hidden');
    });

    // Updated save-reflection event listener
    reflectionModal.addEventListener('click', async (e) => {
        if (e.target.id === 'save-reflection') {
            console.log('Saving reflection');
            const form = document.getElementById('trade-details-form');
       
     const tradeId = parseInt(form.dataset.tradeId); // ✅ Convert to number
const trade = trades.find(t => t.id === tradeId && t.accountId === settings.activeAccountId);

if (!trade) {
    showToast('Error: Invalid trade selected.', 'error');
    console.error('Trade not found or does not match active account:', tradeId);
    return;
}


            const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
            if (!activeAccount) {
                showToast('No active account selected.', 'error');
                console.error('Active account not found for ID:', settings.activeAccountId);
                return;
            }
    
            const strategyId = parseInt(document.getElementById('detail-strategy').value) || 0;
            console.log('Selected strategyId:', strategyId);
            const strategy = strategies.find(s => s.id === strategyId);
            const strategyName = strategy ? strategy.name : '';
            console.log('Mapped strategyName:', strategyName, 'Strategy object:', strategy, 'Available strategies:', strategies.map(s => ({ id: s.id, name: s.name })));
    
            if (!strategyId || !strategyName) {
                showToast('Please select a valid strategy.', 'error');
                console.error('Strategy validation failed: strategyId=', strategyId, 'strategyName=', strategyName);
                return;
            }
    
            const updatedReflection = {
                tradeId: trade.id,
                accountId: settings.activeAccountId,
                notes: document.getElementById('detail-trade-notes').value.trim() || '',
                lessons: '',
                checklist: {
                    planFollowed: true,
                    riskManaged: parseFloat(document.getElementById('detail-actual-risk').value) <= parseFloat(document.getElementById('detail-planned-risk').value) * 1.1,
                    emotionsControlled: document.getElementById('detail-emotion-tags-value').value.split(',').filter(tag => tag.trim()).every(e => ['Confident', 'Calm'].includes(e)),
                    setupValid: parseInt(document.getElementById('detail-setup-score').value) >= 8
                }
            };
    
            const exitReasonSelect = document.getElementById('detail-exit-reason');
            const exitReasonCustom = document.getElementById('detail-exit-reason-custom');
            const exitReason = exitReasonSelect.value === 'Other' ? exitReasonCustom.value.trim() : exitReasonSelect.value;
    
            const entryPrice = parseFloat(document.getElementById('detail-entry-price').value) || null;
            const slPrice = parseFloat(document.getElementById('detail-sl-price').value) || null;
            const exitPrice = parseFloat(document.getElementById('detail-exit-price').value) || null;
            const holdTimeInput = document.getElementById('detail-hold-time').value.trim();
            const holdTime = holdTimeInput ? parseHoldTime(holdTimeInput) : null;
            const actualRR = parseFloat(document.getElementById('detail-actual-rr').value) || 0;
            const adherence = parseInt(document.getElementById('detail-adherence-value').value) || null;
    const position = document.getElementById('trade-position')?.value || '';


            const updatedTrade = {
                ...trade,
                tradeType: document.getElementById('detail-trade-type').value || '',
                timeframe: document.getElementById('detail-timeframe').value || '',
                session: document.getElementById('detail-session').value || '',
                strategyId: strategyId,
                strategy: strategyName,
                setupScore: parseInt(document.getElementById('detail-setup-score').value) || 8,
                plannedRisk: parseFloat(document.getElementById('detail-planned-risk').value) || 0,
                actualRisk: parseFloat(document.getElementById('detail-actual-risk').value) || 0,
                plannedRR: parseFloat(document.getElementById('detail-planned-rr').value) || 0,
                actualRR: actualRR,
                lotSize: parseFloat(document.getElementById('detail-lot-size').value) || 0,
                stopLoss: parseInt(document.getElementById('detail-stop-loss').value) || 0,
                entryPrice: entryPrice,
                slPrice: slPrice,
                exitPrice: exitPrice,
                holdTime: holdTime,
                exitReason: exitReason || '',
                mood: document.getElementById('detail-mood').value || '',
                emotions: document.getElementById('detail-emotion-tags-value').value.split(',').filter(tag => tag.trim()),
                mistakes: document.getElementById('detail-mistakes-tags-value').value.split(',').filter(tag => tag.trim()),
                notes: document.getElementById('detail-trade-notes').value.trim() || '',
                adherence: adherence,
                screenshots: [],
                  position, // ✅ Add this line
            };
    
            if (entryPrice !== null && (isNaN(entryPrice) || entryPrice < 0)) {
                showToast('Entry Price must be a positive number.', 'error');
                return;
            }
            if (slPrice !== null && (isNaN(slPrice) || slPrice < 0)) {
                showToast('SL Price must be a positive number.', 'error');
                return;
            }
            if (exitPrice !== null && (isNaN(exitPrice) || exitPrice < 0)) {
                showToast('Exit Price must be a positive number.', 'error');
                return;
            }
            if (holdTimeInput && holdTime === null) {
                showToast('Invalid Hold Time format. Use e.g., 2h 30m or 150m.', 'error');
                return;
            }
            if (adherence === null || isNaN(adherence) || adherence < 1 || adherence > 5) {
                showToast('Please select an Adherence rating (1-5 stars).', 'error');
                return;
            }
    
            updatedTrade.outcome = updatedTrade.actualRR > 0 ? 'Win' : 'Loss';
    
            const actualRisk = updatedTrade.actualRisk || 0;
            updatedTrade.profitLoss = actualRisk * actualRR;
            updatedTrade.profitLoss = isNaN(updatedTrade.profitLoss) ? 0 : parseFloat(updatedTrade.profitLoss.toFixed(2));
            console.log('Calculated outcome and profitLoss:', {
                outcome: updatedTrade.outcome,
                actualRisk,
                actualRR,
                profitLoss: updatedTrade.profitLoss
            });
    
            console.log('Validating trade:', updatedTrade);
            if (!(await validateTrade(updatedTrade, strategies, [], settings.tradingWindow, trades, pairs, activeAccount))) {
                showToast('Trade validation failed. Please correct the errors.', 'error');
                return;
            }
    
            const dailyLoss = calculateDailyLoss(trades, new Date(), settings.activeAccountId);
            if (!validateRisk(updatedTrade.actualRisk, activeAccount.initialBalance, dailyLoss, activeAccount, trades)) {
                return;
            }
    
            const imageRows = document.querySelectorAll('#detail-image-uploads .image-row');
            const maxSizeMB = 2;
            const quality = 0.8;
            for (const row of imageRows) {
                const fileInput = row.querySelector('.image-file');
                const captionInput = row.querySelector('.image-caption');
                const preview = row.querySelector('.image-preview');
                if (fileInput.files.length > 0) {
                    const file = fileInput.files[0];
                    if (file.size > maxSizeMB * 1024 * 1024) {
                        showToast(`Image file size exceeds ${maxSizeMB}MB limit.`, 'error');
                        return;
                    }
                    try {
                        const compressedBlob = await compressImageMainThread(file, maxSizeMB, quality);
                        const reader = new FileReader();
                        const base64Promise = new Promise((resolve, reject) => {
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = () => reject(new Error('Failed to convert blob to base64'));
                            reader.readAsDataURL(compressedBlob);
                        });
                        const base64Image = await base64Promise;
                        updatedTrade.screenshots.push({ url: base64Image, caption: captionInput.value.trim() });
                        console.log(`Compressed and saved screenshot: ${base64Image.length * 0.75} bytes`);
                    } catch (err) {
                        showToast(`Failed to compress image: ${err.message}`, 'error');
                        console.error('Image compression error:', err);
                        return;
                    }
                } else if (preview && !preview.classList.contains('d-none')) {
                    const existingScreenshot = trade.screenshots?.find(s => s.url === preview.src);
                    if (existingScreenshot) {
                        updatedTrade.screenshots.push({ url: existingScreenshot.url, caption: captionInput.value.trim() });
                    } else {
                        updatedTrade.screenshots.push({ url: preview.src, caption: captionInput.value.trim() });
                    }
                }
            }
    
            console.log('Screenshots before saving:', updatedTrade.screenshots);
    
            const globalTradeIndex = trades.findIndex(t => t.id === trade.id);
            if (globalTradeIndex === -1) {
                showToast('Error: Trade not found in global trades array.', 'error');
                console.error('Trade not found for ID:', trade.id);
                return;
            }
    
            updatedTrade.balance = null;
    
            trades[globalTradeIndex] = updatedTrade;
    
            consecutiveLosses = updateConsecutiveLosses(updatedTrade.outcome, trades[globalTradeIndex - 1], consecutiveLosses);
            updatedTrade.disciplineScore = calculateDisciplineScore(updatedTrade, updatedReflection, trades, [], settings.tradingWindow, activeAccount);
    
            console.log('Re-validating trade after calculations:', updatedTrade);
            if (!(await validateTrade(updatedTrade, strategies, [], settings.tradingWindow, trades, pairs, activeAccount))) {
                showToast('Trade validation failed after calculations. Please correct the errors.', 'error');
                return;
            }
    
            const reflectionIndex = reflections.findIndex(r => r.tradeId === trade.id && r.accountId === settings.activeAccountId);
            if (reflectionIndex !== -1) {
                reflections[reflectionIndex] = updatedReflection;
            } else {
                reflections.push(updatedReflection);
            }
    
            console.log('Saving trade to IndexedDB:', updatedTrade);
            await saveData();
            resetTradeCache();
            console.log('Reset trade cache for Trade Log refresh');
    
            // Apply global date filter to trades for dashboard
            let dashboardTrades = trades;
            if (globalDateFilter.type === 'custom' && globalDateFilter.startDate && globalDateFilter.endDate) {
                dashboardTrades = filterTradesByDateRange(trades, globalDateFilter.startDate, globalDateFilter.endDate);
            } else {
                const range = getDateRangeForFilter(globalDateFilter.type);
                if (range.startDate && range.endDate) {
                    dashboardTrades = filterTradesByDateRange(trades, range.startDate, range.endDate);
                }
            }
            dashboardTrades = dashboardTrades.filter(t => t.accountId === settings.activeAccountId);
    
            // Update dashboardData
            window.dashboardData = window.dashboardData || {};
            window.dashboardData.trades = dashboardTrades;
            window.dashboardData.allTrades = trades; // Store unfiltered trades
            window.dashboardData.strategies = strategies;
            window.dashboardData.accounts = accounts;
            window.dashboardData.activeAccountId = settings.activeAccountId;
            window.dashboardData.dateFilter = { ...globalDateFilter }; // Ensure deep copy
            console.log('Updated dashboardData after saving trade:', {
                tradeCount: window.dashboardData.trades.length,
                allTradeCount: window.dashboardData.allTrades.length,
                dateFilter: window.dashboardData.dateFilter
            });
    
            // Always set pendingDashboardUpdate
            window.pendingDashboardUpdate = {
                trades: dashboardTrades,
                allTrades: trades,
                strategies,
                activeAccountId: settings.activeAccountId,
                accounts,
                dateFilter: { ...globalDateFilter }
            };
            console.log('Set pendingDashboardUpdate:', {
                tradeCount: window.pendingDashboardUpdate.trades.length,
                allTradeCount: window.pendingDashboardUpdate.allTrades.length,
                dateFilter: window.pendingDashboardUpdate.dateFilter
            });
    
            renderTrades(trades, settings, consecutiveLosses, dailyPlans, weeklyReviews, strategies, visibleColumns, currentPage, recordsPerPage, currentFilters, activeAccount, settings.activeAccountId);
            showToast('Trade details saved successfully!', 'success');
            bootstrap.Modal.getInstance(reflectionModal).hide();
        }
    });
}

const imageModal = document.getElementById('imageModal');
if (imageModal) {
    imageModal.addEventListener('click', (e) => {
        if (e.target.id === 'toggle-fullscreen') {
            const img = document.getElementById('image-preview');
            if (img) {
                if (!document.fullscreenElement) {
                    img.requestFullscreen().catch(err => {
                        showToast('Error entering fullscreen mode.', 'error');
                        console.error('Fullscreen error:', err);
                    });
                } else {
                    document.exitFullscreen();
                }
            }
        }
    });
} else {
    console.warn('Image modal not found in DOM');
}

async function initializeBrokerManagement() {
    const brokerForm = document.getElementById('broker-form');
    const updateBrokerBtn = document.getElementById('update-broker');
    const cancelBrokerBtn = document.getElementById('cancel-broker-update');
    const brokerListBody = document.getElementById('broker-list-body');
    let editingBrokerId = null;
    let isProcessingDelete = false;

    // Default multiplier values
    const defaultMultipliers = {
        forex: 10,
        indices: 1,
        commodities: 1,
        crypto: 0.01,
        commodities_exceptions: {
            XAGUSD: 5,
            XAUUSD: 100
        }
    };

    // Function to set default form values
    function setDefaultFormValues() {
        console.log('Setting default form values for broker form');
        const brokerNameInput = document.getElementById('broker-name');
        if (brokerNameInput) brokerNameInput.value = '';
        const forexInput = document.getElementById('multiplier-forex');
        if (forexInput) forexInput.value = defaultMultipliers.forex;
        const indicesInput = document.getElementById('multiplier-indices');
        if (indicesInput) indicesInput.value = defaultMultipliers.indices;
        const commoditiesInput = document.getElementById('multiplier-commodities');
        if (commoditiesInput) commoditiesInput.value = defaultMultipliers.commodities;
        const cryptoInput = document.getElementById('multiplier-crypto');
        if (cryptoInput) cryptoInput.value = defaultMultipliers.crypto;
        const xagusdInput = document.getElementById('multiplier-xagusd');
        if (xagusdInput) xagusdInput.value = defaultMultipliers.commodities_exceptions.XAGUSD;
        const xauusdInput = document.getElementById('multiplier-xauusd');
        if (xauusdInput) xauusdInput.value = defaultMultipliers.commodities_exceptions.XAUUSD;
    }

    async function renderBrokerList() {
        try {
            const brokers = await loadFromStore('brokers');
            console.log('Rendering broker list with', brokers.length, 'brokers:', brokers.map(b => ({ id: b.id, name: b.name })));
            renderBrokers(brokers);
            // Verify table content
            if (brokerListBody) {
                const rowCount = brokerListBody.children.length;
                console.log('Broker list body contains', rowCount, 'rows');
                if (rowCount === 0 && brokers.length > 0) {
                    console.warn('Broker list body is empty despite brokers existing');
                    showToast('Broker list failed to render.', 'error');
                } else {
                    const buttons = brokerListBody.querySelectorAll('.edit-broker, .delete-broker');
                    console.log('Found', buttons.length, 'edit/delete buttons in broker table');
                    buttons.forEach(btn => {
                        console.log('Button HTML:', btn.outerHTML, 'Disabled:', btn.disabled);
                    });
                }
            } else {
                console.warn('Broker list body (#broker-list-body) not found in DOM');
                showToast('Broker table not found. Please check the settings page.', 'error');
            }
        } catch (err) {
            console.error('Error rendering broker list:', err);
            showToast('Error loading brokers.', 'error');
        }
    }

    if (brokerForm) {
        // Set default values on form load
        setDefaultFormValues();

        brokerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Broker form submitted, editingBrokerId:', editingBrokerId);
            const brokerData = {
                name: document.getElementById('broker-name').value.trim(),
                multipliers: {
                    forex: parseFloat(document.getElementById('multiplier-forex').value),
                    indices: parseFloat(document.getElementById('multiplier-indices').value),
                    commodities: parseFloat(document.getElementById('multiplier-commodities').value),
                    crypto: parseFloat(document.getElementById('multiplier-crypto').value),
                    commodities_exceptions: {
                        XAGUSD: parseFloat(document.getElementById('multiplier-xagusd').value),
                        XAUUSD: parseFloat(document.getElementById('multiplier-xauusd').value)
                    }
                }
            };

            // Validation
            if (!brokerData.name) {
                showToast('Broker name is required.', 'error');
                console.warn('Validation failed: Broker name is empty');
                return;
            }

            const invalidFields = [];
            if (isNaN(brokerData.multipliers.forex) || brokerData.multipliers.forex < 0) invalidFields.push('Forex Multiplier');
            if (isNaN(brokerData.multipliers.indices) || brokerData.multipliers.indices < 0) invalidFields.push('Indices Multiplier');
            if (isNaN(brokerData.multipliers.commodities) || brokerData.multipliers.commodities < 0) invalidFields.push('Commodities Multiplier');
            if (isNaN(brokerData.multipliers.crypto) || brokerData.multipliers.crypto < 0) invalidFields.push('Crypto Multiplier');
            if (isNaN(brokerData.multipliers.commodities_exceptions.XAGUSD) || brokerData.multipliers.commodities_exceptions.XAGUSD < 0) invalidFields.push('XAGUSD Multiplier');
            if (isNaN(brokerData.multipliers.commodities_exceptions.XAUUSD) || brokerData.multipliers.commodities_exceptions.XAUUSD < 0) invalidFields.push('XAUUSD Multiplier');

            if (invalidFields.length > 0) {
                showToast(`Invalid or negative values in: ${invalidFields.join(', ')}. Please enter non-negative numbers.`, 'error');
                console.warn('Validation failed for fields:', invalidFields);
                return;
            }

            try {
                const brokers = await loadFromStore('brokers');
                const accounts = await loadFromStore('accounts');
                if (brokers.some(b => b.name.toLowerCase() === brokerData.name.toLowerCase() && b.id !== editingBrokerId)) {
                    showToast('Broker name already exists. Please choose a different name.', 'error');
                    console.warn('Duplicate broker name detected:', brokerData.name);
                    return;
                }

                if (editingBrokerId) {
                    brokerData.id = editingBrokerId;
                    await saveToStore('brokers', brokerData);
                    showToast('Broker updated successfully.', 'success');
                    console.log('Updated broker:', brokerData);
                    editingBrokerId = null;
                    updateBrokerBtn.classList.add('d-none');
                    cancelBrokerBtn.classList.add('d-none');
                    brokerForm.querySelector('button[type="submit"]').classList.remove('d-none');
                } else {
                    brokerData.id = Date.now();
                    await saveToStore('brokers', brokerData);
                    showToast('Broker added successfully.', 'success');
                    console.log('Added new broker:', brokerData);
                }

                brokerForm.reset();
                setDefaultFormValues();
                await renderBrokerList();
                renderAccounts(accounts);
            } catch (err) {
                console.error('Error saving broker:', err);
                showToast('Error saving broker. Please try again.', 'error');
            }
        });

        // Add explicit click handler for update-broker button
        if (updateBrokerBtn) {
            updateBrokerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Update broker button clicked, triggering form submit');
                brokerForm.dispatchEvent(new Event('submit'));
            });
        } else {
            console.warn('Update broker button (#update-broker) not found in DOM');
            showToast('Update broker button not found. Please check the settings page.', 'error');
        }
    } else {
        console.warn('Broker form (#broker-form) not found in DOM');
        showToast('Broker form not found. Please check the settings page.', 'error');
    }

    if (cancelBrokerBtn) {
        cancelBrokerBtn.addEventListener('click', () => {
            console.log('Cancel broker update clicked');
            editingBrokerId = null;
            brokerForm.reset();
            setDefaultFormValues();
            updateBrokerBtn.classList.add('d-none');
            cancelBrokerBtn.classList.add('d-none');
            brokerForm.querySelector('button[type="submit"]').classList.remove('d-none');
        });
    } else {
        console.warn('Cancel broker button (#cancel-broker-update) not found in DOM');
    }

    // Render brokers first to ensure table is populated
    await renderBrokerList();

    // Attach event listener for edit/delete actions on broker-list-body
    if (brokerListBody) {
        console.log('Attaching listener to broker-list-body');
        brokerListBody.addEventListener('click', async (e) => {
            const editButton = e.target.closest('.edit-broker');
            const deleteButton = e.target.closest('.delete-broker');

            if (editButton) {
                e.stopPropagation();
                const brokerId = parseInt(editButton.dataset.id);
                console.log('Edit broker clicked, brokerId:', brokerId);
                try {
                    const brokers = await loadFromStore('brokers');
                    const broker = brokers.find(b => b.id === brokerId);
                    if (broker) {
                        console.log('Populating form with broker data:', broker);
                        const nameInput = document.getElementById('broker-name');
                        const forexInput = document.getElementById('multiplier-forex');
                        const indicesInput = document.getElementById('multiplier-indices');
                        const commoditiesInput = document.getElementById('multiplier-commodities');
                        const cryptoInput = document.getElementById('multiplier-crypto');
                        const xagusdInput = document.getElementById('multiplier-xagusd');
                        const xauusdInput = document.getElementById('multiplier-xauusd');

                        if (nameInput && forexInput && indicesInput && commoditiesInput && cryptoInput && xagusdInput && xauusdInput) {
                            nameInput.value = broker.name;
                            forexInput.value = broker.multipliers.forex;
                            indicesInput.value = broker.multipliers.indices;
                            commoditiesInput.value = broker.multipliers.commodities;
                            cryptoInput.value = broker.multipliers.crypto;
                            xagusdInput.value = broker.multipliers.commodities_exceptions.XAGUSD;
                            xauusdInput.value = broker.multipliers.commodities_exceptions.XAUUSD;
                            editingBrokerId = brokerId;
                            if (updateBrokerBtn && cancelBrokerBtn) {
                                updateBrokerBtn.classList.remove('d-none');
                                cancelBrokerBtn.classList.remove('d-none');
                                brokerForm.querySelector('button[type="submit"]').classList.add('d-none');
                            } else {
                                console.warn('Update or cancel buttons not found');
                                showToast('Error: Update buttons not found.', 'error');
                            }
                        } else {
                            console.warn('One or more form inputs not found');
                            showToast('Error: Broker form inputs not found.', 'error');
                        }
                    } else {
                        console.warn('Broker not found for ID:', brokerId);
                        showToast('Broker not found.', 'error');
                    }
                } catch (err) {
                    console.error('Error loading broker for edit:', err);
                    showToast('Error loading broker details.', 'error');
                }
            } else if (deleteButton) {
                e.stopPropagation();
                if (isProcessingDelete) {
                    console.log('Delete action already in progress, ignoring click');
                    return;
                }
                isProcessingDelete = true;
                const brokerId = parseInt(deleteButton.dataset.id);
                console.log('Delete broker clicked, brokerId:', brokerId);
                try {
                    const brokers = await loadFromStore('brokers');
                    if (brokers.length === 1) {
                        console.log('Cannot delete the last broker');
                        showToast('Cannot delete the last broker.', 'error');
                        return;
                    }
                    const accounts = await loadFromStore('accounts');
                    const linkedAccounts = accounts.filter(a => a.brokerId === brokerId);
                    if (linkedAccounts.length > 0) {
                        console.log('Cannot delete broker, linked to accounts:', linkedAccounts.map(a => a.name));
                        showToast(`Cannot delete broker in use by accounts: ${linkedAccounts.map(a => a.name).join(', ')}.`, 'error');
                        return;
                    }
                    await deleteFromStore('brokers', brokerId);
                    showToast('Broker deleted successfully.', 'success');
                    console.log('Deleted broker ID:', brokerId);
                    await renderBrokerList();
                      renderAccounts(accounts);
                   
                } catch (err) {
                    console.error('Error deleting broker:', err);
                    showToast('Error deleting broker. Please try again.', 'error');
                } finally {
                    isProcessingDelete = false;
                }
            }
        });
    } else {
        console.warn('Broker list body (#broker-list-body) not found in DOM');
        showToast('Broker table not found. Please check the settings page.', 'error');
    }
}

async function saveSingleTradeAndReflection(trade, reflection) {
    console.time('saveSingleTradeAndReflection');
    try {
        const db = getDB();
        const transaction = db.transaction(['trades', 'reflections'], 'readwrite');
        const tradesStore = transaction.objectStore('trades');
        const reflectionsStore = transaction.objectStore('reflections');

        await Promise.all([
            new Promise((resolve, reject) => {
                const request = tradesStore.put({
                    ...trade,
                    screenshots: trade.screenshots?.map(img => ({ ...img, url: undefined }))
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            }),
            new Promise((resolve, reject) => {
                const request = reflectionsStore.put({
                    ...reflection,
                    reviewScreenshot: reflection.reviewScreenshot instanceof Blob ? reflection.reviewScreenshot : null
                });
                request.onsuccess = resolve;
                request.onerror = () => reject(request.error);
            })
        ]);

        console.log('Single trade and reflection saved successfully');
    } catch (err) {
        console.error('Save single trade and reflection error:', err);
        throw err;
    } finally {
        console.timeEnd('saveSingleTradeAndReflection');
    }
}

const dateInput = document.getElementById('date');
const timeInput = document.getElementById('trade-time');
if (dateInput) {
    const dateWrapper = dateInput.closest('.input-wrapper');
    if (!dateWrapper) {
        console.error('Date input wrapper (.input-wrapper) not found in DOM');
        showToast('Error: Date input wrapper not found. Please check index.html.', 'error');
    } else {
        dateWrapper.addEventListener('click', (e) => {
            e.preventDefault();
            dateInput.showPicker();
        });
    }
} else {
    console.error('Date input element not found in DOM');
    showToast('Error: Date input not found. Please check index.html.', 'error');
}
if (timeInput) {
    const timeWrapper = timeInput.closest('.input-wrapper');
    if (!timeWrapper) {
        console.error('Time input wrapper (.input-wrapper) not found in DOM');
        showToast('Error: Time input wrapper not found. Please check index.html.', 'error');
    } else {
        timeWrapper.addEventListener('click', (e) => {
            e.preventDefault();
            timeInput.showPicker();
        });
    }
} else {
    console.error('Time input element not found in DOM');
    showToast('Error: Time input not found. Please check index.html.', 'error');
}

document.addEventListener('DOMContentLoaded', async () => {
    
        const loggedIn = await isAuthenticated();
      if (!loggedIn) return logout();
    
      const user = await getUserInfo();
      if (!user || !user.id) return logout(); // ❗ Ensure user is not null
    
      const approved = await isUserApproved(user.id);
      if (!approved) return logout(); // 🚫 Enforce server-side approval check

    try {
        await initializeData();
        initializeNavigation();
        initializeStarRating();
        initImportModal();
        initializeTradeForm();

        const page = document.getElementById('strategies');
        if (page && page.classList.contains('active')) {
            console.log('Strategies page active, initializing form');
            initializeStrategyForm();
        }

        const dailyPlanPage = document.getElementById('daily-plan');
        if (dailyPlanPage && dailyPlanPage.classList.contains('active')) {
            console.trace('Triggering initializeDailyPlanPage on DOMContentLoaded', { page: 'daily-plan' });
            await initializeDailyPlanPage(dailyPlans, settings, accounts, trades);
        } else {
            console.log('Daily Plan page not active on DOMContentLoaded, skipping initialization');
        }

        const weeklyRangePage = document.getElementById('weekly-review');
        if (weeklyRangePage && weeklyRangePage.classList.contains('active')) {
            console.trace('Triggering initializeWeeklyReviewPage on DOMContentLoaded', { page: 'weekly-review' });
            await initializeWeeklyReviewPage(dailyPlans, settings, accounts, trades);
        } else {
            console.log('weekly-review page not active on DOMContentLoaded, skipping initialization');
        }

        const tradeTransfersPage = document.getElementById('trade-transfers');
        if (tradeTransfersPage && tradeTransfersPage.classList.contains('active')) {
            console.trace('Triggering initTradeTransfers on DOMContentLoaded', { page: 'trade-transfers' });
            await initTradeTransfers();
        } else {
            console.log('Trade Transfers page not active on DOMContentLoaded, skipping initialization');
        }

        const reportTransfersPage = document.getElementById('reports');
        if (reportTransfersPage && reportTransfersPage.classList.contains('active')) {
            console.trace('Triggering initReports on DOMContentLoaded', { page: 'reports' });
            await initReports();
        } else {
            console.log('reports page not active on DOMContentLoaded, skipping initialization');
        }

        const backupFrequencySelect = document.getElementById('backup-frequency');
        const customBackupInterval = document.getElementById('custom-backup-interval');
        const customIntervalInput = document.getElementById('custom-interval');
        const autoBackupDownloadCheckbox = document.getElementById('auto-backup-download');
        if (backupFrequencySelect && customBackupInterval && customIntervalInput && autoBackupDownloadCheckbox) {
            if (!settings.backupFrequency) {
                settings.backupFrequency = { type: 'daily', interval: 1 };
                await saveToStore('settings', { id: 'settings', ...settings });
                console.log('Initialized missing backupFrequency to default: daily');
            }
            backupFrequencySelect.value = settings.backupFrequency.type;
            if (settings.backupFrequency.type === 'custom') {
                customBackupInterval.classList.remove('d-none');
                customIntervalInput.value = settings.backupFrequency.interval;
            } else {
                customBackupInterval.classList.add('d-none');
            }
            autoBackupDownloadCheckbox.checked = settings.autoBackupDownload;
            backupFrequencySelect.addEventListener('change', async (e) => {
                const type = e.target.value;
                settings.backupFrequency.type = type;
                if (type === 'custom') {
                    customBackupInterval.classList.remove('d-none');
                    settings.backupFrequency.interval = parseInt(customIntervalInput.value) || 1;
                } else {
                    customBackupInterval.classList.add('d-none');
                    settings.backupFrequency.interval = type === 'daily' ? 1 : type === 'weekly' ? 7 : 0;
                }
                try {
                    await saveToStore('settings', { id: 'settings', ...settings });
                    showToast('Backup frequency updated!', 'success');
                } catch (err) {
                    showToast('Error saving backup frequency.', 'error');
                    console.error('Error saving settings:', err);
                }
            });
            customIntervalInput.addEventListener('input', async (e) => {
                const interval = parseInt(e.target.value) || 1;
                if (settings.backupFrequency.type === 'custom') {
                    settings.backupFrequency.interval = interval;
                    try {
                        await saveToStore('settings', { id: 'settings', ...settings });
                        showToast('Custom backup interval updated!', 'success');
                    } catch (err) {
                        showToast('Error saving backup interval.', 'error');
                        console.error('Error saving settings:', err);
                    }
                }
            });
            autoBackupDownloadCheckbox.addEventListener('change', async (e) => {
                settings.autoBackupDownload = e.target.checked;
                try {
                    await saveToStore('settings', { id: 'settings', ...settings });
                    showToast(`Auto-backup downloads ${e.target.checked ? 'enabled' : 'disabled'}!`, 'success');
                } catch (err) {
                    showToast('Error saving auto-backup download setting.', 'error');
                    console.error('Error saving settings:', err);
                }
            });
        } else {
            console.warn('Backup frequency or download controls not found in DOM');
        }

        // Initialize Broker Multipliers Management
        await initializeBrokerManagement();

        // Updated Account Form Logic
const accountForm = document.getElementById('account-form');
if (accountForm) {
    // Remove existing listeners to prevent duplicates
    if (accountForm.__submitHandler) {
        accountForm.removeEventListener('submit', accountForm.__submitHandler);
    }

    // Debounced submit handler
    const debouncedSubmit = debounce(async (e) => {
        e.preventDefault();
        console.log('Account form submitted');
        const account = {
            name: document.getElementById('account-name').value.trim(),
            initialBalance: parseFloat(document.getElementById('initial-balance').value),
            dailyDrawdown: parseFloat(document.getElementById('daily-drawdown').value),
            maxTradesPerDay: parseInt(document.getElementById('max-trades-per-day').value),
            maxLossPerDay: parseFloat(document.getElementById('max-loss-per-day').value),
            isPropFirm: document.getElementById('is-propfirm').checked,
            brokerId: document.getElementById('broker-id').value ? parseInt(document.getElementById('broker-id').value) : null,
            maxDrawdown: parseFloat(document.getElementById('max-drawdown').value) || 0,
            profitSplit: parseFloat(document.getElementById('profit-split').value) || 0
        };

        await processAccount(account, false); // Always treat submit as new account
    }, 500);

    accountForm.__submitHandler = debouncedSubmit;
    accountForm.addEventListener('submit', accountForm.__submitHandler);

    // Update account button handler
    const updateAccountButton = document.getElementById('update-account');
    if (updateAccountButton) {
        // Remove existing listeners
        if (updateAccountButton.__clickHandler) {
            updateAccountButton.removeEventListener('click', updateAccountButton.__clickHandler);
        }

        updateAccountButton.__clickHandler = async () => {
            console.log('Update account button clicked');
            const account = {
                name: document.getElementById('account-name').value.trim(),
                initialBalance: parseFloat(document.getElementById('initial-balance').value),
                dailyDrawdown: parseFloat(document.getElementById('daily-drawdown').value),
                maxTradesPerDay: parseInt(document.getElementById('max-trades-per-day').value),
                maxLossPerDay: parseFloat(document.getElementById('max-loss-per-day').value),
                isPropFirm: document.getElementById('is-propfirm').checked,
                brokerId: document.getElementById('broker-id').value ? parseInt(document.getElementById('broker-id').value) : null,
                maxDrawdown: parseFloat(document.getElementById('max-drawdown').value) || 0,
                profitSplit: parseFloat(document.getElementById('profit-split').value) || 0
            };

            await processAccount(account, true); // Treat as update
        };
        updateAccountButton.addEventListener('click', updateAccountButton.__clickHandler);
    }
}

       const paginationContainer = document.getElementById('pagination');
if (paginationContainer) {
    paginationContainer.addEventListener('click', async (e) => {
        e.preventDefault();
        const pageLink = e.target.closest('.page-link');
        if (!pageLink) {
            console.log('No page-link found for click event');
            return;
        }

        const parentItem = pageLink.closest('.page-item');
        if (parentItem.classList.contains('disabled')) {
            console.log('Pagination click ignored: button is disabled');
            return;
        }

        const page = parseInt(pageLink.dataset.page);
        if (isNaN(page)) {
            console.warn('Invalid page number:', pageLink.dataset.page);
            return;
        }

        const activeAccount = accounts.find(a => a.id === settings.activeAccountId);
        if (!activeAccount) {
            showToast('No active account selected.', 'error');
            console.error('No active account for pagination');
            return;
        }

        let filteredTrades = trades.filter(t => t.accountId === settings.activeAccountId);
        console.log('Initial filtered trades count:', filteredTrades.length);

        // Apply global date filter
        if (globalDateFilter.type === 'custom' && globalDateFilter.startDate && globalDateFilter.endDate) {
            filteredTrades = filterTradesByDateRange(filteredTrades, globalDateFilter.startDate, globalDateFilter.endDate);
        } else {
            const range = getDateRangeForFilter(globalDateFilter.type);
            if (range.startDate && range.endDate) {
                filteredTrades = filterTradesByDateRange(filteredTrades, range.startDate岂, range.endDate);
            }
        }

        // Apply additional filters
        if (currentFilters.pair) {
            filteredTrades = filteredTrades.filter(t => t.pair === currentFilters.pair);
        }
        if (currentFilters.outcome) {
            filteredTrades = filteredTrades.filter(t => t.outcome === currentFilters.outcome);
        }
        if (currentFilters.strategy) {
            filteredTrades = filteredTrades.filter(t => t.strategy === currentFilters.strategy);
        }
        if (currentFilters.dateStart && currentFilters.dateEnd) {
            filteredTrades = filterTradesByDateRange(filteredTrades, currentFilters.dateStart, currentFilters.dateEnd);
        }
        if (currentFilters.quickSearch) {
            filteredTrades = filteredTrades.filter(t =>
                Object.values(t).some(val =>
                    typeof val === 'string' && val.toLowerCase().includes(currentFilters.quickSearch.toLowerCase())
                )
            );
        }

        const totalPages = Math.ceil(filteredTrades.length / recordsPerPage) || 1;
        console.log(`Pagination details: page=${page}, currentPage=${currentPage}, totalPages=${totalPages}, filteredTrades=${filteredTrades.length}`);

        if (page >= 1 && page <= totalPages && page !== currentPage) {
            currentPage = page;
            try {
                await renderTrades(
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
                    settings.activeAccountId
                );

                // Verify pagination UI update
                const activePageItem = paginationContainer.querySelector('.page-item.active');
                if (activePageItem) {
                    activePageItem.classList.remove('active');
                }
                const newActivePageItem = paginationContainer.querySelector(`.page-item [data-page="${currentPage}"]`)?.closest('.page-item');
                if (newActivePageItem) {
                    newActivePageItem.classList.add('active');
                    console.log('Updated active page item to:', currentPage);
                } else {
                    console.warn('Failed to find new active page item for page:', currentPage);
                }

            } catch (err) {
                console.error('Error rendering trades for page:', page, err);
                showToast('Error loading page.', 'error');
            }
        } else {
            console.log(`Pagination click ignored: page=${page}, currentPage=${currentPage}, totalPages=${totalPages}`);
        }
    });
} else {
    console.warn('Pagination container (#pagination) not found');
    showToast('Pagination controls not found. Please check the trade log HTML.', 'error');
}

    } catch (err) {
        showToast('Error setting up navigation or UI controls.', 'error');
        console.error('Post-initialization error:', err);
    }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await logout();
});