"use client";

import { MobileHeader } from "./mobile-header";
import { MobileTabBar } from "./mobile-tab-bar";

// Everything fixed-position and mobile-only, mounted once in (app)/layout.
export function MobileChrome() {
    return (
        <>
            <MobileHeader />
            <MobileTabBar />
        </>
    );
}
