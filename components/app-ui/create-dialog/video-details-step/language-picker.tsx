"use client"

import * as React from "react"
import { Search, ChevronDown, X, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { CAPTION_LANGS } from "./constants"
import { CreateIcon } from "@/components/icons"

interface LanguagePickerProps {
    languages: string[]
    onChange: (langs: string[]) => void
}

export function LanguagePicker({ languages, onChange }: LanguagePickerProps) {
    const [langPickerOpen, setLangPickerOpen] = React.useState(false)
    const [langSearch, setLangSearch] = React.useState("")

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Language and captions</h3>
            <p className="text-xs text-zinc-500">Captions will be auto-generated via Deepgram for each selected language</p>
            {languages.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {languages.map(code => {
                        const entry = CAPTION_LANGS.find(l => l.code === code)
                        return (
                            <div key={code} className="flex items-center gap-1 bg-zinc-800 rounded-full px-5 py-3">
                                <span className="text-sm text-zinc-200">{entry?.name ?? code.toUpperCase()}</span>
                                <button onClick={() => onChange(languages.filter(l => l !== code))} className="text-zinc-500 hover:text-white ml-1">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
            <div className="relative">
                <button
                    onClick={() => { setLangPickerOpen(!langPickerOpen); setLangSearch("") }}
                    className="flex items-center gap-2 h-12 px-3 rounded-full border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                >
                    <CreateIcon className="w-5 h-5" /> <span className="text-md"> Add language</span>
                    <ChevronDown className={cn("w-5 h-5 transition-transform", langPickerOpen && "rotate-180")} />
                </button>
                {langPickerOpen && (
                    <div className="absolute top-10 left-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 w-56 flex flex-col" style={{ maxHeight: 280 }}>
                        <div className="p-2 border-b border-zinc-700/60">
                            <div className="flex items-center gap-2 bg-zinc-800 rounded-full px-2.5 py-1.5">
                                <Search className="w-5 h-5 text-zinc-500 flex-none" />
                                <input
                                    autoFocus
                                    value={langSearch}
                                    onChange={e => setLangSearch(e.target.value)}
                                    placeholder="Search language..."
                                    className="flex-1 bg-transparent text-md text-zinc-200 placeholder:text-zinc-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar">
                            {CAPTION_LANGS.filter(l =>
                                l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
                                l.code.toLowerCase().includes(langSearch.toLowerCase())
                            ).map(lang => (
                                <button
                                    key={lang.code}
                                    onClick={() => {
                                        onChange(
                                            languages.includes(lang.code)
                                                ? languages.filter(c => c !== lang.code)
                                                : [...languages, lang.code]
                                        )
                                    }}
                                    className={cn(
                                        "flex items-center justify-between w-full px-3 py-2 text-md hover:bg-white/5 transition-colors",
                                        languages.includes(lang.code) ? "text-twitter2" : "text-zinc-200"
                                    )}
                                >
                                    <span>{lang.name}</span>
                                    {languages.includes(lang.code) && <Check className="w-3.5 h-3.5 flex-none" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
