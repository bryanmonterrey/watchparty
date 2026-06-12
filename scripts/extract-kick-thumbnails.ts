import puppeteer from "puppeteer";
import * as fs from "fs";
import * as path from "path";

// Configuration
const TARGET_URL = "https://kick.com/browse/categories";
const OUTPUT_FILE = path.join(process.cwd(), "kick_categories.json");
const SCROLL_DELAY = 1500; // time in ms to wait after each scroll
const MAX_SCROLLS = 100; // safeguard to prevent infinite loop

interface CategoryInfo {
  title: string;
  slug: string;
  thumbnailUrl: string;
  viewers: string;
  tags: string[];
}

async function extractKickCategories() {
  console.log("🚀 Launching browser...");
  const browser = await puppeteer.launch({
    headless: false, // Use headed mode on macOS to bypass Cloudflare verification
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  try {
    const page = await browser.newPage();

    // Mask bot signatures (delete navigator.webdriver property)
    await page.evaluateOnNewDocument(() => {
      // @ts-ignore
      delete Object.getPrototypeOf(navigator).webdriver;
    });

    // Log request failures and HTTP error responses for debugging
    page.on("requestfailed", (request) => {
      console.log(`⚠️ Request Failed: ${request.url()} | Reason: ${request.failure()?.errorText}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        console.log(`❌ HTTP Error Response: ${response.url()} | Status: ${response.status()}`);
      }
    });

    // Set a modern user agent to avoid bot detection blocks
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    // Set custom viewport
    await page.setViewport({ width: 1440, height: 900 });

    console.log(`🌐 Navigating to ${TARGET_URL}...`);
    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    console.log("⏳ Waiting for content to load...");
    let loaded = false;
    for (let i = 0; i < 30; i++) {
      loaded = await page.evaluate(() => {
        return document.querySelectorAll('a[href^="/category/"]').length > 0;
      });
      if (loaded) {
        console.log("✔️ Category cards detected in DOM.");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!loaded) {
      await page.screenshot({ path: path.join(process.cwd(), "kick_error_screenshot.png") });
      console.log("📸 Timeout waiting for cards. Saved error screenshot to kick_error_screenshot.png");
      throw new Error("Timeout waiting for category cards to load.");
    }

    console.log("📜 Starting auto-scroll and dynamic extraction to fetch all categories. Press Ctrl+C if you want to stop early.");

    let scrollCount = 0;
    let noChangeCount = 0;
    const accumulatedCategories = new Map<string, CategoryInfo>();

    // Helper function to extract visible categories from the current DOM state
    async function extractVisibleCategories() {
      return await page.evaluate(() => {
        const cards = document.querySelectorAll('div[class*="group/card"]');
        const results: CategoryInfo[] = [];

        cards.forEach((card) => {
          try {
            const thumbnailLink = card.querySelector('a.aspect-\\[3\\/4\\]') as HTMLAnchorElement | null;
            const img = card.querySelector('img') as HTMLImageElement | null;
            const titleLink = card.querySelector('a:not(.aspect-\\[3\\/4\\])') as HTMLAnchorElement | null;
            const titleElement = titleLink ? titleLink.querySelector('span') as HTMLSpanElement | null : null;
            
            const spans = Array.from(card.querySelectorAll('span'));
            let viewers = "0";
            const watchingIndex = spans.findIndex(span => span.textContent?.trim().toLowerCase() === 'watching');
            if (watchingIndex !== -1 && spans[watchingIndex + 1]) {
              viewers = spans[watchingIndex + 1].textContent?.trim() || "0";
            }

            // Extract tags
            const allLinks = Array.from(card.querySelectorAll('a'));
            const tags = allLinks
              .filter(a => a !== thumbnailLink && a !== titleLink && !a.querySelector('img'))
              .map(a => a.textContent.trim())
              .filter(text => text.length > 0 && !text.toLowerCase().includes('watching'));

            if (titleElement && img && thumbnailLink) {
              results.push({
                title: titleElement.textContent?.trim() || "",
                slug: thumbnailLink.getAttribute("href") || "",
                thumbnailUrl: img.src || img.getAttribute("src") || "",
                viewers: viewers,
                tags: tags
              });
            }
          } catch (err) {
            // Skip individual card errors
          }
        });
        return results;
      });
    }

    // Extract initial visible categories
    const initialCategories = await extractVisibleCategories();
    initialCategories.forEach(c => accumulatedCategories.set(c.slug, c));
    console.log(`⭐ Initial categories loaded: ${accumulatedCategories.size}`);

    // Focus body to ensure keypresses and scroll actions are registered
    await page.click('body').catch(() => {});
    await page.screenshot({ path: path.join(process.cwd(), "kick_page_debug_initial.png") });
    console.log("📸 Saved initial page screenshot for verification.");

    // Dismiss Cookie Banner if present
    console.log("🍪 Checking for cookie consent banner...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const acceptBtn = buttons.find(b => b.textContent?.trim() === 'Accept all');
      if (acceptBtn) {
        acceptBtn.click();
        console.log("✔️ Clicked 'Accept all' cookies button.");
      } else {
        console.log("❓ Cookie button not found via exact text, trying general selectors.");
        // Try other common selectors or classes if any
        const primaryButtons = document.querySelectorAll('button.bg-green-500, button.bg-accent, button');
        for (const btn of Array.from(primaryButtons)) {
          if (btn.textContent?.toLowerCase().includes('accept')) {
            (btn as HTMLButtonElement).click();
            break;
          }
        }
      }
    });

    // Wait for the cookie banner to fade out
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.screenshot({ path: path.join(process.cwd(), "kick_page_debug_after_cookie.png") }).catch(() => {});

    // Trace parents of the category card to find the true scrolling element
    const trace = await page.evaluate(() => {
      const card = document.querySelector('div[class*="group/card"]');
      if (!card) {
        return ["❌ Tracing error: No card found in DOM to trace parent hierarchy!"];
      }
      const lines: string[] = [];
      let current: HTMLElement | null = card.parentElement;
      while (current) {
        const style = window.getComputedStyle(current);
        lines.push(`Tag: <${current.tagName.toLowerCase()}> | ID: "${current.id || ""}" | Classes: "${current.className.substring(0, 60)}" | ScrollHeight: ${current.scrollHeight} | ClientHeight: ${current.clientHeight} | OverflowY: ${style.overflowY}`);
        current = current.parentElement;
      }
      return lines;
    });
    console.log("🔍 Tracing category card parents:");
    trace.forEach(line => console.log(line));

    // Move mouse to the center of `#main-container` to focus wheel events over the scrollable area
    await page.mouse.move(800, 500).catch(() => {});

    while (scrollCount < MAX_SCROLLS) {
      // 1. Scroll the #main-container directly in the DOM
      await page.evaluate(() => {
        const container = document.getElementById('main-container');
        if (container) {
          container.scrollBy(0, window.innerHeight * 1.5);
        } else {
          // Fallback if ID changes
          const allElements = document.querySelectorAll('*');
          allElements.forEach(el => {
            const style = window.getComputedStyle(el);
            const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
            if (isScrollable) {
              el.scrollBy(0, window.innerHeight * 1.5);
            }
          });
        }
      });

      // 2. Simulate hardware mouse wheel scrolling over the container
      await page.mouse.wheel({ deltaY: 4000 });

      // 3. Simulate keypresses to trigger scroll event handlers
      await page.keyboard.press('PageDown');
      
      // Wait for new items to load
      await new Promise((resolve) => setTimeout(resolve, SCROLL_DELAY));

      // Extract currently visible categories and add them to our accumulated collection
      const visible = await extractVisibleCategories();
      const previousSize = accumulatedCategories.size;
      visible.forEach(c => accumulatedCategories.set(c.slug, c));

      console.log(`   └─ Scroll #${scrollCount + 1}: Extracted ${visible.length} visible items. Total accumulated: ${accumulatedCategories.size}`);

      // Auto-save progress to disk in real-time so data isn't lost if the script is stopped
      if (accumulatedCategories.size > 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(Array.from(accumulatedCategories.values()), null, 2), "utf-8");
      }

      if (accumulatedCategories.size > previousSize) {
        noChangeCount = 0; // Reset retry counter since we got new items
      } else {
        noChangeCount++;
        if (noChangeCount >= 3) {
          console.log("⚠️ No new items accumulated. Trying a deep scroll and wait...");
          await page.mouse.wheel({ deltaY: 6000 });
          await page.evaluate(() => {
            const container = document.getElementById('main-container');
            if (container) {
              container.scrollTo(0, container.scrollHeight);
            } else {
              const allElements = document.querySelectorAll('*');
              allElements.forEach(el => {
                const style = window.getComputedStyle(el);
                if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
                  el.scrollTo(0, el.scrollHeight);
                }
              });
            }
          });
          await new Promise((resolve) => setTimeout(resolve, SCROLL_DELAY * 2));
          
          const finalVisible = await extractVisibleCategories();
          finalVisible.forEach(c => accumulatedCategories.set(c.slug, c));

          if (accumulatedCategories.size > 0) {
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify(Array.from(accumulatedCategories.values()), null, 2), "utf-8");
          }

          if (accumulatedCategories.size <= previousSize) {
            console.log("🏁 Reached the end of the page (no more new categories found).");
            break;
          } else {
            noChangeCount = 0;
          }
        }
      }

      scrollCount++;
    }

    const categories = Array.from(accumulatedCategories.values());
    await page.screenshot({ path: path.join(process.cwd(), "kick_page_debug_scrolled.png") }).catch(() => {});
    console.log("📸 Saved scrolled page screenshot for verification.");
    console.log(`✨ Successfully extracted ${categories.length} categories!`);

    // Output to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(categories, null, 2), "utf-8");
    console.log(`💾 Data saved to: ${OUTPUT_FILE}`);

    // Print a nice preview table
    console.log("\n📊 Preview of first 10 categories:");
    console.table(
      categories.slice(0, 10).map((c) => ({
        Title: c.title,
        Slug: c.slug,
        "Thumbnail URL": c.thumbnailUrl.substring(0, 60) + "...",
        Viewers: c.viewers,
      }))
    );

  } catch (error) {
    console.error("❌ An error occurred during scraping:", error);
  } finally {
    console.log("🔌 Closing browser...");
    await browser.close();
  }
}

// Graceful shutdown on Ctrl+C (SIGINT)
process.on("SIGINT", async () => {
  console.log("\n🛑 Script interrupted by user. Saving current progress and exiting...");
  // The while loop already saves progress in real-time, but we ensure exit is clean
  process.exit(0);
});

extractKickCategories();
