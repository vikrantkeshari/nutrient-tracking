/**
 * Compresses an image client-side to target ~25KB (with a strict 50KB hard cap).
 * Recursively reduces resolution and quality if the initial pass fails the cap.
 * 
 * @param {File|Blob} imageFile - The image to compress
 * @returns {Promise<{blob: Blob, base64: string}>} - The compressed Blob and its Base64 representation
 */
export function compressImage(imageFile) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let quality = 0.7;
        let scale = 1.0;
        const maxResolution = 400; // PRD specification

        const runCompression = () => {
          let width = img.width * scale;
          let height = img.height * scale;

          // Limit maximum dimensions
          if (width > maxResolution || height > maxResolution) {
            if (width > height) {
              height = (height * maxResolution) / width;
              width = maxResolution;
            } else {
              width = (width * maxResolution) / height;
              height = maxResolution;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Export as JPEG with the current quality setting
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                return reject(new Error("Canvas conversion to Blob failed"));
              }

              // Check if output meets the hard cap limit
              const fileSizeKb = blob.size / 1024;
              console.log(`Compression iteration: scale=${scale.toFixed(2)}, quality=${quality.toFixed(2)} -> Size: ${fileSizeKb.toFixed(1)} KB`);

              if (fileSizeKb > 50 && (quality > 0.1 || scale > 0.3)) {
                // Shrink quality first, then resolution scale if quality drops too low
                if (quality > 0.3) {
                  quality -= 0.15;
                } else {
                  scale -= 0.15;
                  quality = 0.5; // reset quality slightly for smaller canvas
                }
                runCompression(); // recurse
              } else {
                // Pass criteria met or hit absolute limits. Convert to Base64 data URL.
                const fileReader = new FileReader();
                fileReader.onloadend = () => {
                  resolve({
                    blob: blob,
                    base64: fileReader.result
                  });
                };
                fileReader.readAsDataURL(blob);
              }
            },
            "image/jpeg",
            quality
          );
        };

        runCompression();
      };
      img.onerror = () => reject(new Error("Failed to load image file"));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(imageFile);
  });
}
