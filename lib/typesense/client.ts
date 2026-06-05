import Typesense from "typesense";

export const typesenseClient = new Typesense.Client({
    nodes: [{
        host: process.env.TYPESENSE_HOST ?? "localhost",
        port: Number(process.env.TYPESENSE_PORT ?? 8108),
        protocol: (process.env.TYPESENSE_PROTOCOL ?? "http") as "http" | "https",
    }],
    apiKey: process.env.TYPESENSE_API_KEY ?? "xyz",
    connectionTimeoutSeconds: 5,
});
