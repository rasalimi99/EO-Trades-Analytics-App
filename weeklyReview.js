import { saveToStore, loadFromStore, saveImage, deleteFromStore } from './data.js';
import { 
    showToast, 
    calculateWinRate, 
    calculateTradeCounts, 
    compressImageMainThread,
    validateDateRange,
    getDatesInRange,
    getPreviousWeekRange,
    filterTradesForRange,
    calculateEquityCurve,
    calculateTradeTagAnalysis

}
 from './utils.js';

 function formatDateRange(start, end) {
    const format = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${format(start)} → ${format(end)}`;
}


// Update renderWeeklyStats to pass accountId to calculateEquityCurve
function renderWeeklyStats(trades, startDate, endDate, activeAccountId, statsDiv) {
    const tradesForRange = filterTradesForRange(trades, startDate, endDate, activeAccountId);
    console.log('renderWeeklyStats:', { startDate, endDate, activeAccountId, tradesForRange: tradesForRange.length });

    if (!statsDiv) {
        showToast('Error: Stats container not found.', 'error');
        console.error('Missing stats container');
        return;
    }

    const tradeCount = tradesForRange.length;
    const tradeCounts = calculateTradeCounts(tradesForRange, activeAccountId);
    const profitLoss = tradesForRange.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const winRate = calculateWinRate(tradesForRange);
    const bestTrade = tradesForRange.reduce((max, t) => (!max || t.profitLoss > max.profitLoss ? t : max), null);
    const worstTrade = tradesForRange.reduce((min, t) => (!min || t.profitLoss < min.profitLoss ? t : min), null);

    // Calculate previous week's stats for comparison
    const { prevStart, prevEnd } = getPreviousWeekRange(endDate);
    const prevTrades = filterTradesForRange(trades, prevStart, prevEnd, activeAccountId);
    console.log(`Previous week trades (${prevStart} to ${prevEnd}):`, prevTrades);
    if (prevTrades.length === 0) {
        console.log(`No trades found for previous week (${prevStart} to ${prevEnd}). Add trades in this range to see previous week data.`);
    }

    // Check for invalid trade data in previous week
    let invalidTradeWarning = '';
    prevTrades.forEach(trade => {
        if (typeof trade.profitLoss !== 'number' || trade.profitLoss === 0) {
            invalidTradeWarning += `<p class="text-warning">Warning: Trade on ${trade.date} has invalid or zero profit/loss (${trade.profitLoss}). Update the trade to see accurate stats.</p>`;
        }
        if (trade.outcome !== 'Win' && trade.outcome !== 'Loss') {
            invalidTradeWarning += `<p class="text-warning">Warning: Trade on ${trade.date} has invalid outcome (${trade.outcome}). Set to "Win" or "Loss" to calculate win rate.</p>`;
        }
    });

    const prevTradeCount = prevTrades.length;
    const prevProfitLoss = prevTrades.reduce((sum, t) => {
        const pl = t.profitLoss || 0;
        console.log(`Previous week trade: ${t.date}, profitLoss: ${pl}, outcome: ${t.outcome}`);
        return sum + pl;
    }, 0);
    const prevWinRate = calculateWinRate(prevTrades);

    statsDiv.innerHTML = `
        <div class="wr-stats-grid">
            <div class="wr-stat-widget">
                <i class="bi bi-list-check me-2"></i>
                <span class="wr-stat-label">Trades Taken</span>
                <span class="wr-stat-value">${tradeCount.toFixed(2)}</span>
                <small class="wr-stat-compare">Prev : ${prevTradeCount.toFixed(2)}</small>
            </div>
            <div class="wr-stat-widget">
                <i class="bi bi-trophy me-2"></i>
                <span class="wr-stat-label">Total Wins</span>
                <span class="wr-stat-value">${tradeCounts.wins.toFixed(2)}</span>
            </div>
            <div class="wr-stat-widget">
                <i class="bi bi-x-circle me-2"></i>
                <span class="wr-stat-label">Total Losses</span>
                <span class="wr-stat-value">${tradeCounts.losses.toFixed(2)}</span>
            </div>
            <div class="wr-stat-widget">
                <i class="bi bi-currency-dollar me-2"></i>
                <span class="wr-stat-label">Net P&L</span>
                <span class="wr-stat-value ${profitLoss >= 0 ? 'text-success' : 'text-danger'}">$${profitLoss.toFixed(2)}</span>
                <small class="wr-stat-compare">Prev : $${prevProfitLoss.toFixed(2)}</small>
            </div>
            <div class="wr-stat-widget">
                <i class="bi bi-graph-up me-2"></i>
                <span class="wr-stat-label">Win Rate</span>
                <span class="wr-stat-value">${winRate.toFixed(2)}%</span>
                <small class="wr-stat-compare">Prev : ${prevWinRate.toFixed(2)}%</small>
            </div>
            <div class="wr-stat-widget">
                <i class="bi bi-arrow-up-circle me-2"></i>
                <span class="wr-stat-label">Best Trade</span>
                <span class="wr-stat-value">${bestTrade ? `$${bestTrade.profitLoss.toFixed(2)}` : '-'}</span>
            </div>
            <div class="wr-stat-widget">
                <i class="bi bi-arrow-down-circle me-2"></i>
                <span class="wr-stat-label">Worst Trade</span>
                <span class="wr-stat-value">${worstTrade ? `$${worstTrade.profitLoss.toFixed(2)}` : '-'}</span>
            </div>
        </div>
        ${invalidTradeWarning}
        <div class="wr-export-buttons mt-3 text-end">
            <button class="btn btn-outline-primary wr-export-pdf-btn me-2"><i class="bi bi-file-earmark-pdf me-1"></i>Export PDF</button>
            <button class="btn btn-outline-primary wr-export-csv-btn"><i class="bi bi-filetype-csv me-1"></i>Export CSV</button>
        </div>
    `;

    console.log('Stats rendered:', {
        tradeCount,
        wins: tradeCounts.wins,
        losses: tradeCounts.losses,
        profitLoss,
        winRate,
        bestTrade: bestTrade?.profitLoss,
        worstTrade: worstTrade?.profitLoss,
        prevTradeCount,
        prevProfitLoss,
        prevWinRate
    });

    // Add event listeners for export buttons
    const exportPdfBtn = statsDiv.querySelector('.wr-export-pdf-btn');
    const exportCsvBtn = statsDiv.querySelector('.wr-export-csv-btn');

    exportPdfBtn.addEventListener('click', () => {
        exportToPdf(startDate, endDate);
    });

    exportCsvBtn.addEventListener('click', () => {
        exportToCsv(tradesForRange, startDate, endDate);
    });

    return tradesForRange; // Return trades for use in trades table and equity curve
}

// Update exportToPdf to fix jspdf-autotable integration
// Update exportToPdf to fix dark background in tag analysis section
async function exportToPdf(startDate, endDate) {
    try {
        // Load jsPDF if not already loaded
        if (!window.jsPDF) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/1.5.3/jspdf.min.js';
            script.async = false;
            document.head.appendChild(script);

            await new Promise(resolve => {
                script.onload = () => {
                    console.log('jsPDF loaded successfully');
                    resolve();
                };
                script.onerror = () => {
                    showToast('Failed to load jsPDF library.', 'error');
                    resolve();
                };
            });
        }

        if (!window.jsPDF) {
            showToast('jsPDF library not available.', 'error');
            return;
        }

        const doc = new window.jsPDF({
            orientation: 'portrait',
            unit: 'in',
            format: 'letter'
        });

        // Set up basic styling
        const margin = 0.5;
        let yPosition = margin;
        const pageWidth = doc.internal.pageSize.getWidth() - 2 * margin;
        const pageHeight = doc.internal.pageSize.getHeight() - 2 * margin;

        // Title
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255); // Reset fill color to white
        doc.text(`Weekly Review: ${formatDateRange(startDate, endDate)}`, margin, yPosition);
        yPosition += 0.3;

        // Stats Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.text('Trade Statistics', margin, yPosition);
        yPosition += 0.2;

        const statsDiv = document.getElementById('weekly-stats');
        const statsWidgets = statsDiv.querySelectorAll('.wr-stat-widget');
        const statsData = [];
        statsWidgets.forEach(widget => {
            const label = widget.querySelector('.wr-stat-label').textContent;
            const value = widget.querySelector('.wr-stat-value').textContent;
            const compare = widget.querySelector('.wr-stat-compare')?.textContent || '';
            statsData.push([label, value, compare]);
        });

        doc.setFontSize(10);
        statsData.forEach(([label, value, compare], index) => {
            if (yPosition + 0.3 > pageHeight) {
                doc.addPage();
                yPosition = margin;
            }
            doc.setTextColor(0, 0, 0);
            doc.text(`${label}: ${value}`, margin, yPosition);
            if (compare) {
                doc.setFontSize(8);
                doc.text(compare, margin + 2, yPosition);
                doc.setFontSize(10);
            }
            yPosition += compare ? 0.3 : 0.2;
        });
        yPosition += 0.2;

        // Equity Curve Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.text('Equity Curve', margin, yPosition);
        yPosition += 0.2;

        let chartImageSrc = '';
        const equityCurveCanvas = document.getElementById('equity-curve-chart');
        if (equityCurveCanvas) {
            const chartInstance = Chart.getChart(equityCurveCanvas);
            if (chartInstance) {
                chartImageSrc = chartInstance.toBase64Image();
                console.log('Chart base64 image extracted:', chartImageSrc.substring(0, 50) + '...');
            }
        }

        if (chartImageSrc) {
            if (yPosition + 3 > pageHeight) {
                doc.addPage();
                yPosition = margin;
            }
            doc.addImage(chartImageSrc, 'PNG', margin, yPosition, pageWidth, 3);
            yPosition += 3.2;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text('Equity curve chart not available.', margin, yPosition);
            yPosition += 0.2;
        }

        // Quick Notes Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.text('Quick Notes', margin, yPosition);
        yPosition += 0.2;
        doc.setFontSize(12);
        const quickNotes = document.getElementById('quick-notes')?.value || 'No quick notes';
        const quickNotesLines = doc.splitTextToSize(quickNotes, pageWidth);
        quickNotesLines.forEach(line => {
            if (yPosition + 0.2 > pageHeight) {
                doc.addPage();
                yPosition = margin;
            }
            doc.setTextColor(0, 0, 0);
            doc.text(line, margin, yPosition);
            yPosition += 0.2;
        });
        yPosition += 0.2;

        // What I Learned Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.text('What I Learned', margin, yPosition);
        yPosition += 0.2;
        doc.setFontSize(12);
        let whatLearnedText = 'No content provided.';
        if (window.learnedEditorInstance && typeof window.learnedEditorInstance.getData === 'function') {
            whatLearnedText = window.learnedEditorInstance.getData().replace(/<[^>]+>/g, '') || 'No content provided.';
        } else {
            const learnedEditorElement = document.getElementById('learned-content-editor');
            if (learnedEditorElement) {
                whatLearnedText = learnedEditorElement.innerHTML.replace(/<[^>]+>/g, '') || 'No content provided.';
            }
        }
        const whatLearnedLines = doc.splitTextToSize(whatLearnedText, pageWidth);
        whatLearnedLines.forEach(line => {
            if (yPosition + 0.2 > pageHeight) {
                doc.addPage();
                yPosition = margin;
            }
            doc.setTextColor(0, 0, 0);
            doc.text(line, margin, yPosition);
            yPosition += 0.2;
        });
        yPosition += 0.2;

        // Mistakes Made Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.text('Mistakes Made', margin, yPosition);
        yPosition += 0.2;
        doc.setFontSize(12);
        let mistakesMadeText = 'No content provided.';
        if (window.mistakesEditorInstance && typeof window.mistakesEditorInstance.getData === 'function') {
            mistakesMadeText = window.mistakesEditorInstance.getData().replace(/<[^>]+>/g, '') || 'No content provided.';
        } else {
            const mistakesEditorElement = document.getElementById('mistakes-content-editor');
            if (mistakesEditorElement) {
                mistakesMadeText = mistakesEditorElement.innerHTML.replace(/<[^>]+>/g, '') || 'No content provided.';
            }
        }
        const mistakesMadeLines = doc.splitTextToSize(mistakesMadeText, pageWidth);
        mistakesMadeLines.forEach(line => {
            if (yPosition + 0.2 > pageHeight) {
                doc.addPage();
                yPosition = margin;
            }
            doc.setTextColor(0, 0, 0);
            doc.text(line, margin, yPosition);
            yPosition += 0.2;
        });
        yPosition += 0.2;

        // Trades Table Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.text('Trades in Selected Range', margin, yPosition);
        yPosition += 0.2;

        const tradesTableElement = document.getElementById('range-trades')?.querySelector('table');
        if (tradesTableElement) {
            const tradesRows = tradesTableElement.querySelectorAll('tbody tr');
            const tradesData = Array.from(tradesRows).map(row => {
                const cells = row.querySelectorAll('td');
                return Array.from(cells).map(cell => cell.textContent);
            });

            console.log('Trades data extracted:', tradesData);

            // Define table structure
            const headers = ['Trade #', 'Date', 'Pair', 'Strategy', 'Risk', 'Outcome', 'Profit/Loss'];
            const columnWidths = [0.5, 0.8, 0.7, 1.0, 0.7, 0.7, 0.8]; // Adjust widths to fit page
            const totalTableWidth = columnWidths.reduce((a, b) => a + b, 0);
            const xStart = margin;
            const rowHeight = 0.2;
            const headerHeight = 0.3;

            // Render table header
            doc.setFontSize(10);
            doc.setFillColor(242, 242, 242); // Light gray background for header
            doc.rect(xStart, yPosition, totalTableWidth, headerHeight, 'F');
            let xPosition = xStart;
            headers.forEach((header, index) => {
                doc.setTextColor(0, 0, 0);
                doc.text(header, xPosition + 0.05, yPosition + 0.2);
                xPosition += columnWidths[index];
            });
            yPosition += headerHeight;

            // Draw header bottom border
            doc.setLineWidth(0.01);
            doc.line(xStart, yPosition, xStart + totalTableWidth, yPosition);

            // Reset fill color to white for the table body
            doc.setFillColor(255, 255, 255);

            // Render table rows
            tradesData.forEach((row, rowIndex) => {
                if (yPosition + rowHeight > pageHeight) {
                    doc.addPage();
                    yPosition = margin;

                    // Re-render header on new page
                    doc.setFillColor(242, 242, 242);
                    doc.rect(xStart, yPosition, totalTableWidth, headerHeight, 'F');
                    xPosition = xStart;
                    headers.forEach((header, index) => {
                        doc.setTextColor(0, 0, 0);
                        doc.text(header, xPosition + 0.05, yPosition + 0.2);
                        xPosition += columnWidths[index];
                    });
                    yPosition += headerHeight;
                    doc.line(xStart, yPosition, xStart + totalTableWidth, yPosition);
                    doc.setFillColor(255, 255, 255); // Reset fill color for body
                }

                xPosition = xStart;
                row.forEach((cell, colIndex) => {
                    // Set text color for Profit/Loss column
                    if (colIndex === 6) { // Profit/Loss column
                        const value = parseFloat(cell.replace('$', ''));
                        doc.setTextColor(value >= 0 ? 0 : 255, value >= 0 ? 128 : 0, 0); // Green or Red
                    } else {
                        doc.setTextColor(0, 0, 0); // Reset to black
                    }
                    doc.text(cell, xPosition + 0.05, yPosition + 0.15);
                    xPosition += columnWidths[colIndex];
                });
                yPosition += rowHeight;

                // Draw row bottom border
                doc.line(xStart, yPosition, xStart + totalTableWidth, yPosition);
            });

            // Draw vertical lines for columns
            xPosition = xStart;
            for (let i = 0; i <= headers.length; i++) {
                doc.line(xPosition, yPosition - (tradesData.length * rowHeight + headerHeight), xPosition, yPosition);
                if (i < headers.length) xPosition += columnWidths[i];
            }

            yPosition += 0.2;
        } else {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text('No trades found for this period.', margin, yPosition);
            yPosition += 0.2;
            console.warn('Trades table element not found.');
        }

        // Tag Analysis Section
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(255, 255, 255); // Reset fill color to white
        console.log('Fill color before tag analysis:', doc.getFillColor());
        doc.text('Trade Tag Analysis', margin, yPosition);
        yPosition += 0.2;

        const tagAnalysisDiv = document.getElementById('tag-analysis');
        const tagAnalysisTable = tagAnalysisDiv?.querySelector('table');
        if (tagAnalysisTable && tagAnalysisTable.querySelectorAll('tbody tr').length > 0) {
            const tagRows = tagAnalysisTable.querySelectorAll('tbody tr');
            const tagData = Array.from(tagRows).map(row => {
                const cells = row.querySelectorAll('td');
                return Array.from(cells).map(cell => cell.textContent);
            });

            console.log('Tag analysis data extracted:', tagData);

            // Define table structure
            const tagHeaders = ['Tag', 'Trades', 'Wins', 'Losses', 'Win Rate (%)', 'Total P&L ($)'];
            const tagColumnWidths = [1.0, 0.7, 0.7, 0.7, 1.0, 1.0];
            const tagTotalTableWidth = tagColumnWidths.reduce((a, b) => a + b, 0);
            const tagXStart = margin;
            const rowHeight = 0.2;
            const headerHeight = 0.3;

            // Render table header
            doc.setFontSize(10);
            doc.setFillColor(242, 242, 242); // Light gray background for header
            doc.rect(tagXStart, yPosition, tagTotalTableWidth, headerHeight, 'F');
            let tagXPosition = tagXStart;
            tagHeaders.forEach((header, index) => {
                doc.setTextColor(0, 0, 0); // Ensure black text for header
                doc.text(header, tagXPosition + 0.05, yPosition + 0.2);
                tagXPosition += tagColumnWidths[index];
            });
            yPosition += headerHeight;

            // Draw header bottom border
            doc.setLineWidth(0.01);
            doc.line(tagXStart, yPosition, tagXStart + tagTotalTableWidth, yPosition);

            // Reset fill color to white for the table body
            doc.setFillColor(255, 255, 255);

            // Render table rows
            tagData.forEach((row, rowIndex) => {
                if (yPosition + rowHeight > pageHeight) {
                    doc.addPage();
                    yPosition = margin;

                    // Re-render header on new page
                    doc.setFillColor(242, 242, 242);
                    doc.rect(tagXStart, yPosition, tagTotalTableWidth, headerHeight, 'F');
                    tagXPosition = tagXStart;
                    tagHeaders.forEach((header, index) => {
                        doc.setTextColor(0, 0, 0);
                        doc.text(header, tagXPosition + 0.05, yPosition + 0.2);
                        tagXPosition += tagColumnWidths[index];
                    });
                    yPosition += headerHeight;
                    doc.line(tagXStart, yPosition, tagXStart + tagTotalTableWidth, yPosition);
                    doc.setFillColor(255, 255, 255); // Reset fill color for body
                }

                tagXPosition = tagXStart;
                row.forEach((cell, colIndex) => {
                    // Set text color for Total P&L column
                    if (colIndex === 5) { // Total P&L column
                        const value = parseFloat(cell.replace('$', ''));
                        doc.setTextColor(value >= 0 ? 0 : 255, value >= 0 ? 128 : 0, 0); // Green or Red
                    } else {
                        doc.setTextColor(0, 0, 0); // Reset to black
                    }
                    doc.text(cell, tagXPosition + 0.05, yPosition + 0.15);
                    tagXPosition += tagColumnWidths[colIndex];
                });
                yPosition += rowHeight;

                // Draw row bottom border
                doc.line(tagXStart, yPosition, tagXStart + tagTotalTableWidth, yPosition);
            });

            // Draw vertical lines for columns
            tagXPosition = tagXStart;
            for (let i = 0; i <= tagHeaders.length; i++) {
                doc.line(tagXPosition, yPosition - (tagData.length * rowHeight + headerHeight), tagXPosition, yPosition);
                if (i < tagHeaders.length) tagXPosition += tagColumnWidths[i];
            }

            yPosition += 0.2;
        } else {
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0); // Reset text color to black
            doc.setFillColor(255, 255, 255); // Reset fill color to white
            console.log('Fill color after tag analysis:', doc.getFillColor());
            doc.text('No tagged trades found for this period.', margin, yPosition);
            yPosition += 0.2;
        }

        // Save the PDF
        doc.save(`Weekly_Review_${startDate}_to_${endDate}.pdf`);
        showToast('PDF exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting PDF:', error);
        showToast('Failed to export PDF.', 'error');
    }
}

// Update exportToCsv to fix functionality and ensure content inclusion
function exportToCsv(trades, startDate, endDate) {
    if (!trades || trades.length === 0) {
        showToast('No trades to export.', 'error');
        return;
    }

    const headers = ['Trade #', 'Date', 'Pair', 'Strategy', 'Risk', 'Outcome', 'Profit/Loss', 'Tags'];
    const csvRows = [headers.join(',')];

    trades.forEach((trade, index) => {
        const row = [
            index + 1,
            trade.date,
            trade.pair || '-',
            trade.strategy || '-',
            trade.risk ? `$${trade.risk.toFixed(2)}` : '-',
            trade.outcome || '-',
            trade.profitLoss ? `$${trade.profitLoss.toFixed(2)}` : '-',
            trade.tags ? trade.tags.join(';') : ''
        ];
        csvRows.push(row.map(item => `"${item}"`).join(',')); // Wrap each item in quotes to handle commas
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Trades_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully!', 'success');
}


function generateDateRange(start, end) {
    const result = [];
    const date = new Date(start);
    const endDate = new Date(end);

    while (date <= endDate) {
        result.push(date.toISOString().slice(0, 10));
        date.setDate(date.getDate() + 1);
    }

    return result;
}

function generateWeekdaysOnly(start, end) {
    const result = [];
    const date = new Date(start);
    const endDate = new Date(end);

    while (date <= endDate) {
        const day = date.getDay(); // 0=Sun, 6=Sat
        if (day >= 1 && day <= 5) {
            result.push(date.toISOString().slice(0, 10));
        }
        date.setDate(date.getDate() + 1);
    }

    return result;
}



// Update renderEquityCurveChart to pass accountId
async function renderEquityCurveChart(trades, startDate, endDate, chartContainer, accountId) {
    if (!chartContainer) {
        showToast('Error: Chart container not found.', 'error');
        console.error('Missing chart container');
        return;
    }

    // Load Chart.js if needed
    if (!window.Chart) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        script.async = true;
        document.head.appendChild(script);
        await new Promise(resolve => {
            script.onload = resolve;
            script.onerror = () => {
                showToast('Failed to load Chart.js.', 'error');
                resolve();
            };
        });
    }

    if (!window.Chart) {
        showToast('Chart.js not available. Cannot render equity chart.', 'error');
        return;
    }

    // ✅ Display current week date range correctly (Mon–Fri)
    const formattedStart = new Date(startDate).toISOString().split('T')[0];
    const formattedEnd = new Date(endDate).toISOString().split('T')[0];
    console.log(`📅 Current week range: ${formattedStart} → ${formattedEnd}`);
    const currentRangeLabel = `${formattedStart} → ${formattedEnd}`;

    // Get proper Monday–Friday previous week
    const { prevStart, prevEnd } = getPreviousWeekRange(endDate);
    const previousRangeLabel = `${prevStart} → ${prevEnd}`;

    // Calculate equity data for current and previous weeks
    const { currentEquityData, previousEquityData } = calculateEquityCurve(
        trades, startDate, endDate, prevStart, prevEnd, accountId
    );

    // Prepare label and equity series
    const currentDates = currentEquityData.map(d => d.date);
    const previousDates = previousEquityData.map(d => d.date);
    const allLabels = [...new Set([...previousDates, ...currentDates])].sort();

    const currentEquity = allLabels.map(date => {
        const found = currentEquityData.find(d => d.date === date);
        return found ? found.equity : null;
    });

    const previousEquity = allLabels.map(date => {
        const found = previousEquityData.find(d => d.date === date);
        return found ? found.equity : null;
    });

    // Destroy any existing chart
    const existingChart = Chart.getChart('equity-curve-chart');
    if (existingChart) existingChart.destroy();

    // Setup chart canvas
    chartContainer.innerHTML = '<canvas id="equity-curve-chart"></canvas>';
    const ctx = document.getElementById('equity-curve-chart').getContext('2d');

    // ✅ Render chart
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: `📈 Current Week (${currentRangeLabel})`,
                    data: currentEquity,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: `🕒 Previous Week (${previousRangeLabel})`,
                    data: previousEquity,
                    borderColor: '#6c757d',
                    backgroundColor: 'rgba(108, 117, 125, 0.1)',
                    borderDash: [5, 5],
                    fill: true,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Date' },
                    ticks: {
                        callback: value => allLabels[value] || ''
                    }
                },
                y: {
                    beginAtZero: false,
                    title: { display: true, text: 'Cumulative P&L ($)' }
                }
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y?.toFixed(2) || 0}`
                    }
                }
            }
        }
    });
}


// Update renderTradeTagAnalysis to pass accountId if needed (though not used currently)
function renderTradeTagAnalysis(trades, analysisContainer) {
    if (!analysisContainer) {
        showToast('Error: Tag analysis container not found.', 'error');
        console.error('Missing tag analysis container');
        return;
    }

    const tagAnalysis = calculateTradeTagAnalysis(trades);
    const categories = ['positive', 'negative', 'neutral'];

    const headerIcons = {
        positive: '✅',
        negative: '⚠️',
        neutral: '🟡'
    };

    const categoryColors = {
        positive: 'success',
        negative: 'danger',
        neutral: 'secondary'
    };

    const allTags = categories.flatMap(cat => Object.keys(tagAnalysis[cat] || {}));
    if (allTags.length === 0) {
        analysisContainer.innerHTML = '<p>No tagged trades found for this period.</p>';
        return;
    }

    analysisContainer.innerHTML = categories.map(category => {
        const tags = Object.keys(tagAnalysis[category] || {});
        if (tags.length === 0) return '';

        const icon = headerIcons[category];
        const color = categoryColors[category];
        const label = category.charAt(0).toUpperCase() + category.slice(1);

        return `
            <h5 class="mt-4 text-${color}">${icon} ${label} Tags</h5>
            <div class="table-responsive">
                <table class="table table-striped wr-tag-analysis-table">
                    <thead>
                        <tr>
                            <th>Tag</th>
                            <th>Trades</th>
                            <th>Wins</th>
                            <th>Losses</th>
                            <th>Win Rate (%)</th>
                            <th>Total P&L ($)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tags.map(tag => {
                            const stats = tagAnalysis[category][tag];
                            return `
                                <tr>
                                    <td>${tag}</td>
                                    <td>${stats.trades}</td>
                                    <td>${stats.wins}</td>
                                    <td>${stats.losses}</td>
                                    <td>${stats.winRate}</td>
                                    <td class="${stats.totalPnl >= 0 ? 'text-success' : 'text-danger'}">$${stats.totalPnl.toFixed(2)}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }).join('');
}


// Render trades table for the selected date range
function renderTradesTable(trades, tradesDiv) {
    if (!tradesDiv) {
        showToast('Error: Trades container not found.', 'error');
        console.error('Missing trades container');
        return;
    }

    if (trades.length === 0) {
        tradesDiv.innerHTML = '<p>No trades found for this period.</p>';
        return;
    }

    tradesDiv.innerHTML = `
        <div class="table-responsive">
            <table class="table table-striped wr-trades-table">
                <thead>
                    <tr>
                        <th>Trade #</th>
                        <th>Date</th>
                        <th>Pair</th>
                        <th>Strategy</th>
                        <th>Risk</th>
                        <th>Outcome</th>
                        <th>Profit/Loss</th>
                    </tr>
                </thead>
                <tbody>
                    ${trades.map((trade, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${trade.date}</td>
                            <td>${trade.pair || '-'}</td>
                            <td>${trade.strategy || '-'}</td>
                            <td>${trade.risk ? `$${trade.risk.toFixed(2)}` : '-'}</td>
                            <td>${trade.outcome || '-'}</td>
                            <td class="${trade.profitLoss >= 0 ? 'text-success' : 'text-danger'}">${trade.profitLoss ? `$${trade.profitLoss.toFixed(2)}` : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Validate weekly review existence
function validateWeeklyReview(startDate, endDate, accountId, weeklyReviews) {
    if (!startDate || !endDate || !accountId || !Array.isArray(weeklyReviews)) {
        console.warn('Invalid inputs for validateWeeklyReview:', { startDate, endDate, accountId, weeklyReviews });
        showToast('Invalid review data.', 'error');
        return false;
    }

    const start = new Date(startDate).toISOString().split('T')[0];
    const end = new Date(endDate).toISOString().split('T')[0];
    const exists = weeklyReviews.some(review => {
        if (!review || !review.accountId || !review.startDate || !review.endDate) {
            console.warn('Invalid review entry during validation:', review);
            return false;
        }
        const reviewStart = new Date(review.startDate).toISOString().split('T')[0];
        const reviewEnd = new Date(review.endDate).toISOString().split('T')[0];
        const isDuplicate = review.accountId === accountId && reviewStart === start && reviewEnd === end;
        console.log(`Checking for duplicate review: Review Start=${reviewStart}, End=${reviewEnd}, AccountId=${review.accountId}, Matches=${isDuplicate}`);
        return isDuplicate;
    });

    console.log(`validateWeeklyReview: StartDate=${start}, EndDate=${end}, AccountId=${accountId}, Exists=${exists}`);
    return exists; // Return true if a review exists
}

// Function to handle image insertion with compression
async function insertImage(file) {
    if (!file) return null;

    try {
        const compressedBlob = await compressImageMainThread(file, 1, 0.7);
        if (!compressedBlob) {
            showToast('Failed to compress image.', 'error');
            console.error('[WeeklyReview Debug] Image compression failed');
            return null;
        }

        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                const base64Data = e.target.result;
                const imageId = await saveImage(compressedBlob);
                resolve({ url: base64Data, imageId });
            };
            reader.onerror = () => {
                console.error('[WeeklyReview Debug] Failed to read compressed image file');
                reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(compressedBlob);
        });
    } catch (err) {
        showToast('Error processing image.', 'error');
        console.error('[WeeklyReview Debug] Error in insertImage:', err);
        return null;
    }
}

// Custom CKEditor Upload Adapter
class CustomUploadAdapter {
    constructor(loader) {
        this.loader = loader;
    }

    async upload() {
        const file = await this.loader.file;
        const result = await insertImage(file);
        if (result) {
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'wr-image-wrapper';
            imgWrapper.innerHTML = `
                <img src="${result.url}" data-image-id="${result.imageId}" style="max-width: 100%; height: auto;" class="wr-resizable-image" />
                <div class="wr-resize-handle"></div>
            `;
            const img = imgWrapper.querySelector('.wr-resizable-image');
            const handle = imgWrapper.querySelector('.wr-resize-handle');
            let isResizing = false;
            let startX, startWidth, startHeight, aspectRatio;

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                isResizing = true;
                startX = e.clientX;
                startWidth = img.offsetWidth;
                startHeight = img.offsetHeight;
                aspectRatio = startWidth / startHeight;
                document.addEventListener('mousemove', resizeImage);
                document.addEventListener('mouseup', stopResizing);
            });

            function resizeImage(e) {
                if (!isResizing) return;
                const deltaX = e.clientX - startX;
                const newWidth = Math.max(50, startWidth + deltaX);
                const newHeight = newWidth / aspectRatio;
                img.style.width = `${newWidth}px`;
                img.style.height = `${newHeight}px`;
            }

            function stopResizing() {
                isResizing = false;
                document.removeEventListener('mousemove', resizeImage);
                document.removeEventListener('mouseup', stopResizing);
            }

            img.addEventListener('click', () => {
                const fullScreenModal = document.querySelector('#fullScreenImageModal');
                if (fullScreenModal) {
                    const fullScreenImage = fullScreenModal.querySelector('#full-screen-image');
                    if (fullScreenImage) {
                        fullScreenImage.src = result.url;
                        const bsModal = new bootstrap.Modal(fullScreenModal);
                        bsModal.show();
                    } else {
                        console.error('[WeeklyReview Debug] Full-screen image element not found in modal');
                    }
                } else {
                    console.error('[WeeklyReview Debug] Full-screen image modal not found');
                }
            });

            return { default: result.url };
        }
        throw new Error('Image upload failed');
    }

    abort() {
        // Handle upload cancellation if needed
    }
}

function CustomUploadAdapterPlugin(editor) {
    editor.plugins.get('FileRepository').createUploadAdapter = (loader) => {
        return new CustomUploadAdapter(loader);
    };
}

// Function to dynamically load CKEditor script
async function loadCKEditorScript() {
    const cdnUrls = [
        'https://cdn.ckeditor.com/ckeditor5/36.0.1/classic/ckeditor.js',
        'https://cdn.ckeditor.com/ckeditor5/42.0.0/classic/ckeditor.js'
    ];

    for (const url of cdnUrls) {
        try {
            return await new Promise((resolve, reject) => {
                if (window.ClassicEditor) {
                    console.log('[WeeklyReview Debug] CKEditor already loaded');
                    resolve(window.ClassicEditor);
                    return;
                }

                const script = document.createElement('script');
                script.src = url;
                script.async = true;

                script.onload = () => {
                    console.log('[WeeklyReview Debug] CKEditor script loaded successfully from:', url);
                    if (window.ClassicEditor) {
                        resolve(window.ClassicEditor);
                    } else {
                        console.error('[WeeklyReview Debug] CKEditor script loaded but ClassicEditor is undefined for:', url);
                        reject(new Error('ClassicEditor not defined after script load'));
                    }
                };

                script.onerror = (error) => {
                    console.error('[WeeklyReview Debug] Failed to load CKEditor script from:', url, error);
                    reject(new Error(`Failed to load CKEditor script from ${url}`));
                };

                document.head.appendChild(script);
            });
        } catch (error) {
            console.warn('[WeeklyReview Debug] Failed to load CKEditor from:', url, 'Trying next URL...');
            continue;
        }
    }

    throw new Error('All CKEditor CDN attempts failed');
}

// Function to wait for CKEditor to load
async function waitForCKEditor(timeout = 15000) {
    const startTime = Date.now();
    let ClassicEditor = window.ClassicEditor;

    if (ClassicEditor) {
        console.log('[WeeklyReview Debug] CKEditor found immediately');
        return ClassicEditor;
    }

    try {
        ClassicEditor = await loadCKEditorScript();
        if (ClassicEditor) return ClassicEditor;
    } catch (error) {
        console.error('[WeeklyReview Debug] Initial CKEditor load failed:', error);
    }

    while (!ClassicEditor && Date.now() - startTime < timeout) {
        ClassicEditor = window.ClassicEditor;
        if (ClassicEditor) {
            console.log('[WeeklyReview Debug] CKEditor found during polling');
            return ClassicEditor;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.error('[WeeklyReview Debug] CKEditor not loaded after timeout');
    return null;
}

// Global variables to store CKEditor instances
let learnedEditorInstance = null;
let mistakesEditorInstance = null;

// Function to destroy CKEditor instances if they exist
async function destroyCKEditorInstances() {
    try {
        if (learnedEditorInstance) {
            await learnedEditorInstance.destroy();
            learnedEditorInstance = null;
            console.log('[WeeklyReview Debug] Destroyed learnedEditorInstance');
        }
        if (mistakesEditorInstance) {
            await mistakesEditorInstance.destroy();
            mistakesEditorInstance = null;
            console.log('[WeeklyReview Debug] Destroyed mistakesEditorInstance');
        }
    } catch (error) {
        console.error('[WeeklyReview Debug] Error destroying CKEditor instances:', error);
    }
}

// Update renderWeeklyReviewForm to use validateWeeklyReview
export async function renderWeeklyReviewForm(weeklyReviews, trades, activeAccountId, accounts) {
    const container = document.getElementById('weekly-review');
    if (!container) {
        console.log('Weekly Review container not found');
        showToast('Error: Weekly Review container not found.', 'error');
        return;
    }

    console.log('Rendering Weekly Review form:', {
        activeAccountId,
        weeklyReviewsCount: weeklyReviews.length,
        tradesCount: trades.length,
        filteredReviews: weeklyReviews.filter(r => r.accountId === activeAccountId).length,
        filteredTrades: trades.filter(t => t.accountId === activeAccountId).length
    });

    // Log all accountIds in trades to debug mismatch
    const tradeAccountIds = [...new Set(trades.map(t => t.accountId))];
    console.log('Account IDs in trades:', tradeAccountIds);
    if (!tradeAccountIds.includes(activeAccountId)) {
        console.warn(`Active accountId ${activeAccountId} does not match any trades. Available accountIds: ${tradeAccountIds.join(', ')}`);
    }

    // Store trades and activeAccountId globally for PDF export
    document.__trades = trades;
    document.__activeAccountId = activeAccountId;

    try {
        // Load Flatpickr for date range picker
        if (!window.flatpickr) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/flatpickr';
            script.async = true;
            document.head.appendChild(script);

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css';
            document.head.appendChild(link);

            await new Promise(resolve => {
                script.onload = resolve;
                script.onerror = () => {
                    showToast('Failed to load date picker library.', 'error');
                    resolve();
                };
            });
        }

        // Load templates for What I Learned and Mistakes Made
        const weeklyReviewTemplates = (await loadFromStore('weeklyReviewTemplates') || []).sort((a, b) => b.id - a.id);
        const learnedTemplates = weeklyReviewTemplates.filter(t => t.section === 'What I Learned');
        const mistakesTemplates = weeklyReviewTemplates.filter(t => t.section === 'Mistakes Made');
        const recentLearnedTemplates = learnedTemplates.slice(0, 5);
        const recentMistakesTemplates = mistakesTemplates.slice(0, 5);

        // Initial HTML with date range picker and placeholders, wrapped in card
        container.innerHTML = `
            <h2>Weekly Review</h2>
            <div class="card p-3 mb-4">
                <div class="card-body position-relative">
                    <div class="row">
                        <div class="col-md-12">
                            <h5 class="card-title">Select Date Range</h5>
                            <div class="mb-3">
                                <label for="date-range" class="form-label">Select Date Range</label>
                                <input type="text" class="form-control" id="date-range" placeholder="Select date range..." required>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card p-3 mb-4 wr-loading-container" id="stats-container" style="display: none;">
                <div class="card-body position-relative">
                    <div class="wr-loading-spinner" style="display: none;">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                    </div>
                    <div class="row">
                        <div class="col-md-12">
                            <div class="wr-stats-section mb-4">
                                <h6 class="wr-section-title"><i class="bi bi-bar-chart me-2"></i>Trade Statistics</h6>
                                <div id="weekly-stats" class="mb-4"></div>
                            </div>
                            <div class="wr-equity-curve-section mb-4">
                                <h6 class="wr-section-title"><i class="bi bi-graph-up-arrow me-2"></i>Equity Curve</h6>
                                <div class="wr-equity-curve-chart" id="equity-curve-container" style="height: 300px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card p-3 mb-4" id="review-form-container" style="display: none;">
                <div class="card-body position-relative">
                    <div class="row">
                        <div class="col-md-12">
                            <div class="wr-review-section">
                                <div class="wr-review-header">
                                    <h6 class="wr-section-title"><i class="bi bi-file-earmark-text me-2"></i>Weekly Review</h6>
                                </div>
                                <div class="wr-review-form-section">
                                    <form id="weekly-review-form">
                                        <div class="mb-3">
                                            <label for="quick-notes" class="form-label">Quick Notes</label>
                                            <textarea class="form-control" id="quick-notes" rows="5" placeholder="Add quick notes for this week..."></textarea>
                                        </div>
                                        <div class="mb-3">
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <h6 class="wr-subsection-title">What I Learned</h6>
                                                <div class="d-flex align-items-center">
                                                    <div class="wr-recent-templates me-2 d-flex flex-wrap gap-1">
                                                        ${recentLearnedTemplates.map(t => `
                                                            <button type="button" class="btn btn-sm btn-outline-secondary wr-recent-template wr-learned-recent-template" data-template-id="${t.id}">${t.name}</button>
                                                        `).join('')}
                                                    </div>
                                                    <div class="wr-custom-dropdown">
                                                        <button type="button" class="btn btn-outline-secondary dropdown-toggle wr-template-select wr-learned-template-select" id="learned-template-select" data-bs-toggle="dropdown">
                                                            Select Template
                                                        </button>
                                                        <ul class="dropdown-menu" id="learned-template-list">
                                                            ${learnedTemplates.map(t => `
                                                                <li class="dropdown-item d-flex justify-content-between align-items-center">
                                                                    <span class="wr-template-name" data-template-id="${t.id}">${t.name}</span>
                                                                    <span class="wr-template-delete ms-2" data-template-id="${t.id}" data-store="weeklyReviewTemplates">
                                                                        <i class="bi bi-trash text-danger"></i>
                                                                    </span>
                                                                </li>
                                                            `).join('')}
                                                            <li class="dropdown-item wr-save-template-option" data-section="What I Learned">Save as Template...</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="wr-rich-text-editor form-control" id="learned-content-editor"></div>
                                        </div>
                                        <div class="mb-3">
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <h6 class="wr-subsection-title">Mistakes Made</h6>
                                                <div class="d-flex align-items-center">
                                                    <div class="wr-recent-templates me-2 d-flex flex-wrap gap-1">
                                                        ${recentMistakesTemplates.map(t => `
                                                            <button type="button" class="btn btn-sm btn-outline-secondary wr-recent-template wr-mistakes-recent-template" data-template-id="${t.id}">${t.name}</button>
                                                        `).join('')}
                                                    </div>
                                                    <div class="wr-custom-dropdown">
                                                        <button type="button" class="btn btn-outline-secondary dropdown-toggle wr-template-select wr-mistakes-template-select" id="mistakes-template-select" data-bs-toggle="dropdown">
                                                            Select Template
                                                        </button>
                                                        <ul class="dropdown-menu" id="mistakes-template-list">
                                                            ${mistakesTemplates.map(t => `
                                                                <li class="dropdown-item d-flex justify-content-between align-items-center">
                                                                    <span class="wr-template-name" data-template-id="${t.id}">${t.name}</span>
                                                                    <span class="wr-template-delete ms-2" data-template-id="${t.id}" data-store="weeklyReviewTemplates">
                                                                        <i class="bi bi-trash text-danger"></i>
                                                                    </span>
                                                                </li>
                                                            `).join('')}
                                                            <li class="dropdown-item wr-save-template-option" data-section="Mistakes Made">Save as Template...</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="wr-rich-text-editor form-control" id="mistakes-content-editor"></div>
                                        </div>
                                        <div class="d-flex gap-2">
                                            <button type="submit" class="btn wr-btn-primary" id="save-review-btn">Save Review</button>
                                            <button type="button" class="btn btn-secondary" id="done-btn">Done</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card p-3 mb-4" id="tag-analysis-container" style="display: none;">
                <div class="card-body position-relative">
                    <div class="row">
                        <div class="col-md-12">
                            <div class="wr-tag-analysis-section mt-4">
                                <h6 class="wr-section-title"><i class="bi bi-tags me-2"></i>Trade Tag Analysis</h6>
                                <div id="tag-analysis"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card p-3 mb-4" id="trades-container" style="display: none;">
                <div class="card-body position-relative">
                    <div class="row">
                        <div class="col-md-12">
                            <div class="wr-trades-section mt-4">
                                <h6 class="wr-section-title"><i class="bi bi-table me-2"></i>Trades in Selected Range</h6>
                                <div id="range-trades"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Initialize Flatpickr date range picker
        const dateRangeInput = document.getElementById('date-range');
        let startDate, endDate;
        if (window.flatpickr) {
            flatpickr(dateRangeInput, {
                mode: 'range',
                dateFormat: 'Y-m-d',
                maxDate: new Date(),
                onClose: async (selectedDates) => {
                    if (selectedDates.length === 2) {
                        startDate = selectedDates[0].toISOString().split('T')[0];
                        endDate = selectedDates[1].toISOString().split('T')[0];

                        // Validate the date range
                        if (!validateDateRange(startDate, endDate)) {
                            dateRangeInput.value = ''; // Clear the invalid selection
                            return;
                        }

                        // Show loading state
                        const statsContainer = document.getElementById('stats-container');
                        const tradesContainer = document.getElementById('trades-container');
                        const tagAnalysisContainer = document.getElementById('tag-analysis-container');
                        const formContainer = document.getElementById('review-form-container');
                        const loadingSpinner = statsContainer.querySelector('.wr-loading-spinner');
                        loadingSpinner.style.display = 'block';
                        statsContainer.style.display = 'block';
                        tradesContainer.style.display = 'block';
                        tagAnalysisContainer.style.display = 'block';

                        try {
                            // Destroy existing CKEditor instances to prevent duplication
                            await destroyCKEditorInstances();

                            // Render stats, equity curve, tag analysis, and trades
                            const tradesForRange = renderWeeklyStats(trades, startDate, endDate, activeAccountId, document.getElementById('weekly-stats'));
                            if (tradesForRange.length === 0) {
                                statsContainer.querySelector('.card-body').innerHTML = '<p>No trades found for this period. Try a different date range.</p>';
                                tradesContainer.style.display = 'none';
                                tagAnalysisContainer.style.display = 'none';
                                return;
                            }

                            await renderEquityCurveChart(trades, startDate, endDate, document.getElementById('equity-curve-container'), activeAccountId);
                            renderTradeTagAnalysis(tradesForRange, document.getElementById('tag-analysis'));
                            renderTradesTable(tradesForRange, document.getElementById('range-trades'));

                            // Show the form
                            formContainer.style.display = 'block';

                            // Load the latest weekly reviews from the database
                            const latestWeeklyReviews = await loadFromStore('weeklyReviews') || [];
                            console.log('Loaded latest weeklyReviews:', latestWeeklyReviews);

                            // Check for existing review and populate form
                            const existingReview = latestWeeklyReviews.find(review => 
                                review.accountId === activeAccountId &&
                                new Date(review.startDate).toISOString().split('T')[0] === startDate &&
                                new Date(review.endDate).toISOString().split('T')[0] === endDate
                            );
                            console.log('Existing review for date range:', existingReview);

                            // Update Save/Update button text
                            const saveButton = document.getElementById('save-review-btn');
                            if (existingReview) {
                                saveButton.textContent = 'Update Review';
                            } else {
                                saveButton.textContent = 'Save Review';
                            }

                            // Initialize quick notes
                            const quickNotesInput = document.getElementById('quick-notes');
                            if (quickNotesInput && existingReview) {
                                quickNotesInput.value = existingReview.quickNotes || '';
                                console.log('Populated Quick Notes:', quickNotesInput.value);
                            } else {
                                quickNotesInput.value = '';
                                console.log('No Quick Notes to populate');
                            }

                            // Initialize CKEditor for What I Learned
                            let isReadonly = false;
                            const learnedEditor = document.getElementById('learned-content-editor');
                            if (learnedEditor) {
                                const ClassicEditor = await waitForCKEditor();
                                if (ClassicEditor) {
                                    try {
                                        window.learnedEditorInstance = await ClassicEditor.create(learnedEditor, {
                                            toolbar: ['bold', 'italic', 'bulletedList', 'table', 'imageUpload'],
                                            extraPlugins: [CustomUploadAdapterPlugin],
                                            image: {
                                                toolbar: ['imageStyle:full', 'imageStyle:side']
                                            },
                                            table: {
                                                contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
                                            }
                                        });
                                        window.learnedEditorInstance.setData(existingReview ? existingReview.whatLearned : '<p>Enter what you learned this week...</p>');
                                        console.log('[WeeklyReview Debug] CKEditor initialized for What I Learned with toolbar:', ['bold', 'italic', 'bulletedList', 'table', 'imageUpload']);
                                    } catch (error) {
                                        console.error('[WeeklyReview Debug] Error initializing CKEditor for What I Learned:', error);
                                        showToast('Failed to load editor. Displaying content in readonly mode.', 'warning');
                                        learnedEditor.innerHTML = existingReview ? existingReview.whatLearned : '<p>Enter what you learned this week...</p>';
                                        learnedEditor.classList.add('readonly');
                                        isReadonly = true;
                                    }
                                } else {
                                    console.error('[WeeklyReview Debug] CKEditor not loaded after timeout: ClassicEditor is undefined');
                                    showToast('Editor not available. Displaying content in readonly mode.', 'warning');
                                    learnedEditor.innerHTML = existingReview ? existingReview.whatLearned : '<p>Enter what you learned this week...</p>';
                                    learnedEditor.classList.add('readonly');
                                    isReadonly = true;
                                }
                            }

                            // Initialize CKEditor for Mistakes Made
                            const mistakesEditor = document.getElementById('mistakes-content-editor');
                            if (mistakesEditor) {
                                const ClassicEditor = await waitForCKEditor();
                                if (ClassicEditor) {
                                    try {
                                        window.mistakesEditorInstance = await ClassicEditor.create(mistakesEditor, {
                                            toolbar: ['bold', 'italic', 'bulletedList', 'table', 'imageUpload'],
                                            extraPlugins: [CustomUploadAdapterPlugin],
                                            image: {
                                                toolbar: ['imageStyle:full', 'imageStyle:side']
                                            },
                                            table: {
                                                contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
                                            }
                                        });
                                        window.mistakesEditorInstance.setData(existingReview ? (existingReview.mistakesMade || '<p>Enter mistakes made this week...</p>') : '<p>Enter mistakes made this week...</p>');
                                        console.log('[WeeklyReview Debug] CKEditor initialized for Mistakes Made with toolbar:', ['bold', 'italic', 'bulletedList', 'table', 'imageUpload']);
                                    } catch (error) {
                                        console.error('[WeeklyReview Debug] Error initializing CKEditor for Mistakes Made:', error);
                                        showToast('Failed to load editor. Displaying content in readonly mode.', 'warning');
                                        mistakesEditor.innerHTML = existingReview ? (existingReview.mistakesMade || '<p>Enter mistakes made this week...</p>') : '<p>Enter mistakes made this week...</p>';
                                        mistakesEditor.classList.add('readonly');
                                        isReadonly = true;
                                    }
                                } else {
                                    console.error('[WeeklyReview Debug] CKEditor not loaded after timeout: ClassicEditor is undefined');
                                    showToast('Editor not available. Displaying content in readonly mode.', 'warning');
                                    mistakesEditor.innerHTML = existingReview ? (existingReview.mistakesMade || '<p>Enter mistakes made this week...</p>') : '<p>Enter mistakes made this week...</p>';
                                    mistakesEditor.classList.add('readonly');
                                    isReadonly = true;
                                }
                            }

                            // Function to reset UI to date picker state
                            const resetToDatePicker = async () => {
                                dateRangeInput.value = '';
                                formContainer.style.display = 'none';
                                statsContainer.style.display = 'none';
                                tradesContainer.style.display = 'none';
                                tagAnalysisContainer.style.display = 'none';
                                if (!isReadonly) {
                                    await destroyCKEditorInstances();
                                }
                                document.getElementById('weekly-stats').innerHTML = '';
                                document.getElementById('equity-curve-container').innerHTML = '';
                                document.getElementById('tag-analysis').innerHTML = '';
                                document.getElementById('range-trades').innerHTML = '';
                            };

                            // Function to show the Save Template form
                            function showSaveTemplateForm(section, editorContent, onSaveCallback) {
                                const saveFormContainer = document.createElement('div');
                                saveFormContainer.className = 'card mb-3';
                                saveFormContainer.innerHTML = `
                                    <div class="card-body">
                                        <h5 class="card-title">Save ${section} Template</h5>
                                        <form id="save-template-form-${section.toLowerCase().replace(/\s/g, '-') }">
                                            <div class="mb-3">
                                                <label for="template-name-${section.toLowerCase().replace(/\s/g, '-') }" class="form-label">Template Name</label>
                                                <input type="text" class="form-control" id="template-name-${section.toLowerCase().replace(/\s/g, '-') }" required>
                                            </div>
                                            <button type="submit" class="btn wr-btn-primary me-2">Save Template</button>
                                            <button type="button" class="btn btn-secondary cancel-template-btn">Cancel</button>
                                        </form>
                                    </div>
                                `;

                                const parent = document.getElementById('weekly-review-form').parentElement;
                                parent.insertBefore(saveFormContainer, document.getElementById('weekly-review-form'));

                                const saveForm = saveFormContainer.querySelector(`#save-template-form-${section.toLowerCase().replace(/\s/g, '-') }`);
                                saveForm.addEventListener('submit', async (e) => {
                                    e.preventDefault();
                                    const templateNameInput = saveFormContainer.querySelector(`#template-name-${section.toLowerCase().replace(/\s/g, '-') }`);
                                    const templateName = templateNameInput.value.trim();
                                    if (!templateName) {
                                        showToast('Please enter a template name.', 'error');
                                        return;
                                    }

                                    await onSaveCallback(templateName);
                                    // Do not hide the form or reset UI here
                                });

                                const cancelBtn = saveFormContainer.querySelector('.cancel-template-btn');
                                cancelBtn.addEventListener('click', () => {
                                    saveFormContainer.remove();
                                });
                            }

                            // Handle What I Learned template selection and deletion
                            const learnedTemplateList = document.getElementById('learned-template-list');
                            if (learnedTemplateList) {
                                const learnedTemplateSelect = document.getElementById('learned-template-select');
                                const learnedTemplateNames = learnedTemplateList.querySelectorAll('.wr-template-name');
                                learnedTemplateNames.forEach(name => {
                                    name.addEventListener('click', () => {
                                        const templateId = parseInt(name.dataset.templateId);
                                        const template = learnedTemplates.find(t => t.id === templateId);
                                        if (template) {
                                            if (window.learnedEditorInstance && !isReadonly) {
                                                window.learnedEditorInstance.setData(template.content);
                                            } else {
                                                learnedEditor.innerHTML = template.content;
                                            }
                                            learnedTemplateSelect.textContent = template.name;
                                        }
                                        const dropdown = new bootstrap.Dropdown(learnedTemplateSelect);
                                        dropdown.hide();
                                    });
                                });

                                const learnedDeleteIcons = learnedTemplateList.querySelectorAll('.wr-template-delete');
                                learnedDeleteIcons.forEach(icon => {
                                    icon.addEventListener('click', async (e) => {
                                        e.stopPropagation();
                                        const templateId = parseInt(icon.dataset.templateId);
                                        const storeName = icon.dataset.store;
                                        await deleteFromStore(storeName, templateId);
                                        showToast('Template deleted successfully!', 'success');
                                        // Do not hide the form or reset UI here
                                        renderWeeklyReviewForm(weeklyReviews, trades, activeAccountId, accounts);
                                    });
                                });

                                const learnedSaveOption = learnedTemplateList.querySelector('.wr-save-template-option');
                                learnedSaveOption.addEventListener('click', () => {
                                    if (isReadonly) {
                                        showToast('Cannot save template in readonly mode.', 'error');
                                        return;
                                    }
                                    showSaveTemplateForm('What I Learned', window.learnedEditorInstance.getData(), async (templateName) => {
                                        const newTemplate = {
                                            id: Date.now(),
                                            name: templateName,
                                            content: window.learnedEditorInstance.getData(),
                                            section: 'What I Learned',
                                            accountId: activeAccountId
                                        };
                                        await saveToStore('weeklyReviewTemplates', newTemplate);
                                        showToast('What I Learned template saved successfully!', 'success');
                                        renderWeeklyReviewForm(weeklyReviews, trades, activeAccountId, accounts);
                                    });
                                    const dropdown = new bootstrap.Dropdown(learnedTemplateSelect);
                                    dropdown.hide();
                                });
                            }

                            // Handle Mistakes Made template selection and deletion
                            const mistakesTemplateList = document.getElementById('mistakes-template-list');
                            if (mistakesTemplateList) {
                                const mistakesTemplateSelect = document.getElementById('mistakes-template-select');
                                const mistakesTemplateNames = mistakesTemplateList.querySelectorAll('.wr-template-name');
                                mistakesTemplateNames.forEach(name => {
                                    name.addEventListener('click', () => {
                                        const templateId = parseInt(name.dataset.templateId);
                                        const template = mistakesTemplates.find(t => t.id === templateId);
                                        if (template) {
                                            if (window.mistakesEditorInstance && !isReadonly) {
                                                window.mistakesEditorInstance.setData(template.content);
                                            } else {
                                                mistakesEditor.innerHTML = template.content;
                                            }
                                            mistakesTemplateSelect.textContent = template.name;
                                        }
                                        const dropdown = new bootstrap.Dropdown(mistakesTemplateSelect);
                                        dropdown.hide();
                                    });
                                });

                                const mistakesDeleteIcons = mistakesTemplateList.querySelectorAll('.wr-template-delete');
                                mistakesDeleteIcons.forEach(icon => {
                                    icon.addEventListener('click', async (e) => {
                                        e.stopPropagation();
                                        const templateId = parseInt(icon.dataset.templateId);
                                        const storeName = icon.dataset.store;
                                        await deleteFromStore(storeName, templateId);
                                        showToast('Template deleted successfully!', 'success');
                                        // Do not hide the form or reset UI here
                                        renderWeeklyReviewForm(weeklyReviews, trades, activeAccountId, accounts);
                                    });
                                });

                                const mistakesSaveOption = mistakesTemplateList.querySelector('.wr-save-template-option');
                                mistakesSaveOption.addEventListener('click', () => {
                                    if (isReadonly) {
                                        showToast('Cannot save template in readonly mode.', 'error');
                                        return;
                                    }
                                    showSaveTemplateForm('Mistakes Made', window.mistakesEditorInstance.getData(), async (templateName) => {
                                        const newTemplate = {
                                            id: Date.now(),
                                            name: templateName,
                                            content: window.mistakesEditorInstance.getData(),
                                            section: 'Mistakes Made',
                                            accountId: activeAccountId
                                        };
                                        await saveToStore('weeklyReviewTemplates', newTemplate);
                                        showToast('Mistakes Made template saved successfully!', 'success');
                                        renderWeeklyReviewForm(weeklyReviews, trades, activeAccountId, accounts);
                                    });
                                    const dropdown = new bootstrap.Dropdown(mistakesTemplateSelect);
                                    dropdown.hide();
                                });
                            }

                            // Handle recent template clicks
                            const learnedRecentTemplates = container.querySelectorAll('.wr-learned-recent-template');
                            learnedRecentTemplates.forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const templateId = parseInt(btn.dataset.templateId);
                                    const template = learnedTemplates.find(t => t.id === templateId);
                                    if (template) {
                                        if (window.learnedEditorInstance && !isReadonly) {
                                            window.learnedEditorInstance.setData(template.content);
                                        } else {
                                            learnedEditor.innerHTML = template.content;
                                        }
                                    }
                                });
                            });

                            const mistakesRecentTemplates = container.querySelectorAll('.wr-mistakes-recent-template');
                            mistakesRecentTemplates.forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const templateId = parseInt(btn.dataset.templateId);
                                    const template = mistakesTemplates.find(t => t.id === templateId);
                                    if (template) {
                                        if (window.mistakesEditorInstance && !isReadonly) {
                                            window.mistakesEditorInstance.setData(template.content);
                                        } else {
                                            mistakesEditor.innerHTML = template.content;
                                        }
                                    }
                                });
                            });

                            // Handle form submission
                            const form = document.getElementById('weekly-review-form');
                            form.addEventListener('submit', async (e) => {
                                e.preventDefault();

                                const dateRange = dateRangeInput.value.split(' to ');
                                if (dateRange.length !== 2) {
                                    showToast('Please select a valid date range.', 'error');
                                    return;
                                }

                                const startDate = dateRange[0];
                                const endDate = dateRange[1];
                                let whatLearned, mistakesMade, quickNotes;

                                if (isReadonly) {
                                    whatLearned = learnedEditor.innerHTML;
                                    mistakesMade = mistakesEditor.innerHTML;
                                    quickNotes = document.getElementById('quick-notes')?.value || '';
                                } else {
                                    whatLearned = window.learnedEditorInstance.getData();
                                    mistakesMade = window.mistakesEditorInstance.getData();
                                    quickNotes = document.getElementById('quick-notes')?.value || '';
                                }

                                const plainLearnedText = whatLearned.replace(/<[^>]+>/g, '').trim();
                                if (!plainLearnedText) {
                                    showToast('Please enter what you learned.', 'error');
                                    return;
                                }

                                if (!validateDateRange(startDate, endDate)) {
                                    return;
                                }

                                const startDateObj = new Date(startDate);
                                if (startDateObj > new Date()) {
                                    showToast('Cannot create a review for a future period.', 'error');
                                    return;
                                }

                                // Validate if a review already exists (only for new reviews, not updates)
                                const existingReviewIndex = weeklyReviews.findIndex(review => 
                                    review.accountId === activeAccountId &&
                                    new Date(review.startDate).toISOString().split('T')[0] === startDate &&
                                    new Date(review.endDate).toISOString().split('T')[0] === endDate
                                );

                                if (existingReviewIndex === -1) { // Only validate for new reviews
                                    const reviewExists = validateWeeklyReview(startDate, endDate, activeAccountId, weeklyReviews);
                                    if (reviewExists) {
                                        showToast('A review already exists for this date range and account.', 'error');
                                        return;
                                    }
                                }

                                // If a review exists, update it; otherwise, create a new one
                                const newReview = {
                                    id: existingReviewIndex !== -1 ? weeklyReviews[existingReviewIndex].id : Date.now(),
                                    accountId: activeAccountId,
                                    startDate,
                                    endDate,
                                    whatLearned,
                                    mistakesMade,
                                    quickNotes,
                                    createdAt: existingReviewIndex !== -1 ? weeklyReviews[existingReviewIndex].createdAt : new Date().toISOString()
                                };

                                if (existingReviewIndex !== -1) {
                                    weeklyReviews[existingReviewIndex] = newReview;
                                } else {
                                    weeklyReviews.push(newReview);
                                }
                                await saveToStore('weeklyReviews', newReview);
                                showToast(`${existingReviewIndex !== -1 ? 'Review updated' : 'Review saved'} successfully!`, 'success');

                                // Reload weekly reviews from the database to ensure the latest data
                                const updatedWeeklyReviews = await loadFromStore('weeklyReviews') || [];
                                console.log('Reloaded weeklyReviews after save:', updatedWeeklyReviews);

                                // Reset form but keep UI visible
                                form.reset();

                                // Re-populate the form with the latest data
                                const updatedReview = updatedWeeklyReviews.find(review => 
                                    review.accountId === activeAccountId &&
                                    new Date(review.startDate).toISOString().split('T')[0] === startDate &&
                                    new Date(review.endDate).toISOString().split('T')[0] === endDate
                                );
                                if (quickNotesInput && updatedReview) {
                                    quickNotesInput.value = updatedReview.quickNotes || '';
                                    console.log('Re-populated Quick Notes after save:', quickNotesInput.value);
                                }
                                if (window.learnedEditorInstance && updatedReview) {
                                    window.learnedEditorInstance.setData(updatedReview.whatLearned || '<p>Enter what you learned this week...</p>');
                                }
                                if (window.mistakesEditorInstance && updatedReview) {
                                    window.mistakesEditorInstance.setData(updatedReview.mistakesMade || '<p>Enter mistakes made this week...</p>');
                                }
                            });

                            // Handle Done button click
                            const doneButton = document.getElementById('done-btn');
                            doneButton.addEventListener('click', async () => {
                                await resetToDatePicker();
                            });
                        } catch (error) {
                            console.error('Error rendering weekly review content:', error);
                            statsContainer.querySelector('.card-body').innerHTML = '<p class="text-danger">Failed to load content. Please try again.</p>';
                            tradesContainer.style.display = 'none';
                            tagAnalysisContainer.style.display = 'none';
                            showToast('Error loading review content.', 'error');
                        } finally {
                            loadingSpinner.style.display = 'none';
                        }
                    }
                }
            });
        } else {
            console.warn('Flatpickr not loaded, date range picker will not work');
            showToast('Date picker not available. Please select dates manually.', 'warning');
        }

        console.log('Weekly Review form rendering completed');
    } catch (err) {
        console.error('Error rendering Weekly Review form:', err);
        showToast('Error rendering form.', 'error');
        container.innerHTML = '<p class="text-danger">Failed to load form. Please try again.</p>';
    }
}
// Initialize weekly review page
export async function initializeWeeklyReviewPage(weeklyReviews, settings, accounts, trades) {
    const page = document.getElementById('weekly-review');
    if (!page || !page.classList.contains('active')) {
        console.log('Weekly Review page not active, skipping initialization');
        return;
    }

    console.log('Initializing Weekly Review page');

    // Load fresh weeklyReviews from the store
    const freshWeeklyReviews = await loadFromStore('weeklyReviews') || [];
    console.log('Loaded fresh weeklyReviews during initialization:', freshWeeklyReviews);

    renderWeeklyReviewForm(freshWeeklyReviews, trades, settings.activeAccountId, accounts);
}