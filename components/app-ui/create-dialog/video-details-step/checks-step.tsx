"use client"

import * as React from "react"

export function ChecksStep() {
    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-1">
                <h3 className="text-xl font-semibold text-white">Checks</h3>
                <p className="text-sm text-zinc-400">We'll check your video for issues that may restrict its visibility and then you will have the opportunity to fix issues before publishing your video. <a href="#" className="text-blue-500 hover:underline">Learn more</a></p>
            </div>

            <div className="space-y-6">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-white">Copyright</h4>
                        <div className="flex items-center gap-2">
                            {/* Green check icon */}
                            <div className="h-6 w-6 rounded-full border border-green-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                        </div>
                    </div>
                    <p className="text-sm text-zinc-500">No issues found</p>
                </div>
                <div className="space-y-2">
                    <p className="text-xs text-zinc-500">
                        Remember: These check results aren't final. Issues may come up in the future that impact your video. <a href="#" className="text-blue-500 hover:underline">Learn more</a>
                    </p>
                </div>
            </div>
        </div>
    )
}
