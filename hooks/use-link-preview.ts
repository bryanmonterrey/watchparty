import { useState, useEffect, useRef } from "react";

export interface LinkPreviewData {
    url: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
}

const URL_REGEX = /https?:\/\/[^\s]+/g;

export function useLinkPreview(text: string, debounceMs = 800) {
    const [preview, setPreview] = useState<LinkPreviewData | null>(null);
    const [loading, setLoading] = useState(false);
    const lastFetched = useRef<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const matches = text.match(URL_REGEX);
        const url = matches?.[0] ?? null;

        if (!url) {
            setPreview(null);
            lastFetched.current = null;
            return;
        }

        if (url === lastFetched.current) return;

        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(async () => {
            lastFetched.current = url;
            setLoading(true);
            try {
                const res = await fetch(`/api/og-preview?url=${encodeURIComponent(url)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!data.error) setPreview(data);
                    else setPreview(null);
                } else {
                    setPreview(null);
                }
            } catch {
                setPreview(null);
            } finally {
                setLoading(false);
            }
        }, debounceMs);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [text, debounceMs]);

    const clearPreview = () => {
        setPreview(null);
        lastFetched.current = null;
    };

    return { preview, loading, clearPreview };
}
