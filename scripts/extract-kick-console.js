/**
 * KICK CATEGORY EXTRACTOR - BROWSER CONSOLE SCRIPT
 * 
 * Instructions:
 * 1. Open https://kick.com/browse/categories in your browser (Chrome/Safari/Firefox).
 * 2. Open Developer Tools (F12 or Right Click -> Inspect).
 * 3. Go to the "Console" tab.
 * 4. Paste this code and press Enter.
 * 5. The page will auto-scroll, load all categories, and download "kick_categories.json".
 */
(async () => {
  const SCROLL_DELAY = 1500; // Delay in milliseconds between scrolls
  const accumulated = new Map();
  
  console.log("🚀 Starting Kick Category Scraper... DO NOT close this tab.");
  console.log("📜 Scrolling and extracting...");

  let noChangeCount = 0;
  let previousSize = 0;

  while (true) {
    // Extract items visible in the DOM
    const cards = document.querySelectorAll('div[class*="group/card"]');
    cards.forEach(card => {
      try {
        const thumbnailLink = card.querySelector('a.aspect-\\[3\\/4\\]');
        const img = card.querySelector('img');
        const titleElement = card.querySelector('a:not(.aspect-\\[3\\/4\\]) span');
        
        const spans = Array.from(card.querySelectorAll('span'));
        let viewers = "0";
        const watchingIndex = spans.findIndex(span => span.textContent?.trim().toLowerCase() === 'watching');
        if (watchingIndex !== -1 && spans[watchingIndex + 1]) {
          viewers = spans[watchingIndex + 1].textContent?.trim() || "0";
        }

        if (titleElement && img && thumbnailLink) {
          const slug = thumbnailLink.getAttribute("href");
          const thumbnailUrl = img.src || img.getAttribute("src");
          
          if (slug && thumbnailUrl) {
            accumulated.set(slug, {
              title: titleElement.textContent.trim(),
              slug: slug,
              thumbnailUrl: thumbnailUrl,
              viewers: viewers
            });
          }
        }
      } catch (err) {
        // Skip individual card errors
      }
    });

    console.log(`   └─ Captured ${accumulated.size} categories so far...`);

    // Stop scrolling if size has stopped changing (meaning we reached the end)
    if (accumulated.size > previousSize) {
      previousSize = accumulated.size;
      noChangeCount = 0;
    } else {
      noChangeCount++;
      if (noChangeCount >= 4) {
        console.log("🏁 Reached the end of the page (no more categories loading)!");
        break;
      }
    }

    // Scroll the main container
    const container = document.getElementById('main-container') || window;
    container.scrollBy(0, window.innerHeight * 2);
    
    // Wait for the new batch to render
    await new Promise(resolve => setTimeout(resolve, SCROLL_DELAY));
  }

  const result = Array.from(accumulated.values());
  
  // Format as JSON and trigger a browser download
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(result, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "kick_categories.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  
  console.log(`💾 Completed! Downloaded ${result.length} categories to kick_categories.json.`);
})();
