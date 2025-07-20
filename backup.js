import { showToast, blobToBase64, base64ToBlob } from './utils.js';
import { loadFromStore, saveToStore, deleteFromStore, getDB, openDB } from './data.js';

let lastBackupTime = 0;
const MIN_BACKUP_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Schedules automatic backups at a user-defined interval.
 * 
 * WHY: Ensures user data is regularly saved without manual effort,
 *      protecting against data loss from crashes or device failure.
 */
export async function scheduleAutoBackup(trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs) {
    try {
        // Determine backup frequency from settings
        const frequency = settings.backupFrequency || { type: 'daily', interval: 1 };
        let intervalMs;
        switch (frequency.type) {
            case 'every-save':
                // No interval needed; backup is triggered on save events
                return;
            case 'daily':
                intervalMs = 24 * 60 * 60 * 1000; // 1 day
                break;
            case 'weekly':
                intervalMs = 7 * 24 * 60 * 60 * 1000; // 1 week
                break;
            case 'custom':
                intervalMs = (frequency.interval || 1) * 24 * 60 * 60 * 1000;
                break;
            default:
                console.warn('Invalid backup frequency, defaulting to daily:', frequency.type);
                intervalMs = 24 * 60 * 60 * 1000;
        }

        // Clear any existing interval
        if (window.autoBackupInterval) {
            clearInterval(window.autoBackupInterval);
        }

        // Set up new interval for auto-backup
        window.autoBackupInterval = setInterval(async () => {
            console.log('Running scheduled auto-backup');
            await autoBackup(trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs);
        }, intervalMs);

        console.log(`Scheduled auto-backup with frequency: ${frequency.type}, interval: ${frequency.interval || 1} days`);
    } catch (err) {
        showToast(`Error scheduling auto-backup: ${err.message}`, 'error');
        console.error('Auto-backup scheduling error:', err);
    }
}

/**
 * Manually creates a backup of all app data, including images and screenshots.
 * Offers both JSON and ZIP download.
 * 
 * WHY: Lets users save, migrate, or share their data. 
 *      Essential for user trust and for compliance with best practices in data management.
 */
export async function backupData() {
    console.time('backupData');
    try {
        // List of all stores to backup
        const stores = [
            'trades', 'strategies', 'reflections', 'dailyPlans', 'weeklyReviews', 'settings', 
            'accounts', 'pairs', 'columnPrefs', 'deleted', 'analytics', 'afterMarketTemplates', 
            'brokers', 'dashboard', 'images', 'planTemplates', 'preMarketTemplates', 
            'reportTemplates', 'strategyVersions', 'weeklyReviewTemplates'
        ];
        const data = {};

        // Load all data from stores
        for (const store of stores) {
            try {
                data[store] = await loadFromStore(store);
            } catch (err) {
                throw new Error(`Failed to load ${store}: ${err.message}`);
            }
        }

        // Convert trade screenshots to base64 using a web worker
        const tradesWithBase64 = await new Promise((resolve) => {
            const worker = new Worker('backupWorker.js');
            worker.onmessage = ({ data }) => resolve(data);
            worker.onerror = (err) => {
                throw new Error(`Backup worker error: ${err.message}`);
            };
            worker.postMessage({ trades: data.trades });
        });

        // Convert reflection screenshots to base64
        const reflectionsWithBase64 = await Promise.all(data.reflections.map(async reflection => {
            const reviewScreenshot = reflection.reviewScreenshot instanceof Blob ? {
                base64: await blobToBase64(reflection.reviewScreenshot),
                filename: `review_screenshot_trade_${reflection.tradeId}.jpg`
            } : null;
            return { ...reflection, reviewScreenshot };
        }));

        // Convert images to base64
        const imagesWithBase64 = await Promise.all(data.images.map(async image => {
            const blob = image.blob instanceof Blob ? {
                base64: await blobToBase64(image.blob),
                filename: `image_${image.id}.jpg`
            } : null;
            return { ...image, blob };
        }));

        // Prepare backup object
        const backup = {
            ...data,
            trades: tradesWithBase64,
            reflections: reflectionsWithBase64,
            images: imagesWithBase64
        };

        // --- JSON Backup ---
        const jsonBlob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
        const jsonUrl = URL.createObjectURL(jsonBlob);
        const jsonLink = document.createElement('a');
        jsonLink.href = jsonUrl;
        jsonLink.download = 'prop_challenge_backup.json';
        jsonLink.click();
        URL.revokeObjectURL(jsonUrl);

        // --- ZIP Backup with Screenshots ---
        const zip = new JSZip();
        zip.file('backup.json', JSON.stringify(backup));
        const imagesFolder = zip.folder('screenshots');
        // Add trade screenshots
        tradesWithBase64.forEach(trade => {
            trade.screenshots.forEach(img => {
                if (img.base64) {
                    const base64Data = img.base64.replace(/^data:image\/[a-z]+;base64,/, '');
                    imagesFolder.file(img.filename, base64Data, { base64: true });
                }
            });
        });
        // Add reflection screenshots
        reflectionsWithBase64.forEach(reflection => {
            if (reflection.reviewScreenshot?.base64) {
                const base64Data = reflection.reviewScreenshot.base64.replace(/^data:image\/[a-z]+;base64,/, '');
                imagesFolder.file(reflection.reviewScreenshot.filename, base64Data, { base64: true });
            }
        });
        // Add other images
        imagesWithBase64.forEach(image => {
            if (image.blob?.base64) {
                const base64Data = image.blob.base64.replace(/^data:image\/[a-z]+;base64,/, '');
                imagesFolder.file(image.blob.filename, base64Data, { base64: true });
            }
        });

        // Generate and download ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(zipBlob);
        const zipLink = document.createElement('a');
        zipLink.href = zipUrl;
        zipLink.download = 'prop_challenge_backup.zip';
        zipLink.click();
        URL.revokeObjectURL(zipUrl);

        showToast('Backup created successfully! Downloaded JSON and ZIP with screenshots.', 'success');
    } catch (err) {
        showToast(`Error creating backup: ${err.message}`, 'error');
        console.error('Backup error:', err);
    } finally {
        console.timeEnd('backupData');
    }
}

/**
 * Imports backup data from a file, restores all stores, and reloads the app.
 * 
 * WHY: Lets users recover from data loss, move data between devices, or migrate to a new installation.
 */
export async function importData(file, trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs, initializeData) {
    console.time('importData');
    try {
        // Parse backup file
        const text = await file.text();
        const data = JSON.parse(text);

        // Clear all IndexedDB stores
        const db = getDB();
        const storeNames = [
            'trades', 'strategies', 'reflections', 'dailyPlans', 'weeklyReviews', 'settings', 
            'accounts', 'pairs', 'columnPrefs', 'deleted', 'analytics', 'afterMarketTemplates', 
            'brokers', 'dashboard', 'images', 'planTemplates', 'preMarketTemplates', 
            'reportTemplates', 'strategyVersions', 'weeklyReviewTemplates'
        ];
        const transaction = db.transaction(storeNames, 'readwrite');
        await Promise.all(storeNames.map(storeName => {
            return new Promise((resolve, reject) => {
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }));

        // Clear in-memory arrays
        trades.length = 0;
        strategies.length = 0;
        reflections.length = 0;
        dailyPlans.length = 0;
        weeklyReviews.length = 0;
        accounts.length = 0;
        pairs.length = 0;

        // Convert base64 images back to Blobs
        const tradesWithBlobs = await Promise.all((data.trades || []).map(async trade => {
            const screenshots = await Promise.all((trade.screenshots || []).map(async img => ({
                blob: img.base64 ? base64ToBlob(img.base64) : null,
                caption: img.caption,
                url: img.base64 ? URL.createObjectURL(base64ToBlob(img.base64)) : ''
            })));
            return { ...trade, screenshots, screenshotFilenames: undefined };
        }));

        const reflectionsWithBlobs = await Promise.all((data.reflections || []).map(async reflection => {
            const reviewScreenshot = reflection.reviewScreenshot?.base64 ? 
                URL.createObjectURL(base64ToBlob(reflection.reviewScreenshot.base64)) : null;
            return { ...reflection, reviewScreenshot };
        }));

        const imagesWithBlobs = await Promise.all((data.images || []).map(async image => {
            const blob = image.blob?.base64 ? base64ToBlob(image.blob.base64) : null;
            return { ...image, blob };
        }));

        // Populate arrays with deduplicated data
        trades.push(...tradesWithBlobs);
        strategies.push(...(data.strategies || []));
        reflections.push(...reflectionsWithBlobs);
        dailyPlans.push(...(data.dailyPlans || []));
        weeklyReviews.push(...(data.weeklyReviews || []));

        // Deduplicate accounts and pairs
        const uniqueAccounts = Array.from(new Map((data.accounts || []).map(a => [a.id, a])).values());
        accounts.push(...uniqueAccounts);

        const uniquePairs = Array.from(new Map((data.pairs || []).map(p => [p.id, p])).values());
        const uniquePairsByName = Array.from(new Map(uniquePairs.map(p => [p.name, p])).values());
        pairs.push(...uniquePairsByName);

        // Restore settings
        Object.assign(settings, data.settings?.[0] || settings);

        // Save all data back to IndexedDB
        await Promise.all([
            ...tradesWithBlobs.map(trade => saveToStore('trades', trade)),
            ...(data.strategies || []).map(strategy => saveToStore('strategies', strategy)),
            ...reflectionsWithBlobs.map(reflection => saveToStore('reflections', reflection)),
            ...(data.dailyPlans || []).map(plan => saveToStore('dailyPlans', plan)),
            ...(data.weeklyReviews || []).map(review => saveToStore('weeklyReviews', review)),
            saveToStore('settings', { id: 'settings', ...settings }),
            ...uniqueAccounts.map(account => saveToStore('accounts', account)),
            ...uniquePairsByName.map(pair => saveToStore('pairs', pair)),
            ...(data.columnPrefs || []).map(prefs => saveToStore('columnPrefs', prefs)),
            ...(data.deleted || []).map(deleted => saveToStore('deleted', deleted)),
            ...(data.analytics || []).map(analytic => saveToStore('analytics', analytic)),
            ...(data.afterMarketTemplates || []).map(template => saveToStore('afterMarketTemplates', template)),
            ...(data.brokers || []).map(broker => saveToStore('brokers', broker)),
            ...(data.dashboard || []).map(dash => saveToStore('dashboard', dash)),
            ...imagesWithBlobs.map(image => saveToStore('images', image)),
            ...(data.planTemplates || []).map(template => saveToStore('planTemplates', template)),
            ...(data.preMarketTemplates || []).map(template => saveToStore('preMarketTemplates', template)),
            ...(data.reportTemplates || []).map(template => saveToStore('reportTemplates', template)),
            ...(data.strategyVersions || []).map(version => saveToStore('strategyVersions', version)),
            ...(data.weeklyReviewTemplates || []).map(template => saveToStore('weeklyReviewTemplates', template))
        ]);

        // Re-initialize app data and reload
        await initializeData();
        showToast('Backup restored successfully! Reloading page...', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1500); // 1.5 seconds to show toast
    } catch (err) {
        showToast(`Error importing data: ${err.message}`, 'error');
        console.error('Import error:', err);
    } finally {
        console.timeEnd('importData');
    }
}

/**
 * Performs an automatic backup, applies retention policy, and optionally downloads backup.
 * 
 * WHY: Provides hands-off, regular data protection for users. 
 *      Retention policy prevents storage from filling up with too many backups.
 */
export async function autoBackup(trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs) {
    console.time('autoBackup');
    try {
        const now = Date.now();
        if (now - lastBackupTime < MIN_BACKUP_INTERVAL_MS) {
            console.log('Auto-backup skipped: too soon since last backup');
            return;
        }
        lastBackupTime = now;
        console.log('Triggering auto-backup at:', new Date().toISOString());

        // Convert trade screenshots to base64
        const tradesWithBase64 = await Promise.all(trades.map(async trade => {
            const screenshots = await Promise.all((trade.screenshots || []).map(async (img, i) => ({
                base64: img.blob instanceof Blob ? await blobToBase64(img.blob) : '',
                caption: img.caption,
                filename: `trade_${trade.id}_image_${i + 1}.jpg`
            })));
            return { ...trade, screenshots };
        }));

        // Convert reflection screenshots to base64
        const reflectionsWithBase64 = await Promise.all(reflections.map(async reflection => {
            const reviewScreenshot = reflection.reviewScreenshot instanceof Blob ? {
                base64: await blobToBase64(reflection.reviewScreenshot),
                filename: `review_screenshot_trade_${reflection.tradeId}.jpg`
            } : null;
            return { ...reflection, reviewScreenshot };
        }));

        // Convert images to base64
        const imagesWithBase64 = await Promise.all((await loadFromStore('images')).map(async image => {
            const blob = image.blob instanceof Blob ? {
                base64: await blobToBase64(image.blob),
                filename: `image_${image.id}.jpg`
            } : null;
            return { ...image, blob };
        }));

        // Prepare backup data
        const data = {
            trades: tradesWithBase64,
            strategies,
            reflections: reflectionsWithBase64,
            dailyPlans,
            weeklyReviews,
            settings: [{ id: 'settings', ...settings }],
            accounts,
            pairs,
            columnPrefs: await loadFromStore('columnPrefs'),
            deleted: await loadFromStore('deleted'),
            analytics: await loadFromStore('analytics'),
            afterMarketTemplates: await loadFromStore('afterMarketTemplates'),
            brokers: await loadFromStore('brokers'),
            dashboard: await loadFromStore('dashboard'),
            images: imagesWithBase64,
            planTemplates: await loadFromStore('planTemplates'),
            preMarketTemplates: await loadFromStore('preMarketTemplates'),
            reportTemplates: await loadFromStore('reportTemplates'),
            strategyVersions: await loadFromStore('strategyVersions'),
            weeklyReviewTemplates: await loadFromStore('weeklyReviewTemplates')
        };

        // Save backup to IndexedDB
        const backup = JSON.stringify(data);
        const timestamp = new Date().toISOString();
        await saveToStore('backups', { timestamp, data: backup });

        // --- Retention Policy ---
        const retention = settings.backupRetention || { maxBackups: 10, maxAgeDays: 30 };
        const backups = await loadFromStore('backups');
        const sortedBackups = backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retention.maxAgeDays);

        // Delete old backups
        const backupsToDelete = sortedBackups.filter((b, index) => 
            index >= retention.maxBackups || new Date(b.timestamp) < cutoffDate
        );
        await Promise.all(backupsToDelete.map(b => deleteFromStore('backups', b.timestamp)));
        console.log(`Deleted ${backupsToDelete.length} old backups per retention policy: max ${retention.maxBackups}, age ${retention.maxAgeDays} days`);

        // Optionally download backup file
        if (settings.autoBackupDownload) {
            const jsonBlob = new Blob([backup], { type: 'application/json' });
            const jsonUrl = URL.createObjectURL(jsonBlob);
            const jsonLink = document.createElement('a');
            jsonLink.href = jsonUrl;
            jsonLink.download = `prop_challenge_autobackup_${timestamp}.json`;
            jsonLink.click();
            URL.revokeObjectURL(jsonUrl);
            showToast('Auto-backup created and downloaded successfully!', 'success');
        } else {
            showToast('Auto-backup created successfully!', 'success');
        }

        // Update restore select dropdown if present
        const updatedBackups = await loadFromStore('backups');
        const restoreSelect = document.getElementById('restore-backup');
        if (restoreSelect) {
            restoreSelect.innerHTML = '<option value="">Select Auto-Backup</option>' + 
                updatedBackups.map(b => `<option value="${b.timestamp}">${new Date(b.timestamp).toLocaleString()}</option>`).join('');
        }

    } catch (err) {
        showToast(`Error creating auto-backup: ${err.message}`, 'error');
        console.error('Auto-backup error:', err);
    } finally {
        console.timeEnd('autoBackup');
    }
}

/**
 * Initializes backup-related UI and binds event listeners for settings.
 * 
 * WHY: Ensures the UI is in sync with backup settings and that any changes the user makes
 *      are saved and applied immediately. Also ensures the backup system is running on app load.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const backupFrequencySelect = document.getElementById('backup-frequency');
    const customIntervalInput = document.getElementById('custom-interval');
    const customIntervalDiv = document.getElementById('custom-backup-interval');
    const maxBackupsInput = document.getElementById('max-backups');
    const maxAgeDaysInput = document.getElementById('max-age-days');
    const autoBackupDownloadCheckbox = document.getElementById('auto-backup-download');

    // Initialize UI with stored settings
    const initializeUI = async () => {
        try {
            const settings = await loadFromStore('settings').then(s => s[0] || { id: 'settings', backupFrequency: { type: 'daily', interval: 1 }, backupRetention: { maxBackups: 10, maxAgeDays: 30 }, autoBackupDownload: true });
            console.log('Loaded settings for UI initialization:', settings);

            if (backupFrequencySelect && settings.backupFrequency) {
                backupFrequencySelect.value = settings.backupFrequency.type || 'daily';
                customIntervalDiv.classList.toggle('d-none', settings.backupFrequency.type !== 'custom');
            }
            if (customIntervalInput && settings.backupFrequency) {
                customIntervalInput.value = settings.backupFrequency.interval || 1;
            }
            if (maxBackupsInput && settings.backupRetention) {
                maxBackupsInput.value = settings.backupRetention.maxBackups || 10;
            }
            if (maxAgeDaysInput && settings.backupRetention) {
                maxAgeDaysInput.value = settings.backupRetention.maxAgeDays || 30;
            }
            if (autoBackupDownloadCheckbox) {
                autoBackupDownloadCheckbox.checked = settings.autoBackupDownload !== false;
            }
        } catch (err) {
            showToast(`Error loading settings for UI: ${err.message}`, 'error');
            console.error('UI initialization error:', err);
        }
    };

    // --- Event Listeners for Settings ---

    // Backup frequency change
    if (backupFrequencySelect) {
        backupFrequencySelect.addEventListener('change', async () => {
            // WHY: Lets user change how often backups are made (daily, weekly, custom)
            const type = backupFrequencySelect.value;
            customIntervalDiv.classList.toggle('d-none', type !== 'custom');
            const interval = type === 'custom' ? parseInt(customIntervalInput.value) || 1 : 1;
            try {
                const settings = await loadFromStore('settings').then(s => s[0] || { id: 'settings' });
                settings.backupFrequency = { type, interval };
                await saveToStore('settings', settings);
                console.log('Updated backupFrequency:', settings.backupFrequency);
                await scheduleAutoBackup(
                    await loadFromStore('trades'),
                    await loadFromStore('strategies'),
                    await loadFromStore('reflections'),
                    await loadFromStore('dailyPlans'),
                    await loadFromStore('weeklyReviews'),
                    settings,
                    await loadFromStore('accounts'),
                    await loadFromStore('pairs')
                );
                showToast('Backup frequency updated successfully!', 'success');
            } catch (err) {
                showToast(`Error updating backup frequency: ${err.message}`, 'error');
                console.error('Backup frequency update error:', err);
            }
        });
    }

    // Custom interval change
    if (customIntervalInput) {
        customIntervalInput.addEventListener('change', async () => {
            // WHY: Lets user set a custom backup interval (in days)
            if (backupFrequencySelect.value === 'custom') {
                const interval = parseInt(customIntervalInput.value) || 1;
                try {
                    const settings = await loadFromStore('settings').then(s => s[0] || { id: 'settings' });
                    settings.backupFrequency = { type: 'custom', interval };
                    await saveToStore('settings', settings);
                    console.log('Updated custom backup interval:', settings.backupFrequency);
                    await scheduleAutoBackup(
                        await loadFromStore('trades'),
                        await loadFromStore('strategies'),
                        await loadFromStore('reflections'),
                        await loadFromStore('dailyPlans'),
                        await loadFromStore('weeklyReviews'),
                        settings,
                        await loadFromStore('accounts'),
                        await loadFromStore('pairs')
                    );
                    showToast('Custom backup interval updated successfully!', 'success');
                } catch (err) {
                    showToast(`Error updating custom backup interval: ${err.message}`, 'error');
                    console.error('Custom backup interval update error:', err);
                }
            }
        });
    }

    // Retention policy change
    if (maxBackupsInput && maxAgeDaysInput) {
        const updateRetention = async () => {
            // WHY: Lets user control how many backups are kept and for how long
            const maxBackups = parseInt(maxBackupsInput.value) || 10;
            const maxAgeDays = parseInt(maxAgeDaysInput.value) || 30;
            try {
                const settings = await loadFromStore('settings').then(s => s[0] || { id: 'settings' });
                settings.backupRetention = { maxBackups, maxAgeDays };
                await saveToStore('settings', settings);
                console.log('Updated backupRetention:', settings.backupRetention);
                showToast('Backup retention policy updated successfully!', 'success');
            } catch (err) {
                showToast(`Error updating backup retention: ${err.message}`, 'error');
                console.error('Backup retention update error:', err);
            }
        };
        maxBackupsInput.addEventListener('change', updateRetention);
        maxAgeDaysInput.addEventListener('change', updateRetention);
    }

    // Auto-backup download toggle
    if (autoBackupDownloadCheckbox) {
        autoBackupDownloadCheckbox.addEventListener('change', async () => {
            // WHY: Lets user choose if backups should be automatically downloaded to their device
            try {
                const settings = await loadFromStore('settings').then(s => s[0] || { id: 'settings' });
                settings.autoBackupDownload = autoBackupDownloadCheckbox.checked;
                await saveToStore('settings', settings);
                console.log('Updated autoBackupDownload:', settings.autoBackupDownload);
                showToast('Auto-backup download setting updated successfully!', 'success');
            } catch (err) {
                showToast(`Error updating auto-backup download setting: ${err.message}`, 'error');
                console.error('Auto-backup download update error:', err);
            }
        });
    }

    // --- Initialize database and UI ---
    try {
        await openDB();
        console.log('IndexedDB initialized successfully');
        await initializeUI();
        const [trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs] = await Promise.all([
            loadFromStore('trades'),
            loadFromStore('strategies'),
            loadFromStore('reflections'),
            loadFromStore('dailyPlans'),
            loadFromStore('weeklyReviews'),
            loadFromStore('settings').then(s => s[0] || { id: 'settings' }),
            loadFromStore('accounts'),
            loadFromStore('pairs')
        ]);
        await scheduleAutoBackup(trades, strategies, reflections, dailyPlans, weeklyReviews, settings, accounts, pairs);
    } catch (err) {
        showToast(`Error initializing database or backup schedule: ${err.message}`, 'error');
        console.error('Initialization error:', err);
    }
});