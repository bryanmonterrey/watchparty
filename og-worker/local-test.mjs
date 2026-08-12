import { ImageResponse } from "workers-og";
const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const name="WatchParty", handle="@wp", text="hello from watchparty";
const avatarEl = `<div style="width:80px;height:80px;border-radius:40px;background-color:#e5e7eb;margin-right:24px"></div>`;
const html =
  `<div style="height:100%;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:#000000;color:white">`+
    `<div style="display:flex;flex-direction:column;background-color:#ffffff;color:#000000;width:800px;min-height:400px;border-radius:24px;padding:48px;box-shadow:0 20px 40px rgba(0,0,0,0.5)">`+
      `<div style="display:flex;align-items:center;margin-bottom:32px">`+avatarEl+
        `<div style="display:flex;flex-direction:column">`+
          `<span style="font-size:32px;font-weight:bold;color:#09090b;margin-bottom:4px">${esc(name)}</span>`+
          `<span style="font-size:24px;color:#71717a">${esc(handle)}</span>`+
        `</div>`+
      `</div>`+
      `<div style="display:flex;font-size:36px;line-height:1.4;color:#09090b">${esc(text)}</div>`+
    `</div>`+
  `</div>`;
try {
  const r = new ImageResponse(html, { width: 1200, height: 630 });
  const out = new Uint8Array(await r.arrayBuffer());
  console.log("OK bytes:", out.length);
} catch (e) {
  console.log("ERROR:", e.message);
}
