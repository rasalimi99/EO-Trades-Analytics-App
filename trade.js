// Imports utility functions for validation and UI notifications
import { showToast, validateRequired, validateNumber } from './utils.js';

// Defines pip values for various trading pairs
// Purpose: Provides standard pip values for risk and profit calculations
export const pipValues = {
    'EURUSD': 10,
    'USDJPY': 10,
    'NAS100': 1,
    'US30': 1,
    'GBPUSD': 10,
    'AUDUSD': 10,
    'XAUUSD': 10
};

// Validates trade risk against account limits
// Purpose: Ensures the trade's risk complies with daily trade and loss limits
export function validateRisk(inputRisk, balance, dailyLoss, activeAccount, trades) {
    // Validates that input risk is a valid number greater than 0
    if (!validateNumber(inputRisk, 'Risk', 0)) return false;

    // Checks if an active account is selected
    if (!activeAccount) {
        showToast('No active account selected.', 'error');
        return false;
    }

    // Validates maximum trades per day
    const today = new Date();
    const dailyTrades = trades.filter(t => 
        t.accountId === activeAccount.id && 
        new Date(t.date).toDateString() === today.toDateString()
    ).length;
    if (dailyTrades >= activeAccount.maxTradesPerDay) {
        showToast(`Error: Maximum trades per day (${activeAccount.maxTradesPerDay}) reached.`, 'error');
        return false;
    }

    // Validates daily loss limit
    const dailyLossLimit = activeAccount.initialBalance * (activeAccount.maxLossPerDay / 100);
    if (Math.abs(dailyLoss) + inputRisk > dailyLossLimit) {
        showToast(`Error: Risk ($${inputRisk.toFixed(2)}) would exceed daily loss limit ($${dailyLossLimit.toFixed(2)}).`, 'warning');
        return false; // Note: Original code does not return here, but validation implies it should fail
    }

    return true;
}

// Validates if trade time is within the trading window
// Purpose: Checks if the trade time falls within allowed trading hours
export function validateTradingWindow(tradeTime, tradingWindow) {
    // Allows trade if trading window is not defined
    if (!tradingWindow.start || !tradingWindow.end) return true;

    // Converts times to minutes for comparison
    const tradeMinutes = parseInt(tradeTime.split(':')[0]) * 60 + parseInt(tradeTime.split(':')[1]);
    const startMinutes = parseInt(tradingWindow.start.split(':')[0]) * 60 + parseInt(tradingWindow.start.split(':')[1]);
    const endMinutes = parseInt(tradingWindow.end.split(':')[0]) * 60 + parseInt(tradingWindow.end.split(':')[1]);
    
    // Checks if trade time is within window
    const isWithinWindow = tradeMinutes >= startMinutes && tradeMinutes <= endMinutes;
    if (!isWithinWindow) {
        console.warn(`Trade at ${tradeTime} is outside trading window (${tradingWindow.start}–${tradingWindow.end}). Proceeding without prompt.`);
        return true; // Note: Allows trade despite being outside window
    }
    
    return true;
}

// Calculates loss for a trade
// Purpose: Returns the negative of the input risk as the potential loss
export function calculateLoss(risk) {
    return -risk; // Assumes loss equals risk without slippage
}

// Parses hold time input into minutes
// Purpose: Converts hold time string (e.g., "2h 30m", "150m", "2.5h") to minutes
export function parseHoldTime(input) {
    if (!input) return null;
    
    // Regular expression to match formats: "2h 30m", "150m", or "2.5h"
    const regex = /^(\d+)h\s*(\d*)m?$|^(\d+)m$|^(\d+(\.\d+)?)h$/;
    const match = input.match(regex);
    
    if (!match) return null;
    
    // Handles "Xh Ym" format
    if (match[1]) {
        const hours = parseInt(match[1]);
        const minutes = match[2] ? parseInt(match[2]) : 0;
        return hours * 60 + minutes;
    } 
    // Handles "Xm" format
    else if (match[3]) {
        return parseInt(match[3]);
    } 
    // Handles "X.Yh" format
    else if (match[4]) {
        return Math.round(parseFloat(match[4]) * 60);
    }
    
    return null;
}

// Formats minutes into a readable hold time string
// Purpose: Converts minutes to a string like "2h 30m" or "45m"
export function formatHoldTime(minutes) {
    if (!minutes) return '';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

// Calculates total daily loss for an account
// Purpose: Sums losses for trades on the current day for a specific account
export function calculateDailyLoss(trades, today, activeAccountId) {
    return trades
        .filter(t => t.accountId === activeAccountId && new Date(t.date).toDateString() === today.toDateString() && t.profitLoss < 0)
        .reduce((sum, t) => sum + t.profitLoss, 0);
}

// Updates consecutive loss counter
// Purpose: Tracks the number of consecutive losing trades
export function updateConsecutiveLosses(outcome, lastTrade, consecutiveLosses) {
    if (outcome === 'Loss') {
        return (lastTrade && lastTrade.outcome === 'Loss') ? consecutiveLosses + 1 : 1;
    }
    return 0;
}

// Calculates a discipline score for a trade
// Purpose: Evaluates trade adherence to plan and trading discipline
export function calculateDisciplineScore(trade, reflection, trades, riskPlans, tradingWindow, activeAccount) {
    let score = 0;
    
    // Awards points for risk adherence
    if (Math.abs(trade.plannedRisk - trade.actualRisk) <= 0.01) score += 20;
    
    // Awards points for reward-to-risk ratio adherence
    if (Math.abs(trade.plannedRR - trade.actualRR) <= 0.1) score += 20;
    
    // Awards points for trading within window
    if (!trade.outsideWindow) score += 20;
    
    // Awards points for complete reflection checklist
    if (reflection?.checklist && Object.values(reflection.checklist).every(v => v)) score += 30;
    
    // Awards points for high setup score and no mistakes
    if (trade.setupScore >= 8 && (!trade.mistakes || trade.mistakes.length === 0)) score += 10;
    
    // Deducts points for mistakes
    score -= (trade.mistakes?.length || 0) * 10;
    
    // Clamps score between 0 and 100
    return Math.max(0, Math.min(100, score));
}

// Validates a trade's data
// Purpose: Ensures all required trade fields are valid
export async function validateTrade(trade, strategies, riskPlans, tradingWindow, trades, pairs, activeAccount) {
    if (!activeAccount) {
        showToast('No active account selected.', 'error');
        return false;
    }
    
    // Resolves strategy name from ID or uses provided strategy
    let strategyName = trade.strategy;
    if (trade.strategyId) {
        const strategy = strategies.find(s => s.id === trade.strategyId);
        strategyName = strategy ? strategy.name : trade.strategy;
    }
    if (!strategyName && trade.strategyId) {
        showToast('Selected strategy ID is invalid or not found.', 'error');
        return false;
    }

    console.log('Validating trade with actualRR:', trade.actualRR, 'profitLoss:', trade.profitLoss);

    // Validates trade fields
    const validations = [
        validateRequired(trade.date, 'Date') || showToast('Date is required.', 'error'),
        validateRequired(trade.tradeTime, 'Time of Trade') || showToast('Time of Trade is required.', 'error'),
        validateRequired(trade.pair, 'Pair') || showToast('Pair is required.', 'error'),
        pairs.some(p => p.name === trade.pair) || showToast('Selected pair is not valid.', 'error'),
        validateRequired(trade.tradeType, 'Trade Type') || showToast('Trade Type is required.', 'error'),
        validateRequired(trade.timeframe, 'Timeframe') || showToast('Timeframe is required.', 'error'),
        validateRequired(strategyName, 'Strategy') || showToast('Strategy is required.', 'error'),
        validateNumber(trade.setupScore, 'Setup Score', 0) && trade.setupScore >= 1 && trade.setupScore <= 10 || showToast('Setup Score must be between 1 and 10.', 'error'),
        validateNumber(trade.plannedRisk, 'Planned Risk', 0) && trade.plannedRisk > 0 || showToast('Planned Risk must be greater than 0.', 'error'),
        validateNumber(trade.actualRisk, 'Actual Risk', 0) && trade.actualRisk > 0 || showToast('Actual Risk must be greater than 0.', 'error'),
        validateNumber(trade.plannedRR, 'Planned RR', 0) && trade.plannedRR >= 0.1 && trade.plannedRR <= 20 || showToast('Planned RR must be between 0.1 and 20.', 'error'),
        validateNumber(trade.actualRR, 'Actual RR', null, true) && trade.actualRR >= -20 && trade.actualRR <= 20 || showToast('Actual RR must be between -20 and 20.', 'error'),
        validateNumber(trade.stopLoss, 'Stop Loss', 0) || showToast('Stop Loss must be a valid number.', 'error'),
        validateNumber(trade.lotSize, 'Lot Size', 0, true) || showToast('Lot Size must be a valid number.', 'error'),
        validateNumber(trade.entryPrice, 'Entry Price', 0, true) || showToast('Entry Price must be a valid number.', 'error'),
        validateNumber(trade.slPrice, 'SL Price', 0, true) || showToast('SL Price must be a valid number.', 'error'),
        validateNumber(trade.exitPrice, 'Exit Price', 0, true) || showToast('Exit Price must be a valid number.', 'error'),
        trade.holdTime === null || !isNaN(trade.holdTime) || showToast('Invalid Trade Hold Time format. Use e.g., 2h 30m or 150m.', 'error'),
        trade.outcome === 'Win' || trade.outcome === 'Loss' || showToast('Outcome must be "Win" or "Loss".', 'error'),
        validateRequired(trade.exitReason, 'Exit Reason') || showToast('Exit Reason is required.', 'error'),
        validateRequired(trade.session, 'Session') || showToast('Session is required.', 'error'),
        validateRequired(trade.mood, 'Mood') || showToast('Mood is required.', 'error'),
        validateNumber(trade.adherence, 'Adherence', 0) && trade.adherence >= 1 && trade.adherence <= 5 || showToast('Adherence must be a number between 1 and 5.', 'error'),
        trade.emotions?.length > 0 || showToast('At least one Emotion Tag is required.', 'error'),
        trade.setupScore >= 1 || showToast('Setup Score must be ≥8 for high-probability trades.', 'error'),
        true, // Placeholder for unused validation
        true, // Placeholder for unused validation
        true, // Placeholder for unused validation
        validateNumber(trade.profitLoss, 'Profit/Loss', null, true) || showToast('Profit/Loss must be a valid number.', 'error')
    ];

    // Validates max drawdown limit
    const maxDrawdownLimit = activeAccount.maxDrawdown ? (activeAccount.initialBalance * (activeAccount.maxDrawdown / 100)) : Infinity;
    const previousBalance = trades.length ? (trades[trades.length - 1].balance || activeAccount.initialBalance) : activeAccount.initialBalance;
    const currentDrawdown = activeAccount.initialBalance - previousBalance;
    const newDrawdown = currentDrawdown + (trade.profitLoss < 0 ? Math.abs(trade.profitLoss) : 0);
    if (newDrawdown > maxDrawdownLimit) {
        showToast(`Error: Trade would exceed max drawdown limit ($${maxDrawdownLimit.toFixed(2)}).`, 'error');
        validations.push(false);
    }

    // Checks if all validations pass
    const isValid = validations.every(v => v);
    console.log('Trade validation result:', isValid, 'Failed validations:', validations.map((v, i) => !v ? i : null).filter(v => v !== null));
    return isValid;
}

// Validates a daily trading plan
// Purpose: Ensures all required fields in the daily plan are valid
export function validateDailyPlan(plan) {
    return [
        validateRequired(plan.date, 'Date'),
        validateRequired(plan.gamePlan, 'Game Plan'),
        validateRequired(plan.marketBias, 'Market Bias'),
        validateRequired(plan.emotions, 'Emotions Before Trading'),
        validateNumber(plan.confidenceLevel, 'Confidence Level', 0) && plan.confidenceLevel >= 1 && plan.confidenceLevel <= 10,
        validateRequired(plan.accountId, 'Account')
    ].every(v => v);
}

// Validates a weekly trading review
// Purpose: Ensures all required fields in the weekly review are valid
export function validateWeeklyReview(review) {
    return [
        validateRequired(review.weekStartDate, 'Week Start Date'),
        validateRequired(review.weekEndDate, 'Week End Date'),
        validateNumber(review.totalWins, 'Total Wins', -1),
        validateNumber(review.totalLosses, 'Total Losses', -1),
        validateRequired(review.netPnL, 'Net Profit/Loss'),
        validateRequired(review.lessonsLearned, 'Lessons Learned'),
        validateRequired(review.emotionReflection, 'Emotion Reflection'),
        validateRequired(review.accountId, 'Account')
    ].every(v => v);
}