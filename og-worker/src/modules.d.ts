// wrangler's Data rule (wrangler.jsonc) hands .ttf imports over as raw bytes.
declare module "*.ttf" {
    const data: ArrayBuffer;
    export default data;
}
