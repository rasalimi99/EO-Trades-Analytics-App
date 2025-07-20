/**
 * Web Worker for converting trade screenshots (Blobs) to base64 strings.
 * 
 * WHY: Offloads heavy image processing from the main UI thread, 
 *      keeping the app responsive during backup/export operations.
 */
self.onmessage = async ({ data }) => {

    /**
     * Converts a Blob (image file) to a base64-encoded string.
     * 
     * WHY: Allows images to be stored in JSON backups, 
     *      making them portable and easy to restore/import later.
     */
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Error converting Blob to base64'));
            reader.readAsDataURL(blob);
        });
    }

    // Process all trades and convert their screenshots to base64
    // WHY: Ensures all images are included in the backup as base64 strings.
    const tradesWithBase64 = await Promise.all(data.trades.map(async trade => {
        const screenshots = await Promise.all((trade.screenshots || []).map(async (img, i) => ({
            base64: img.blob instanceof Blob ? await blobToBase64(img.blob) : '',
            caption: img.caption,
            filename: `trade_${trade.id}_image_${i + 1}.jpg`
        })));
        return { ...trade, screenshots, screenshotFilenames: screenshots.map(s => s.filename) };
    }));

    // Send the processed trades back to the main thread
    // WHY: Returns the result to the main app for inclusion in the backup file.
    self.postMessage(tradesWithBase64);
};