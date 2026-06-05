export const LANG_LABELS: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German",
    it: "Italian", pt: "Portuguese", ja: "Japanese", ko: "Korean",
    zh: "Chinese (Simplified)", ar: "Arabic", ru: "Russian", hi: "Hindi",
    nl: "Dutch", pl: "Polish", tr: "Turkish", sv: "Swedish",
    no: "Norwegian", da: "Danish", fi: "Finnish", id: "Indonesian",
    ms: "Malay", th: "Thai", vi: "Vietnamese", uk: "Ukrainian",
    cs: "Czech", ro: "Romanian", hu: "Hungarian", el: "Greek",
    bg: "Bulgarian", hr: "Croatian", sk: "Slovak", ca: "Catalan",
    he: "Hebrew", ta: "Tamil", te: "Telugu", bn: "Bengali",
    et: "Estonian", lv: "Latvian", lt: "Lithuanian",
    "zh-TW": "Chinese (Traditional)", "pt-BR": "Portuguese (Brazil)",
};

export function langLabel(code: string): string {
    return LANG_LABELS[code.split("-")[0]!] ?? code.toUpperCase();
}

function fmt(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(3).padStart(6, "0")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toVtt(result: any, detectedLang?: string): { vtt: string; language: string } {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alt = result?.results?.channels?.[0]?.alternatives?.[0] as any;
    const language: string = detectedLang ?? result?.results?.channels?.[0]?.detected_language ?? "en";

    const lines: string[] = ["WEBVTT", ""];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paragraphs: any[] = alt?.paragraphs?.paragraphs ?? [];
    if (paragraphs.length > 0) {
        let cueIndex = 1;
        for (const para of paragraphs) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const sentence of (para.sentences ?? []) as any[]) {
                lines.push(String(cueIndex++));
                lines.push(`${fmt(sentence.start)} --> ${fmt(sentence.end)}`);
                lines.push(sentence.text);
                lines.push("");
            }
        }
        return { vtt: lines.join("\n"), language };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const words: any[] = alt?.words ?? [];
    if (words.length === 0) return { vtt: "WEBVTT\n", language };

    const CHUNK = 8;
    let cueIndex = 1;
    for (let i = 0; i < words.length; i += CHUNK) {
        const chunk = words.slice(i, i + CHUNK);
        const start: number = chunk[0].start;
        const end: number = chunk[chunk.length - 1].end;
        const text = chunk.map((w: { word: string }) => w.word).join(" ");
        lines.push(String(cueIndex++));
        lines.push(`${fmt(start)} --> ${fmt(end)}`);
        lines.push(text);
        lines.push("");
    }

    return { vtt: lines.join("\n"), language };
}
