/* CHANGES START: Fix container handling, improve error handling */
import { loadFromStore, saveToStore } from './data.js';
import { showToast, formatMoney } from './utils.js';

// Global calendar settings with defaults
// CHANGE: Simplified initialization, removed IIFE
let calendarSettings = {
    showWeeklyStats: true,   // Toggle weekly stats display
    showTradeDetails: true   // Toggle trade details display
};

/**
 * Calculates daily trading statistics for a given month
 * Purpose: Aggregate trade data per day for calendar display
 * @param {Array} trades - Array of trade objects
 * @param {number} year - Year to calculate stats for
 * @param {number} month - Month to calculate stats for (0-11)
 * @returns {Object} Daily stats keyed by day number
 */
export function calculateDailyStats(trades, year, month) {
    const stats = {};
    const daysInMonth = new Date(year, month + 1, 0).getDate(); // Get days in month

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD format
        
        // Filter trades for current day (converted to NY timezone)
        const dailyTrades = trades.filter(t => {
            const localDate = convertToNewYorkDateString(t.date);
            return localDate === dateString;
        });

        // Calculate daily P&L including commissions and swaps
        const profitLoss = dailyTrades.reduce((sum, t) => 
            sum + (t.profitLoss || 0) + (t.commission || 0) + (t.swap || 0), 0
        );

        // Calculate win rate
        const tradeCount = dailyTrades.length;
        const wins = dailyTrades.filter(t => t.outcome === 'Win').length;
        const winRate = tradeCount ? (wins / tradeCount * 100).toFixed(1) : '0.0';

        // Store daily metrics
        stats[day] = { profitLoss, tradeCount, winRate, trades: dailyTrades };
    }

    return stats;
}

/**
 * Calculates weekly and monthly trading statistics
 * Purpose: Provide aggregated views for performance analysis
 * @param {Object} dailyStats - Daily stats from calculateDailyStats()
 * @param {number} year - Year for calculation
 * @param {number} month - Month for calculation (0-11)
 * @returns {Object} Contains weeklyStats array and monthlyStats object
 */
export function calculateWeeklyAndMonthlyStats(dailyStats, year, month) {
    const weeklyStats = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let currentWeek = [];
    let weekNumber = 1;

    // Group days into weeks (Sunday to Saturday)
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
        currentWeek.push({ day, stats: dailyStats[day] });

        // End of week (Saturday) or end of month
        if (dayOfWeek === 6 || day === daysInMonth) {
            // Calculate weekly P&L (deducting commissions/swaps)
            const weekProfitLoss = currentWeek.reduce((sum, d) => {
                return sum + (d.stats.trades || []).reduce((subSum, t) => {
                    const profit = t.profitLoss || 0;
                    const commission = Math.abs(t.commission || 0);
                    const swap = Math.abs(t.swap || 0);
                    return subSum + (profit - commission - swap);
                }, 0);
            }, 0);

            // Count trading days in week
            const tradingDays = currentWeek.filter(d => d.stats.tradeCount > 0).length;
            weeklyStats.push({ weekNumber, profitLoss: weekProfitLoss, tradingDays });
            
            currentWeek = []; // Reset for next week
            weekNumber++;
        }
    }

    // Calculate monthly stats
    const monthlyProfitLoss = Object.values(dailyStats).reduce((sum, d) => {
        return sum + (d.trades || []).reduce((subSum, t) => {
            const profit = t.profitLoss || 0;
            const commission = Math.abs(t.commission || 0);
            const swap = Math.abs(t.swap || 0);
            return subSum + (profit - commission - swap);
        }, 0);
    }, 0);

    const monthlyTradingDays = Object.values(dailyStats).filter(d => d.tradeCount > 0).length;
    const monthlyTradeCount = Object.values(dailyStats).reduce((sum, d) => sum + d.tradeCount, 0);

    return {
        weeklyStats,
        monthlyStats: {
            profitLoss: monthlyProfitLoss,
            tradingDays: monthlyTradingDays,
            tradeCount: monthlyTradeCount
        }
    };
}

/**
 * Calculates yearly trading statistics
 * Purpose: Show annual performance overview
 * @param {Array} trades - Array of trade objects
 * @param {number} year - Year to calculate stats for
 * @returns {Object} Yearly performance metrics
 */
export function calculateYearlyStats(trades, year) {
    // Filter trades for given year
    const yearlyTrades = trades.filter(t => t.date.startsWith(String(year)));
    
    // Calculate yearly metrics
    const totalPnL = yearlyTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const totalTrades = yearlyTrades.length;
    const wins = yearlyTrades.filter(t => t.outcome === 'Win').length;
    const winRate = totalTrades ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

    return {
        totalPnL: totalPnL,
        totalTrades: totalTrades,
        winRate: winRate
    };
}

/**
 * Downloads monthly calendar as PDF (landscape)
 * Purpose: Export functionality for user reports
 * @param {number} year - Year for calendar
 * @param {number} month - Month for calendar (0-11)
 */
export async function downloadMonthlyCalendarPDF(year, month) {
    try {
        // Library checks
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library is not loaded. Please check your internet connection and refresh the page.');
        }
        if (!window.html2canvas) {
            throw new Error('html2canvas library is not loaded. Please check your internet connection and refresh the page.');
        }

        // PDF setup (landscape)
        const jsPDF = window.jspdf.jsPDF;
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Capture calendar element
        const monthlyCalendar = document.querySelector('.calendar-container');
        if (!monthlyCalendar) throw new Error('Monthly calendar not found');
        
        // Generate canvas from HTML (with dark mode support)
        const canvas = await window.html2canvas(monthlyCalendar, {
            scale: 2,
            useCORS: true,
            backgroundColor: document.body.classList.contains('dark-mode') ? '#212529' : '#f8f9fa'
        });
        
        // Add image to PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgProps = pdf.getImageProperties(imgData);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = (imgProps.height * (pageWidth - 20)) / imgProps.width;
        let heightLeft = imgHeight;
        let position = 10;

        // Handle multi-page documents
        pdf.addImage(imgData, 'JPEG', 10, position, pageWidth - 20, imgHeight);
        heightLeft -= pageHeight - 20;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight + 10;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 10, position, pageWidth - 20, imgHeight);
            heightLeft -= pageHeight - 20;
        }

        // Save with descriptive filename
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        pdf.save(`Monthly_Calendar_${monthNames[month]}_${year}.pdf`);
        showToast('Monthly calendar saved as PDF!', 'success');
    } catch (err) {
        showToast(`Error generating PDF: ${err.message}`, 'error');
        console.error('Monthly calendar PDF error:', err);
    }
}

/**
 * Downloads yearly calendar as PDF (portrait)
 * Purpose: Export annual report for record-keeping
 * @param {number} year - Year to export
 * @param {HTMLElement} wrapper - Optional container element
 */
export async function downloadYearlyCalendarPDF(year, wrapper = null) {
    try {
        // Library checks
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error('jsPDF library is not loaded. Please check your internet connection and refresh the page.');
        }
        if (!window.html2canvas) {
            throw new Error('html2canvas library is not loaded. Please check your internet connection and refresh the page.');
        }

        // PDF setup (portrait)
        const jsPDF = window.jspdf.jsPDF;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Locate yearly calendar element
        const yearlyCalendar = wrapper ? wrapper.querySelector('.yearly-overview') : document.getElementById('yearly-overview');
        if (!yearlyCalendar) throw new Error('Yearly calendar not found');
        
        // Generate canvas from HTML
        const canvas = await window.html2canvas(yearlyCalendar, {
            scale: 2,
            useCORS: true,
            backgroundColor: document.body.classList.contains('dark-mode') ? '#212529' : '#f8f9fa'
        });
        
        // Add image to PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const imgProps = pdf.getImageProperties(imgData);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = (imgProps.height * (pageWidth - 20)) / imgProps.width;
        let heightLeft = imgHeight;
        let position = 10;

        // Handle multi-page documents
        pdf.addImage(imgData, 'JPEG', 10, position, pageWidth - 20, imgHeight);
        heightLeft -= pageHeight - 20;

        while (heightLeft > 0) {
            position = heightLeft - imgHeight + 10;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 10, position, pageWidth - 20, imgHeight);
            heightLeft -= pageHeight - 20;
        }

        // Save file
        pdf.save(`Yearly_Calendar_${year}.pdf`);
        showToast('Yearly calendar saved as PDF!', 'success');
    } catch (err) {
        showToast(`Error generating PDF: ${err.message}`, 'error');
        console.error('Yearly calendar PDF error:', err);
    }
}

/**
 * Converts ISO date string to New York timezone date
 * Purpose: Normalize trade timestamps to consistent timezone
 * @param {string} isoDateStr - ISO 8601 date string
 * @returns {string} Date string in YYYY-MM-DD format (NY time)
 */
function convertToNewYorkDateString(isoDateStr) {
    const nyDate = new Date(new Date(isoDateStr).toLocaleString('en-US', {
        timeZone: 'America/New_York'
    }));
    return nyDate.toISOString().split('T')[0]; // "YYYY-MM-DD"
}

/**
 * Renders interactive trading calendar for a month
 * Purpose: Main visualization component for daily trading performance
 * @param {Object} config - Configuration object
 * @param {string} config.containerId - DOM element ID for calendar
 * @param {Object} config.indexedTrades - Trades indexed by month
 * @param {Array} config.allTrades - All trades array
 * @param {number} config.year - Year to display
 * @param {number} config.month - Month to display (0-11)
 * @param {string} config.activeAccountId - Current account ID
 * @param {boolean} [config.showBackgroundColors=true] - Color-code profitable days
 * @param {boolean} [config.showTradeDetails] - Show trade metrics per day
 * @param {boolean} [config.showWeeklyStats] - Show weekly summary
 * @param {boolean} [config.showMonthlyStats=true] - Show monthly summary
 * @param {boolean} [config.showHeaderIcons=true] - Show action icons
 * @param {boolean} [config.showNoteIcon=true] - Show plan notes icon
 * @param {boolean} [config.enableCellClick=true] - Enable day click events
 * @param {Function} [config.onDayClick] - Day click handler
 * @param {Function} [config.onNoteClick] - Note icon click handler
 * @param {Function} [config.onMonthSelect] - Month change handler
 * @param {string} [config.callerPage='dashboard'] - Calling page context
 */
// CHANGE: Updated to add settings icon and use calendarSettings
export async function renderCalendar({
    containerId,
    indexedTrades,
    allTrades,
    year,
    month,
    activeAccountId,
    showBackgroundColors = true,
    showTradeDetails = calendarSettings.showTradeDetails,
    showWeeklyStats = calendarSettings.showWeeklyStats,
    showMonthlyStats = true,
    showHeaderIcons = true,
    showNoteIcon = true,
    enableCellClick = true,
    onDayClick = () => {},
    onNoteClick = () => {},
    onMonthSelect = () => {},
    callerPage = 'dashboard' // New optional parameter to indicate the calling page
}) {
    console.log(`renderCalendar called with containerId: ${containerId}, year: ${year}, month: ${month}, accountId: ${activeAccountId}, callerPage: ${callerPage}`);
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Calendar container with ID ${containerId} not found`);
        showToast(`Error: Calendar container not found.`, 'error');
        return;
    }

    // Retrieve trades for the selected month
    const yearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    const startDate = `${yearMonth}-01`;
    const endDate = `${yearMonth}-${new Date(year, month + 1, 0).getDate()}`;
    console.log(`Retrieving trades for ${yearMonth}, accountId: ${activeAccountId}`);
    let monthTrades = indexedTrades[yearMonth] || [];
    console.log(`Retrieved ${monthTrades.length} trades for ${yearMonth}`, 
        monthTrades.slice(0, 5).map(t => ({ id: t.id, date: t.date, accountId: t.accountId })));

    // Fallback to allTrades if no indexed trades
    if (monthTrades.length === 0 && Array.isArray(allTrades)) {
        console.warn(`No indexed trades for ${yearMonth}, falling back to allTrades`);
        monthTrades = allTrades.filter(t => {
            if (!t || !t.date || !t.accountId) return false;
            return t.date.startsWith(yearMonth);
        });
        console.log(`Fallback retrieved ${monthTrades.length} trades for ${yearMonth}`, 
            monthTrades.slice(0, 5).map(t => ({ id: t.id, date: t.date, accountId: t.accountId })));
    }

    // Filter trades by active account
    console.time('Trade filtering');
    const filteredTrades = monthTrades.filter(t => {
        if (!t || !t.accountId || !t.date) {
            console.warn('Invalid trade data:', t);
            return false;
        }
        const isValidDate = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
        if (!isValidDate) {
            console.warn(`Invalid trade date format: ${t.date}`);
            return false;
        }
        return t.accountId === activeAccountId;
    });
    console.timeEnd('Trade filtering');
    console.log(`Filtered trades: ${filteredTrades.length}`, 
        filteredTrades.map(t => ({ id: t.id, date: t.date, accountId: t.accountId })));

    // Calculate statistics
    const dailyStats = calculateDailyStats(filteredTrades, year, month);
    const { weeklyStats, monthlyStats } = calculateWeeklyAndMonthlyStats(dailyStats, year, month);

    // Load daily plans
    let dailyPlans = [];
    try {
        dailyPlans = await loadFromStore('dailyPlans');
        console.log(`Loaded ${dailyPlans.length} daily plans`);
    } catch (err) {
        console.error('Failed to load daily plans:', err);
        showToast('Error loading daily plans.', 'error');
    }
    
    // Filter plans for current month/account
    console.log(`Filtering daily plans for ${startDate} to ${endDate}, accountId: ${activeAccountId}`);
    const filteredDailyPlans = dailyPlans.filter(plan => {
        if (!plan || !plan.accountId || !plan.date) {
            console.warn('Invalid daily plan data:', plan);
            return false;
        }
        const planDate = plan.date.split('T')[0]; // Normalize to YYYY-MM-DD
        const isValidDate = typeof planDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(planDate);
        if (!isValidDate) {
            console.warn(`Invalid plan date format: ${plan.date}`);
            return false;
        }
        return plan.accountId === activeAccountId && planDate >= startDate && planDate <= endDate;
    });
    console.log(`Filtered daily plans: ${filteredDailyPlans.length}`, 
        filteredDailyPlans.map(p => ({ date: p.date, accountId: p.accountId })));

    // Prepare calendar HTML
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    console.log(`Rendering calendar for ${monthNames[month]} ${year}: ${filteredTrades.length} trades, ${filteredDailyPlans.length} plans`);

    // Monthly stats color coding
    const monthlyStatsColor = monthlyStats.profitLoss >= 0 ? '#28a745' : '#dc3545';

    // Generate HTML structure
    let html = `
        <div class="calendar-header">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="d-flex align-items-center">
                    ${showMonthlyStats ? '<span class="calendar-period me-3">This month</span>' : ''}
                    <button class="btn btn-outline-primary btn-sm prev-month">←</button>
                    <h5 class="mb-0 mx-2">${monthNames[month]} ${year}</h5>
                    <button class="btn btn-outline-primary btn-sm next-month">→</button>
                </div>
                <div class="d-flex align-items-center">
                    ${showMonthlyStats ? `
                        <span class="calendar-stats me-20" style="color: ${monthlyStatsColor};">
                            Monthly stats: $${formatMoney(monthlyStats.profitLoss)} (${monthlyStats.tradingDays} days)
                        </span>
                    ` : ''}
                    ${showHeaderIcons ? `
                        <div class="calendar-header-actions">
                            <button class="btn btn-link p-0" id="print-monthly-calendar" title="Download Monthly Calendar as PDF">
                                <i class="bi bi-filetype-pdf"></i>
                            </button>
                            <button class="btn btn-link p-0 ms-2" id="calendar-settings" title="Calendar Settings">
                                <i class="bi bi-gear"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
        <div class="calendar-container d-flex">
            <div class="calendar-grid">
                <div class="calendar-day-header">Sun</div>
                <div class="calendar-day-header">Mon</div>
                <div class="calendar-day-header">Tue</div>
                <div class="calendar-day-header">Wed</div>
                <div class="calendar-day-header">Thu</div>
                <div class="calendar-day-header">Fri</div>
                <div class="calendar-day-header">Sat</div>
    `;

    // Empty days for calendar alignment
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day empty"></div>`;
    }

    // Generate day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const stats = dailyStats[day];
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const tradeBackground = showBackgroundColors && stats.tradeCount > 0 ? 
            (stats.profitLoss >= 0 ? 'bg-success-light' : 'bg-danger-light') : '';
        const isToday = day === todayDate && month === todayMonth && year === todayYear;
        const dateString = date.toISOString().split('T')[0];
        const dailyPlan = filteredDailyPlans.find(plan => plan.date.split('T')[0] === dateString);
        const hasDailyPlan = !!dailyPlan;
        const planBackground = callerPage === 'dailyPlan' && hasDailyPlan ? 'bg-plan-light' : '';

        html += `
            <div class="calendar-day ${tradeBackground} ${planBackground} ${isWeekend ? 'weekend' : ''}" 
                 data-day="${day}" data-has-trades="${stats.tradeCount > 0}">
                <div class="calendar-day-header d-flex align-items-center">
                    <span class="calendar-day-number ${isToday ? 'today-circle' : ''}">${day}</span>
                </div>
                ${showTradeDetails && stats.tradeCount > 0 ? `
                    <div class="calendar-day-content">
                        <div class="calendar-day-profit">$${formatMoney(stats.profitLoss)}</div>
                        <div class="calendar-day-trades">${stats.tradeCount} trades</div>
                        <div class="calendar-day-winrate">${stats.winRate}%</div>
                    </div>
                    ${showTradeDetails && showNoteIcon && hasDailyPlan ? 
                        `<i class="bi bi-sticky note-icon" data-date="${dateString}"></i>` : ''}
                ` : (showNoteIcon && hasDailyPlan ? 
                    `<i class="bi bi-sticky note-icon" data-date="${dateString}"></i>` : '')}
            </div>
        `;
    }

    // Weekly stats section
    html += `
            </div>
            ${showWeeklyStats ? `
                <div class="calendar-weekly-stats">
                    ${weeklyStats.map(week => {
                        const weekPnlColor = week.profitLoss >= 0 ? '#28a745' : '#dc3545';
                        const hasData = week.tradingDays > 0;
                        return `
                            <div class="calendar-week card ${hasData ? '' : 'empty-week'}">
                                <div>Week ${week.weekNumber}</div>
                                <div style="color: ${weekPnlColor};">$ ${formatMoney(week.profitLoss)}</div>
                                <div>${week.tradingDays} days</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : ''}
        </div>
    `;

    // Render to DOM
    container.innerHTML = html;

    // Setup event listeners
    const prevButton = container.querySelector('.prev-month');
    const nextButton = container.querySelector('.next-month');
    const days = container.querySelectorAll('.calendar-day');
    const noteIcons = container.querySelectorAll('.note-icon');
    const settingsButton = container.querySelector('#calendar-settings');

    // Previous month navigation
    prevButton.addEventListener('click', () => {
        const newDate = new Date(year, month - 1, 1);
        console.log(`Navigating to previous month: ${newDate.getMonth() + 1}/${newDate.getFullYear()}`);
        renderCalendar({
            containerId,
            indexedTrades,
            allTrades,
            year: newDate.getFullYear(),
            month: newDate.getMonth(),
            activeAccountId,
            showBackgroundColors,
            showTradeDetails,
            showWeeklyStats,
            showMonthlyStats,
            showHeaderIcons,
            showNoteIcon,
            enableCellClick,
            onDayClick,
            onNoteClick,
            onMonthSelect,
            callerPage
        });
        onMonthSelect(newDate.getFullYear(), newDate.getMonth());
    });

    // Next month navigation
    nextButton.addEventListener('click', () => {
        const newDate = new Date(year, month + 1, 1);
        console.log(`Navigating to next month: ${newDate.getMonth() + 1}/${newDate.getFullYear()}`);
        renderCalendar({
            containerId,
            indexedTrades,
            allTrades,
            year: newDate.getFullYear(),
            month: newDate.getMonth(),
            activeAccountId,
            showBackgroundColors,
            showTradeDetails,
            showWeeklyStats,
            showMonthlyStats,
            showHeaderIcons,
            showNoteIcon,
            enableCellClick,
            onDayClick,
            onNoteClick,
            onMonthSelect,
            callerPage
        });
        onMonthSelect(newDate.getFullYear(), newDate.getMonth());
    });

    // Day cell click handler
    if (enableCellClick) {
        days.forEach(day => {
            day.addEventListener('click', () => {
                const dayNumber = parseInt(day.dataset.day);
                const hasTrades = day.dataset.hasTrades === 'true';
                if (hasTrades) {
                    const date = new Date(year, month, dayNumber);
                    const dateString = date.toISOString().split('T')[0];
                    const dailyTrades = filteredTrades.filter(t => t.date === dateString);
                    const dailyPlan = filteredDailyPlans.find(plan => plan.date.split('T')[0] === dateString);
                    onDayClick(dayNumber, dateString, dailyTrades, dailyPlan);
                }
            });
        });
    }

    // Note icon click handler
    if (showNoteIcon) {
        noteIcons.forEach(icon => {
            icon.addEventListener('click', (event) => {
                event.stopPropagation();
                const dateString = icon.getAttribute('data-date');
                const dailyPlan = filteredDailyPlans.find(plan => plan.date.split('T')[0] === dateString);
                const dailyTrades = filteredTrades.filter(t => t.date === dateString);
                onNoteClick(dateString, dailyPlan, dailyTrades);
            });
        });
    }

    // Settings button handler
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            console.log('Calendar settings button clicked');
            showCalendarSettingsModal({
                containerId,
                indexedTrades,
                allTrades,
                year,
                month,
                activeAccountId,
                showBackgroundColors,
                showTradeDetails,
                showWeeklyStats,
                showMonthlyStats,
                showHeaderIcons,
                showNoteIcon,
                enableCellClick,
                onDayClick,
                onNoteClick,
                onMonthSelect,
                callerPage
            });
        });
    }

    // Monthly PDF export button
    const printMonthlyButton = container.querySelector('#print-monthly-calendar');
    if (printMonthlyButton) {
        printMonthlyButton.addEventListener('click', async () => {
            await downloadMonthlyCalendarPDF(year, month);
        });
    }
}

/**
 * Shows calendar settings modal
 * Purpose: Allow user to customize calendar display
 * @param {Object} options - Current calendar configuration
 */
// CHANGE: Updated to load settings from IndexedDB
async function showCalendarSettingsModal(options) {
    try {
        const modalElement = document.getElementById('calendarSettingsModal');
        if (!modalElement) {
            throw new Error('Calendar settings modal element not found');
        }
        
        // Manage existing modal instance
        const existingModal = bootstrap.Modal.getInstance(modalElement);
        if (existingModal) {
            existingModal.hide();
            existingModal.dispose();
            console.log('Disposed existing calendarSettingsModal instance');
        }
        
        // Initialize new modal
        const modal = new bootstrap.Modal(modalElement, {
            backdrop: true,
            keyboard: true,
            focus: true
        });
        
        // CHANGE: Load settings from IndexedDB
        try {
            const savedConfig = await loadFromStore('dashboard');
            const savedSettings = savedConfig?.find(d => d.id === 'calendarSettings')?.data;
            if (savedSettings) {
                calendarSettings = { ...calendarSettings, ...savedSettings };
                console.log('Loaded calendar settings for modal from IndexedDB:', calendarSettings);
            } else {
                console.log('No calendar settings found in IndexedDB for modal, using current:', calendarSettings);
            }
        } catch (err) {
            console.error('Error loading calendar settings for modal:', err);
        }
        
        // Populate modal body
        const modalBody = modalElement.querySelector('.modal-body');
        if (!modalBody) {
            throw new Error('Calendar settings modal body not found');
        }
        console.log('Opening modal with calendarSettings:', calendarSettings);
        modalBody.innerHTML = `
            <div class="mb-3 form-check">
                <input type="checkbox" class="form-check-input" id="show-weekly-stats" 
                    ${calendarSettings.showWeeklyStats ? 'checked' : ''}>
                <label class="form-check-label" for="show-weekly-stats">Show Weekly Stats</label>
            </div>
            <div class="mb-3 form-check">
                <input type="checkbox" class="form-check-input" id="show-trade-details" 
                    ${calendarSettings.showTradeDetails ? 'checked' : ''}>
                <label class="form-check-label" for="show-trade-details">Show Trade Details</label>
            </div>
        `;
        
        // Setup modal buttons
        const saveButton = modalElement.querySelector('.modal-footer .btn-primary');
        const cancelButton = modalElement.querySelector('.modal-footer .btn-secondary');
        if (!saveButton || !cancelButton) {
            throw new Error('Calendar settings modal buttons not found');
        }
        const newSaveButton = saveButton.cloneNode(true);
        saveButton.parentNode.replaceChild(newSaveButton, saveButton);
        const newCancelButton = cancelButton.cloneNode(true);
        cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);

        // Save button handler
        newSaveButton.addEventListener('click', async () => {
            console.log('Save calendar settings clicked');
            try {
                // Update settings from form
                const showWeeklyStats = document.getElementById('show-weekly-stats').checked;
                const showTradeDetails = document.getElementById('show-trade-details').checked;
                calendarSettings.showWeeklyStats = showWeeklyStats;
                calendarSettings.showTradeDetails = showTradeDetails;
                console.log('Updated calendar settings:', calendarSettings);
                
                // Save to persistent storage
                await saveToStore('dashboard', { id: 'calendarSettings', data: calendarSettings });
                console.log('Saved calendar settings to IndexedDB:', calendarSettings);
                
                // Re-render calendar with new settings
                const updatedOptions = {
                    ...options,
                    showWeeklyStats,
                    showTradeDetails
                };
                console.log('Re-rendering calendar with options:', updatedOptions);
                renderCalendar(updatedOptions);
                
                showToast('Calendar settings saved.', 'success');
                modal.hide();
                
                // Cleanup after modal close
                modalElement.addEventListener('hidden.bs.modal', () => {
                    modalElement.classList.remove('show', 'modal-open', 'fade');
                    modalElement.style.display = 'none';
                    modalElement.removeAttribute('aria-modal');
                    modalElement.setAttribute('aria-hidden', 'true');
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.body.style.paddingRight = '';
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    backdrops.forEach(backdrop => backdrop.remove());
                    modal.dispose();
                    console.log('Calendar settings modal fully closed and disposed');
                }, { once: true });
            } catch (err) {
                showToast('Error saving calendar settings.', 'error');
                console.error('Save calendar settings error:', err);
            }
        }, { once: true });

        // Cancel button handler
        newCancelButton.addEventListener('click', () => {
            console.log('Cancel calendar settings clicked');
            modal.hide();
            modalElement.addEventListener('hidden.bs.modal', () => {
                modalElement.classList.remove('show', 'modal-open', 'fade');
                modalElement.style.display = 'none';
                modalElement.removeAttribute('aria-modal');
                modalElement.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.body.style.paddingRight = '';
                const backdrops = document.querySelectorAll('.modal-backdrop');
                backdrops.forEach(backdrop => backdrop.remove());
                modal.dispose();
                console.log('Calendar settings modal fully closed and disposed (cancel)');
            }, { once: true });
        }, { once: true });

        console.log('Showing calendar settings modal');
        modal.show();
    } catch (err) {
        showToast('Error showing calendar settings modal.', 'error');
        console.error('Calendar settings modal error:', err);
    }
}

/**
 * Renders yearly overview calendar
 * Purpose: Annual performance summary with monthly breakdowns
 * @param {Object} config - Configuration object
 * @param {string} config.containerId - DOM element ID (fallback)
 * @param {HTMLElement} config.container - DOM element to render in
 * @param {Array} config.trades - Array of trade objects
 * @param {number} config.year - Year to display
 * @param {string} config.activeAccountId - Current account ID
 * @param {boolean} [config.showBackgroundColors=true] - Color-code days
 * @param {Function} [config.onMonthClick] - Month selection handler
 */
export async function renderYearlyOverview({
    containerId,
    container, // New parameter to accept a DOM element
    trades,
    year,
    activeAccountId,
    showBackgroundColors = true,
    onMonthClick = () => {}
}) {
    console.log(`renderYearlyOverview called with containerId: ${containerId}, container: ${container}, trades: ${trades.length}, year: ${year}`);
    
    // Use provided container or fallback to ID lookup
    const targetContainer = container || document.getElementById(containerId);
    if (!targetContainer) {
        console.error(`Yearly overview container not found: containerId=${containerId}, container=${container}`);
        return;
    }

    // Filter trades by active account
    const filteredTrades = trades.filter(t => t.accountId === activeAccountId);
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    // Calculate and display yearly stats
    const yearlyStats = calculateYearlyStats(filteredTrades, year);
    const yearlyStatsColor = yearlyStats.totalPnL >= 0 ? '#28a745' : '#dc3545';
    const yearlyStatsHtml = `
        <span class="yearly-stats" style="color: ${yearlyStatsColor};">
            Yearly stats: $${yearlyStats.totalPnL.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} | 
            Trades: ${yearlyStats.totalTrades} | 
            Win Rate: ${yearlyStats.winRate}%
        </span>
    `;
    const yearlyStatsElement = document.getElementById('yearly-stats');
    if (yearlyStatsElement) {
        yearlyStatsElement.innerHTML = yearlyStatsHtml;
    }

    // Handle no-trades scenario
    if (filteredTrades.length === 0) {
        targetContainer.innerHTML = '<div>No trade data available for the yearly overview. Add trades to display the calendar.</div>';
        console.warn('No trades available for yearly overview');
        return;
    }

    let html = '';

    // Generate monthly calendars in 3-column grid
    for (let month = 0; month < 12; month++) {
        const dailyStats = calculateDailyStats(filteredTrades, year, month);
        const { monthlyStats } = calculateWeeklyAndMonthlyStats(dailyStats, year, month);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const isCurrentMonth = year === todayYear && month === todayMonth;

        // Calendar grid calculations
        const totalCells = firstDay + daysInMonth;
        const rowsNeeded = Math.ceil(totalCells / 7);
        const totalCellsNeeded = rowsNeeded * 7;

        // New row every 3 months
        if (month % 3 === 0) {
            html += month > 0 ? '</div>' : '';
            html += '<div class="row">';
        }

        // Monthly calendar HTML
        html += `
            <div class="col-md-4 col-sm-6 mb-3">
                <div class="small-calendar ${isCurrentMonth ? 'current-month' : ''}" 
                     data-year="${year}" data-month="${month}">
                    <h6 class="text-center mb-2">${monthNames[month]} ${year}</h6>
                    <div class="small-calendar-grid">
                        <div class="small-calendar-day-header">S</div>
                        <div class="small-calendar-day-header">M</div>
                        <div class="small-calendar-day-header">T</div>
                        <div class="small-calendar-day-header">W</div>
                        <div class="small-calendar-day-header">T</div>
                        <div class="small-calendar-day-header">F</div>
                        <div class="small-calendar-day-header">S</div>
        `;

        // Empty prefix days
        for (let i = 0; i < firstDay; i++) {
            html += `<div class="small-calendar-day empty"></div>`;
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const stats = dailyStats[day];
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const background = showBackgroundColors && stats.tradeCount > 0 ? 
                (stats.profitLoss >= 0 ? 'bg-success-light' : 'bg-danger-light') : '';
            const isToday = day === todayDate && month === todayMonth && year === todayYear;

            html += `
                <div class="small-calendar-day ${background} ${isWeekend ? 'weekend' : ''}" data-day="${day}">
                    <span class="small-calendar-day-number ${isToday ? 'today-circle' : ''}">${day}</span>
                </div>
            `;
        }

        // Empty suffix days
        for (let i = totalCells; i < totalCellsNeeded; i++) {
            html += `<div class="small-calendar-day empty"></div>`;
        }

        // Monthly footer stats
        html += `
                    </div>
                    <div class="small-calendar-stats text-center mt-1">
                        Total P&L: $${monthlyStats.profitLoss.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} | 
                        Trading Days: ${monthlyStats.tradingDays} | 
                        Trades: ${monthlyStats.tradeCount}
                    </div>
                </div>
            </div>
        `;
    }

    html += '</div>';
    targetContainer.innerHTML = html;

    // Add month click handlers
    const monthElements = targetContainer.querySelectorAll('.small-calendar');
    monthElements.forEach(monthElement => {
        monthElement.addEventListener('click', () => {
            const selectedYear = parseInt(monthElement.dataset.year);
            const selectedMonth = parseInt(monthElement.dataset.month);
            onMonthClick(selectedYear, selectedMonth);
        });
    });

    // Yearly PDF export button
    const printYearlyButton = document.querySelector('#print-yearly-calendar');
    if (printYearlyButton) {
        printYearlyButton.removeEventListener('click', downloadYearlyCalendarPDF);
        printYearlyButton.addEventListener('click', async () => {
            await downloadYearlyCalendarPDF(year);
        });
    } else {
        console.warn('Yearly PDF button (#print-yearly-calendar) not found in DOM');
    }
}
/* CHANGES END */