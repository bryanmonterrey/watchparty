"use client";

import * as React from "react";
import { CopyButton } from "@/components/console/copy-button";

// A deliberately small markdown renderer for the Console Agent's replies — the
// agent emits only bold, inline code, fenced code blocks, bullet lists and
// links, so this covers exactly that and nothing more. NO heavy markdown lib
// (the console stays light) and NO dangerouslySetInnerHTML: everything is real
// React nodes, so text is auto-escaped and only known element types are ever
// created. Link hrefs are sanitised to http(s)/relative — anything else
// renders as plain text, which is what keeps this XSS-safe.

/** Inline: bold, links, inline code — earliest-match scan, left to right. */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let rest = text;
    let i = 0;
    // Ordered so `code` wins over `bold` at the same position (a backtick span
    // must not have its contents parsed).
    const patterns: { re: RegExp; make: (m: RegExpMatchArray, k: string) => React.ReactNode }[] = [
        {
            re: /`([^`]+)`/,
            make: (m, k) => (
                <code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{m[1]}</code>
            ),
        },
        {
            re: /\*\*([^*]+)\*\*/,
            make: (m, k) => <strong key={k} className="font-semibold">{m[1]}</strong>,
        },
        {
            re: /\[([^\]]+)\]\(([^)]+)\)/,
            make: (m, k) => {
                const href = m[2].trim();
                const safe = /^(https?:\/\/|\/)/i.test(href);
                return safe ? (
                    <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">{m[1]}</a>
                ) : (
                    <React.Fragment key={k}>{m[0]}</React.Fragment>
                );
            },
        },
    ];

    let guard = 0;
    while (rest && guard++ < 2000) {
        let best: { idx: number; len: number; node: React.ReactNode } | null = null;
        for (const { re, make } of patterns) {
            const m = rest.match(re);
            if (m && m.index !== undefined && (best === null || m.index < best.idx)) {
                best = { idx: m.index, len: m[0].length, node: make(m, `${keyBase}-${i++}`) };
            }
        }
        if (!best) {
            out.push(rest);
            break;
        }
        if (best.idx > 0) out.push(rest.slice(0, best.idx));
        out.push(best.node);
        rest = rest.slice(best.idx + best.len);
    }
    return out;
}

type Block =
    | { kind: "code"; text: string }
    | { kind: "list"; items: string[] }
    | { kind: "p"; text: string };

/** Block-level: fenced code, bullet lists, paragraphs. */
function toBlocks(md: string): Block[] {
    const lines = md.replace(/\r\n/g, "\n").split("\n");
    const blocks: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.trimStart().startsWith("```")) {
            const body: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith("```")) body.push(lines[i++]);
            i++; // closing fence
            blocks.push({ kind: "code", text: body.join("\n") });
            continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
                i++;
            }
            blocks.push({ kind: "list", items });
            continue;
        }
        if (line.trim() === "") {
            i++;
            continue;
        }
        // Gather consecutive non-empty, non-list, non-fence lines into a paragraph.
        const para: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^\s*[-*]\s+/.test(lines[i]) &&
            !lines[i].trimStart().startsWith("```")
        ) {
            para.push(lines[i++]);
        }
        blocks.push({ kind: "p", text: para.join("\n") });
    }
    return blocks;
}

export function AgentMarkdown({ children }: { children: string }) {
    const blocks = React.useMemo(() => toBlocks(children), [children]);
    return (
        <div className="flex flex-col gap-2 text-sm leading-relaxed">
            {blocks.map((b, i) => {
                if (b.kind === "code") {
                    return (
                        <div key={i} className="group relative">
                            <pre className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-xs">
                                <code>{b.text}</code>
                            </pre>
                            <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                <CopyButton value={b.text} />
                            </div>
                        </div>
                    );
                }
                if (b.kind === "list") {
                    return (
                        <ul key={i} className="flex flex-col gap-1 pl-1">
                            {b.items.map((it, j) => (
                                <li key={j} className="flex gap-2">
                                    <span className="select-none text-muted-foreground">•</span>
                                    <span className="min-w-0">{renderInline(it, `${i}-${j}`)}</span>
                                </li>
                            ))}
                        </ul>
                    );
                }
                return (
                    <p key={i} className="whitespace-pre-wrap">{renderInline(b.text, `p${i}`)}</p>
                );
            })}
        </div>
    );
}
