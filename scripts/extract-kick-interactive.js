(async () => {
  const accumulated = new Map();
  console.clear();
  console.log("%c🚀 Kick Interactive Tags Scraper Activated!", "color: #00ff00; font-weight: bold; font-size: 16px;");
  console.log("%c👉 INSTRUCTIONS:\n1. Scroll down the page naturally (so Kick loads new items).\n2. I will collect their titles, thumbnails, viewers, AND tags (genres/categories).\n3. When done, type 'download()' in the console and press Enter.\n4. I will copy the JSON to your clipboard.", "color: #00bfff; font-size: 14px;");

  const extractVisible = () => {
    const cards = document.querySelectorAll('div[class*="group/card"]');
    let newItemsCount = 0;
    
    cards.forEach(card => {
      try {
        const thumbnailLink = card.querySelector('a.aspect-\\[3\\/4\\]');
        const img = card.querySelector('img');
        const titleLink = card.querySelector('a:not(.aspect-\\[3\\/4\\])');
        const titleElement = titleLink ? titleLink.querySelector('span') : null;
        
        // Find viewer count
        const spans = Array.from(card.querySelectorAll('span'));
        let viewers = "0";
        const watchingIndex = spans.findIndex(span => span.textContent?.trim().toLowerCase() === 'watching');
        if (watchingIndex !== -1 && spans[watchingIndex + 1]) {
          viewers = spans[watchingIndex + 1].textContent?.trim() || "0";
        }

        // Extract tags (genres/secondary categories)
        // These are links styled as badges that are NOT the thumbnail or main title link
        const allLinks = Array.from(card.querySelectorAll('a'));
        const tags = allLinks
          .filter(a => a !== thumbnailLink && a !== titleLink && !a.querySelector('img'))
          .map(a => a.textContent.trim())
          .filter(text => text.length > 0 && !text.toLowerCase().includes('watching'));

        if (titleElement && img && thumbnailLink) {
          const slug = thumbnailLink.getAttribute("href");
          const thumbnailUrl = img.src || img.getAttribute("src");
          
          if (slug && thumbnailUrl && !accumulated.has(slug)) {
            accumulated.set(slug, {
              title: titleElement.textContent.trim(),
              slug: slug,
              thumbnailUrl: thumbnailUrl,
              viewers: viewers,
              tags: tags // Add the tags array here!
            });
            newItemsCount++;
          }
        }
      } catch (err) {}
    });

    if (newItemsCount > 0) {
      console.log(`%c✨ Collected +${newItemsCount} new categories. Total accumulated: ${accumulated.size}`, "color: #adff2f;");
    }
  };

  // Run initial pass
  extractVisible();

  // Watch the DOM for changes
  const observer = new MutationObserver(() => {
    extractVisible();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Expose download function to copy to clipboard
  window.download = async () => {
    observer.disconnect();
    const result = Array.from(accumulated.values());
    if (result.length === 0) {
      console.log("%c❌ No categories collected yet!", "color: red;");
      return;
    }
    
    const jsonString = JSON.stringify(result, null, 2);

    try {
      await navigator.clipboard.writeText(jsonString);
      console.log("%c📋 SUCCESS! JSON (including tags) copied to clipboard.", "color: #00ff00; font-weight: bold; font-size: 14px;");
      console.log("%c👉 Go to VS Code, open kick_categories.json, select all, and Paste (Cmd+V).", "color: #ffff00; font-size: 13px;");
    } catch (err) {
      if (typeof copy === 'function') {
        copy(jsonString);
        console.log("%c📋 SUCCESS! JSON copied to clipboard using DevTools copy().", "color: #00ff00; font-weight: bold; font-size: 14px;");
      } else {
        console.log("%c⚠️ Browser blocked direct clipboard write. Right click the printed object below and choose 'Copy object':", "color: orange;");
        console.log(result);
      }
    }
  };
})();
