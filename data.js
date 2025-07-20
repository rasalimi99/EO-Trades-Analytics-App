// Database configuration constants
const dbName = 'PropChallengeTrackerDB'; // Name of the IndexedDB database
const dbVersion = 41; // Database version, incremented to 41 to support timezone fields
let db; // Global reference to the opened IndexedDB database instance

// Import utility function for displaying toast notifications
import { showToast } from './utils.js';

// Opens and initializes the IndexedDB database, creating or upgrading the schema as needed
// Purpose: Establishes a connection to the IndexedDB database and ensures the schema is up-to-date
export async function openDB() {
    console.time('openDB'); // Start performance timer for debugging
    return new Promise((resolve, reject) => {
        // Request to open the database with the specified name and version
        const request = indexedDB.open(dbName, dbVersion);

        // Handle schema creation or upgrade when the database version changes
        request.onupgradeneeded = (event) => {
            db = event.target.result; // Store the database instance
            try {
                // Create or update 'trades' store
                if (!db.objectStoreNames.contains('trades')) {
                    const tradeStore = db.createObjectStore('trades', { keyPath: 'id', autoIncrement: true });
                    tradeStore.createIndex('date', 'date', { unique: false });
                    tradeStore.createIndex('pair', 'pair', { unique: false });
                    tradeStore.createIndex('outcome', 'outcome', { unique: false });
                    tradeStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created trades object store with indexes');
                } else {
                    // Ensure indexes exist on existing 'trades' store
                    const tradeStore = event.target.transaction.objectStore('trades');
                    if (!tradeStore.indexNames.contains('date')) {
                        tradeStore.createIndex('date', 'date', { unique: false });
                    }
                    if (!tradeStore.indexNames.contains('pair')) {
                        tradeStore.createIndex('pair', 'pair', { unique: false });
                    }
                    if (!tradeStore.indexNames.contains('outcome')) {
                        tradeStore.createIndex('outcome', 'outcome', { unique: false });
                    }
                    if (!tradeStore.indexNames.contains('accountId')) {
                        tradeStore.createIndex('accountId', 'accountId', { unique: false });
                    }
                }

                // Create or update 'strategies' store
                if (!db.objectStoreNames.contains('strategies')) {
                    const strategyStore = db.createObjectStore('strategies', { keyPath: 'id', autoIncrement: true });
                    strategyStore.createIndex('accountId', 'accountId', { unique: false });
                    strategyStore.createIndex('marketType', 'marketType', { unique: false });
                    strategyStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    console.log('Created strategies object store with indexes');
                } else {
                    // Ensure indexes exist and migrate existing strategies
                    const strategyStore = event.target.transaction.objectStore('strategies');
                    if (!strategyStore.indexNames.contains('accountId')) {
                        strategyStore.createIndex('accountId', 'accountId', { unique: false });
                    }
                    if (!strategyStore.indexNames.contains('marketType')) {
                        strategyStore.createIndex('marketType', 'marketType', { unique: false });
                    }
                    if (!strategyStore.indexNames.contains('tags')) {
                        strategyStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    }
                    // Migrate existing strategies to new schema
                    const request = strategyStore.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const strategy = cursor.value;
                            if (!strategy.marketType) {
                                strategy.marketType = 'forex';
                                strategy.timeframes = ['H1'];
                                strategy.tags = [];
                                strategy.entryConditions = [{ id: 'cond1', type: 'Other', description: strategy.rules || 'Default entry', params: {} }];
                                strategy.exitConditions = [{ id: 'cond2', type: 'Other', description: 'Default exit', params: {} }];
                                strategy.riskSettings = { riskPercent: 0.5, stopLossPips: 10, rr: 2 };
                                strategy.description = strategy.rules || '';
                                strategy.createdAt = new Date().toISOString();
                                strategy.lastUsed = null;
                                delete strategy.rules;
                                cursor.update(strategy);
                                console.log(`Updated strategy ${strategy.name} with new schema`);
                            }
                            cursor.continue();
                        }
                    };
                }

                // Create 'strategyVersions' store if it doesn't exist
                if (!db.objectStoreNames.contains('strategyVersions')) {
                    db.createObjectStore('strategyVersions', { keyPath: 'id', autoIncrement: true });
                    console.log('Created strategyVersions object store');
                }

                // Create 'reflections' store if it doesn't exist
                if (!db.objectStoreNames.contains('reflections')) {
                    db.createObjectStore('reflections', { keyPath: 'tradeId' });
                    console.log('Created reflections object store');
                }

                // Create 'dailyPlans' store if it doesn't exist
                if (!db.objectStoreNames.contains('dailyPlans')) {
                    db.createObjectStore('dailyPlans', { keyPath: 'id', autoIncrement: true });
                    console.log('Created dailyPlans object store');
                }

                // Create 'planTemplates' store with index
                if (!db.objectStoreNames.contains('planTemplates')) {
                    const planTemplateStore = db.createObjectStore('planTemplates', { keyPath: 'id', autoIncrement: true });
                    planTemplateStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created planTemplates object store with accountId index');
                }

                // Create 'preMarketTemplates' store with index
                if (!db.objectStoreNames.contains('preMarketTemplates')) {
                    const preMarketTemplateStore = db.createObjectStore('preMarketTemplates', { keyPath: 'id', autoIncrement: true });
                    preMarketTemplateStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created preMarketTemplates object store with accountId index');
                }

                // Create 'afterMarketTemplates' store with index
                if (!db.objectStoreNames.contains('afterMarketTemplates')) {
                    const afterMarketTemplateStore = db.createObjectStore('afterMarketTemplates', { keyPath: 'id', autoIncrement: true });
                    afterMarketTemplateStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created afterMarketTemplates object store with accountId index');
                }

                // Create 'weeklyReviews' store with index
                if (!db.objectStoreNames.contains('weeklyReviews')) {
                    const weeklyReviewStore = db.createObjectStore('weeklyReviews', { keyPath: 'id', autoIncrement: true });
                    weeklyReviewStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created weeklyReviews object store with accountId index');
                }

                // Create 'weeklyReviewTemplates' store with index
                if (!db.objectStoreNames.contains('weeklyReviewTemplates')) {
                    const weeklyReviewTemplateStore = db.createObjectStore('weeklyReviewTemplates', { keyPath: 'id', autoIncrement: true });
                    weeklyReviewTemplateStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created weeklyReviewTemplates object store with accountId index');
                }

                // Create or update 'settings' store
                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'id' });
                    settingsStore.put({
                        id: 'settings',
                        tradingWindow: { start: null, end: null },
                        activeAccountId: null,
                        backupFrequency: { type: 'daily', interval: 1 },
                        backupRetention: { maxBackups: 10, maxAgeDays: 30 },
                        autoBackupDownload: true,
                        conditionTypes: ['Price Action'],
                        targetTimezone: 'UTC' // Default timezone for consistency
                    });
                    console.log('Created settings store with targetTimezone');
                } else {
                    // Update existing settings with new fields
                    const settingsStore = event.target.transaction.objectStore('settings');
                    const request = settingsStore.get('settings');
                    request.onsuccess = () => {
                        const settingsData = request.result || {};
                        if (!settingsData.backupFrequency) {
                            settingsData.backupFrequency = { type: 'daily', interval: 1 };
                        }
                        if (!settingsData.backupRetention) {
                            settingsData.backupRetention = { maxBackups: 10, maxAgeDays: 30 };
                        }
                        if (!settingsData.conditionTypes) {
                            settingsData.conditionTypes = ['Price Action'];
                        }
                        if (!settingsData.targetTimezone) {
                            settingsData.targetTimezone = 'UTC';
                        }
                        settingsStore.put(settingsData);
                        console.log('Updated settings with targetTimezone');
                    };
                }

                // Create 'reportTemplates' store with index
                if (!db.objectStoreNames.contains('reportTemplates')) {
                    const templateStore = db.createObjectStore('reportTemplates', { keyPath: 'id' });
                    templateStore.createIndex('accountId', 'accountId', { unique: false });
                    console.log('Created reportTemplates object store with accountId index');
                }

                // Create 'analytics' store if it doesn't exist
                if (!db.objectStoreNames.contains('analytics')) {
                    db.createObjectStore('analytics', { keyPath: 'id' });
                    console.log('Created analytics object store');
                }

                // Create 'deleted' store if it doesn't exist
                if (!db.objectStoreNames.contains('deleted')) {
                    db.createObjectStore('deleted', { keyPath: 'id' });
                    console.log('Created deleted object store');
                }

                // Create 'backups' store if it doesn't exist
                if (!db.objectStoreNames.contains('backups')) {
                    db.createObjectStore('backups', { keyPath: 'timestamp' });
                    console.log('Created backups object store');
                }

                // Create 'images' store if it doesn't exist
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
                    console.log('Created images object store');
                }

                // Create 'columnPrefs' store if it doesn't exist
                if (!db.objectStoreNames.contains('columnPrefs')) {
                    db.createObjectStore('columnPrefs', { keyPath: 'id' });
                    console.log('Created columnPrefs object store');
                }

                // Create or update 'brokers' store
                if (!db.objectStoreNames.contains('brokers')) {
                    const brokerStore = db.createObjectStore('brokers', { keyPath: 'id', autoIncrement: true });
                    brokerStore.createIndex('name', 'name', { unique: true });
                    console.log('Created brokers object store with name index');
                } else {
                    // Migrate existing brokers with new fields
                    const brokerStore = event.target.transaction.objectStore('brokers');
                    const cursorRequest = brokerStore.openCursor();
                    cursorRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const broker = cursor.value;
                            if (!broker.multipliers) {
                                broker.multipliers = {
                                    forex: 10,
                                    indices: 1,
                                    commodities: 1,
                                    crypto: 0.01,
                                    commodities_exceptions: { XAGUSD: 5, XAUUSD: 100 }
                                };
                            }
                            if (!broker.timezone) {
                                broker.timezone = 'UTC';
                            }
                            cursor.update(broker);
                            console.log(`Updated broker ${broker.name} with default multipliers and timezone`);
                            cursor.continue();
                        }
                    };
                }

                // Create 'accounts' store if it doesn't exist
                if (!db.objectStoreNames.contains('accounts')) {
                    db.createObjectStore('accounts', { keyPath: 'id', autoIncrement: true });
                    console.log('Created accounts object store');
                }

                // Create or update 'pairs' store
                if (!db.objectStoreNames.contains('pairs')) {
                    const pairStore = db.createObjectStore('pairs', { keyPath: 'id', autoIncrement: true });
                    pairStore.createIndex('name', 'name', { unique: true });
                    pairStore.createIndex('market_type', 'market_type', { unique: false });
                    console.log('Created pairs object store with name and market_type indexes');
                } else {
                    // Ensure indexes and migrate existing pairs
                    const pairStore = event.target.transaction.objectStore('pairs');
                    if (!pairStore.indexNames.contains('name')) {
                        pairStore.createIndex('name', 'name', { unique: true });
                    }
                    if (!pairStore.indexNames.contains('market_type')) {
                        pairStore.createIndex('market_type', 'market_type', { unique: false });
                        console.log('Added market_type index to pairs store');
                    }
                    const request = pairStore.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const pair = cursor.value;
                            if (!pair.hasOwnProperty('market_type')) {
                                pair.market_type = ['SPX500', 'US30', 'NDX100', 'NAS100'].includes(pair.name) ? 'indices' :
                                                  ['XAUUSD', 'XAGUSD'].includes(pair.name) ? 'commodities' :
                                                  'forex';
                                cursor.update(pair);
                                console.log(`Updated pair ${pair.name} with market_type: ${pair.market_type}`);
                            }
                            cursor.continue();
                        }
                    };
                    request.onerror = (err) => {
                        console.error('Error migrating pairs:', err);
                        showToast('Error migrating pairs data.', 'error');
                    };
                }

                // Create 'dashboard' store if it doesn't exist
                if (!db.objectStoreNames.contains('dashboard')) {
                    db.createObjectStore('dashboard', { keyPath: 'id' });
                    console.log('Created dashboard object store');
                }

                console.log('IndexedDB schema created or updated to version', dbVersion);
            } catch (err) {
                showToast('Error updating database schema.', 'error');
                console.error('Schema update error:', err);
                reject(err);
            }
        };

        // Handle successful database opening
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('IndexedDB opened successfully');
            resolve(db);
            console.timeEnd('openDB');
        };

        // Handle database opening errors
        request.onerror = (event) => {
            showToast('Error opening database.', 'error');
            console.error('IndexedDB open error:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Returns the current database instance, ensuring it has been initialized
// Purpose: Provides access to the database instance for other functions
export function getDB() {
    if (!db) {
        throw new Error('IndexedDB not initialized. Call openDB first.');
    }
    return db;
}

// Saves data to a specified store in the database
// Purpose: Provides a generic method to store data in any object store
export async function saveToStore(storeName, data) {
    const db = getDB(); // Get the database instance
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    return new Promise((resolve, reject) => {
        const request = store.put(data);
        request.onsuccess = () => {
            console.log(`Data saved to ${storeName}`);
            resolve();
        };
        request.onerror = () => {
            showToast(`Error saving to ${storeName}.`, 'error');
            console.error(`Error saving to ${storeName}:`, request.error);
            reject(request.error);
        };
    });
}

// Deletes data from a specified store by key
// Purpose: Allows removal of specific records from an object store
export async function deleteFromStore(storeName, key) {
    const db = getDB(); // Get the database instance
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    return new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onsuccess = () => {
            console.log(`Data deleted from ${storeName} with key ${key}`);
            resolve();
        };
        request.onerror = () => {
            showToast(`Error deleting from ${storeName}.`, 'error');
            console.error(`Error deleting from ${storeName}:`, request.error);
            reject(request.error);
        };
    });
}

// Loads all data from a specified store
// Purpose: Retrieves all records from an object store for use in the application
export async function loadFromStore(storeName) {
    console.time(`loadFromStore_${storeName}`); // Start performance timer
    const db = getDB(); // Get the database instance
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
            console.log(`Loaded ${request.result.length} items from ${storeName}`);
            resolve(request.result);
            console.timeEnd(`loadFromStore_${storeName}`);
        };
        request.onerror = () => {
            showToast(`Error loading from ${storeName}.`, 'error');
            console.error(`Error loading from ${storeName}:`, request.error);
            reject(request.error);
        };
    });
}

// Saves an image blob to the 'images' store
// Purpose: Stores image data with a unique ID for later retrieval
export async function saveImage(blob) {
    const id = Date.now() + Math.random(); // Generate a unique ID
    await saveToStore('images', { id, blob });
    console.log(`Image saved with id ${id}`);
    return id;
}

// Retrieves an image blob from the 'images' store by ID
// Purpose: Fetches a stored image for display or processing
export async function getImage(id) {
    const db = getDB(); // Get the database instance
    const transaction = db.transaction(['images'], 'readonly');
    const store = transaction.objectStore('images');
    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => {
            console.log(`Image retrieved with id ${id}`);
            resolve(request.result?.blob || null);
        };
        request.onerror = () => {
            console.error(`Error retrieving image with id ${id}:`, request.error);
            reject(request.error);
        };
    });
}