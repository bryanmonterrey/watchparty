"use client";

import React, { useState } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";

interface WithAuthProps {
    children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement> }>;
    onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * A wrapper component that intercepts clicks. 
 * If the user is authenticated, it fires the normal onClick handler or lets the child's onClick propagate.
 * If the user is unauthenticated, it opens the WalletConnectModal instead of triggering the action.
 * 
 * Uses forwardRef so it can safely wrap items inside Dropdowns, Tooltips, or DialogTriggers.
 */
export const WithAuth = React.forwardRef<HTMLElement, WithAuthProps & React.HTMLAttributes<HTMLElement>>(
    ({ children, onClick, ...props }, ref) => {
        const { data: session, isPending } = useAuthSession();
        const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

        const handleClick: React.MouseEventHandler<HTMLElement> = (e) => {
            // Wait for session to load before making decisions
            if (isPending) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Safely check if user is populated in the session object
            const hasUser = session && typeof session === "object" && "user" in session && Boolean(session.user);

            // If not logged in, intercept the click and show login
            if (!hasUser) {
                // Stop navigation and propagation but do NOT fire the parent's onClick (e.g., DialogTrigger)
                e.preventDefault();
                e.stopPropagation();

                // Also fire the child's native onClick (which contains the sidebar-closing logic)
                if (children && children.props && typeof children.props.onClick === "function") {
                    children.props.onClick(e);
                }

                setIsLoginModalOpen(true);
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

                {/* The login modal that appears for unauthenticated users */}
                <WalletConnectModal
                    open={isLoginModalOpen}
                    onOpenChange={setIsLoginModalOpen}
                />
            </React.Fragment>
        );
    }
);

WithAuth.displayName = "WithAuth";
