// Imports utility functions for data handling and UI updates
import { openDB, loadFromStore, saveToStore } from './data.js';
import { 
  filterTradesByAccount, 
  filterTradesByDateRange, 
  showToast, 
  showLoader, 
  hideLoader, 
  indexTradesByMonth, 
  getDateRangeForFilter 
} from './utils.js';

// Global variables for managing state
// Purpose: Stores accounts, trades, strategies, and UI-related data
let accounts = []; // List of all accounts
let trades = []; // All trades loaded from store
let strategies = []; // All strategies loaded from store
let filteredTrades = []; // Trades after applying filters
let selectedTradeIds = new Set(); // IDs of selected trades
let currentPage = 1; // Current page for pagination
let pageSize = 25; // Number of trades per page
const MAX_TRADES = 1000; // Maximum trades to display when 'all' is selected
let datePicker = null; // Flatpickr instance for date range selection
let totalTradesCount = 0; // Total number of filtered trades

// Initializes the trade transfers page
// Purpose: Sets up UI, loads data, and attaches event listeners
export async function initTradeTransfers() {
  showLoader('trade-transfers');
  try {
    // Loads accounts and strategies from store
    // Purpose: Populates dropdowns with account and strategy data
    accounts = await loadFromStore('accounts');
    strategies = await loadFromStore('strategies');
    populateAccountDropdowns();
    populateStrategyDropdown();

    // Initializes page size from dropdown
    // Purpose: Sets initial pagination size
    const pageSizeSelect = document.getElementById('page-size');
    pageSize = parseInt(pageSizeSelect.value) || 25;

    // Initializes date range picker with default to current month
    // Purpose: Sets up Flatpickr for date range filtering
    const { startDate, endDate } = getDateRangeForFilter('current-month');
    datePicker = flatpickr('#date-range', {
      mode: 'range',
      dateFormat: 'Y-m-d',
      defaultDate: [startDate, endDate],
      maxDate: new Date(),
      allowInput: false,
      onChange: (selectedDates) => {
        if (selectedDates.length === 2) {
          console.log('Flatpickr onChange:', selectedDates.map(d => d.toISOString().split('T')[0]));
        }
      }
    });

    // Attaches event listeners for UI interactions
    // Purpose: Handles user actions like loading trades, pagination, and transfers
    document.getElementById('load-trades-btn').addEventListener('click', () => {
      setTimeout(() => loadTrades(), 100); // Delays to allow Flatpickr to update
    });
    document.getElementById('select-all').addEventListener('change', toggleSelectAll);
    document.getElementById('page-size').addEventListener('change', updatePageSize);
    document.getElementById('first-page').addEventListener('click', () => goToPage(1));
    document.getElementById('prev-page').addEventListener('click', () => goToPage(currentPage - 1));
    document.getElementById('next-page').addEventListener('click', () => goToPage(currentPage + 1));
    document.getElementById('last-page').addEventListener('click', () => goToPage(Math.ceil(totalTradesCount / pageSize)));
    document.getElementById('transfer-button').addEventListener('click', showConfirmationModal);
    document.getElementById('confirm-transfer').addEventListener('click', confirmTransfer);
    document.getElementById('assign-strategy-btn').addEventListener('click', showAssignStrategyModal);
    document.getElementById('confirm-assign-strategy').addEventListener('click', confirmAssignStrategy);
    document.getElementById('source-account').addEventListener('change', populateStrategyDropdown);

    // Adds event listener for trade checkbox changes
    // Purpose: Updates strategy button when trades are selected
    document.getElementById('trade-list').addEventListener('change', (event) => {
      if (event.target.classList.contains('trade-checkbox')) {
        updateAssignStrategyButton();
      }
    });
  } catch (err) {
    console.error('Error initializing page:', err);
    showToast('Error setting up page.', 'error');
  } finally {
    hideLoader('trade-transfers');
  }
}

// Populates source and target account dropdowns
// Purpose: Fills account selection dropdowns with available accounts
function populateAccountDropdowns() {
  const sourceSelect = document.getElementById('source-account');
  const targetSelect = document.getElementById('target-account');
  sourceSelect.innerHTML = '<option value="">Select Source Account</option>';
  targetSelect.innerHTML = '<option value="">Select Target Account</option>';
  accounts.forEach(account => {
    const option = `<option value="${account.id}">${account.name || `Account ${account.id}`}</option>`;
    sourceSelect.insertAdjacentHTML('beforeend', option);
    targetSelect.insertAdjacentHTML('beforeend', option);
  });
}

// Populates strategy dropdown based on source account
// Purpose: Filters and displays strategies for the selected source account
function populateStrategyDropdown() {
  const strategySelect = document.getElementById('strategy-select');
  strategySelect.innerHTML = '<option value="">Select Strategy</option>';
  const sourceAccountId = parseInt(document.getElementById('source-account').value);
  
  // Filters strategies by the selected source account
  const filteredStrategies = sourceAccountId ? strategies.filter(strategy => strategy.accountId === sourceAccountId) : [];
  
  filteredStrategies.forEach(strategy => {
    const option = `<option value="${strategy.id}">${strategy.name || `Strategy ${strategy.id}`}</option>`;
    strategySelect.insertAdjacentHTML('beforeend', option);
  });

  // Attaches listener to update button state on strategy change
  strategySelect.addEventListener('change', updateAssignStrategyButton);
  updateAssignStrategyButton();
}

// Loads and filters trades based on user selections
// Purpose: Fetches trades, applies filters, and updates UI
async function loadTrades() {
  showLoader('trade-transfers');
  try {
    const sourceAccountId = parseInt(document.getElementById('source-account').value);
    const targetAccountId = parseInt(document.getElementById('target-account').value);
    
    // Validates account selections
    if (!sourceAccountId || !targetAccountId) {
      showToast('Please select both source and target accounts.', 'error');
      document.getElementById('trade-list-container').classList.add('d-none');
      return;
    }
    
    // Validates date range
    if (!datePicker.selectedDates || datePicker.selectedDates.length !== 2) {
      showToast('Please select a valid date range.', 'error');
      document.getElementById('trade-list-container').classList.add('d-none');
      return;
    }
    
    const [startDate, endDate] = datePicker.selectedDates;
    const diffDays = (endDate - startDate) / (1000 * 60 * 60 * 24);
    const today = new Date();
    if (startDate > today || endDate > today) {
      showToast('Date range cannot include future dates.', 'error');
      document.getElementById('trade-list-container').classList.add('d-none');
      return;
    }
    if (diffDays > 365) {
      showToast('Date range cannot exceed 1 year.', 'error');
      document.getElementById('trade-list-container').classList.add('d-none');
      return;
    }
    if (startDate > endDate) {
      showToast('End date must be after start date.', 'error');
      document.getElementById('trade-list-container').classList.add('d-none');
      return;
    }

    // Updates page size
    const pageSizeSelect = document.getElementById('page-size');
    pageSize = pageSizeSelect.value === 'all' ? MAX_TRADES : parseInt(pageSizeSelect.value);

    // Fetches and filters trades
    trades = await loadFromStore('trades');
    filteredTrades = filterTradesByAccount(trades, sourceAccountId);
    filteredTrades = filterTradesByDateRange(filteredTrades, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
    totalTradesCount = filteredTrades.length;

    // Sorts trades (copied trades first, then by date descending)
    filteredTrades.sort((a, b) => {
      if (a.isCopied && !b.isCopied) return -1;
      if (!a.isCopied && b.isCopied) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    // Resets selection and pagination
    selectedTradeIds.clear();
    currentPage = 1;
    await fetchTradesForCurrentPage();
    updatePagination();
    updateTransferButton();
    updateAssignStrategyButton();
    document.getElementById('trade-list-container').classList.remove('d-none');
  } catch (err) {
    console.error('Error loading trades:', err);
    showToast('Error loading trades.', 'error');
    document.getElementById('trade-list-container').classList.add('d-none');
  } finally {
    hideLoader('trade-transfers');
  }
}

// Fetches trades for the current page
// Purpose: Retrieves and sorts trades for pagination
async function fetchTradesForCurrentPage() {
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = pageSize === 'all' ? totalTradesCount : Math.min(startIndex + pageSize, totalTradesCount);

  // Opens database and transaction
  const db = await openDB();
  const tx = db.transaction('trades', 'readonly');
  const store = tx.objectStore('trades');
  const index = store.index('accountId');

  const sourceAccountId = parseInt(document.getElementById('source-account').value);
  const [startDate, endDate] = datePicker.selectedDates;
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  const tradesForPage = [];
  let currentIndex = 0;
  const cursorRequest = index.openCursor(IDBKeyRange.only(sourceAccountId));

  // Iterates through trades to select those within date range and page bounds
  await new Promise((resolve, reject) => {
    cursorRequest.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) {
        resolve();
        return;
      }
      const trade = cursor.value;
      const tradeDate = trade.date;
      if (tradeDate >= startDateStr && tradeDate <= endDateStr) {
        if (currentIndex >= startIndex && currentIndex < endIndex && tradesForPage.length < pageSize) {
          tradesForPage.push(trade);
        }
        currentIndex++;
      }
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  // Sorts trades for the current page
  tradesForPage.sort((a, b) => {
    if (a.isCopied && !b.isCopied) return -1;
    if (!a.isCopied && b.isCopied) return 1;
    return new Date(b.date) - new Date(a.date);
  });

  console.log('Trades for page:', tradesForPage.length, tradesForPage.map(t => ({ id: t.id, date: t.date, isCopied: t.isCopied })));

  // Updates filteredTrades and renders list
  filteredTrades = tradesForPage;
  renderTradeList();
  updateSelectAll();
}

// Renders the trade list in the UI
// Purpose: Displays trades in a table with selection checkboxes
function renderTradeList() {
  const tradeListBody = document.getElementById('trade-list').querySelector('tbody');
  tradeListBody.innerHTML = '';
  const sourceAccountId = parseInt(document.getElementById('source-account').value);
  const sourceAccount = accounts.find(a => a.id === sourceAccountId);
  const sourceAccountName = sourceAccount ? sourceAccount.name || `Account ${sourceAccount.id}` : 'Unknown Account';

  // Generates table rows for each trade
  filteredTrades.forEach(trade => {
    const isSelected = selectedTradeIds.has(trade.id);
    const actionNote = trade.isCopied ? `Trade copied from ${sourceAccountName}` : trade.isTransferred ? `Trade transferred from ${sourceAccountName}` : '';
    const pnlClass = trade.profitLoss > 0 ? 'pnl-positive' : trade.profitLoss < 0 ? 'pnl-negative' : '';
    const outcomeClass = trade.outcome === 'Win' ? 'outcome-win' : trade.outcome === 'Loss' ? 'outcome-loss' : '';
    const strategy = strategies.find(s => s.id === trade.strategyId);
    const strategyName = strategy ? strategy.name : 'N/A';
    const row = `
      <tr>
        <td>
          <input type="checkbox" class="form-check-input trade-checkbox" data-trade-id="${trade.id}" ${isSelected ? 'checked' : ''}>
        </td>
        <td>${trade.id}</td>
        <td>${trade.date}</td>
        <td>${trade.pair || 'N/A'}</td>
        <td>${strategyName}</td>
        <td class="${outcomeClass}">${trade.outcome || 'N/A'}</td>
        <td class="${pnlClass}">${trade.profitLoss !== undefined ? `$${trade.profitLoss.toFixed(2)}` : 'N/A'}</td>
        <td>${actionNote}</td>
      </tr>
    `;
    tradeListBody.insertAdjacentHTML('beforeend', row);
  });

  // Attaches event listeners to checkboxes
  document.querySelectorAll('.trade-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const tradeId = parseInt(checkbox.dataset.tradeId);
      if (checkbox.checked) {
        selectedTradeIds.add(tradeId);
      } else {
        selectedTradeIds.delete(tradeId);
      }
      updateSelectAll();
      updateTransferButton();
      updateAssignStrategyButton();
    });
  });
}

// Toggles selection of all visible trades
// Purpose: Selects or deselects all trades on the current page
function toggleSelectAll() {
  const selectAll = document.getElementById('select-all');
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = pageSize === 'all' ? filteredTrades.length : Math.min(startIndex + pageSize, filteredTrades.length);
  const visibleTrades = filteredTrades.slice(startIndex, endIndex);

  selectedTradeIds.clear();
  if (selectAll.checked) {
    visibleTrades.forEach(trade => selectedTradeIds.add(trade.id));
  }
  renderTradeList();
  updateTransferButton();
  updateAssignStrategyButton();
}

// Updates the select-all checkbox state
// Purpose: Reflects whether all visible trades are selected
function updateSelectAll() {
  const selectAll = document.getElementById('select-all');
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = pageSize === 'all' ? filteredTrades.length : Math.min(startIndex + pageSize, filteredTrades.length);
  const visibleTrades = filteredTrades.slice(startIndex, endIndex);
  const allVisibleSelected = visibleTrades.length > 0 && visibleTrades.every(trade => selectedTradeIds.has(trade.id));
  selectAll.checked = allVisibleSelected;
}

// Updates the page size and refreshes trades
// Purpose: Adjusts pagination based on user-selected page size
function updatePageSize() {
  const select = document.getElementById('page-size');
  const previousPageSize = pageSize;
  pageSize = select.value === 'all' ? MAX_TRADES : parseInt(select.value);
  
  // Recalculates current page to maintain record range
  if (previousPageSize !== pageSize) {
    const startIndex = (currentPage - 1) * previousPageSize;
    currentPage = Math.floor(startIndex / pageSize) + 1;
  }

  fetchTradesForCurrentPage();
  updatePagination();
  updateSelectAll();
}

// Navigates to a specific page
// Purpose: Updates the current page and refreshes trade list
function goToPage(page) {
  currentPage = Math.max(1, Math.min(page, Math.ceil(totalTradesCount / pageSize)));
  fetchTradesForCurrentPage();
  updatePagination();
  updateSelectAll();
}

// Updates pagination button states
// Purpose: Enables/disables pagination controls based on current page
function updatePagination() {
  const totalPages = Math.ceil(totalTradesCount / pageSize);
  document.getElementById('first-page').disabled = currentPage === 1 || totalTradesCount === 0;
  document.getElementById('prev-page').disabled = currentPage === 1 || totalTradesCount === 0;
  document.getElementById('next-page').disabled = currentPage === totalPages || totalTradesCount === 0;
  document.getElementById('last-page').disabled = currentPage === totalPages || totalTradesCount === 0;
}

// Updates the transfer button state
// Purpose: Enables/disables the transfer button based on trade selection
function updateTransferButton() {
  const transferButton = document.getElementById('transfer-button');
  transferButton.disabled = selectedTradeIds.size === 0;
}

// Updates the assign strategy button state
// Purpose: Enables/disables the assign strategy button based on selections
function updateAssignStrategyButton() {
  const assignButton = document.getElementById('assign-strategy-btn');
  const strategySelect = document.getElementById('strategy-select');
  const isEnabled = selectedTradeIds.size > 0 && strategySelect.value;
  assignButton.disabled = !isEnabled;
  console.log('Updating Assign Strategy Button:', {
    selectedTradeIds: selectedTradeIds.size,
    strategySelected: strategySelect.value,
    buttonEnabled: isEnabled
  });
}

// Shows the transfer confirmation modal
// Purpose: Displays selected trades and transfer details for confirmation
function showConfirmationModal() {
  const sourceAccountId = parseInt(document.getElementById('source-account').value);
  const targetAccountId = parseInt(document.getElementById('target-account').value);
  const sourceAccount = accounts.find(a => a.id === sourceAccountId);
  const targetAccount = accounts.find(a => a.id === targetAccountId);
  
  // Validates account selections
  if (!sourceAccount || !targetAccount) {
    showToast('Invalid source or target account.', 'error');
    return;
  }
  
  const selectedTrades = filteredTrades.filter(t => selectedTradeIds.has(t.id));
  const isSameAccount = sourceAccountId === targetAccountId;
  const action = isSameAccount ? 'copy' : 'transfer';
  
  // Updates modal content
  document.getElementById('transfer-summary').textContent = `Are you sure you want to ${action} ${selectedTrades.length} trade(s) from ${sourceAccount.name || `Account ${sourceAccount.id}`} to ${targetAccount.name || `Account ${targetAccount.id}`}?`;
  const tradeDetails = document.getElementById('trade-details');
  tradeDetails.innerHTML = selectedTrades.map(trade => `
    <li class="list-group-item">
      ID: ${trade.id}, Pair: ${trade.pair || 'N/A'}, Strategy: ${trade.strategy || 'N/A'}, 
      Outcome: ${trade.outcome || 'N/A'}, PnL: $${(trade.profitLoss || 0).toFixed(2)}
    </li>
  `).join('');
  
  // Shows modal
  const modal = new bootstrap.Modal(document.getElementById('confirm-modal'));
  modal.show();
}

// Shows the assign strategy modal
// Purpose: Displays selected trades and strategy for assignment confirmation
function showAssignStrategyModal() {
  const selectedTrades = filteredTrades.filter(t => selectedTradeIds.has(t.id));
  const strategySelect = document.getElementById('strategy-select');
  const strategyId = parseInt(strategySelect.value);
  const strategy = strategies.find(s => s.id === strategyId);
  const strategyName = strategy ? strategy.name : 'Unknown Strategy';

  // Updates modal content
  document.getElementById('assign-strategy-summary').textContent = `Are you sure you want to assign/reassign the strategy "${strategyName}" to ${selectedTrades.length} trade(s)?`;
  const assignDetails = document.getElementById('assign-strategy-details');
  assignDetails.innerHTML = selectedTrades.map(trade => {
    const action = trade.strategyId ? 'Reassign' : 'Assign';
    const currentStrategy = trade.strategyId ? strategies.find(s => s.id === trade.strategyId)?.name || 'Unknown' : 'None';
    return `
      <li class="list-group-item">
        ${action} Trade ID: ${trade.id}, Current Strategy: ${currentStrategy}, New Strategy: ${strategyName}
      </li>
    `;
  }).join('');
  
  // Shows modal
  const modal = new bootstrap.Modal(document.getElementById('assign-strategy-modal'));
  modal.show();
}

// Confirms strategy assignment to selected trades
// Purpose: Updates trade records with selected strategy
async function confirmAssignStrategy() {
  showLoader('trade-transfers');
  try {
    const strategySelect = document.getElementById('strategy-select');
    const strategyId = parseInt(strategySelect.value);
    const strategy = strategies.find(s => s.id === strategyId);
    
    // Validates strategy selection
    if (!strategy) {
      showToast('Invalid strategy selected.', 'error');
      return;
    }

    const selectedTrades = filteredTrades.filter(t => selectedTradeIds.has(t.id));
    const db = await openDB();
    const tx = db.transaction('trades', 'readwrite');
    const store = tx.objectStore('trades');

    // Updates trades with new strategy ID
    const updatePromises = [];
    for (const trade of selectedTrades) {
      trade.strategyId = strategyId;
      updatePromises.push(new Promise((resolve, reject) => {
        const request = store.put(trade);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }));
    }

    await Promise.all(updatePromises);
    await tx.done;

    showToast(`Successfully assigned/reassigned strategy to ${selectedTrades.length} trade(s).`, 'success');
    await loadTrades();
    bootstrap.Modal.getInstance(document.getElementById('assign-strategy-modal')).hide();
  } catch (err) {
    console.error('Error assigning strategy:', err);
    showToast('Error assigning strategy.', 'error');
  } finally {
    hideLoader('trade-transfers');
  }
}

// Confirms transfer or copy of selected trades
// Purpose: Updates or creates trade records based on transfer/copy action
async function confirmTransfer() {
  showLoader('trade-transfers');
  try {
    const sourceAccountId = parseInt(document.getElementById('source-account').value);
    const targetAccountId = parseInt(document.getElementById('target-account').value);
    const isSameAccount = sourceAccountId === targetAccountId;
    const selectedTrades = filteredTrades.filter(t => selectedTradeIds.has(t.id));
    let invalidTrades = 0;

    const db = await openDB();
    const tx = db.transaction('trades', 'readwrite');
    const store = tx.objectStore('trades');

    // Fetches all existing trades to determine max ID
    const allTradesRequest = store.getAll();
    const existingTrades = await new Promise((resolve, reject) => {
      allTradesRequest.onsuccess = () => resolve(allTradesRequest.result);
      allTradesRequest.onerror = () => reject(allTradesRequest.error);
    });
    const existingIds = existingTrades.map(trade => trade.id);
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;

    // Processes selected trades
    const putPromises = [];
    for (let i = 0; i < selectedTrades.length; i++) {
      const trade = selectedTrades[i];
      
      // Validates trade data
      if (typeof trade.profitLoss !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(trade.date)) {
        invalidTrades++;
        continue;
      }
      
      if (isSameAccount) {
        // Copies trade with new ID and marks as copied
        const newTrade = { ...trade, id: maxId + i + 1, balance: null, isCopied: true, isTransferred: false };
        putPromises.push(new Promise((resolve, reject) => {
          const request = store.put(newTrade);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }));
      } else {
        // Transfers trade by updating account ID and clearing strategy
        trade.accountId = targetAccountId;
        trade.balance = null;
        trade.strategyId = null; // Clears strategy as they are account-specific
        trade.isTransferred = true;
        trade.isCopied = false;
        putPromises.push(new Promise((resolve, reject) => {
          const request = store.put(trade);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        }));
      }
    }

    // Executes all updates
    await Promise.all(putPromises);
    await tx.done;

    // Shows warning for invalid trades
    if (invalidTrades > 0) {
      showToast(`${invalidTrades} trade(s) skipped due to invalid data.`, 'warning');
    }

    // Shows success message
    const targetAccount = accounts.find(a => a.id === targetAccountId);
    showToast(`Successfully ${isSameAccount ? 'copied' : 'transferred'} ${selectedTrades.length - invalidTrades} trades to account ${targetAccount.name || `Account ${targetAccount.id}`}.`, 'success');
    
    // Refreshes trade list
    await loadTrades();
    bootstrap.Modal.getInstance(document.getElementById('confirm-modal')).hide();
  } catch (err) {
    console.error('Error transferring trades:', err);
    showToast('Error transferring trades.', 'error');
  } finally {
    hideLoader('trade-transfers');
  }
}