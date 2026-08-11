// The app verification checklist (Phase 11, Discord §9), as PURE logic — no DB,
// no network — so the per-app detail (verificationChecklist) and the batch
// apps-list summary (verificationSummary) compute it ONE way and can't drift,
// and so the criteria are unit-testable (tests/developer-verification.test.ts).
// The router just feeds it the app + owner fields and renders what comes back.

export type VerificationInput = {
    name: string | null;
    description: string | null;
    iconUrl: string | null;
    tosUrl: string | null;
    privacyUrl: string | null;
    emailVerified: boolean | null;
    twoFactorEnabled: boolean | null;
};

export type VerificationCriterion = {
    key: string;
    label: string;
    detail: string;
    met: boolean;
};

export type VerificationResult = {
    criteria: VerificationCriterion[];
    met: number;
    total: number;
    complete: boolean;
};

export function computeVerification(input: VerificationInput): VerificationResult {
    const criteria: VerificationCriterion[] = [
        {
            key: "profile",
            label: "Complete app profile",
            detail: "A name, description, and icon.",
            // A whitespace-only description or empty icon must not count.
            met: !!(input.name?.trim() && input.description?.trim() && input.iconUrl?.trim()),
        },
        {
            key: "tos",
            label: "Terms of Service URL",
            detail: "A link to your app's terms.",
            met: !!input.tosUrl?.trim(),
        },
        {
            key: "privacy",
            label: "Privacy Policy URL",
            detail: "A link to your privacy policy.",
            met: !!input.privacyUrl?.trim(),
        },
        {
            key: "email",
            label: "Verified owner email",
            detail: "The owner account's email is confirmed.",
            met: !!input.emailVerified,
        },
        {
            key: "2fa",
            label: "Two-factor authentication",
            detail: "2FA is enabled on the owner account.",
            met: !!input.twoFactorEnabled,
        },
    ];
    const met = criteria.filter((c) => c.met).length;
    return { criteria, met, total: criteria.length, complete: met === criteria.length };
}
