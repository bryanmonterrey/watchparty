"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthSession } from "@/hooks/use-auth-session";

interface WithAuthProps {
    children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;
    onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * A wrapper component that intercepts clicks. 
 * If the user is authenticated, it fires the normal onClick handler or lets the child's onClick propagate.
 * If the user is unauthenticated, it sends them to /login instead of triggering the action —
 * the same destination as the header's Sign In button, with the current path as callbackUrl.
 * (It used to open WalletConnectModal, which offers only the wallet methods and statically
 * pulled the modal into every bundle that wraps something in WithAuth.)
 * 
 * Uses forwardRef so it can safely wrap items inside Dropdowns, Tooltips, or DialogTriggers.
 */
export const WithAuth = React.forwardRef<HTMLElement, WithAuthProps & React.HTMLAttributes<HTMLElement>>(
    ({ children, onClick, ...props }, ref) => {
        const { data: session, isPending } = useAuthSession();
        const router = useRouter();
        const pathname = usePathname();

        const handleClick: React.MouseEventHandler<HTMLElement> = (e) => {
            // Wait for session to load before making decisions
            if (isPending) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Safely check if user is populated in the session object
            const hasUser = session && typeof session === "object" && "user" in session && Boolean(session.user);

            // If not logged in, intercept the click and go to login
            if (!hasUser) {
                // Stop navigation and propagation but do NOT fire the parent's onClick (e.g., DialogTrigger)
                e.preventDefault();
                e.stopPropagation();

                // Also fire the child's native onClick (which contains the sidebar-closing logic)
                if (children && children.props && typeof children.props.onClick === "function") {
                    children.props.onClick(e);
                }

                router.push(`/login?callbackUrl=${encodeURIComponent(pathname || "/home")}`);
                return;
            }

            // If logged in, fire both the injected onClick (from wrappers like Radix) and the child's native onClick
            let eventHandled = false;

            if (onClick) {
                onClick(e);
                eventHandled = true;
            }

            if (children && children.props && typeof children.props.onClick === "function") {
                children.props.onClick(e);
                eventHandled = true;
            }
        };

        return (
            <React.Fragment>
                {/* Clone the child element to attach our intercepted onClick handler and forward the ref */}
                {React.isValidElement(children)
                    ? React.cloneElement(children, { ...props, onClick: handleClick, ref } as any)
                    : children}
            </React.Fragment>
        );
    }
);

WithAuth.displayName = "WithAuth";
