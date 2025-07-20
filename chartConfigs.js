/**
 * chartConfigs.js
 * ----------------
 * This module defines configuration objects and utility functions for rendering trading charts.
 * Each chartConfig contains:
 *   - Chart metadata (name, type, legend text, etc.)
 *   - Data processing logic (processData)
 *   - Annotation definitions
 *   - Tooltip customization
 *   - Dataset construction for Chart.js
 *
 * It also exports:
 *   - renderChartWrapper: Function to prepare data and render charts.
 *   - createChartRenderer: Factory function that creates chart renderers for specific chart types.
 */

import { createGradient, renderChart, showToast } from './utils.js';

// Stores active Chart.js chart instances to manage and update charts efficiently.
let chartInstances = {};

/**
 * generateEmotionColor
 * --------------------
 * Maps emotion strings to specific hex colors for consistent visualization.
 * Purpose: Ensures emotions are represented with distinct colors in charts for easy identification.
 *
 * @param {string} emotion - Name of the emotion (e.g., "Fear").
 * @returns {string} - Corresponding hex color, defaults to purple if emotion is not mapped.
 */
function generateEmotionColor(emotion) {
    const colorMap = {
        Fear: '#dc3545',        // Red for Fear
        Confidence: '#28a745',  // Green for Confidence
        Greed: '#ffc107',       // Yellow for Greed
        Hope: '#17a2b8',        // Cyan for Hope
        Boredom: '#6c757d',     // Gray for Boredom
        Excitement: '#007bff'   // Blue for Excitement
    };
    return colorMap[emotion] || '#6f42c1'; // Default to purple if emotion is not found
}

/**
 * chartConfigs
 * ------------
 * Defines configurations for various chart types used in the trading app.
 * Purpose: Centralizes chart-specific logic for data processing, styling, and annotations.
 */
export const chartConfigs = {
    /**
     * BALANCE CHART
     * Displays the running account balance (equity curve) over time.
     * Purpose: Visualizes the growth or decline of account equity to assess trading performance.
     */
    balance: {
        name: 'Balance',
        type: 'line',           // Chart.js line chart type
        chartType: 'line',      // Internal chart type identifier
        legendText: 'Equity Line Chart', // Legend displayed below the chart
        yAxisBeginAtZero: false, // Y-axis does not start at zero to show relative changes
        yAxisTicks: {
            // Formats Y-axis ticks as dollar amounts
            callback: value => `$${Number(value).toLocaleString()}`
        },

        /**
         * Processes trade data to generate balance data points.
         * Purpose: Converts daily P&L into a cumulative balance for the equity curve.
         */
        processData: ({ dailyPnLMap, initialBalance }) => {
            const tradeDates = Object.keys(dailyPnLMap).sort(); // Sort dates chronologically
            let runningBalance = initialBalance; // Start with initial account balance
            const balances = [];

            // Calculate running balance by summing daily P&L
            for (const date of tradeDates) {
                runningBalance += dailyPnLMap[date];
                balances.push(parseFloat(runningBalance.toFixed(2))); // Round to 2 decimals
            }

            // Add initial balance point before first trade
            const firstTradeDate = tradeDates[0];
            const beforeFirstDate = new Date(firstTradeDate);
            beforeFirstDate.setDate(beforeFirstDate.getDate() - 1);
            const startLabel = beforeFirstDate.toISOString().split('T')[0];
            tradeDates.unshift(startLabel);
            balances.unshift(initialBalance);

            return {
                labels: tradeDates,      // X-axis labels (dates)
                data: balances,          // Y-axis data (balances)
                additionalData: { initialBalance } // Store initial balance for annotations
            };
        },

        /**
         * Defines annotations for the balance chart (e.g., initial balance line, min/max points).
         * Purpose: Highlights key levels like initial balance, peak, and trough for better insights.
         */
        getAnnotations: ({ labels, data, initialBalance, options }) => ({
            initial: {
                type: 'line', // Horizontal line at initial balance
                yMin: initialBalance,
                yMax: initialBalance,
                borderColor: options.annotationColor || '#adb5bd', // Light gray default
                borderWidth: 1,
                borderDash: [4, 4], // Dashed line
                label: {
                    content: 'Initial',
                    enabled: true,
                    position: 'start',
                    color: options.annotationColor || '#6c757d' // Gray label
                }
            },
            maxPoint: {
                type: 'point', // Mark highest balance
                xValue: labels[data.indexOf(Math.max(...data))],
                yValue: Math.max(...data),
                backgroundColor: options.dotColor || '#28a745', // Green for max
                radius: 5,
                label: {
                    content: `📈 Max: $${Math.max(...data)}`,
                    enabled: true,
                    position: 'top',
                    color: options.dotColor || '#28a745'
                }
            },
            minPoint: {
                type: 'point', // Mark lowest balance
                xValue: labels[data.indexOf(Math.min(...data))],
                yValue: Math.min(...data),
                backgroundColor: options.dotColor || '#dc3545', // Red for min
                radius: 5,
                label: {
                    content: `📉 Min: $${Math.min(...data)}`,
                    enabled: true,
                    position: 'bottom',
                    color: options.dotColor || '#dc3545'
                }
            },
            target: {
                type: 'line', // Horizontal line at target balance (+$1000)
                yMin: initialBalance + 1000,
                yMax: initialBalance + 1000,
                borderColor: options.annotationColor || '#00c851', // Green for target
                borderWidth: 1,
                borderDash: [5, 5], // Dashed line
                label: {
                    content: 'Target +$1000',
                    enabled: true,
                    position: 'start',
                    color: options.annotationColor || '#00c851'
                }
            }
        }),

        /**
         * Customizes tooltip content for the balance chart.
         * Purpose: Provides detailed information (balance, daily P&L, percentage change) on hover.
         */
        tooltipCallbacks: ({ labels, data, dailyPnLMap, initialBalance }) => ({
            label: function (ctx) {
                const date = labels[ctx.dataIndex];
                const pnl = dailyPnLMap[date] ?? 0;
                const pctChange = ((data[ctx.dataIndex] - initialBalance) / initialBalance * 100).toFixed(2);
                return [
                    `Balance: $${ctx.formattedValue}`,
                    `PnL: $${pnl.toFixed(2)}`,
                    `Change: ${pctChange}%`
                ];
            }
        }),

        /**
         * Constructs Chart.js datasets for the balance chart.
         * Purpose: Defines the visual style (gradient fill, line color, points) for the equity curve.
         */
        getDatasets: ({ canvas, data, options }) => {
            const ctx = canvas.getContext('2d');
            const gradient = createGradient(
                ctx,
                canvas,
                options.fillStartColor || 'rgba(68, 102, 255, 0.3)', // Blue gradient start
                options.fillEndColor || 'rgba(68, 102, 255, 0.05)'  // Fades to transparent
            );

            return [{
                label: 'Equity',
                data,
                backgroundColor: gradient, // Gradient fill under the line
                borderColor: options.lineColor || '#4466ff', // Blue line
                fill: true,
                tension: 0.35, // Smooth curve
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 5,
                pointBackgroundColor: options.dotColor || '#4466ff', // Blue points
                pointBorderColor: '#fff', // White point border
                segment: { borderColor: options.lineColor || '#4466ff' }
            }];
        }
    },

    /**
     * DRAWDOWN CHART
     * Shows the percentage drawdown from the peak balance over time.
     * Purpose: Helps traders understand the extent of losses relative to peak equity.
     */
    drawdown: {
        name: 'Drawdown',
        type: 'line',
        chartType: 'line',
        legendText: 'Drawdown Line Chart',
        yAxisBeginAtZero: false, // Y-axis adjusts to data range
        yAxisTicks: {
            // Formats Y-axis ticks as percentages
            callback: value => `${value}%`
        },

        /**
         * Processes trade data to calculate drawdown percentages.
         * Purpose: Computes the percentage drop from the highest balance to show risk exposure.
         */
        processData: ({ dailyPnLMap, initialBalance }) => {
            const tradeDates = Object.keys(dailyPnLMap).sort();
            let runningBalance = initialBalance;
            const balances = [];

            // Calculate running balances
            for (const date of tradeDates) {
                runningBalance += dailyPnLMap[date];
                balances.push(parseFloat(runningBalance.toFixed(2)));
            }

            // Add initial balance before first trade
            const firstTradeDate = tradeDates[0];
            const beforeFirstDate = new Date(firstTradeDate);
            beforeFirstDate.setDate(beforeFirstDate.getDate() - 1);
            const startLabel = beforeFirstDate.toISOString().split('T')[0];
            tradeDates.unshift(startLabel);
            balances.unshift(initialBalance);

            // Calculate drawdowns as percentage from peak
            let peak = initialBalance;
            const drawdowns = balances.map(balance => {
                if (balance > peak) peak = balance;
                const dd = ((balance - peak) / peak) * 100;
                return parseFloat(dd.toFixed(2));
            });

            return {
                labels: tradeDates,
                data: drawdowns,
                additionalData: { balances } // Store balances for tooltip
            };
        },

        /**
         * Defines annotations for the drawdown chart (e.g., minimum drawdown point).
         * Purpose: Highlights the maximum drawdown for risk analysis.
         */
        getAnnotations: ({ labels, data, options }) => ({
            minPoint: {
                type: 'point',
                xValue: labels[data.indexOf(Math.min(...data))],
                yValue: Math.min(...data),
                backgroundColor: options.dotColor || '#dc3545', // Red for min drawdown
                radius: 5,
                label: {
                    content: `Min: ${Math.min(...data)}%`,
                    enabled: true,
                    position: 'bottom',
                    color: options.dotColor || '#dc3545'
                }
            }
        }),

        /**
         * Customizes tooltip content for the drawdown chart.
         * Purpose: Shows drawdown percentage and corresponding balance on hover.
         */
        tooltipCallbacks: ({ data, additionalData }) => ({
            label: function (ctx) {
                const percent = data[ctx.dataIndex];
                const balance = additionalData.balances[ctx.dataIndex];
                return [
                    `Drawdown: ${percent.toFixed(2)}%`,
                    `Balance: $${balance.toFixed(2)}`
                ];
            }
        }),

        /**
         * Constructs Chart.js datasets for the drawdown chart.
         * Purpose: Defines the visual style (red gradient for losses) for the drawdown curve.
         */
        getDatasets: ({ canvas, data, options }) => {
            const ctx = canvas.getContext('2d');
            const gradient = createGradient(
                ctx,
                canvas,
                options.fillStartColor || 'rgba(220, 53, 69, 0.3)', // Red gradient start
                options.fillEndColor || 'rgba(220, 53, 69, 0.05)'  // Fades to transparent
            );

            return [{
                label: 'Drawdown',
                data,
                backgroundColor: gradient,
                borderColor: options.lineColor || '#dc3545', // Red line
                fill: 'origin',
                tension: 0.35,
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 5,
                pointBackgroundColor: options.dotColor || '#dc3545', // Red points
                pointBorderColor: '#fff',
                segment: {
                    borderColor: options.lineColor || '#dc3545',
                    pointBackgroundColor: options.dotColor || '#dc3545'
                }
            }];
        }
    },

    /**
     * DAILY NET P&L CHART
     * Displays daily profit/loss (net after commissions and swaps) as a bar chart.
     * Purpose: Shows daily performance to identify profitable or loss-making days.
     */
    dailyNetPnL: {
        name: 'Daily Net P&L',
        type: 'bar',
        chartType: 'bar',
        legendText: 'Daily Net P&L Bar Chart',
        yAxisBeginAtZero: true, // Y-axis starts at zero for clarity
        yAxisTicks: {
            // Formats Y-axis ticks as dollar amounts
            callback: value => `$${value}`
        },

        /**
         * Processes trade data to compute daily net P&L.
         * Purpose: Aggregates trades by date to show daily net profit or loss.
         */
        processData: ({ trades }) => {
            // Group trades by date and compute net P&L
            const dailyMap = {};
            trades.forEach(t => {
                if (!dailyMap[t.date]) dailyMap[t.date] = 0;
                dailyMap[t.date] += (t.profitLoss || 0) + (t.commission || 0) + (t.swap || 0);
            });

            const sortedEntries = Object.entries(dailyMap)
                .sort((a, b) => new Date(a[0]) - new Date(b[0]));

            return {
                labels: sortedEntries.map(entry => entry[0]), // Dates
                data: sortedEntries.map(entry => parseFloat(entry[1].toFixed(2))) // Net P&L
            };
        },

        /**
         * Returns empty annotations (none needed for bar chart).
         * Purpose: Simplifies chart by omitting annotations.
         */
        getAnnotations: () => ({}),

        /**
         * Customizes tooltip content for the daily net P&L chart.
         * Purpose: Displays the net P&L value for the hovered bar.
         */
        tooltipCallbacks: () => ({
            label: ctx => `PnL: $${ctx.raw}`
        }),

        /**
         * Constructs Chart.js datasets for the daily net P&L chart.
         * Purpose: Styles bars green for profits and red for losses.
         */
        getDatasets: ({ data, options }) => [{
            label: 'Daily Net P&L',
            backgroundColor: Array.isArray(data)
                ? data.map(value => value >= 0
                    ? options.dotColor || '#28a745' // Green for profits
                    : options.dotColor || '#dc3545') // Red for losses
                : options.dotColor || '#28a745',
            borderRadius: 2,
            barThickness: 6,
            borderSkipped: false,
            data
        }]
    },

    /**
     * NET CUMULATIVE P&L CHART
     * Shows the cumulative net profit/loss over time.
     * Purpose: Tracks overall profitability across all trades.
     */
    netCumulative: {
        name: 'Net Cumulative',
        type: 'line',
        chartType: 'line',
        legendText: 'Net Cumulative P&L Line Chart',
        yAxisBeginAtZero: true,
        yAxisTicks: {
            // Formats Y-axis ticks as dollar amounts
            callback: value => `$${value}`
        },

        /**
         * Processes trade data to compute cumulative net P&L.
         * Purpose: Aggregates trade P&L (including commissions and swaps) over time.
         */
        processData: ({ trades = [], options }) => {
            let cumulative = 0;
            const labels = [];
            const data = [];
            const cumulativeTrades = [];

            // Sort trades by date
            const sortedTrades = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));

            for (const t of sortedTrades) {
                const netPL = (t.profitLoss || 0) + (t.commission || 0) + (t.swap || 0);
                cumulative += netPL;

                labels.push(t.date);
                data.push(parseFloat(cumulative.toFixed(2)));

                cumulativeTrades.push({
                    date: t.date,
                    pair: t.pair,
                    profitLoss: t.profitLoss,
                    commission: t.commission,
                    swap: t.swap,
                    netPL: parseFloat(netPL.toFixed(2)),
                    cumulative: parseFloat(cumulative.toFixed(2))
                });
            }

            const initial = 0;
            const crossIndex = data.findIndex(v => v !== initial);

            return {
                labels,
                data,
                additionalData: { initial, crossIndex, cumulativeTrades }
            };
        },

        /**
         * Defines annotations for the net cumulative chart (initial balance line).
         * Purpose: Marks the zero line for reference.
         */
        getAnnotations: ({ additionalData, options }) => ({
            initial: {
                type: 'line',
                yMin: additionalData.initial,
                yMax: additionalData.initial,
                borderColor: options.annotationColor || '#adb5bd',
                borderWidth: 1,
                borderDash: [4, 4],
                label: {
                    content: `Initial ($${additionalData.initial})`,
                    enabled: true,
                    position: 'start',
                    color: options.annotationColor || '#6c757d'
                }
            }
        }),

        /**
         * Customizes tooltip content for the net cumulative chart.
         * Purpose: Shows detailed trade information (date, pair, P&L, cumulative) on hover.
         */
        tooltipCallbacks: ({ trades }) => ({
            label: function (ctx) {
                const index = ctx.dataIndex;
                if (!trades || index < 0 || index >= trades.length) {
                    return `Cumulative P&L: $${ctx.raw}`;
                }
                const trade = trades[index];
                return [
                    `Date: ${trade.date}`,
                    `Pair: ${trade.pair || 'N/A'}`,
                    `P&L: $${trade.profitLoss?.toFixed(2) || 0}`,
                    `Cumulative: $${ctx.raw}`
                ];
            }
        }),

        /**
         * Constructs Chart.js datasets for the net cumulative chart.
         * Purpose: Uses dynamic colors (green/red) based on profitability.
         */
        getDatasets: ({ canvas, data, additionalData, options }) => {
            const ctx = canvas.getContext('2d');
            const { initial, crossIndex } = additionalData;

            const gradient = createGradient(
                ctx,
                canvas,
                options.fillStartColor || 'rgba(108, 117, 125, 0.3)', // Gray gradient
                options.fillEndColor || 'rgba(108, 117, 125, 0.05)'
            );

            const pointColors = data.map((v, i) => {
                if (i < crossIndex) return options.dotColor || '#6c757d';
                return v > initial ? options.dotColor || '#28a745' : options.dotColor || '#dc3545';
            });

            return [{
                label: 'Net Cumulative P&L',
                data,
                fill: true,
                backgroundColor: gradient,
                tension: 0.35,
                borderWidth: 2,
                borderColor: options.lineColor || '#6c757d',
                pointRadius: 4,
                pointHoverRadius: 5,
                pointBorderColor: '#fff',
                pointBackgroundColor: pointColors,
                order: 1,
                segment: {
                    borderColor: ctx => {
                        const i = ctx.p1DataIndex;
                        const y = ctx.p1.parsed.y;
                        return i < crossIndex
                            ? options.lineColor || '#6c757d'
                            : (y > initial ? options.lineColor || '#28a745' : options.lineColor || '#dc3545');
                    },
                    pointBackgroundColor: ctx => {
                        const i = ctx.p1DataIndex;
                        const y = ctx.p1.parsed.y;
                        return i < crossIndex
                            ? options.dotColor || '#6c757d'
                            : (y > initial ? options.dotColor || '#28a745' : options.dotColor || '#dc3545');
                    }
                }
            }];
        }
    },

    /**
     * CUMULATIVE DAILY NET P&L CHART
     * Shows cumulative daily net P&L with green/red segments for profit/loss.
     * Purpose: Visualizes daily cumulative performance with clear profit/loss distinction.
     */
    cumulativeDailyNet: {
        name: 'Cumulative Daily Net',
        type: 'line',
        chartType: 'line',
        legendText: 'Cumulative Daily Net P&L Line Chart',
        yAxisBeginAtZero: true,
        yAxisTicks: {
            // Formats Y-axis ticks as dollar amounts
            callback: value => `$${value}`
        },

        /**
         * Processes daily P&L data to compute cumulative values.
         * Purpose: Aggregates daily P&L and separates data into green/red fills for visualization.
         */
        processData: ({ dailyPnLMap }) => {
            const sortedEntries = Object.entries(dailyPnLMap)
                .sort((a, b) => new Date(a[0]) - new Date(b[0]));
            let cumulative = 0;
            const labels = [];
            const cumulativeData = [];

            // Add initial point before first trade
            if (sortedEntries.length > 0) {
                const firstDate = new Date(sortedEntries[0][0]);
                firstDate.setDate(firstDate.getDate() - 1);
                const preDate = firstDate.toISOString().split('T')[0];
                labels.push(preDate);
                cumulativeData.push(0);
            }

            // Calculate cumulative P&L
            for (const [date, pnl] of sortedEntries) {
                cumulative += pnl;
                labels.push(date);
                cumulativeData.push(parseFloat(cumulative.toFixed(2)));
            }

            const threshold = 0;
            let crossIndex = cumulativeData.findIndex(v => v !== 0);
            if (crossIndex === -1) crossIndex = 0;

            // Separate data for green (profit) and red (loss) fills
            const greenFill = cumulativeData.map((v, i) => {
                const prev = i > 0 ? cumulativeData[i - 1] : v;
                return (v >= threshold || prev >= threshold) ? v : null;
            });

            const redFill = cumulativeData.map((v, i) => {
                const prev = i > 0 ? cumulativeData[i - 1] : v;
                return (v < threshold || prev < threshold) ? v : null;
            });

            return {
                labels,
                data: cumulativeData,
                additionalData: { threshold, crossIndex, greenFill, redFill }
            };
        },

        /**
         * Defines annotations for the cumulative daily net chart (initial zero line).
         * Purpose: Marks the zero line for reference.
         */
        getAnnotations: ({ options }) => ({
            initial: {
                type: 'line',
                yMin: 0,
                yMax: 0,
                borderColor: options.annotationColor || '#adb5bd',
                borderWidth: 1,
                borderDash: [4, 4],
                label: {
                    content: `Initial ($0)`,
                    enabled: true,
                    position: 'start',
                    color: options.annotationColor || '#6c757d'
                }
            }
        }),

        /**
         * Customizes tooltip content for the cumulative daily net chart.
         * Purpose: Shows the cumulative daily net P&L on hover.
         */
        tooltipCallbacks: () => ({
            label: ctx => `Cumulative Daily Net: $${ctx.raw}`
        }),

        /**
         * Constructs Chart.js datasets for the cumulative daily net chart.
         * Purpose: Uses separate green/red fills for profit/loss segments and a main line.
         */
        getDatasets: ({ canvas, data, additionalData, options }) => {
            const ctx = canvas.getContext('2d');
            const { threshold, crossIndex, greenFill, redFill } = additionalData;

            const redGradient = createGradient(
                ctx, canvas,
                options.fillStartColor || 'rgba(220, 53, 69, 0.3)', // Red gradient
                options.fillEndColor || 'rgba(220, 53, 69, 0.05)'
            );
            const greenGradient = createGradient(
                ctx, canvas,
                options.fillStartColor || 'rgba(40, 167, 69, 0.3)', // Green gradient
                options.fillEndColor || 'rgba(40, 167, 69, 0.05)'
            );

            const pointColors = data.map((v, i) => {
                if (i < crossIndex) return options.dotColor || '#6c757d';
                return v >= threshold ? options.dotColor || '#28a745' : options.dotColor || '#dc3545';
            });

            return [
                {
                    label: 'Red Fill',
                    data: redFill,
                    backgroundColor: redGradient,
                    borderColor: 'transparent',
                    fill: 'origin',
                    pointRadius: 0,
                    tension: 0.35,
                    order: 0
                },
                {
                    label: 'Green Fill',
                    data: greenFill,
                    backgroundColor: greenGradient,
                    borderColor: 'transparent',
                    fill: 'origin',
                    pointRadius: 0,
                    tension: 0.35,
                    order: 0
                },
                {
                    label: 'Cumulative Daily Net',
                    data,
                    fill: false,
                    tension: 0.35,
                    borderWidth: 2,
                    backgroundColor: 'transparent',
                    borderColor: options.lineColor || '#6c757d',
                    pointRadius: 4,
                    pointHoverRadius: 5,
                    pointBorderColor: '#fff',
                    pointBackgroundColor: pointColors,
                    order: 1,
                    segment: {
                        borderColor: ctx => {
                            const i = ctx.p1DataIndex;
                            const y = ctx.p1.parsed.y;
                            return i < crossIndex
                                ? options.lineColor || '#6c757d'
                                : (y >= threshold ? options.lineColor || '#28a745' : options.lineColor || '#dc3545');
                        },
                        pointBackgroundColor: ctx => {
                            const i = ctx.p1DataIndex;
                            const y = ctx.p1.parsed.y;
                            return i < crossIndex
                                ? options.dotColor || '#6c757d'
                                : (y >= threshold ? options.dotColor || '#28a745' : options.dotColor || '#dc3545');
                        }
                    }
                }
            ];
        }
    }
};

/**
 * renderChartWrapper
 * ------------------
 * Main function to render charts by preparing data and configuring Chart.js.
 * Purpose: Orchestrates data filtering, processing, and chart rendering with error handling.
 *
 * @param {Object} params - Parameters including chart ID, container, trades, accounts, etc.
 */
export function renderChartWrapper({
    id,
    container,
    trades,
    strategies,
    activeAccountId,
    accounts,
    settings,
    options = {},
    chartConfig
}) {
    try {
        // Validate container element
        if (!container || !(container instanceof HTMLElement)) {
            throw new Error('Invalid or undefined container element');
        }

        // Check if trades data is available
        if (!Array.isArray(trades)) {
            console.warn(`Trades data is not available for chart ${id}, rendering placeholder`);
            container.innerHTML = '<div>No trades available.</div>';
            return;
        }

        // Validate accounts data
        if (!Array.isArray(accounts)) throw new Error('Accounts not loaded');

        console.log(`Rendering chart ${id} (${chartConfig.name}) with ${trades.length} trades`);

        // Find the active account to get initial balance
        const account = accounts.find(a => a.id === activeAccountId);
        const initialBalance = account?.initialBalance ?? 0;

        // Filter trades for the active account and sort by date
        const filteredTrades = trades
            .filter(t => t.accountId === activeAccountId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Handle case with no trades for the account
        if (filteredTrades.length === 0) {
            console.log(`No trades for chart ${id}, rendering placeholder`);
            container.innerHTML = '<div>No trades for this account.</div>';
            return;
        }

        // Create a daily P&L map
        const dailyPnLMap = {};
        for (const trade of filteredTrades) {
            const date = new Date(trade.date).toISOString().split('T')[0];
            dailyPnLMap[date] = (dailyPnLMap[date] ?? 0) + (trade.profitLoss ?? 0);
        }

        // Process chart data using the chartConfig's processData function
        const { labels, data, additionalData, datasets } = chartConfig.processData({
            dailyPnLMap,
            initialBalance,
            filteredTrades,
            trades,
            options
        });

        console.log(`Chart ${id} data: ${labels.length} labels, ${data?.length || datasets?.length || 0} data points`);

        // Configure grid and label display options
        const showXGrid = options?.xGrid === true;
        const showYGrid = options?.yGrid === true;
        const showFullDate = options.showFullDate ?? true;

        // Adjust label frequency for readability
        const labelCount = labels.length;
        const labelStep = labelCount > 20 ? Math.ceil(labelCount / 10) : 1;

        // Setup chart container and canvas
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-container';
        wrapper.style.height = '400px';
        wrapper.style.minHeight = '400px';
        wrapper.style.width = '100%';
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);

        // Define background color plugin for consistent chart background
        const backgroundPlugin = {
            id: 'backgroundColor',
            beforeDraw: (chart) => {
                const { ctx, width, height } = chart;
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.restore();
            }
        };

        // Render the chart using Chart.js
        renderChart({
            id,
            container,
            type: chartConfig.type,
            labels,
            data,
            datasets: chartConfig.getDatasets
                ? chartConfig.getDatasets({ canvas, data, options, additionalData })
                : datasets || [],
            chartOptions: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        display: true,
                        grid: { display: showXGrid },
                        ticks: {
                            autoSkip: false,
                            maxRotation: 60,
                            minRotation: 30,
                            font: { size: 8 },
                            callback: function (_, index) {
                                const label = labels[index];
                                return index % labelStep === 0
                                    ? (showFullDate ? label : label.slice(5))
                                    : '';
                            }
                        }
                    },
                    y: {
                        beginAtZero: chartConfig.yAxisBeginAtZero ?? false,
                        grid: { display: showYGrid },
                        ticks: chartConfig.yAxisTicks || {}
                    }
                },
                plugins: {
                    annotation: chartConfig.getAnnotations?.({
                        labels,
                        data,
                        initialBalance,
                        additionalData,
                        options
                    }) || {},
                    tooltip: {
                        backgroundColor: '#fff',
                        titleColor: '#000',
                        bodyColor: '#333',
                        borderColor: '#ccc',
                        borderWidth: 1,
                        padding: 8,
                        cornerRadius: 4,
                        displayColors: false,
                        titleFont: { size: 13 },
                        bodyFont: { size: 12 },
                        callbacks: chartConfig.tooltipCallbacks({
                            labels,
                            data,
                            dailyPnLMap,
                            initialBalance,
                            additionalData,
                            trades,
                            options
                        })
                    },
                    zoom: {
                        pan: { enabled: true, mode: 'x', modifierKey: 'ctrl' },
                        zoom: {
                            wheel: { enabled: true },
                            drag: {
                                enabled: true,
                                backgroundColor: 'rgba(151, 151, 151, 0.15)',
                                borderColor: '#007bff',
                                borderWidth: 0
                            },
                            pinch: { enabled: true },
                            mode: 'x'
                        },
                        limits: { x: { minRange: 5 } }
                    },
                    legend: { display: false },
                    ...(chartConfig.chartPlugins || {})
                },
                ...(chartConfig.chartOptions || {})
            },
            plugins: [backgroundPlugin, ...(chartConfig.extraPlugins || [])],
            afterRenderCallback: chart => {
                // Add legend text below chart if specified
                if (chartConfig.legendText) {
                    const legend = document.createElement('div');
                    legend.innerHTML =
                        `<div style="font-size: 11px; text-align: center; margin-top: 6px; color: #6c757d;">
                            ${chartConfig.legendText}
                        </div>`;
                    container.appendChild(legend);
                }
                chartConfig.afterRenderCallback?.(chart);
                console.log(`Chart ${id} rendered successfully`);
            },
            chartInstances
        });
    } catch (err) {
        // Handle errors by showing a toast and rendering an error message
        showToast(`Error rendering ${chartConfig.name} widget.`, 'error');
        console.error(`Error rendering chart ${id} (${chartConfig.name}):`, err);
        container.innerHTML = `<div>Error rendering ${chartConfig.name}</div>`;
    }
}

/**
 * createChartRenderer
 * -------------------
 * Factory function that creates a renderer for a specific chart type.
 * Purpose: Simplifies chart rendering by providing a reusable function for a given chart key.
 *
 * @param {string} chartKey - The key of the chart configuration (e.g., 'balance').
 * @returns {Function} - A function that renders the specified chart type.
 */
export function createChartRenderer(chartKey) {
    return function (id, container, trades, strategies, activeAccountId, accounts, settings) {
        renderChartWrapper({
            id,
            container,
            trades,
            strategies,
            activeAccountId,
            accounts,
            options: {
                ...settings,
                xGrid: settings.xGrid === true,
                yGrid: settings.yGrid === true
            },
            chartConfig: chartConfigs[chartKey]
        });
    };
}