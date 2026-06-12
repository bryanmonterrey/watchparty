import * as fs from "fs";
import * as path from "path";

const JSON_FILE = path.join(process.cwd(), "kick_categories.json");
const OUTPUT_DIR = path.join(process.cwd(), "public", "thumbnails");
const CONCURRENCY_LIMIT = 10; // Number of images to download at the same time

interface CategoryInfo {
  title: string;
  slug: string;
  thumbnailUrl: string;
  viewers: string;
}

// Helper function to sanitize the slug to create a valid filename
function getFilenameFromSlug(slug: string, url: string): string {
  // Extract slug name, e.g., "/category/just-chatting" -> "just-chatting"
  const baseName = slug.replace(/^\/category\//, "").replace(/[^a-zA-Z0-9-_]/g, "_");
  
  // Try to determine extension from the URL (default to webp)
  let ext = ".webp";
  if (url.includes(".png")) ext = ".png";
  else if (url.includes(".jpg") || url.includes(".jpeg")) ext = ".jpg";
  
  return `${baseName}${ext}`;
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ Failed to download ${url}: HTTP ${res.status}`);
      return false;
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    return true;
  } catch (err) {
    console.error(`❌ Error downloading ${url}:`, err);
    return false;
  }
}

async function startDownload() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error(`❌ Error: ${JSON_FILE} not found. Please run the extractor first!`);
    return;
  }

  // Create public/thumbnails directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Created directory: ${OUTPUT_DIR}`);
  }

  console.log("📖 Reading categories list...");
  const categories: CategoryInfo[] = JSON.parse(fs.readFileSync(JSON_FILE, "utf-8"));
  console.log(`📝 Found ${categories.length} categories to download.`);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Process in batches to prevent hitting rate-limits or running out of file descriptors
  for (let i = 0; i < categories.length; i += CONCURRENCY_LIMIT) {
    const batch = categories.slice(i, i + CONCURRENCY_LIMIT);
    console.log(`⏳ Downloading batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(categories.length / CONCURRENCY_LIMIT)}...`);

    const promises = batch.map(async (category) => {
      if (!category.thumbnailUrl || category.thumbnailUrl.startsWith("/")) {
        // Already local or invalid
        skippedCount++;
        return;
      }

      const filename = getFilenameFromSlug(category.slug, category.thumbnailUrl);
      const destPath = path.join(OUTPUT_DIR, filename);

      // Skip download if file already exists
      if (fs.existsSync(destPath)) {
        category.thumbnailUrl = `/thumbnails/${filename}`; // Update path to local
        skippedCount++;
        return;
      }

      const success = await downloadImage(category.thumbnailUrl, destPath);
      if (success) {
        category.thumbnailUrl = `/thumbnails/${filename}`; // Update path to local
        successCount++;
      } else {
        failedCount++;
      }
    });

    await Promise.all(promises);
  }

  // Save updated paths back to the JSON file
  fs.writeFileSync(JSON_FILE, JSON.stringify(categories, null, 2), "utf-8");

  console.log("\n✨ Download completed!");
  console.log(`   ├─ downloaded: ${successCount}`);
  console.log(`   ├─ skipped/already downloaded: ${skippedCount}`);
  console.log(`   └─ failed: ${failedCount}`);
  console.log(`💾 Updated paths saved back to ${JSON_FILE}`);
}

startDownload();
