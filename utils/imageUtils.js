// Function to apply corner radius to an image
function applyCornerRadius(imageDataUrl, radius) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const width = img.width;
      const height = img.height;

      canvas.width = width;
      canvas.height = height;

      // Create rounded rectangle path
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(width - radius, 0);
      ctx.quadraticCurveTo(width, 0, width, radius);
      ctx.lineTo(width, height - radius);
      ctx.quadraticCurveTo(width, height, width - radius, height);
      ctx.lineTo(radius, height);
      ctx.quadraticCurveTo(0, height, 0, height - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();

      // Draw image
      ctx.drawImage(img, 0, 0);

      // Export as PNG
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageDataUrl;
  });
}

// Function to crop image to specified area
function cropImage(imageDataUrl, selection) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to selection area
        canvas.width = selection.width;
        canvas.height = selection.height;
        
        // Calculate the device pixel ratio to handle high-DPI displays
        const devicePixelRatio = window.devicePixelRatio || 1;
        
        // Draw the cropped portion of the image
        ctx.drawImage(
          img,
          selection.x * devicePixelRatio,
          selection.y * devicePixelRatio,
          selection.width * devicePixelRatio,
          selection.height * devicePixelRatio,
          0,
          0,
          selection.width,
          selection.height
        );
        
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    img.onerror = () => {
      reject(new Error('Failed to load image for cropping'));
    };
    img.src = imageDataUrl;
  });
}

// Function to stitch images together vertically
function stitchImages(imageDataUrls, overlap = 0) {
  return new Promise((resolve, reject) => {
    if (!imageDataUrls || imageDataUrls.length === 0) {
      reject(new Error('No images provided'));
      return;
    }
    
    if (imageDataUrls.length === 1) {
      resolve(imageDataUrls[0]);
      return;
    }

    const images = [];
    let loadedCount = 0;

    // Load all images first
    imageDataUrls.forEach((dataUrl, index) => {
      const img = new Image();
      img.onload = () => {
        images[index] = img;
        loadedCount++;
        
        if (loadedCount === imageDataUrls.length) {
          // All images loaded, now stitch them
          stitchLoadedImages();
        }
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image ${index}`));
      };
      img.src = dataUrl;
    });

    function stitchLoadedImages() {
      try {
        // Calculate canvas dimensions
        const canvasWidth = Math.max(...images.map(img => img.width));
        let canvasHeight = 0;
        
        // Calculate total height with overlap
        for (let i = 0; i < images.length; i++) {
          if (i === 0) {
            canvasHeight += images[i].height;
          } else {
            canvasHeight += images[i].height - overlap;
          }
        }

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Draw images
        let currentY = 0;
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const x = (canvasWidth - img.width) / 2; // Center horizontally
          
          ctx.drawImage(img, x, currentY);
          
          if (i < images.length - 1) {
            currentY += img.height - overlap;
          }
        }

        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    }
  });
}

// Function to capture scrolling screenshot
async function captureScrollingScreenshot(tabId) {
  return new Promise(async (resolve, reject) => {
    try {
      // Get page info
      chrome.tabs.sendMessage(tabId, { action: 'getPageInfo' }, async (pageInfo) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Failed to get page info: ' + chrome.runtime.lastError.message));
          return;
        }

        const { scrollHeight, clientHeight } = pageInfo;
        const screenshots = [];
        const scrollStep = Math.floor(clientHeight * 0.8); // 20% overlap
        const totalSteps = Math.ceil(scrollHeight / scrollStep);

        // Reset scroll position
        chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: 0 });

        for (let step = 0; step < totalSteps; step++) {
          const scrollY = step * scrollStep;
          
          // Scroll to position
          chrome.tabs.sendMessage(tabId, { action: 'scrollTo', y: scrollY });
          
          // Wait for scroll to complete
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Capture screenshot
          const dataUrl = await new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(dataUrl);
              }
            });
          });
          
          screenshots.push(dataUrl);
        }

        // Stitch images together
        const overlap = Math.floor(clientHeight * 0.2);
        const stitchedImage = await stitchImages(screenshots, overlap);
        resolve(stitchedImage);
      });
    } catch (error) {
      reject(error);
    }
  });
}