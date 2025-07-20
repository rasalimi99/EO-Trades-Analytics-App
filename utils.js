// Imports database access utility
import { getDB } from './data.js';

// Global state for toast notifications and balance caching
const toastQueue = new Map(); // Manages toast notifications
let lastToastTime = 0; // Tracks time of last toast
const TOAST_DEBOUNCE_MS = 500; // Debounce interval for toasts (ms)
const balanceCache = new Map(); // In-memory cache for account balances

// Displays a toast notification
// Purpose: Shows a Bootstrap toast with dynamic container creation
export function showToast(message, type, hasCallback = false, callback = null) {
    // Maps 'error' type to Bootstrap's 'danger' class
    if (type === "error") {
        type = "danger";
    }

    // Ensures toast container exists
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.warn('Toast container not found, creating dynamically');
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }

    // Creates unique toast ID
    const toastId = `toast-${Date.now()}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.role = 'alert';
    toast.ariaLive = 'assertive';
    toast.ariaAtomic = 'true';
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${message}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;
    toastContainer.appendChild(toast);

    // Initializes Bootstrap toast
    const bsToast = new bootstrap.Toast(toast, {
        delay: 3000
    });
    bsToast.show();

    // Handles toast close event
    toast.addEventListener('hidden.bs.toast', () => {
        console.log(`Toast hidden: ${toastId}`);
        toast.remove();
        if (hasCallback && callback) {
            callback();
        }
    });

    console.log(`Creating toast: ${message}, type: ${type}, hasCallback: ${hasCallback}`);
}

// Converts base64 string to Blob
// Purpose: Converts base64 image data to a Blob for file handling
export function base64ToBlob(base64) {
    try {
        const base64Data = base64.replace(/^data:image\/[a-z]+;base64,/, '');
        const binary = atob(base64Data);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return new Blob([array], { type: 'image/png' });
    } catch (e) {
        console.error('Error converting base64 to Blob:', e);
        return null;
    }
}

// Converts Blob to base64 string
// Purpose: Converts a Blob to a base64 data URL
export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Error converting Blob to base64'));
        reader.readAsDataURL(blob);
    });
}

// Compresses an image without resizing
// Purpose: Reduces image file size by lowering quality while maintaining dimensions
export async function compressImage(file, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (e) => {
            img.src = e.target.result;
        };

        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Maintains original image dimensions
            const width = img.width;
            const height = img.height;
            canvas.width = width;
            canvas.height = height;

            // Draws image on canvas
            ctx.drawImage(img, 0, 0, width, height);

            // Converts to base64 with specified quality
            const compressedImage = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedImage);
        };

        img.onerror = (err) => reject(err);
    });
}

// Compresses an image in the main thread without resizing
// Purpose: Compresses image to JPEG with specified quality, enforcing size limit
export function compressImageMainThread(file, maxSizeMB, quality = 0.8) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            reject(new Error('File is not an image'));
            return;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
            reject(new Error(`Image size exceeds ${maxSizeMB} MB`));
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const width = img.width;
                    const height = img.height;
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        throw new Error('Failed to get canvas context');
                    }
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob.size > maxSizeMB * 1024 * 1024) {
                            reject(new Error('Image too large after compression'));
                        } else {
                            resolve(blob);
                        }
                    }, 'image/jpeg', quality);
                } catch (err) {
                    reject(new Error('Canvas processing error: ' + err.message));
                }
            };
            img.onerror = () => reject(new Error('Image load error'));
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
    });
}

// Parses hold time string to minutes
// Purpose: Converts strings like "2h 30m" or "45m" to total minutes
export function parseHoldTime(input) {
    if (!input) return 0;
    let totalMinutes = 0;
    const hoursMatch = input.match(/(\d+)h/);
    const minutesMatch = input.match(/(\d+)m/);
    if (hoursMatch) totalMinutes += parseInt(hoursMatch[1]) * 60;
    if (minutesMatch) totalMinutes += parseInt(minutesMatch[1]);
    return totalMinutes;
}

// Formats minutes to a hold time string
// Purpose: Converts minutes to a string like "2h 30m" or "45m"
export function formatHoldTime(minutes) {
    if (!minutes) return '';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

// Validates required fields
// Purpose: Checks if a field is non-empty and displays a toast if invalid
export function validateRequired(field, name) {
    if (!field || (typeof field === 'string' && field.trim() === '')) {
        showToast(`${name} is required.`, 'error');
        return false;
    }
    return true;
}

// Validates numeric fields
// Purpose: Ensures a value is a valid number within specified constraints
export function validateNumber(value, field, min = null, allowNegative = false) {
    if (value === null || value === undefined || isNaN(value)) {
        showToast(`${field} must be a valid number.`, 'error');
        return false;
    }
    if (min !== null && value < min && (!allowNegative || value >= 0)) {
        showToast(`${field} must be ${min === 0 ? 'non-negative' : `at least ${min}`}.`, 'error');
        return false;
    }
    if (!allowNegative && value < 0) {
        showToast(`${field} must be a positive number.`, 'error');
        return false;
    }
    return true;
}

// Debounces a function
// Purpose: Limits the rate at which a function is executed
export function debounce(fn, ms) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
    };
}

// Manages tag selection UI
// Purpose: Handles tag creation, selection, and removal in a UI component
export class TagManager {
    constructor(containerId, inputId, predefinedTags, newTagInputId = null) {
        this.container = document.getElementById(containerId);
        this.input = document.getElementById(inputId);
        this.newTagInput = newTagInputId ? document.getElementById(newTagInputId) : null;
        this.predefinedTags = predefinedTags || [];
        this.selectedTags = [];
        this.allTags = [...this.predefinedTags];
        if (!this.container) {
            console.error(`Tag container with ID ${containerId} not found`);
            showToast(`Error: Tag container not found for ${containerId}.`, 'error');
        }
        if (!this.input) {
            console.error(`Tag input with ID ${inputId} not found`);
            showToast(`Error: Tag input not found for ${inputId}.`, 'error');
        }
    }

    // Initializes the tag manager with initial tags
    init(initialTags = [], allTags = null) {
        if (!this.container || !this.input) {
            console.warn('Skipping TagManager init due to missing container or input');
            return;
        }
        this.selectedTags = [...initialTags];
        this.allTags = allTags ? [...new Set([...this.predefinedTags, ...allTags])] : [...this.predefinedTags];
        this.renderTags();
        this.bindEvents();
        this.updateInput();
    }

    // Renders tags in the UI
    renderTags() {
        if (this.container) {
            this.container.innerHTML = this.allTags.map(tag => `
                <span class="badge ${this.selectedTags.includes(tag) ? 'bg-primary selected' : 'bg-light text-dark'} tag-badge" data-tag="${tag}">
                    ${tag}
                    ${this.predefinedTags.includes(tag) ? '' : '<span class="remove-tag">×</span>'}
                </span>
            `).join('');
            console.log(`Rendered tags for ${this.container.id}:`, this.allTags);
        }
    }

    // Attaches event listeners for tag interactions
    bindEvents() {
        if (!this.container) return;
        this.container.querySelectorAll('.tag-badge').forEach(tag => {
            tag.removeEventListener('click', tag.__clickHandler); // Remove existing listener
            tag.__clickHandler = (e) => {
                if (e.target.classList.contains('remove-tag')) {
                    const tagValue = tag.dataset.tag;
                    if (!this.predefinedTags.includes(tagValue)) {
                        this.allTags = this.allTags.filter(t => t !== tagValue);
                        this.selectedTags = this.selectedTags.filter(t => t !== tagValue);
                        this.renderTags();
                        this.bindEvents();
                        this.updateInput();
                        showToast(`Removed tag: ${tagValue}`, 'success');
                    }
                    return;
                }
                const tagValue = tag.dataset.tag;
                const index = this.selectedTags.indexOf(tagValue);
                if (index === -1) {
                    this.selectedTags.push(tagValue);
                    tag.classList.add('selected', 'bg-primary');
                    tag.classList.remove('bg-light', 'text-dark');
                } else {
                    this.selectedTags.splice(index, 1);
                    tag.classList.remove('selected', 'bg-primary');
                    tag.classList.add('bg-light', 'text-dark');
                }
                this.updateInput();
            };
            tag.addEventListener('click', tag.__clickHandler);
        });

        if (this.newTagInput) {
            // Remove existing listener
            this.newTagInput.removeEventListener('keydown', this.newTagInput.__keydownHandler);
            // Debounced keydown handler
            this.newTagInput.__keydownHandler = debounce((e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const newTag = this.newTagInput.value.trim();
                    if (newTag && newTag.length <= 50 && !this.allTags.includes(newTag)) {
                        this.allTags.push(newTag);
                        this.selectedTags.push(newTag);
                        this.renderTags();
                        this.bindEvents();
                        this.newTagInput.value = '';
                        this.updateInput();
                        showToast(`Added new tag: ${newTag}`, 'success');
                    } else if (!newTag) {
                        showToast('Please enter a tag.', 'warning');
                    } else if (newTag.length > 50) {
                        showToast('Tag must be 50 characters or less.', 'warning');
                    } else {
                        showToast('Tag already exists.', 'warning');
                    }
                }
            }, 300);
            this.newTagInput.addEventListener('keydown', this.newTagInput.__keydownHandler);
        }
    }

    // Updates hidden input with selected tags
    updateInput() {
        if (this.input) {
            this.input.value = this.selectedTags.join(',');
            this.input.dispatchEvent(new Event('change'));
        }
    }

    // Returns currently selected tags
    getSelectedTags() {
        return [...this.selectedTags];
    }
}

// Checks if a trade time is outside the trading window
// Purpose: Validates trade time against start and end times
export function isTimeOutsideWindow(tradeTime, startTime, endTime) {
    try {
        // Validates input time formats (HH:mm)
        const timeFormat = /^\d{2}:\d{2}$/;
        if (!tradeTime || !timeFormat.test(tradeTime)) {
            console.warn(`Invalid tradeTime format: ${tradeTime}, expected HH:mm`);
            return false;
        }
        if (!startTime || !timeFormat.test(startTime)) {
            console.warn(`Invalid startTime format: ${startTime}, expected HH:mm, defaulting to 00:00`);
            startTime = '00:00';
        }
        if (!endTime || !timeFormat.test(endTime)) {
            console.warn(`Invalid endTime format: ${endTime}, expected HH:mm, defaulting to 23:59`);
            endTime = '23:59';
        }

        // Parses times to minutes
        const [tradeHours, tradeMinutes] = tradeTime.split(':').map(num => parseInt(num));
        const [startHours, startMinutes] = startTime.split(':').map(num => parseInt(num));
        const [endHours, endMinutes] = endTime.split(':').map(num => parseInt(num));

        // Validates time components
        if (isNaN(tradeHours) || isNaN(tradeMinutes) || tradeHours < 0 || tradeHours > 23 || tradeMinutes < 0 || tradeMinutes > 59) {
            console.warn(`Invalid tradeTime components: ${tradeTime} (hours: ${tradeHours}, minutes: ${tradeMinutes})`);
            return false;
        }
        if (isNaN(startHours) || isNaN(startMinutes) || startHours < 0 || startHours > 23 || startMinutes < 0 || startMinutes > 59) {
            console.warn(`Invalid startTime components: ${startTime} (hours: ${startHours}, minutes: ${startMinutes})`);
            return false;
        }
        if (isNaN(endHours) || isNaN(endMinutes) || endHours < 0 || endHours > 23 || endMinutes < 0 || endMinutes > 59) {
            console.warn(`Invalid endTime components: ${endTime} (hours: ${endHours}, minutes: ${endMinutes})`);
            return false;
        }

        const tradeTotalMinutes = tradeHours * 60 + tradeMinutes;
        const startTotalMinutes = startHours * 60 + startMinutes;
        const endTotalMinutes = endHours * 60 + endMinutes;

        console.log(`Time check: tradeTime=${tradeTime} (${tradeTotalMinutes} min), window=${startTime} (${startTotalMinutes} min) to ${endTime} (${endTotalMinutes} min)`);

        // Handles overnight windows (e.g., 22:00 to 06:00)
        let isOutside;
        if (startTotalMinutes > endTotalMinutes) {
            isOutside = tradeTotalMinutes < startTotalMinutes && tradeTotalMinutes > endTotalMinutes;
        } else {
            isOutside = tradeTotalMinutes < startTotalMinutes || tradeTotalMinutes > endTotalMinutes;
        }

        console.log(`isOutsideWindow result: ${isOutside}, tradeTime=${tradeTime} (${tradeTotalMinutes} min), window=${startTotalMinutes}-${endTotalMinutes} min`);
        return isOutside;
    } catch (err) {
        console.error(`Error in isTimeOutsideWindow:`, err);
        showToast('Error checking trading window.', 'error');
        return false;
    }
}

// Calculates drawdown percentage over time
// Purpose: Computes drawdown based on trade profit/loss relative to initial balance
export function calculateDrawdown(trades, initialBalance = 10000) {
    if (!trades || !trades.length) return [0];

    // Sorts trades by date and time
    const sortedTrades = [...trades].sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.tradeTime || '00:00'}`);
        const dateB = new Date(`${b.date}T${b.tradeTime || '00:00'}`);
        return dateA - dateB;
    });

    let balance = initialBalance;
    let peak = initialBalance;
    const drawdowns = sortedTrades.map(trade => {
        const profitLoss = Number(trade.profitLoss) || 0;
        if (isNaN(profitLoss)) {
            console.warn('Invalid profitLoss:', trade);
            return 0;
        }
        balance += profitLoss;
        peak = Math.max(peak, balance, initialBalance);
        if (initialBalance <= 0 || peak <= 0) {
            console.warn('Invalid balance or peak:', { initialBalance, balance, peak });
            return 0;
        }
        const drawdown = ((balance - peak) / initialBalance) * 100;
        return Math.max(-50, Math.min(0, drawdown));
    });

    console.log('CalculateDrawdown - Initial Balance:', initialBalance, 'Balances:', sortedTrades.map(t => balance += (Number(t.profitLoss) || 0)), 'Drawdowns:', drawdowns);
    return drawdowns.length ? drawdowns : [0];
}

// Parses date and time strings
// Purpose: Converts date and time strings to a valid Date object
export const parseDateTime = (date, time) => {
    try {
        // Validates date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error(`Invalid date format: ${date}`);
        }
        // Validates and normalizes time format (H:mm or HH:mm)
        let validTime = '00:00';
        if (time) {
            const timeMatch = time.match(/^(\d{1,2}):(\d{2})$/);
            if (timeMatch) {
                const hours = timeMatch[1].padStart(2, '0');
                const minutes = timeMatch[2];
                validTime = `${hours}:${minutes}`;
            } else {
                throw new Error(`Invalid time format: ${time}`);
            }
        }
        // Parses date with normalized time
        const dateTime = new Date(`${date}T${validTime}:00Z`);
        if (isNaN(dateTime.getTime())) throw new Error('Invalid date');
        return dateTime;
    } catch (err) {
        console.warn(`Invalid date/time: ${date} ${time}, using epoch as fallback`, err);
        return new Date(0);
    }
};

// Calculates winning and losing streaks
// Purpose: Analyzes trade sequences to determine streaks based on daily P&L
export function calculateFullStreaks(trades, outcomeKey = 'outcome', dateKey = 'date', skipRecencyCheck = false, streakMode = 'lenient') {
    // Validates and filters trades
    const validTrades = trades.filter(t => {
        const isValid = t && 
            t[dateKey] && 
            t[outcomeKey] && 
            typeof t.profitLoss !== 'undefined' && 
            ['Win', 'Loss'].includes(t[outcomeKey]);
        if (!isValid) {
            console.warn('Invalid trade filtered out:', t);
        }
        return isValid;
    });

    // Handles empty or invalid trade data
    if (!validTrades.length) {
        console.log('No valid trades after filtering, returning zero streaks');
        return { 
            winTrades: 0, 
            lossTrades: 0, 
            winDays: 0, 
            lossDays: 0,
            winTradesLosingStreak: 0,
            lossTradesLosingStreak: 0,
            winningStreakWinRate: 0,
            losingStreakWinRate: 0,
            winningStreakNetPnL: 0,
            losingStreakNetPnL: 0,
            mostRecentStreak: 'none'
        };
    }

    // Checks trade recency
    if (!skipRecencyCheck) {
        const mostRecentTrade = validTrades.reduce((latest, trade) => {
            const tradeDate = parseDateTime(trade[dateKey], trade.tradeTime || '00:00');
            const latestDate = parseDateTime(latest[dateKey], latest.tradeTime || '00:00');
            return tradeDate > latestDate ? trade : latest;
        }, validTrades[0]);
        const mostRecentTradeDate = parseDateTime(mostRecentTrade[dateKey], mostRecentTrade.tradeTime || '00:00');
        const currentDate = new Date();
        const daysSinceLastTrade = (currentDate - mostRecentTradeDate) / (1000 * 60 * 60 * 24);
        console.log('Most recent trade:', mostRecentTrade);
        console.log('Most recent trade date:', mostRecentTradeDate.toISOString());
        console.log('Days since last trade:', daysSinceLastTrade);
        if (daysSinceLastTrade > 30) {
            console.log('No recent trades (last trade more than 30 days ago), resetting streaks to 0');
            return { 
                winTrades: 0, 
                lossTrades: 0, 
                winDays: 0, 
                lossDays: 0,
                winTradesLosingStreak: 0,
                lossTradesLosingStreak: 0,
                winningStreakWinRate: 0,
                losingStreakWinRate: 0,
                winningStreakNetPnL: 0,
                losingStreakNetPnL: 0,
                mostRecentStreak: 'none'
            };
        }
    }

    // Sorts trades by date and time
    const sortedTrades = [...validTrades].sort((a, b) => {
        const dateA = parseDateTime(a[dateKey], a.tradeTime || '00:00');
        const dateB = parseDateTime(b[dateKey], b.tradeTime || '00:00');
        return dateA - dateB || (a.id > b.id ? 1 : -1);
    });
    console.log('Sorted trades by date and time (ascending):', sortedTrades.map(t => ({
        date: t[dateKey],
        tradeTime: t.tradeTime,
        outcome: t[outcomeKey]
    })));

    let currentWinDays = 0;
    let currentLossDays = 0;
    let previousWinDays = 0;
    let previousLossDays = 0;
    let maxLossDayStreak = 0;
    let tempLossDayStreak = 0;

    // Groups trades by date
    const groupedByDate = new Map();
    for (let trade of sortedTrades) {
        const date = trade[dateKey];
        if (!groupedByDate.has(date)) groupedByDate.set(date, []);
        groupedByDate.get(date).push({ outcome: trade[outcomeKey], profitLoss: trade.profitLoss || 0 });
    }
    console.log('Grouped trades by date:', Object.fromEntries(groupedByDate));

    // Processes daily P&L and streaks
    const orderedDates = Array.from(groupedByDate.keys()).sort((a, b) => new Date(b) - new Date(a));
    console.log('Ordered dates (descending):', orderedDates);

    const dailyPnL = {};
    const tradesByDate = {};
    for (const date of orderedDates) {
        const tradesOnDate = groupedByDate.get(date);
        const totalPnL = tradesOnDate.reduce((sum, trade) => sum + (trade.profitLoss || 0), 0);
        dailyPnL[date] = totalPnL;
        tradesByDate[date] = tradesOnDate;
    }
    console.log('Daily PnL:', dailyPnL);

    let mostRecentStreak = 'none';
    let mostRecentWinningDays = [];
    let mostRecentLosingDays = [];
    let mostRecentWinningStreakTrades = [];
    let mostRecentLosingStreakTrades = [];
    let previousWinningDays = [];
    let previousLosingDays = [];
    let previousWinningStreakTrades = [];
    let previousLosingStreakTrades = [];
    let foundFirstStreak = false;
    let foundSecondStreak = false;

    const EPSILON = 0.0001;

    // Identifies most recent and previous streaks
    for (let i = 0; i < orderedDates.length; i++) {
        const date = orderedDates[i];
        const pnl = dailyPnL[date];
        const isWinningOrBreakeven = pnl >= 0;
        const isLosing = pnl < 0;
        const isBreakeven = Math.abs(pnl) < EPSILON;
        console.log(`Processing date ${date}: PnL=${pnl}, isWinningOrBreakeven=${isWinningOrBreakeven}, isLosing=${isLosing}, isBreakeven=${isBreakeven}`);

        if (isBreakeven) {
            if (!foundFirstStreak) {
                continue;
            } else if (!foundSecondStreak) {
                break;
            }
        }

        if (!foundFirstStreak) {
            if (isWinningOrBreakeven) {
                currentWinDays++;
                mostRecentWinningDays.push(date);
                mostRecentWinningStreakTrades.push(...tradesByDate[date]);
                mostRecentStreak = 'winning';
                console.log(`Started most recent winning streak at ${currentWinDays} days for ${date}`);
            } else {
                currentLossDays++;
                mostRecentLosingDays.push(date);
                mostRecentLosingStreakTrades.push(...tradesByDate[date]);
                mostRecentStreak = 'losing';
                console.log(`Started most recent losing streak at ${currentLossDays} days for ${date}`);
            }
            foundFirstStreak = true;
        } else if (!foundSecondStreak) {
            if (mostRecentStreak === 'winning' && isWinningOrBreakeven) {
                currentWinDays++;
                mostRecentWinningDays.push(date);
                mostRecentWinningStreakTrades.push(...tradesByDate[date]);
                console.log(`Incremented most recent winDays to ${currentWinDays} for ${date}`);
            } else if (mostRecentStreak === 'losing' && isLosing) {
                currentLossDays++;
                mostRecentLosingDays.push(date);
                mostRecentLosingStreakTrades.push(...tradesByDate[date]);
                console.log(`Incremented most recent lossDays to ${currentLossDays} for ${date}`);
            } else {
                if (mostRecentStreak === 'winning' && isLosing) {
                    previousLossDays++;
                    previousLosingDays.push(date);
                    previousLosingStreakTrades.push(...tradesByDate[date]);
                    console.log(`Started previous losing streak at ${previousLossDays} days for ${date}`);
                } else if (mostRecentStreak === 'losing' && isWinningOrBreakeven) {
                    previousWinDays++;
                    previousWinningDays.push(date);
                    previousWinningStreakTrades.push(...tradesByDate[date]);
                    console.log(`Started previous winning streak at ${previousWinDays} days for ${date}`);
                }
                foundSecondStreak = true;
            }
        } else {
            if (mostRecentStreak === 'winning' && isLosing) {
                previousLossDays++;
                previousLosingDays.push(date);
                previousLosingStreakTrades.push(...tradesByDate[date]);
                console.log(`Incremented previous lossDays to ${previousLossDays} for ${date}`);
            } else if (mostRecentStreak === 'losing' && isWinningOrBreakeven) {
                previousWinDays++;
                previousWinningDays.push(date);
                previousWinningStreakTrades.push(...tradesByDate[date]);
                console.log(`Incremented previous winDays to ${previousWinDays} for ${date}`);
            } else {
                break;
            }
        }
    }

    // Sets win/loss days based on most recent streak
    let winDays, lossDays;
    let winningStreakTrades, losingStreakTrades;
    let winningDays, losingDays;

    if (mostRecentStreak === 'winning') {
        winDays = currentWinDays;
        lossDays = previousLossDays;
        winningStreakTrades = mostRecentWinningStreakTrades;
        losingStreakTrades = previousLosingStreakTrades;
        winningDays = mostRecentWinningDays;
        losingDays = previousLosingDays;
    } else if (mostRecentStreak === 'losing') {
        winDays = previousWinDays;
        lossDays = currentLossDays;
        winningStreakTrades = previousWinningStreakTrades;
        losingStreakTrades = mostRecentLosingStreakTrades;
        winningDays = previousWinningDays;
        losingDays = mostRecentLosingDays;
    } else {
        winDays = 0;
        lossDays = 0;
        winningStreakTrades = [];
        losingStreakTrades = [];
        winningDays = [];
        losingDays = [];
    }

    console.log('Most recent streak:', mostRecentStreak);
    console.log('Winning days:', winningDays);
    console.log('Losing days:', losingDays);
    console.log('✔️ Winning days:', winDays);
    console.log('✔️ Losing days:', lossDays);

    // Calculates trade streaks within winning/losing day streaks
    const winningStreakWins = winningStreakTrades.filter(trade => trade.outcome === 'Win').length;
    const winningStreakLosses = winningStreakTrades.filter(trade => trade.outcome === 'Loss').length;
    const winningStreakWinRate = winningStreakTrades.length > 0 ? (winningStreakWins / winningStreakTrades.length * 100).toFixed(2) : 0;
    const winningStreakNetPnL = winningDays.reduce((sum, date) => sum + (dailyPnL[date] || 0), 0);

    const losingStreakWins = losingStreakTrades.filter(trade => trade.outcome === 'Win').length;
    const losingStreakLosses = losingStreakTrades.filter(trade => trade.outcome === 'Loss').length;
    const losingStreakWinRate = losingStreakTrades.length > 0 ? (losingStreakWins / losingStreakTrades.length * 100).toFixed(2) : 0;
    const losingStreakNetPnL = losingDays.reduce((sum, date) => sum + (dailyPnL[date] || 0), 0);

    console.log('Trades during winning streak:', { wins: winningStreakWins, losses: winningStreakLosses, winRate: winningStreakWinRate, netPnL: winningStreakNetPnL });
    console.log('Trades during losing streak:', { wins: losingStreakWins, losses: losingStreakLosses, winRate: losingStreakWinRate, netPnL: losingStreakNetPnL });

    // Calculates maximum losing day streak
    const orderedDatesAsc = Array.from(groupedByDate.keys()).sort((a, b) => new Date(a) - new Date(b));
    console.log('Ordered dates (ascending) for max loss streak:', orderedDatesAsc);
    tempLossDayStreak = 0;
    maxLossDayStreak = 0;
    for (let i = 0; i < orderedDatesAsc.length; i++) {
        const date = orderedDatesAsc[i];
        const pnl = dailyPnL[date];
        const isLosing = pnl < 0;
        const isBreakeven = Math.abs(pnl) < EPSILON;
        console.log(`Processing date ${date}: PnL=${pnl}, isLosing=${isLosing}, isBreakeven=${isBreakeven}`);
        if (isLosing) {
            tempLossDayStreak++;
            maxLossDayStreak = Math.max(maxLossDayStreak, tempLossDayStreak);
            console.log(`Incremented tempLossDayStreak to ${tempLossDayStreak}, maxLossDayStreak=${maxLossDayStreak}`);
        } else {
            tempLossDayStreak = 0;
            console.log(`Reset tempLossDayStreak to 0 (day is ${isBreakeven ? 'breakeven' : 'winning'})`);
        }
    }
    console.log('📉 Max losing day streak (all time):', maxLossDayStreak);

    const result = {
        winTrades: winningStreakWins,
        lossTrades: winningStreakLosses,
        winDays,
        lossDays,
        winTradesLosingStreak: losingStreakWins,
        lossTradesLosingStreak: losingStreakLosses,
        winningStreakWinRate,
        losingStreakWinRate,
        winningStreakNetPnL,
        losingStreakNetPnL,
        maxLossDayStreak,
        mostRecentStreak
    };

    console.log('✅ Final full streaks result:', result);
    return result;
}

// Calculates win rate for a specific date
// Purpose: Computes the percentage of winning trades for a given day
export function calculateWinRateForDate(trades, date = new Date(), outcomeKey = 'outcome', dateKey = 'date', winValue = 'Win') {
    try {
        // Ensures date is valid
        const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        const targetDateString = validDate.toDateString();
        console.log(`Calculating win rate for date: ${targetDateString}, total trades: ${trades.length}`);
        console.log(`Raw trade dates:`, trades.map(t => t[dateKey]));

        // Filters trades for the given date
        const selectedTrades = trades.filter(t => {
            if (!t[dateKey]) {
                console.warn(`Trade missing date:`, t);
                return false;
            }

            let tradeDate;
            try {
                const rawDate = String(t[dateKey]).trim();
                if (typeof rawDate === 'string') {
                    if (rawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        tradeDate = new Date(rawDate);
                    } else if (rawDate.match(/^\d{4}-\d{2}-\d{2}T/)) {
                        tradeDate = new Date(rawDate);
                    } else if (rawDate.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/)) {
                        const parts = rawDate.split(/[\/-]/);
                        tradeDate = new Date(`${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`);
                    } else if (rawDate.match(/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/)) {
                        const parts = rawDate.split(/[\/-]/);
                        tradeDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                    } else if (rawDate.match(/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/)) {
                        const parts = rawDate.split(/[\/-]/);
                        tradeDate = new Date(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
                    } else if (rawDate.match(/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/)) {
                        tradeDate = new Date(rawDate);
                    } else {
                        tradeDate = new Date(rawDate);
                    }
                } else {
                    tradeDate = new Date(rawDate);
                }

                if (isNaN(tradeDate.getTime())) {
                    console.warn(`Invalid trade date: ${rawDate}`);
                    return false;
                }

                const tradeDateString = tradeDate.toDateString();
                console.log(`Parsed trade date: ${rawDate} -> ${tradeDateString}`);
                return tradeDateString === targetDateString;
            } catch (err) {
                console.warn(`Error parsing trade date: ${t[dateKey]}, error:`, err);
                return false;
            }
        });

        console.log(`Trades found for ${targetDateString}:`, selectedTrades.map(t => ({ id: t.id, date: t[dateKey], outcome: t[outcomeKey] })));

        if (!selectedTrades.length) {
            console.log(`No trades matched for ${targetDateString}`);
            return 0;
        }

        const wins = selectedTrades.filter(t => t[outcomeKey] === winValue).length;
        const winRate = (wins / selectedTrades.length * 100);
        console.log(`Win rate: ${winRate.toFixed(2)}% (${wins}/${selectedTrades.length} wins)`);
        return winRate;
    } catch (err) {
        console.error('Error in calculateWinRateForDate:', err);
        showToast('Error calculating daily win rate.', 'error');
        return 0;
    }
}

// Calculates overall win rate
// Purpose: Computes the percentage of winning trades across all trades
export function calculateWinRate(trades, outcomeKey = 'outcome', winValue = 'Win') {
    if (!trades || !trades.length) return 0;
    const wins = trades.filter(t => t[outcomeKey] === winValue).length;
    return (wins / trades.length * 100);
}

// Calculates profit factor
// Purpose: Computes ratio of total profits to total losses
export function calculateProfitFactor(trades, profitLossKey = 'profitLoss', outcomeKey = 'outcome', winValue = 'Win', lossValue = 'Loss') {
    const wins = trades.filter(t => t[outcomeKey] === winValue).reduce((sum, t) => sum + (t[profitLossKey] || 0), 0);
    const losses = Math.abs(trades.filter(t => t[outcomeKey] === lossValue).reduce((sum, t) => sum + (t[profitLossKey] || 0), 0));
    return losses === 0 ? (wins > 0 ? Infinity : 0) : (wins / losses).toFixed(2);
}

// Calculates average win/loss ratio
// Purpose: Computes the ratio of average win to average loss
export function calculateAvgWinLoss(trades, profitLossKey = 'profitLoss', outcomeKey = 'outcome', winValue = 'Win', lossValue = 'Loss') {
    const wins = trades.filter(t => t[outcomeKey] === winValue);
    const losses = trades.filter(t => t[outcomeKey] === lossValue);
    const avgWin = wins.length ? wins.reduce((sum, t) => sum + (t[profitLossKey] || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((sum, t) => sum + (t[profitLossKey] || 0), 0) / losses.length) : 0;
    if (avgWin === 0 || avgLoss === 0) return '0.00';
    return (avgWin / avgLoss).toFixed(2);
}

// Renders a Chart.js chart
// Purpose: Generic function to render charts with Chart.js
export async function renderChart({
    id,
    container,
    type = 'line',
    labels = [],
    data = [],
    datasets = [],
    chartOptions = {},
    plugins = [],
    afterRenderCallback = null,
    chartInstances = {}
}) {
    try {
        // Validates container
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('Invalid container element');
        }

        // Destroys existing chart instance
        if (chartInstances[id]) {
            chartInstances[id].destroy();
        }

        // Clears container and creates canvas
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-container';
        wrapper.style.height = '400px';
        wrapper.style.minHeight = '400px';
        wrapper.style.width = '100%';

        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        // Prepares chart data
        const chartData = datasets.length > 0 ? { labels, datasets } : {
            labels,
            datasets: [{ data, ...chartOptions.datasetOptions }]
        };

        // Creates chart instance
        chartInstances[id] = new window.Chart(canvas, {
            type,
            data: chartData,
            options: chartOptions,
            plugins
        });

        // Executes callback if provided
        if (typeof afterRenderCallback === 'function') {
            afterRenderCallback(chartInstances[id]);
        }

    } catch (err) {
        console.error(`Error rendering chart ${id}:`, err);
        container.innerHTML = `<div class="text-danger">Error rendering Chart</div>`;
        showToast(`Error rendering chart ${id}.`, 'error');
    }
}

// Creates a linear gradient for charts
// Purpose: Generates a gradient for chart datasets
export function createGradient(ctx, canvas, colorStart, colorEnd) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 400);
    gradient.addColorStop(0, colorStart);
    gradient.addColorStop(1, colorEnd);
    return gradient;
}

// Calculates trade counts for an account
// Purpose: Counts total, winning, and losing trades within a date range
export function calculateTradeCounts(trades, accountId, startDate = null, endDate = null) {
    if (!Array.isArray(trades) || !accountId) {
        return { total: 0, wins: 0, losses: 0 };
    }

    const filteredTrades = trades.filter(trade => {
        if (trade.accountId !== accountId) return false;
        if (startDate && new Date(trade.date) < new Date(startDate)) return false;
        if (endDate && new Date(trade.date) > new Date(endDate)) return false;
        return true;
    });

    const total = filteredTrades.length;
    const wins = filteredTrades.filter(t => t.profitLoss > 0).length;
    const losses = filteredTrades.filter(t => t.profitLoss < 0).length;

    return { total, wins, losses };
}

// Filters trades by account ID
// Purpose: Returns trades associated with a specific account
export function filterTradesByAccount(trades, accountId) {
    if (!Array.isArray(trades) || !accountId) return [];
    return trades.filter(t => t.accountId === accountId);
}

// Renders a top metric UI component
// Purpose: Displays a metric with a circular progress visualization
export function renderTopMetric(container, { value, format = 'number', colorFn = null }) {
    try {
        let displayValue = value;
        
        // Normalizes value for formatting
        if (typeof value === 'string') {
            value = parseFloat(value.replace('%', '').replace('$', ''));
        }

        if (isNaN(value)) value = 0;

        if (format === 'currency') {
            displayValue = `$${value.toFixed(2)}`;
        } else if (format === 'currency-short') {
            displayValue = `$${Math.round(value)}`;
        } else if (format === 'percentage') {
            displayValue = `${value.toFixed(0)}%`;
        } else if (format === 'percentage-short') {
            displayValue = `${value.toFixed(0)}%`;
        } else if (format === 'number') {
            displayValue = value.toFixed(0);
        }

        const circumference = 2 * Math.PI * 30;
        const strokeDasharray = `${(value / 100) * circumference} ${circumference}`;
        const color = colorFn ? colorFn(value) : '#28a745';

        container.innerHTML = `
            <div class="d-flex flex-column align-items-center text-center">
                <div class="position-relative d-flex justify-content-center align-items-center" style="width: 100px; height: 100px;">
                    <svg width="100" height="100" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="30" fill="none" stroke="#e9ecef" stroke-width="4"/>
                        <circle cx="40" cy="40" r="30" fill="none" 
                                stroke="${color}" 
                                stroke-width="4" 
                                stroke-dasharray="${strokeDasharray}" 
                                stroke-dashoffset="0" 
                                transform="rotate(-90 40 40)"/>
                    </svg>
                    <span class="position-absolute" style="font-size: 0.9rem; color: ${color}">${displayValue}</span>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('Error rendering Top Metric:', err);
        container.innerHTML = '<div class="text-danger">Error rendering Top Metric</div>';
    }
}


// Apply predefined date range filters
// Purpose: Generates start and end dates for common time filters
export function getDateRangeForFilter(filterType) {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day
    let startDate = null;
    let endDate = today;

    switch (filterType) {
        case 'current-month':
            startDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'last-3-days':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 2);
            break;
        case 'last-7-days':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 6);
            break;
        case 'last-15-days':
            startDate = new Date(today);
            startDate.setDate(today.getDate() - 14);
            break;
        case 'last-3-months':
            startDate = new Date(today);
            startDate.setMonth(today.getMonth() - 3);
            startDate.setDate(1);
            break;
        case 'last-6-months':
            startDate = new Date(today);
            startDate.setMonth(today.getMonth() - 6);
            startDate.setDate(1);
            break;
        case 'year-to-date':
            startDate = new Date(today.getFullYear(), 0, 1);
            break;
        case 'all-time':
            startDate = null; // No start date for all-time
            endDate = null; // No end date for all-time
            break;
        case 'custom':
            // Custom range will be handled separately
            return { startDate: null, endDate: null };
        default:
            console.warn(`Unrecognized filter type: ${filterType}, returning null range`);
            return { startDate: null, endDate: null };
    }

    return { 
        startDate: startDate ? startDate.toISOString().split('T')[0] : null, 
        endDate: endDate ? endDate.toISOString().split('T')[0] : null 
    };
}

// Filters trades by date range
// Purpose: Returns trades within the specified start and end dates
export function filterTradesByDateRange(trades, startDate, endDate) {
    if (!Array.isArray(trades)) return [];
    if (!startDate || !endDate) return trades;

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include entire end date

    return trades.filter(trade => {
        const tradeDate = new Date(trade.date);
        return tradeDate >= start && tradeDate <= end;
    });
}

// Manages dynamic loaders
// Purpose: Shows a loading spinner for a target element
export function showLoader(targetId) {
    let loader = loaderCache.get(targetId);
    if (!loader) {
        loader = document.createElement('div');
        loader.id = `${targetId}-loader`;
        loader.className = 'dynamic-loader';
        loader.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 255, 255, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
        `;
        loader.innerHTML = `
            <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
        `;
        document.body.appendChild(loader);
        loaderCache.set(targetId, loader);
        console.log(`Created and cached loader for ${targetId}`);
    }
    loader.style.display = 'flex';
    console.log(`Loader shown for ${targetId}`);

    const target = document.getElementById(targetId);
    if (target) {
        target.style.display = 'none';
        console.log(`Target ${targetId} hidden`);
    } else {
        console.warn(`Target element ${targetId} not found`);
    }
}

// Hides a loader and shows the target element
// Purpose: Removes the loading spinner and restores visibility of the target
export function hideLoader(targetId) {
    const loader = loaderCache.get(targetId);
    if (loader) {
        loader.style.display = 'none';
        console.log(`Loader hidden for ${targetId}`);
    } else {
        console.warn(`Loader for ${targetId} not found in cache`);
    }

    const target = document.getElementById(targetId);
    if (target) {
        target.style.display = 'block';
        console.log(`Target ${targetId} shown`);
    } else {
        console.warn(`Target element ${targetId} not found`);
    }
}

// Indexes trades by month
// Purpose: Organizes trades into a dictionary by year-month for efficient access
export function indexTradesByMonth(trades) {
    console.time('Indexing trades');
    const indexedTrades = {};
    if (!Array.isArray(trades)) {
        console.warn('Trades array is invalid or empty:', trades);
        return indexedTrades;
    }
    trades.forEach((trade, index) => {
        if (!trade || !trade.date || !trade.accountId) {
            console.warn(`Invalid trade data at index ${index}:`, trade);
            return;
        }
        const isValidDate = typeof trade.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(trade.date);
        if (!isValidDate) {
            console.warn(`Invalid trade date format at index ${index}: ${trade.date}`);
            return;
        }
        const yearMonth = trade.date.slice(0, 7); // e.g., '2025-04'
        if (!indexedTrades[yearMonth]) {
            indexedTrades[yearMonth] = [];
        }
        indexedTrades[yearMonth].push(trade);
    });
    console.timeEnd('Indexing trades');
    console.log(`Indexed ${Object.keys(indexedTrades).length} months:`, Object.keys(indexedTrades));
    // Log trade counts for key months
    ['2025-01', '2025-04'].forEach(month => {
        if (indexedTrades[month]) {
            console.log(`Trades for ${month}: ${indexedTrades[month].length}`, 
                indexedTrades[month].slice(0, 5).map(t => ({ id: t.id, date: t.date, accountId: t.accountId })));
        } else {
            console.log(`No trades indexed for ${month}`);
        }
    });
    return indexedTrades;
}

// Updates indexed trades for new trades
// Purpose: Adds a single trade to the month-based index
export function addTradeToIndex(indexedTrades, trade) {
    if (!trade || !trade.date || !trade.accountId) {
        console.warn('Invalid trade data for indexing:', trade);
        return;
    }
    const isValidDate = typeof trade.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(trade.date);
    if (!isValidDate) {
        console.warn(`Invalid trade date format: ${trade.date}`);
        return;
    }
    const yearMonth = trade.date.slice(0, 7);
    if (!indexedTrades[yearMonth]) {
        indexedTrades[yearMonth] = [];
    }
    indexedTrades[yearMonth].push(trade);
}

/**
 * Calculates the balance for an account by summing initialBalance and profitLoss from trades.
 * @param {Object} options
 * @param {number|string} options.accountId - The ID of the account (numeric or string).
 * @param {string} [options.startDate] - Start date for trade filtering (YYYY-MM-DD).
 * @param {string} [options.endDate] - End date for trade filtering (YYYY-MM-DD).
 * @param {number|string} [options.tradeId] - Specific trade ID to calculate balance up to (numeric or string).
 * @param {Object} [options.filters] - Additional filters (e.g., { pair: 'EURUSD', strategy: 'Scalping' }).
 * @param {boolean} [options.useCache=true] - Use in-memory cache for performance.
 * @param {boolean} [options.validate=false] - Validate against stored balance field.
 * @returns {Promise<{balance: number, initialBalance: number, account: Object}>} The calculated balance, initial balance, and account data.
 * @throws {Error} If account or trades are invalid or database is not initialized.
 */
export async function calculateAccountBalance({
    accountId,
    startDate,
    endDate,
    tradeId,
    filters = {},
    useCache = true,
    validate = false
} = {}) {
    try {
        console.log(`Calculating balance for accountId: ${accountId}, tradeId: ${tradeId || 'none'}, useCache: ${useCache}, validate: ${validate}, type: ${typeof accountId}`);

        // Input validation
        if (!validateAccountId(accountId, 'calculateAccountBalance')) {
            throw new Error('Invalid or missing accountId');
        }

        // Normalize to numeric ID
        const numericId = typeof accountId === 'string' && !isNaN(parseInt(accountId)) ? parseInt(accountId) : accountId;
        console.log(`Using numericId: ${numericId} (type: ${typeof numericId})`);

        // Normalize tradeId to numeric
        const numericTradeId = tradeId && typeof tradeId === 'string' && !isNaN(parseInt(tradeId)) ? parseInt(tradeId) : tradeId;
        console.log(`Using numericTradeId: ${numericTradeId || 'none'} (type: ${typeof numericTradeId})`);

        // Check cache
        const cacheKey = `${numericId}_${startDate || ''}_${endDate || ''}_${numericTradeId || ''}_${JSON.stringify(filters)}`;
        if (useCache && balanceCache.has(cacheKey)) {
            const cachedData = balanceCache.get(cacheKey);
            console.log(`Cache hit for account ${numericId}: balance=${cachedData.balance}, initialBalance=${cachedData.initialBalance}`);
            return cachedData;
        } else {
            console.log(`Cache miss for account ${numericId}, key: ${cacheKey}`);
        }

        // Access database
        let db;
        try {
            db = getDB();
        } catch (err) {
            console.error('Database access error:', err, err.stack);
            throw new Error('Database not initialized. Please try again.');
        }

        const transaction = db.transaction(['accounts', 'trades'], 'readonly');
        const accountStore = transaction.objectStore('accounts');
        const tradeStore = transaction.objectStore('trades');

        // Fetch account with numeric ID
        console.log(`Querying accountStore for accountId: ${numericId}`);
        let account = await new Promise((resolve, reject) => {
            const request = accountStore.get(numericId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error(`Failed to fetch account ${numericId}: ${request.error}`));
        });

        if (!account) {
            console.error('Account not found in database:', { accountId: numericId, accounts: await accountStore.getAll() });
            throw new Error(`Account ${numericId} not found`);
        }
        console.log(`Fetched account for ID ${numericId}:`, { id: account.id, name: account.name, initialBalance: account.initialBalance });

        const initialBalance = account.initialBalance ?? 0;
        if (typeof initialBalance !== 'number') {
            console.warn(`Invalid initialBalance for account ${numericId}: ${initialBalance}, defaulting to 0`);
        }

        // Fetch trades with numeric ID
        let trades = [];
        console.log(`Fetching trades for accountId: ${numericId} (numeric)`);
        await new Promise((resolve, reject) => {
            const request = tradeStore.index('accountId').openCursor(IDBKeyRange.only(numericId));
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    trades.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            request.onerror = () => reject(new Error(`Failed to fetch trades for account ${numericId}: ${request.error}`));
        });

        console.log(`Fetched ${trades.length} trades for account ${numericId}:`, 
            trades.map(t => ({ id: t.id, accountId: t.accountId, profitLoss: t.profitLoss, date: t.date, tradeTime: t.tradeTime })));

        // Handle empty trades
        if (trades.length === 0) {
            const result = { balance: initialBalance, initialBalance, account };
            if (useCache) {
                balanceCache.set(cacheKey, result);
                if (balanceCache.size > 100) balanceCache.clear();
            }
            console.log(`No trades for account ${numericId}, all-time balance: ${initialBalance}`);
            return result;
        }

        // Validate trade IDs
        const tradeIds = new Set();
        trades = trades.filter(trade => {
            if (!trade.id) {
                console.warn(`Trade missing ID for account ${numericId}:`, trade);
                return false;
            }
            if (tradeIds.has(trade.id)) {
                console.warn(`Duplicate trade ID ${trade.id} for account ${numericId}`);
                return false;
            }
            tradeIds.add(trade.id);
            return true;
        });

        // Filter by tradeId
        if (numericTradeId) {
            const tradeIndex = trades.findIndex(t => t.id === numericTradeId || t.id === numericTradeId.toString());
            if (tradeIndex === -1) {
                console.error(`Trade ${numericTradeId} not found for account ${numericId}`);
                throw new Error(`Trade ${numericTradeId} not found for account ${numericId}`);
            }
            trades = trades.slice(0, tradeIndex + 1);
            console.log(`Filtered trades up to tradeId ${numericTradeId}:`, 
                trades.map(t => ({ id: t.id, accountId: t.accountId, profitLoss: t.profitLoss, date: t.date })));
        }

        // Apply other filters
        if (startDate || endDate) {
            trades = trades.filter(trade => {
                const tradeDate = trade.date;
                const isValid = (!startDate || tradeDate >= startDate) && (!endDate || tradeDate <= endDate);
                if (!isValid) console.log(`Filtered out trade ${trade.id} outside date range: ${tradeDate}`);
                return isValid;
            });
        }
        if (filters.pair || filters.strategy) {
            trades = trades.filter(trade => {
                const isValid = (!filters.pair || trade.pair === filters.pair) &&
                               (!filters.strategy || trade.strategy === filters.strategy);
                if (!isValid) console.log(`Filtered out trade ${trade.id} for filters:`, filters);
                return isValid;
            });
        }

        // Sort trades
        trades.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.tradeTime}`);
            const dateB = new Date(`${b.date}T${b.tradeTime}`);
            return dateA - dateB;
        });

        // Calculate total profit/loss - commission - swap
        const totalPnL = trades.reduce((sum, trade) => {
            const profitLoss = typeof trade.profitLoss === 'number' ? trade.profitLoss : 0;
            const commission = typeof trade.commission === 'number' ? trade.commission : 0;
            const swap = typeof trade.swap === 'number' ? trade.swap : 0;

            // Always subtract commission and swap as costs
            const net = profitLoss - Math.abs(commission) - Math.abs(swap);

            if (isNaN(net)) {
                console.warn(`Invalid trade values for trade ${trade.id}:`, trade);
                return sum;
            }

            return sum + net;
        }, 0);
        console.log(`Calculated totalPnL for account ${numericId}: ${totalPnL}, trades: ${trades.length}`);

        // Calculate balance
        const balance = initialBalance + totalPnL;

        // Validation
        if (validate && trades.length > 0) {
            const lastTrade = trades[trades.length - 1];
            if (lastTrade.balance && Math.abs(lastTrade.balance - balance) > 0.01) {
                console.warn(`Balance mismatch for account ${numericId}: calculated ${balance}, stored ${lastTrade.balance}`);
                showToast(`Balance mismatch detected for account ${numericId}. Consider recalculating trades.`, 'warning');
            }
        }

        // Cache result
        const result = { balance, initialBalance, account };
        if (useCache) {
            balanceCache.set(cacheKey, result);
            if (balanceCache.size > 100) balanceCache.clear();
            console.log(`Cached balance for account ${numericId}: ${balance}, initialBalance: ${initialBalance}, key: ${cacheKey}`);
        }

        console.log(`Calculated all-time balance for account ${numericId}: ${balance}`);
        return result;
    } catch (err) {
        console.error(`Error calculating all-time balance for account ${accountId || 'unknown'}:`, err, err.stack);
        throw err;
    }
}

// Clears the balance cache
// Purpose: Resets the in-memory cache for account balances
export function clearBalanceCache() {
    balanceCache.clear();
    console.log('Balance cache cleared');
}

// Validates account ID
// Purpose: Ensures the account ID is valid (not null or undefined)
export function validateAccountId(accountId, context = 'unknown') {
    if (accountId === null || accountId === undefined) {
        console.error(`Invalid accountId in ${context}:`, accountId);
        showToast('Invalid account ID.', 'error');
        return false;
    }
    console.log(`Validated accountId in ${context}: ${accountId} (type: ${typeof accountId})`);
    return true;
}

// Normalizes account ID
// Purpose: Converts string account IDs to numeric, ensuring consistency
export function normalizeAccountID(activeAccountId, context = 'unknown') {
    if (activeAccountId === null || activeAccountId === undefined) {
        console.error(`Invalid accountId in ${context}:`, activeAccountId);
        showToast('Invalid account ID.', 'error');
        throw new Error(`Invalid accountId in ${context}`);
    }
    const numericId = typeof activeAccountId === 'string' && !isNaN(parseInt(activeAccountId)) 
        ? parseInt(activeAccountId) 
        : activeAccountId;
    if (typeof numericId !== 'number' || isNaN(numericId)) {
        console.error(`Non-numeric accountId in ${context}:`, numericId);
        showToast('Invalid account ID.', 'error');
        throw new Error(`Non-numeric accountId in ${context}`);
    }
    console.log(`Normalized accountId in ${context}: ${activeAccountId} → ${numericId} (type: ${typeof numericId})`);
    return numericId;
}

// Calculates basic strategy performance metrics
// Purpose: Computes metrics like total trades, win rate, and net P&L for a given strategy
export function calculateStrategyMetrics(trades, strategyName) {
    // Ensure trades is an array
    const strategyTrades = Array.isArray(trades) ? trades : [];
    if (!Array.isArray(trades)) {
        console.warn(`calculateStrategyMetrics received non-array trades for strategy "${strategyName}":`, trades);
    }
    console.log(`calculateStrategyMetrics for strategy "${strategyName}":`, strategyTrades.length, 'trades:', strategyTrades);

    const totalTrades = strategyTrades.length;
    const wins = strategyTrades.filter(t => t.outcome === 'Win').length;
    const winRate = totalTrades ? (wins / totalTrades * 100).toFixed(2) : 0;
    const netPnL = strategyTrades.reduce((sum, t) => sum + (t.profitLoss || 0), 0).toFixed(2);
    const lastUsed = strategyTrades.length ? strategyTrades.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : null;

    return { totalTrades, winRate, netPnL, lastUsed };
}

// Validates daily trading plan
// Purpose: Ensures no duplicate plan exists for the given date and account
export function validateDailyPlan(date, accountId, dailyPlans) {
    if (!date || !accountId || !Array.isArray(dailyPlans)) {
        console.warn('Invalid inputs for validateDailyPlan:', { date, accountId, dailyPlans });
        showToast('Invalid plan data.', 'error');
        return false;
    }

    const dateStr = new Date(date).toISOString().split('T')[0];
    const exists = dailyPlans.some(plan => 
        plan.accountId === accountId && 
        new Date(plan.date).toISOString().split('T')[0] === dateStr
    );

    console.log(`validateDailyPlan: Date=${dateStr}, AccountId=${accountId}, Exists=${exists}`);
    return !exists;
}

// Validates date range
// Purpose: Ensures date range is valid (1–7 days, no future dates, end after start)
export function validateDateRange(startDate, endDate) {
    // Check if dates are valid
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();

    // Ensure dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        showToast('Invalid date format. Please select valid dates.', 'error');
        return false;
    }

    // Ensure end date is after start date
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) {
        showToast('End date must be after start date.', 'error');
        return false;
    }

    // Ensure date range is between 1 and 7 days
    if (diffDays > 7) {
        showToast('Date range cannot exceed 7 days.', 'error');
        return false;
    }

    // Ensure start date is not in the future
    if (start > today) {
        showToast('Start date cannot be in the future.', 'error');
        return false;
    }

    // Ensure end date is not in the future
    if (end > today) {
        showToast('End date cannot be in the future.', 'error');
        return false;
    }

    return true;
}

// Formats date range for display
// Purpose: Converts start and end dates to a human-readable string
export function formatDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
}

// Generates dates between start and end date
// Purpose: Returns an array of dates within the specified range
export function getDatesInRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.error(`Invalid date range: startDate=${startDate}, endDate=${endDate}`);
        throw new Error(`Invalid date range: startDate=${startDate}, endDate=${endDate}`);
    }

    const dates = [];
    let currentDate = new Date(start);
    while (currentDate <= end) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }
    console.log(`Generated dates for range ${startDate} to ${endDate}:`, dates.map(d => d.toISOString().split('T')[0]));
    return dates;
}

// Gets the previous week's date range
// Purpose: Returns the Monday-to-Friday range for the previous week
export function getPreviousWeekRange(endDate) {
    const currentEnd = new Date(endDate);
    const currentMonday = new Date(currentEnd);
    
    // Move to current week's Monday
    currentMonday.setDate(currentEnd.getDate() - ((currentEnd.getDay() + 6) % 7));

    // Previous week: subtract 7 days
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(currentMonday.getDate() - 7);

    const prevFriday = new Date(prevMonday);
    prevFriday.setDate(prevMonday.getDate() + 4); // Monday + 4 = Friday

    const prevStart = prevMonday.toISOString().split('T')[0];
    const prevEnd = prevFriday.toISOString().split('T')[0];

    console.log(`🗓️ Previous week range (Mon–Fri): ${prevStart} → ${prevEnd}`);
    return { prevStart, prevEnd };
}

// Filters trades for a specific date range and account
// Purpose: Returns trades within the date range and matching account ID, with validation
export function filterTradesForRange(trades, startDate, endDate, accountId) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    console.log(`Filtering trades for range ${startDate} to ${endDate}, accountId: ${accountId}`);

    const filteredTrades = trades.filter(t => {
        const tradeDate = new Date(t.date);
        const matchesAccount = t.accountId === accountId;
        const withinRange = tradeDate >= start && tradeDate <= end;
        if (withinRange && matchesAccount) {
            if (typeof t.profitLoss !== 'number') {
                console.warn(`Trade on ${t.date} has invalid profitLoss: ${t.profitLoss}`);
            }
            if (t.outcome !== 'Win' && t.outcome !== 'Loss') {
                console.warn(`Trade on ${t.date} has invalid outcome: ${t.outcome}`);
            }
        }
        console.log(`Trade: ${t.date}, accountId: ${t.accountId}, matchesAccount: ${matchesAccount}, withinRange: ${withinRange}`);
        return matchesAccount && withinRange;
    });

    console.log(`Filtered ${filteredTrades.length} trades for range ${startDate} to ${endDate}`);
    return filteredTrades;
}

// Calculates equity curve for current and previous week
// Purpose: Computes cumulative P&L for trades in specified date ranges
export function calculateEquityCurve(trades, startDate, endDate, prevStartDate, prevEndDate, accountId) {
    // Validate input dates
    if (!startDate || !endDate) {
        throw new Error('startDate and endDate are required');
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error(`Invalid current week date range: startDate=${startDate}, endDate=${endDate}`);
    }

    // Combine current and previous range for comparison
    const allDates = [];
    if (prevStartDate && prevEndDate) {
        const prevStart = new Date(prevStartDate);
        const prevEnd = new Date(prevEndDate);
        if (isNaN(prevStart.getTime()) || isNaN(prevEnd.getTime())) {
            console.warn(`Invalid previous week date range: prevStartDate=${prevStartDate}, prevEndDate=${prevEndDate}, skipping previous week`);
        } else {
            const prevDates = getDatesInRange(prevStartDate, prevEndDate);
            const today = new Date();
            const filteredPrevDates = prevDates.filter(date => date instanceof Date && !isNaN(date.getTime()) && date <= today);
            allDates.push(...filteredPrevDates);
        }
    }

    const currentDates = getDatesInRange(startDate, endDate);
    allDates.push(...currentDates.filter(date => date instanceof Date && !isNaN(date.getTime())));
    console.log('All dates for equity curve:', allDates.map(d => d.toISOString().split('T')[0]));

    // Pre-sort trades by date for efficiency
    const sortedTrades = trades.sort((a, b) => new Date(a.date) - new Date(b.date));
    console.log('Sorted trades for equity curve:', sortedTrades.map(t => ({
        date: t.date,
        accountId: t.accountId,
        profitLoss: t.profitLoss
    })));

    // Filter trades for the specific accountId
    const accountTrades = sortedTrades.filter(trade => trade.accountId === accountId);
    console.log(`Filtered trades for accountId ${accountId}:`, accountTrades.map(t => ({
        date: t.date,
        accountId: t.accountId,
        profitLoss: t.profitLoss
    })));

    // Calculate daily P&L for all trades in the range for this account
    const dailyPnl = {};
    allDates.forEach(date => {
        dailyPnl[date.toISOString().split('T')[0]] = 0;
    });

    accountTrades.forEach(trade => {
        const tradeDate = new Date(trade.date).toISOString().split('T')[0];
        if (dailyPnl.hasOwnProperty(tradeDate)) {
            const pl = trade.profitLoss || 0;
            dailyPnl[tradeDate] += pl;
            console.log(`Daily P&L for ${tradeDate} (accountId: ${accountId}): Added ${pl}, Total: ${dailyPnl[tradeDate]}`);
        } else {
            console.log(`Trade on ${tradeDate} outside of date range, skipping:`, trade);
        }
    });
    console.log('Daily P&L after accumulation:', dailyPnl);

    // Calculate cumulative P&L for the current range
    const currentEquityData = [];
    let cumulativePnlCurrent = 0;
    currentDates.forEach(date => {
        const dateStr = date.toISOString().split('T')[0];
        cumulativePnlCurrent += dailyPnl[dateStr] || 0;
        currentEquityData.push({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            equity: cumulativePnlCurrent
        });
    });

    // Calculate cumulative P&L for the previous range (if applicable)
    let previousEquityData = [];
    if (prevStartDate && prevEndDate && !isNaN(new Date(prevStartDate).getTime()) && !isNaN(new Date(prevEndDate).getTime())) {
        const prevDates = getDatesInRange(prevStartDate, prevEndDate);
        const filteredPrevDates = prevDates.filter(date => date instanceof Date && !isNaN(date.getTime()) && date <= new Date());
        let cumulativePnlPrevious = 0;
        filteredPrevDates.forEach(date => {
            const dateStr = date.toISOString().split('T')[0];
            cumulativePnlPrevious += dailyPnl[dateStr] || 0;
            previousEquityData.push({
                date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                equity: cumulativePnlPrevious
            });
        });
        console.log('Previous week equity data:', previousEquityData);
    }

    return { currentEquityData, previousEquityData };
}

// Converts field to array
// Purpose: Ensures a field is an array, parsing JSON strings if necessary
function toArray(field) {
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
        try {
            const parsed = JSON.parse(field);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

// Analyzes trade tags
// Purpose: Categorizes and computes metrics for positive, negative, and neutral tags
export function calculateTradeTagAnalysis(trades) {
    const tagAnalysis = {
        positive: {},
        negative: {},
        neutral: {} // uncategorized
    };

    trades.forEach(trade => {
        const emotionTags = toArray(trade.emotions);
        const mistakeTags = toArray(trade.mistakes);
        const customTags = toArray(trade.customTags);

        const combinedTags = [...emotionTags, ...mistakeTags, ...customTags];
        if (combinedTags.length === 0) return;

        combinedTags.forEach(tag => {
            let category = 'neutral';
            if (POSITIVE_TAGS.includes(tag)) category = 'positive';
            else if (NEGATIVE_TAGS.includes(tag)) category = 'negative';

            if (!tagAnalysis[category][tag]) {
                tagAnalysis[category][tag] = {
                    totalPnl: 0,
                    wins: 0,
                    losses: 0,
                    trades: 0
                };
            }

            tagAnalysis[category][tag].totalPnl += trade.profitLoss || 0;
            tagAnalysis[category][tag].trades += 1;

            if (trade.outcome === 'Win') {
                tagAnalysis[category][tag].wins += 1;
            } else if (trade.outcome === 'Loss') {
                tagAnalysis[category][tag].losses += 1;
            }
        });
    });

    // Finalize win rate
    ['positive', 'negative', 'neutral'].forEach(group => {
        Object.keys(tagAnalysis[group]).forEach(tag => {
            const total = tagAnalysis[group][tag].trades;
            tagAnalysis[group][tag].winRate = total > 0
                ? (tagAnalysis[group][tag].wins / total * 100).toFixed(2)
                : '0.00';
        });
    });

    return tagAnalysis;
}

// Gets strategy name by ID
// Purpose: Retrieves the name of a strategy based on its ID
export function getStrategyNameById(strategyId, strategies) {
    const strategy = strategies.find(s => s.id === strategyId);
    return strategy ? strategy.name : '-';
}

// Determines trade direction
// Purpose: Infers whether a trade is Long or Short based on entry and exit prices
export function getTradeDirection(entryPrice, exitPrice) {
    if (typeof entryPrice !== 'number' || typeof exitPrice !== 'number') return '-';
    if (exitPrice > entryPrice) return 'Long';
    if (exitPrice < entryPrice) return 'Short';
    return '-';
}

// Formats monetary values
// Purpose: Converts numbers to formatted strings (e.g., billions, millions, thousands)
export function formatMoney(value) {
    if (value === 0) return '0';
    const absValue = Math.abs(value);

    if (absValue >= 1_000_000_000) {
        // Show billions with 2 decimals, trim trailing zeros
        return (value / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
    }
    if (absValue >= 1_000_000) {
        // Show millions with 2 decimals
        return (value / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    }
    if (absValue >= 1_000) {
        // Show thousands with 2 decimals
        return (value / 1_000).toFixed(2).replace(/\.?0+$/, '') + 'K';
    }

    // For numbers less than 1000, show max 2 decimals, remove trailing zeros
    return value.toFixed(2).replace(/\.?0+$/, '');
}
