// Web Worker message handler for processing image compression requests
// Purpose: Receives messages from the main thread containing image file data and compression parameters,
// processes the image, and sends back the compressed result or an error message
self.onmessage = async (e) => {
    // Destructure the message data to extract file, maxSizeMB, maxWidth, and quality
    const { file, maxSizeMB, maxWidth, quality } = e.data;

    try {
        // Check if OffscreenCanvas is supported in the browser
        // Purpose: Ensures the browser supports OffscreenCanvas, which is required for image processing in a worker
        if (!self.OffscreenCanvas) {
            throw new Error('OffscreenCanvas not supported');
        }

        // Compress the image using the provided parameters
        const blob = await compressImage(file, maxSizeMB, maxWidth, quality);

        // Send the compressed image blob back to the main thread
        // Purpose: Returns the successful result to the main thread for further processing or storage
        self.postMessage({ blob });
    } catch (err) {
        // Send any errors back to the main thread
        // Purpose: Informs the main thread of any issues during image processing for error handling
        self.postMessage({ error: err.message || 'Unknown image processing error' });
    }
};

// Compresses an image file to meet size and width constraints
// Purpose: Processes an image file to reduce its size and dimensions while maintaining quality,
// ensuring it fits within specified limits for efficient storage or display
function compressImage(file, maxSizeMB, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        // Validate that the file is an image
        // Purpose: Prevents processing of non-image files to avoid errors
        if (!file.type.startsWith('image/')) {
            reject(new Error('File is not an image'));
            return;
        }

        // Check if the file size exceeds the maximum allowed size (in MB)
        // Purpose: Ensures the input file does not exceed the size limit before processing
        if (file.size > maxSizeMB * 1024 * 1024) {
            reject(new Error(`Image size exceeds ${maxSizeMB} MB`));
            return;
        }

        // Create a FileReader to read the image file
        // Purpose: Reads the file as a data URL to load it into an Image object
        const reader = new FileReader();

        // Handle successful file reading
        reader.onload = (e) => {
            // Create a new Image object to load the file content
            // Purpose: Allows manipulation of the image data for resizing and compression
            const img = new Image();
            img.src = e.target.result;

            // Handle successful image loading
            img.onload = () => {
                try {
                    // Create an OffscreenCanvas with the image's original dimensions
                    // Purpose: Provides a canvas for drawing and resizing the image off the main thread
                    const canvas = new OffscreenCanvas(img.width, img.height);
                    let width = img.width;
                    let height = img.height;

                    // Resize the image if its width exceeds maxWidth
                    // Purpose: Scales the image proportionally to fit within the maximum width constraint
                    if (width > maxWidth) {
                        height = (maxWidth / width) * height;
                        width = maxWidth;
                    }

                    // Set the canvas dimensions to the resized values
                    canvas.width = width;
                    canvas.height = height;

                    // Get the 2D rendering context for the canvas
                    // Purpose: Allows drawing the resized image onto the canvas
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        throw new Error('Failed to get canvas context');
                    }

                    // Draw the resized image onto the canvas
                    // Purpose: Renders the image at the specified dimensions
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert the canvas content to a JPEG blob with the specified quality
                    // Purpose: Compresses the image to reduce file size while maintaining acceptable quality
                    canvas.convertToBlob({ type: 'image/jpeg', quality }).then(blob => {
                        // Check if the compressed blob exceeds the maximum size
                        // Purpose: Ensures the compressed image still meets size constraints
                        if (blob.size > maxSizeMB * 1024 * 1024) {
                            reject(new Error('Image too large after compression'));
                        } else {
                            // Resolve with the compressed blob
                            resolve(blob);
                        }
                    }).catch(err => reject(new Error('Canvas conversion error: ' + err.message)));
                } catch (err) {
                    // Reject with any errors during canvas processing
                    reject(new Error('Canvas processing error: ' + err.message));
                }
            };

            // Handle errors during image loading
            // Purpose: Catches and reports issues with loading the image
            img.onerror = () => reject(new Error('Image load error'));
        };

        // Handle errors during file reading
        // Purpose: Catches and reports issues with reading the file
        reader.onerror = () => reject(new Error('File read error'));

        // Read the file as a data URL
        // Purpose: Initiates the file reading process to load the image
        reader.readAsDataURL(file);
    });
}