import { saveToStore, loadFromStore, saveImage, deleteFromStore } from './data.js';
import { showToast, validateDailyPlan, calculateWinRateForDate, calculateTradeCounts, indexTradesByMonth, compressImageMainThread } from './utils.js';
import { renderCalendar, calculateDailyStats, calculateWeeklyAndMonthlyStats } from './calendar.js';

/**
 * renderDailyStats
 * ----------------
 * Renders daily trade statistics for a selected date in the UI.
 * Purpose: Displays key metrics (trade count, wins, losses, net P&L, win rate) and a trade table for a specific date.
 *
 * @param {Array} trades - List of trade objects.
 * @param {string} dateString - Date in string format (e.g., '2025-07-20').
 * @param {string} activeAccountId - ID of the active account.
 */
export function renderDailyStats(trades, dateString, activeAccountId) {
    // Filter trades for the specific date and account
    const date = new Date(dateString);
    const tradesForDate = trades.filter(t =>
        t.accountId === activeAccountId &&
        new Date(t.date).toDateString() === date.toDateString()
    );
    console.log('renderDailyStats:', { dateString, activeAccountId, tradesForDate: tradesForDate.length });

    // Get DOM elements for stats and trades table
    const statsDiv = document.getElementById('daily-stats');
    const tradesBody = document.getElementById('daily-trades-body');

    // Validate DOM elements
    if (!statsDiv || !tradesBody) {
        showToast('Error: Stats or trades table not found.', 'error');
        console.error('Missing DOM elements:', { statsDiv: !!statsDiv, tradesBody: !!tradesBody });
        return;
    }

    // Calculate trade statistics
    const tradeCount = tradesForDate.length;
    const tradeCounts = {
        wins: tradesForDate.filter(t => t.outcome === 'Win').length,
        losses: tradesForDate.filter(t => t.outcome === 'Loss').length
    };
    const profitLoss = tradesForDate.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
    const winRate = tradeCount ? (tradeCounts.wins / tradeCount * 100) : 0;

    // Render stats in the UI
    statsDiv.innerHTML = `
        <p><strong>Trades Taken:</strong> ${tradeCount}</p>
        <p><strong>Total Wins:</strong> ${tradeCounts.wins}</p>
        <p><strong>Total Losses:</strong> ${tradeCounts.losses}</p>
        <p><strong>Net P&L ($):</strong> ${profitLoss.toFixed(2)}</p>
        <p><strong>Win Rate (%):</strong> ${winRate.toFixed(2)}</p>
    `;

    // Render trades table
    tradesBody.innerHTML = tradesForDate.map((trade, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${trade.pair || '-'}</td>
            <td>${trade.strategy || '-'}</td>
            <td>${trade.risk ? `$${trade.risk.toFixed(2)}` : '-'}</td>
            <td>${trade.outcome || '-'}</td>
            <td class="${trade.profitLoss >= 0 ? 'text-success' : 'text-danger'}">${trade.profitLoss ? `$${trade.profitLoss.toFixed(2)}` : '-'}</td>
        </tr>
    `).join('') || '<tr><td colspan="6" class="text-center">No trades for this date.</td></tr>';

    // Log rendered stats for debugging
    console.log('Rendered daily stats:', {
        tradeCount,
        wins: tradeCounts.wins,
        losses: tradeCounts.losses,
        profitLoss,
        winRate,
        tradesRendered: tradesForDate.length
    });
}

/**
 * showDailyPlanModal
 * ------------------
 * Displays a modal for viewing and editing the daily trading plan and after-market review.
 * Purpose: Allows users to create, edit, and manage daily plans with rich text editing and template support.
 *
 * @param {string} dateString - Date for the plan (e.g., '2025-07-20').
 * @param {Object} dailyPlan - Existing daily plan object, if any.
 * @param {Array} dailyTrades - Trades for the specified date.
 * @param {string} activeAccountId - ID of the active account.
 * @param {Array} accounts - List of account objects.
 * @param {Array} trades - List of all trade objects.
 * @param {Array} planTemplates - List of plan templates.
 * @param {Array} dailyPlans - List of all daily plans.
 */
async function showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans) {
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal fade xai-daily-plan-modal';
    const planContent = dailyPlan?.gamePlan || '<p>Enter your pre-market game plan here...</p>';
    const afterMarketReviewContent = dailyPlan?.afterMarketReview || '<p>Enter your after-market review here...</p>';

    // Load and sort templates for pre-market and after-market sections
    const preMarketTemplates = (await loadFromStore('preMarketTemplates') || []).sort((a, b) => b.id - a.id);
    const afterMarketTemplates = (await loadFromStore('afterMarketTemplates') || []).sort((a, b) => b.id - a.id);

    // Get the 5 most recent templates for each section
    const recentPreMarketTemplates = preMarketTemplates.slice(0, 5);
    const recentAfterMarketTemplates = afterMarketTemplates.slice(0, 5);

    // Render modal HTML
    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content xai-modal-content">
                <div class="modal-header xai-modal-header">
                    <h5 class="modal-title xai-modal-title">
                        <i class="bi bi-calendar-day me-2"></i>Daily Plan - ${dateString}
                    </h5>
                    <div class="xai-header-actions">
                        <button class="btn xai-btn-share me-2" title="Share">
                            <i class="bi bi-share"></i>
                        </button>
                        <button class="btn xai-btn-download me-2" title="Download as PDF">
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn xai-btn-close" data-bs-dismiss="modal" title="Close">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>
                <div class="modal-body xai-modal-body">
                    <div class="xai-stats-section mb-4">
                        <h6 class="xai-section-title"><i class="bi bi-bar-chart me-2"></i>Trade Statistics</h6>
                        <div class="xai-stats-grid" id="xai-daily-stats-modal"></div>
                    </div>
                    <div class="xai-plan-section">
                        <div class="xai-plan-header">
                            <h6 class="xai-section-title"><i class="bi bi-file-earmark-text me-2"></i>Trading Plan</h6>
                        </div>
                        <div class="xai-plan-details-card d-none">
                            <div class="xai-plan-content" id="xai-plan-content">${planContent}</div>
                            <div class="xai-plan-field mt-3">
                                <strong>Trades Taken:</strong> ${dailyTrades.length}
                            </div>
                            ${dailyPlan?.afterMarketReview ? `
                                <div class="xai-after-market-review-section mt-4">
                                    <h6 class="xai-subsection-title"><i class="bi bi-check-circle me-2"></i>After Market Review</h6>
                                    <div class="xai-plan-content">${dailyPlan.afterMarketReview}</div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="xai-plan-form-section">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="xai-subsection-title">Pre-Market Game Plan</h6>
                                <div class="d-flex align-items-center">
                                    <div class="xai-recent-templates me-2 d-flex flex-wrap gap-1">
                                        ${recentPreMarketTemplates.map(t => `
                                            <button class="btn btn-sm btn-outline-secondary xai-recent-template xai-pre-market-recent-template" data-template-id="${t.id}">${t.name}</button>
                                        `).join('')}
                                    </div>
                                    <div class="xai-custom-dropdown">
                                        <button class="btn btn-outline-secondary dropdown-toggle xai-template-select xai-pre-market-template-select" type="button" id="pre-market-template-select" data-bs-toggle="dropdown">
                                            Select Template
                                        </button>
                                        <ul class="dropdown-menu" id="pre-market-template-list">
                                            ${preMarketTemplates.map(t => `
                                                <li class="dropdown-item d-flex justify-content-between align-items-center">
                                                    <span class="xai-template-name" data-template-id="${t.id}">${t.name}</span>
                                                    <span class="xai-template-delete ms-2" data-template-id="${t.id}" data-store="preMarketTemplates">
                                                        <i class="bi bi-trash text-danger"></i>
                                                    </span>
                                                </li>
                                            `).join('')}
                                            <li class="dropdown-item xai-save-template-option" data-section="Pre-Market Game Plan">Save as Template...</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                            <div class="mb-3">
                                <div id="plan-content-editor" class="xai-rich-text-editor form-control">${planContent}</div>
                            </div>
                            ${dailyPlan ? `
                                <div class="mt-4">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <h6 class="xai-subsection-title">After Market Review</h6>
                                        <div class="d-flex align-items-center">
                                            <div class="xai-recent-templates me-2 d-flex flex-wrap gap-1">
                                                ${recentAfterMarketTemplates.map(t => `
                                                    <button class="btn btn-sm btn-outline-secondary xai-recent-template xai-after-market-recent-template" data-template-id="${t.id}">${t.name}</button>
                                                `).join('')}
                                            </div>
                                            <div class="xai-custom-dropdown">
                                                <button class="btn btn-outline-secondary dropdown-toggle xai-template-select xai-after-market-template-select" type="button" id="after-market-template-select" data-bs-toggle="dropdown">
                                                    Select Template
                                                </button>
                                                <ul class="dropdown-menu" id="after-market-template-list">
                                                    ${afterMarketTemplates.map(t => `
                                                        <li class="dropdown-item d-flex justify-content-between align-items-center">
                                                            <span class="xai-template-name" data-template-id="${t.id}">${t.name}</span>
                                                            <span class="xai-template-delete ms-2" data-template-id="${t.id}" data-store="afterMarketTemplates">
                                                                <i class="bi bi-trash text-danger"></i>
                                                            </span>
                                                        </li>
                                                    `).join('')}
                                                    <li class="dropdown-item xai-save-template-option" data-section="After Market Review">Save as Template...</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <div id="after-market-review-editor" class="xai-rich-text-editor form-control">${afterMarketReviewContent}</div>
                                    </div>
                                </div>
                            ` : ''}
                            <form id="xai-daily-plan-form">
                                <button type="submit" class="btn xai-btn-primary" title="${dailyPlan ? 'Update' : 'Save'} Plan">
                                    <i class="bi bi-save"></i>
                                </button>
                            </form>
                        </div>
                    </div>
                    <div class="xai-trades-section mt-4">
                        <h6 class="xai-section-title"><i class="bi bi-table me-2"></i>Trades</h6>
                        <div class="table-responsive">
                            <table class="table table-striped xai-table">
                                <thead>
                                    <tr>
                                        <th>Trade #</th>
                                        <th>Pair</th>
                                        <th>Strategy</th>
                                        <th>Risk</th>
                                        <th>Outcome</th>
                                        <th>Profit/Loss</th>
                                    </tr>
                                </thead>
                                <tbody id="xai-daily-trades-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    /**
     * showSaveTemplateModal
     * ---------------------
     * Displays a modal for saving a template for Pre-Market or After Market sections.
     * Purpose: Allows users to save editor content as reusable templates.
     *
     * @param {string} section - Section name ('Pre-Market Game Plan' or 'After Market Review').
     * @param {string} editorContent - Content from the editor.
     * @param {Function} onSaveCallback - Callback to handle template saving.
     */
    function showSaveTemplateModal(section, editorContent, onSaveCallback) {
        const saveModal = document.createElement('div');
        saveModal.className = 'modal fade xai-save-template-modal';
        saveModal.innerHTML = `
            <div class="modal-dialog modal-sm">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Save ${section} Template</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="xai-save-template-form-${section.toLowerCase().replace(/\s/g, '-') }">
                            <div class="mb-3">
                                <label for="template-name-${section.toLowerCase().replace(/\s/g, '-') }" class="form-label">Template Name</label>
                                <input type="text" class="form-control" id="template-name-${section.toLowerCase().replace(/\s/g, '-') }" required>
                            </div>
                            <button type="submit" class="btn xai-btn-primary">Save Template</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(saveModal);
        const bsSaveModal = new bootstrap.Modal(saveModal);
        bsSaveModal.show();

        // Handle template save form submission
        const saveForm = saveModal.querySelector(`#xai-save-template-form-${section.toLowerCase().replace(/\s/g, '-') }`);
        saveForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const templateNameInput = saveModal.querySelector(`#template-name-${section.toLowerCase().replace(/\s/g, '-') }`);
            const templateName = templateNameInput.value.trim();
            if (!templateName) {
                showToast('Please enter a template name.', 'error');
                return;
            }

            await onSaveCallback(templateName);
            bsSaveModal.hide();
            saveModal.remove();
        });

        saveModal.addEventListener('hidden.bs.modal', () => saveModal.remove(), { once: true });
    }

    /**
     * insertImage
     * -----------
     * Compresses and uploads an image for use in the rich text editor.
     * Purpose: Ensures images are compressed to reduce size and stored with a unique ID.
     *
     * @param {File} file - Image file to upload.
     * @returns {Object|null} - Object with image URL and ID, or null if failed.
     */
    async function insertImage(file) {
        if (!file) return null;

        try {
            // Compress image to max 1MB with 0.7 quality
            const compressedBlob = await compressImageMainThread(file, 1, 0.7);
            if (!compressedBlob) {
                showToast('Failed to compress image.', 'error');
                console.error('[DailyPlan Debug] Image compression failed');
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
                    console.error('[DailyPlan Debug] Failed to read compressed image file');
                    reject(new Error('Failed to read file'));
                };
                reader.readAsDataURL(compressedBlob);
            });
        } catch (err) {
            showToast('Error processing image.', 'error');
            console.error('[DailyPlan Debug] Error in insertImage:', err);
            return null;
        }
    }

    /**
     * CustomUploadAdapter
     * ------------------
     * Custom CKEditor upload adapter for handling image uploads.
     * Purpose: Integrates image compression and resizing functionality into CKEditor.
     */
    class CustomUploadAdapter {
        constructor(loader) {
            this.loader = loader;
        }

        async upload() {
            const file = await this.loader.file;
            const result = await insertImage(file);
            if (result) {
                // Create a resizable image wrapper
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'xai-image-wrapper';
                imgWrapper.innerHTML = `
                    <img src="${result.url}" data-image-id="${result.imageId}" style="max-width: 100%; height: auto;" class="xai-resizable-image" />
                    <div class="xai-resize-handle"></div>
                `;
                const img = imgWrapper.querySelector('.xai-resizable-image');
                const handle = imgWrapper.querySelector('.xai-resize-handle');
                let isResizing = false;
                let startX, startWidth, startHeight, aspectRatio;

                // Handle image resizing
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
                    const newWidth = Math.max(50, startWidth + deltaX); // Minimum width 50px
                    const newHeight = newWidth / aspectRatio;
                    img.style.width = `${newWidth}px`;
                    img.style.height = `${newHeight}px`;
                }

                function stopResizing() {
                    isResizing = false;
                    document.removeEventListener('mousemove', resizeImage);
                    document.removeEventListener('mouseup', stopResizing);
                }

                // Handle full-screen image display on click
                img.addEventListener('click', () => {
                    const fullScreenModal = document.querySelector('#fullScreenImageModal');
                    if (fullScreenModal) {
                        const fullScreenImage = fullScreenModal.querySelector('#full-screen-image');
                        if (fullScreenImage) {
                            fullScreenImage.src = result.url;
                            const bsModal = new bootstrap.Modal(fullScreenModal);
                            bsModal.show();
                        } else {
                            console.error('[DailyPlan Debug] Full-screen image element not found in modal');
                        }
                    } else {
                        console.error('[DailyPlan Debug] Full-screen image modal not found');
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

    /**
     * CustomUploadAdapterPlugin
     * ------------------------
     * Registers the custom upload adapter with CKEditor.
     * Purpose: Enables image uploads with compression and resizing in the editor.
     */
    function CustomUploadAdapterPlugin(editor) {
        editor.plugins.get('FileRepository').createUploadAdapter = (loader) => {
            return new CustomUploadAdapter(loader);
        };
    }

    /**
     * loadCKEditorScript
     * ------------------
     * Dynamically loads the CKEditor script from a CDN with fallback.
     * Purpose: Ensures CKEditor is available for rich text editing.
     *
     * @returns {Promise} - Resolves with ClassicEditor or rejects on failure.
     */
    async function loadCKEditorScript() {
        const cdnUrls = [
            'https://cdn.ckeditor.com/ckeditor5/36.0.1/classic/ckeditor.js',
            'https://cdn.ckeditor.com/ckeditor5/42.0.0/classic/ckeditor.js'
        ];

        for (const url of cdnUrls) {
            try {
                return await new Promise((resolve, reject) => {
                    if (window.ClassicEditor) {
                        console.log('[DailyPlan Debug] CKEditor already loaded');
                        resolve(window.ClassicEditor);
                        return;
                    }

                    const script = document.createElement('script');
                    script.src = url;
                    script.async = true;

                    script.onload = () => {
                        console.log('[DailyPlan Debug] CKEditor script loaded successfully from:', url);
                        if (window.ClassicEditor) {
                            resolve(window.ClassicEditor);
                        } else {
                            console.error('[DailyPlan Debug] CKEditor script loaded but ClassicEditor is undefined for:', url);
                            reject(new Error('ClassicEditor not defined after script load'));
                        }
                    };

                    script.onerror = (error) => {
                        console.error('[DailyPlan Debug] Failed to load CKEditor script from:', url, error);
                        reject(new Error(`Failed to load CKEditor script from ${url}`));
                    };

                    document.head.appendChild(script);
                });
            } catch (error) {
                console.warn('[DailyPlan Debug] Failed to load CKEditor from:', url, 'Trying next URL...');
                continue;
            }
        }

        throw new Error('All CKEditor CDN attempts failed');
    }

    /**
     * waitForCKEditor
     * ---------------
     * Waits for CKEditor to load, with polling and timeout.
     * Purpose: Ensures CKEditor is available before initializing editors.
     *
     * @param {number} timeout - Timeout in milliseconds (default: 15000).
     * @returns {Promise} - Resolves with ClassicEditor or null if failed.
     */
    async function waitForCKEditor(timeout = 15000) {
        const startTime = Date.now();
        let ClassicEditor = window.ClassicEditor;

        // Check if CKEditor is already loaded
        if (ClassicEditor) {
            console.log('[DailyPlan Debug] CKEditor found immediately');
            return ClassicEditor;
        }

        // Try loading the script dynamically
        try {
            ClassicEditor = await loadCKEditorScript();
            if (ClassicEditor) return ClassicEditor;
        } catch (error) {
            console.error('[DailyPlan Debug] Initial CKEditor load failed:', error);
        }

        // Poll for ClassicEditor
        while (!ClassicEditor && Date.now() - startTime < timeout) {
            ClassicEditor = window.ClassicEditor;
            if (ClassicEditor) {
                console.log('[DailyPlan Debug] CKEditor found during polling');
                return ClassicEditor;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.error('[DailyPlan Debug] CKEditor not loaded after timeout');
        return null;
    }

    // Initialize CKEditor for Pre-Market Game Plan
    let gamePlanEditorInstance, afterMarketReviewEditorInstance;
    let isReadonly = false;
    const gamePlanEditor = modal.querySelector('#plan-content-editor');
    if (gamePlanEditor) {
        const ClassicEditor = await waitForCKEditor();
        if (ClassicEditor) {
            try {
                gamePlanEditorInstance = await ClassicEditor.create(gamePlanEditor, {
                    toolbar: ['bold', 'italic', 'bulletedList', 'table', 'imageUpload'],
                    extraPlugins: [CustomUploadAdapterPlugin],
                    image: {
                        toolbar: ['imageStyle:full', 'imageStyle:side']
                    },
                    table: {
                        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
                    }
                });
                gamePlanEditorInstance.setData(planContent);
                console.log('[DailyPlan Debug] CKEditor initialized for Pre-Market Game Plan with toolbar:', ['bold', 'italic', 'bulletedList', 'table', 'imageUpload']);
            } catch (error) {
                console.error('[DailyPlan Debug] Error initializing CKEditor for Pre-Market Game Plan:', error);
                showToast('Failed to load editor. Displaying content in readonly mode.', 'warning');
                gamePlanEditor.innerHTML = planContent;
                gamePlanEditor.classList.add('readonly');
                isReadonly = true;
            }
        } else {
            console.error('[DailyPlan Debug] CKEditor not loaded after timeout: ClassicEditor is undefined');
            showToast('Editor not available. Displaying content in readonly mode.', 'warning');
            gamePlanEditor.innerHTML = planContent;
            gamePlanEditor.classList.add('readonly');
            isReadonly = true;
        }
    }

    // Initialize CKEditor for After Market Review
    const afterMarketReviewEditor = modal.querySelector('#after-market-review-editor');
    if (afterMarketReviewEditor) {
        const ClassicEditor = await waitForCKEditor();
        if (ClassicEditor) {
            try {
                afterMarketReviewEditorInstance = await ClassicEditor.create(afterMarketReviewEditor, {
                    toolbar: ['bold', 'italic', 'bulletedList', 'table', 'imageUpload'],
                    extraPlugins: [CustomUploadAdapterPlugin],
                    image: {
                        toolbar: ['imageStyle:full', 'imageStyle:side']
                    },
                    table: {
                        contentToolbar: ['tableColumn', 'tableRow', 'mergeTableCells']
                    }
                });
                afterMarketReviewEditorInstance.setData(afterMarketReviewContent);
                console.log('[DailyPlan Debug] CKEditor initialized for After Market Review with toolbar:', ['bold', 'italic', 'bulletedList', 'table', 'imageUpload']);
            } catch (error) {
                console.error('[DailyPlan Debug] Error initializing CKEditor for After Market Review:', error);
                showToast('Failed to load editor. Displaying content in readonly mode.', 'warning');
                afterMarketReviewEditor.innerHTML = afterMarketReviewContent;
                afterMarketReviewEditor.classList.add('readonly');
                isReadonly = true;
            }
        } else {
            console.error('[DailyPlan Debug] CKEditor not loaded after timeout: ClassicEditor is undefined');
            showToast('Editor not available. Displaying content in readonly mode.', 'warning');
            afterMarketReviewEditor.innerHTML = afterMarketReviewContent;
            afterMarketReviewEditor.classList.add('readonly');
            isReadonly = true;
        }
    }

    // Render stats and trades in the modal
    const statsDiv = modal.querySelector('#xai-daily-stats-modal');
    const tradesBody = modal.querySelector('#xai-daily-trades-body');
    if (statsDiv && tradesBody) {
        const date = new Date(dateString);
        const tradesForDate = trades.filter(t =>
            t.accountId === activeAccountId &&
            new Date(t.date).toDateString() === date.toDateString()
        );
        console.log('showDailyPlanModal stats:', { dateString, activeAccountId, tradesForDate: tradesForDate.length });

        // Calculate trade statistics
        const tradeCount = tradesForDate.length;
        const tradeCounts = {
            wins: tradesForDate.filter(t => t.outcome === 'Win').length,
            losses: tradesForDate.filter(t => t.outcome === 'Loss').length
        };
        const profitLoss = tradesForDate.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
        const winRate = calculateWinRateForDate(tradesForDate, date);

        // Render stats in the modal
        statsDiv.innerHTML = `
            <div class="xai-stat-card">
                <span class="xai-stat-label">Trades Taken</span>
                <span class="xai-stat-value">${tradeCount}</span>
            </div>
            <div class="xai-stat-card">
                <span class="xai-stat-label">Total Wins</span>
                <span class="xai-stat-value">${tradeCounts.wins}</span>
            </div>
            <div class="xai-stat-card">
                <span class="xai-stat-label">Total Losses</span>
                <span class="xai-stat-value">${tradeCounts.losses}</span>
            </div>
            <div class="xai-stat-card">
                <span class="xai-stat-label">Net P&L</span>
                <span class="xai-stat-value ${profitLoss >= 0 ? 'text-success' : 'text-danger'}">$${profitLoss.toFixed(2)}</span>
            </div>
            <div class="xai-stat-card">
                <span class="xai-stat-label">Win Rate</span>
                <span class="xai-stat-value ${winRate >= 0 ? 'text-success' : 'text-danger'}">${winRate.toFixed(2)}%</span>
            </div>
        `;

        // Render trades table in the modal
        tradesBody.innerHTML = tradesForDate.map((trade, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${trade.pair || '-'}</td>
                <td>${trade.strategy || '-'}</td>
                <td>${trade.risk ? `$${trade.risk.toFixed(2)}` : '-'}</td>
                <td>${trade.outcome || '-'}</td>
                <td class="${trade.profitLoss >= 0 ? 'text-success' : 'text-danger'}">${trade.profitLoss ? `$${trade.profitLoss.toFixed(2)}` : '-'}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="text-center">No trades for this date.</td></tr>';

        console.log('Modal stats rendered:', {
            tradeCount,
            wins: tradeCounts.wins,
            losses: tradeCounts.losses,
            profitLoss,
            winRate,
            tradesRendered: tradesForDate.length
        });
    } else {
        console.error('Missing modal DOM elements:', { statsDiv: !!statsDiv, tradesBody: !!tradesBody });
    }

    // Handle Pre-Market Game Plan template selection and deletion
    const preMarketTemplateList = modal.querySelector('#pre-market-template-list');
    if (preMarketTemplateList) {
        const preMarketTemplateSelect = modal.querySelector('#pre-market-template-select');
        const preMarketTemplateNames = preMarketTemplateList.querySelectorAll('.xai-template-name');
        preMarketTemplateNames.forEach(name => {
            name.addEventListener('click', () => {
                const templateId = parseInt(name.dataset.templateId);
                const template = preMarketTemplates.find(t => t.id === templateId);
                if (template) {
                    if (gamePlanEditorInstance && !isReadonly) {
                        gamePlanEditorInstance.setData(template.content);
                    } else {
                        gamePlanEditor.innerHTML = template.content;
                    }
                    preMarketTemplateSelect.textContent = template.name;
                }
                // Close the dropdown
                const dropdown = new bootstrap.Dropdown(preMarketTemplateSelect);
                dropdown.hide();
            });
        });

        const preMarketDeleteIcons = preMarketTemplateList.querySelectorAll('.xai-template-delete');
        preMarketDeleteIcons.forEach(icon => {
            icon.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent dropdown item selection
                const templateId = parseInt(icon.dataset.templateId);
                const storeName = icon.dataset.store;
                // Delete the specific template by ID
                await deleteFromStore(storeName, templateId);
                showToast('Template deleted successfully!', 'success');
                // Reload the modal to update the dropdown and recent templates
                bsModal.hide();
                showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans);
            });
        });

        const preMarketSaveOption = preMarketTemplateList.querySelector('.xai-save-template-option');
        preMarketSaveOption.addEventListener('click', () => {
            if (isReadonly) {
                showToast('Cannot save template in readonly mode.', 'error');
                return;
            }
            showSaveTemplateModal('Pre-Market Game Plan', gamePlanEditorInstance.getData(), async (templateName) => {
                const newTemplate = {
                    id: Date.now(),
                    name: templateName,
                    content: gamePlanEditorInstance.getData(),
                    accountId: activeAccountId
                };
                await saveToStore('preMarketTemplates', newTemplate);
                showToast('Pre-Market Game Plan template saved successfully!', 'success');
                // Reload the modal to update the dropdown and recent templates
                bsModal.hide();
                showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans);
            });
            // Close the dropdown
            const dropdown = new bootstrap.Dropdown(preMarketTemplateSelect);
            dropdown.hide();
        });
    }

    // Handle After Market Review template selection and deletion
    const afterMarketTemplateList = modal.querySelector('#after-market-template-list');
    if (afterMarketTemplateList) {
        const afterMarketTemplateSelect = modal.querySelector('#after-market-template-select');
        const afterMarketTemplateNames = afterMarketTemplateList.querySelectorAll('.xai-template-name');
        afterMarketTemplateNames.forEach(name => {
            name.addEventListener('click', () => {
                const templateId = parseInt(name.dataset.templateId);
                const template = afterMarketTemplates.find(t => t.id === templateId);
                if (template) {
                    if (afterMarketReviewEditorInstance && !isReadonly) {
                        afterMarketReviewEditorInstance.setData(template.content);
                    } else {
                        afterMarketReviewEditor.innerHTML = template.content;
                    }
                    afterMarketTemplateSelect.textContent = template.name;
                }
                // Close the dropdown
                const dropdown = new bootstrap.Dropdown(afterMarketTemplateSelect);
                dropdown.hide();
            });
        });

        const afterMarketDeleteIcons = afterMarketTemplateList.querySelectorAll('.xai-template-delete');
        afterMarketDeleteIcons.forEach(icon => {
            icon.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent dropdown item selection
                const templateId = parseInt(icon.dataset.templateId);
                const storeName = icon.dataset.store;
                // Delete the specific template by ID
                await deleteFromStore(storeName, templateId);
                showToast('Template deleted successfully!', 'success');
                // Reload the modal to update the dropdown and recent templates
                bsModal.hide();
                showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans);
            });
        });

        const afterMarketSaveOption = afterMarketTemplateList.querySelector('.xai-save-template-option');
        afterMarketSaveOption.addEventListener('click', () => {
            if (isReadonly) {
                showToast('Cannot save template in readonly mode.', 'error');
                return;
            }
            showSaveTemplateModal('After Market Review', afterMarketReviewEditorInstance.getData(), async (templateName) => {
                const newTemplate = {
                    id: Date.now(),
                    name: templateName,
                    content: afterMarketReviewEditorInstance.getData(),
                    accountId: activeAccountId
                };
                await saveToStore('afterMarketTemplates', newTemplate);
                showToast('After Market Review template saved successfully!', 'success');
                // Reload the modal to update the dropdown and recent templates
                bsModal.hide();
                showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans);
            });
            // Close the dropdown
            const dropdown = new bootstrap.Dropdown(afterMarketTemplateSelect);
            dropdown.hide();
        });
    }

    // Handle Pre-Market recent template clicks
    const preMarketRecentTemplates = modal.querySelectorAll('.xai-pre-market-recent-template');
    preMarketRecentTemplates.forEach(btn => {
        btn.addEventListener('click', () => {
            const templateId = parseInt(btn.dataset.templateId);
            const template = preMarketTemplates.find(t => t.id === templateId);
            if (template) {
                if (gamePlanEditorInstance && !isReadonly) {
                    gamePlanEditorInstance.setData(template.content);
                } else {
                    gamePlanEditor.innerHTML = template.content;
                }
            }
        });
    });

    // Handle After Market recent template clicks
    const afterMarketRecentTemplates = modal.querySelectorAll('.xai-after-market-recent-template');
    afterMarketRecentTemplates.forEach(btn => {
        btn.addEventListener('click', () => {
            const templateId = parseInt(btn.dataset.templateId);
            const template = afterMarketTemplates.find(t => t.id === templateId);
            if (template) {
                if (afterMarketReviewEditorInstance && !isReadonly) {
                    afterMarketReviewEditorInstance.setData(template.content);
                } else {
                    afterMarketReviewEditor.innerHTML = template.content;
                }
            }
        });
    });

    // Handle plan form submission
    const planForm = modal.querySelector('#xai-daily-plan-form');
    if (planForm) {
        planForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let gamePlanContent;
            if (isReadonly) {
                gamePlanContent = gamePlanEditor.innerHTML;
            } else {
                gamePlanContent = gamePlanEditorInstance.getData();
            }
            // Validate that the game plan editor content is not empty
            const plainGamePlanText = gamePlanContent.replace(/<[^>]+>/g, '').trim();
            if (!plainGamePlanText) {
                showToast('Please enter some content in the pre-market game plan.', 'error');
                return;
            }

            // Prevent plans for future dates
            if (new Date(dateString) > new Date()) {
                showToast('Cannot create a plan for a future date.', 'error');
                return;
            }
            // Validate for duplicate plans
            if (!dailyPlan && !validateDailyPlan(dateString, activeAccountId, dailyPlans)) {
                showToast('A plan for this date and account already exists.', 'error');
                return;
            }

            // Get after-market review content
            let afterMarketReviewContent;
            if (isReadonly) {
                afterMarketReviewContent = afterMarketReviewEditor ? afterMarketReviewEditor.innerHTML : dailyPlan?.afterMarketReview || '';
            } else {
                afterMarketReviewContent = afterMarketReviewEditorInstance ? afterMarketReviewEditorInstance.getData() : dailyPlan?.afterMarketReview || '';
            }

            // Create or update the daily plan
            const newPlan = {
                id: dailyPlan?.id || Date.now(),
                accountId: activeAccountId,
                date: dateString,
                gamePlan: gamePlanContent,
                afterMarketReview: afterMarketReviewContent,
                createdAt: dailyPlan?.createdAt || new Date().toISOString()
            };

            if (dailyPlan) {
                const index = dailyPlans.findIndex(p => p.id === dailyPlan.id);
                if (index !== -1) {
                    dailyPlans[index] = newPlan;
                }
            } else {
                dailyPlans.push(newPlan);
            }
            await saveToStore('dailyPlans', newPlan);
            renderDailyPlanCalendar(dailyPlans, trades, activeAccountId, accounts);
            showToast(`${dailyPlan ? 'Plan updated' : 'Plan saved'} successfully!`, 'success');
            bsModal.hide();
        });
    }

    modal.addEventListener('hidden.bs.modal', () => modal.remove(), { once: true });
}

/**
 * renderDailyPlanCalendar
 * ----------------------
 * Renders a calendar view for daily plans with trade indicators.
 * Purpose: Displays a calendar with clickable days to view or edit daily plans and trades.
 *
 * @param {Array} dailyPlans - List of daily plan objects.
 * @param {Array} trades - List of trade objects.
 * @param {string} activeAccountId - ID of the active account.
 * @param {Array} accounts - List of account objects.
 */
export function renderDailyPlanCalendar(dailyPlans, trades, activeAccountId, accounts) {
    const containerId = 'daily-plan-calendar';
    const container = document.getElementById(containerId);
    if (!container) {
        console.log('Calendar container not found:', containerId);
        showToast('Error: Calendar container not found.', 'error');
        return;
    }

    console.log('Rendering Daily Plan calendar:', {
        containerId,
        activeAccountId,
        dailyPlansCount: dailyPlans.length,
        tradesCount: trades.length,
        filteredPlans: dailyPlans.filter(p => p.accountId === activeAccountId).length,
        filteredTrades: trades.filter(t => t.accountId === activeAccountId).length
    });

    try {
        container.innerHTML = '';
        const today = new Date();
        const onDayClickHandler = async (day, dateString, dailyTrades, dailyPlan) => {
            console.log('Calendar day clicked:', { dateString, tradeCount: dailyTrades.length, hasPlan: !!dailyPlan });
            const statsDateInput = document.getElementById('stats-date');
            if (statsDateInput) {
                statsDateInput.value = dateString;
                renderDailyStats(dailyTrades, dateString, activeAccountId);
                console.log('Stats updated for date:', dateString);
            } else {
                console.log('Stats date input not found in DOM');
            }
            const planTemplates = await loadFromStore('preMarketTemplates') || [];
            showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans);
            console.log('Modal opened for date:', dateString);
        };

        // Render calendar using imported renderCalendar function
        renderCalendar({
            containerId,
            indexedTrades: indexTradesByMonth(trades),
            allTrades: trades,
            year: today.getFullYear(),
            month: today.getMonth(),
            activeAccountId,
            showBackgroundColors: false,
            showTradeDetails: false,
            showWeeklyStats: false,
            showMonthlyStats: false,
            showHeaderIcons: false,
            showNoteIcon: true,
            enableCellClick: true,
            onDayClick: onDayClickHandler,
            onNoteClick: async (dateString, dailyPlan, dailyTrades) => {
                console.log('Calendar note clicked:', { dateString, hasPlan: !!dailyPlan });
                const planTemplates = await loadFromStore('preMarketTemplates') || [];
                showDailyPlanModal(dateString, dailyPlan, dailyTrades, activeAccountId, accounts, trades, planTemplates, dailyPlans);
                console.log('Modal opened for note click on date:', dateString);
            },
            callerPage: 'dailyPlan' // Indicate Daily Plan page
        });

        // Ensure day cells are clickable by setting data-has-trades
        setTimeout(() => {
            const days = container.querySelectorAll('.calendar-day');
            console.log('Found calendar days:', days.length);
            days.forEach(day => {
                const dayNumber = parseInt(day.dataset.day);
                if (!dayNumber) {
                    console.log('Skipping empty day');
                    return;
                }
                day.dataset.hasTrades = 'true';
            });
        }, 100);

        console.log('Calendar rendering completed for:', containerId);
    } catch (err) {
        console.error('Error rendering Daily Plan calendar:', err);
        showToast('Error rendering calendar.', 'error');
        container.innerHTML = '<p class="text-danger">Failed to load calendar. Please try again.</p>';
    }
}

/**
 * initializeDailyPlanPage
 * -----------------------
 * Initializes the Daily Plan page by rendering the calendar if the page is active.
 * Purpose: Sets up the Daily Plan page with the calendar view on page load.
 *
 * @param {Array} dailyPlans - List of daily plan objects.
 * @param {Object} settings - Application settings, including activeAccountId.
 * @param {Array} accounts - List of account objects.
 * @param {Array} trades - List of trade objects.
 */
export async function initializeDailyPlanPage(dailyPlans, settings, accounts, trades) {
    const page = document.getElementById('daily-plan');
    if (!page || !page.classList.contains('active')) {
        console.log('Daily Plan page not active, skipping initialization');
        return;
    }

    console.log('Initializing Daily Plan page');
    renderDailyPlanCalendar(dailyPlans, trades, settings.activeAccountId, accounts);
}