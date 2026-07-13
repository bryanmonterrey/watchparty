import { router, mergeRouters } from "@/server/trpc";
import { accountRouter } from "./account";
import { auditLogRouter } from "./auditLog";
import { passkeyRouter } from "./passkey";
import { walletRouter } from "./wallet";
import { conversationRouter } from "./conversation";
import { messageRouter } from "./message";
import { encryptionRouter } from "./encryption";
import { userRouter } from "./user";
import { contentRouter } from "./content";
import { feedRouter } from "./feed";
import { postRouter } from "./post";
import { uploadRouter } from "./upload";
import { escrowRouter } from "./escrow";
import { communityRouter } from "./community";
import { commentRouter } from "./comment";
import { storyRouter } from "./story";
import { notificationRouter } from "./notification";
import { moderationRouter } from "./moderation";
import { creatorRouter } from "./creator";
import { notificationPrefsRouter } from "./notificationPrefs";
import { streamRouter } from "./stream";
import { adminRouter } from "./admin";
import { subscriptionRouter } from "./subscription";
import { premiumRouter } from "./premium";
import { referralRouter } from "./referral";
import { cardsRouter } from "./cards";
import { friendsRouter } from "./friends";
import { spacesRouter } from "./spaces";
import { tradeRouter } from "./trade";
import { calloutRouter } from "./callout";
import { questRouter } from "./quest";

/**
 * Root application router
 * Merges all sub-routers together
 */
export const appRouter = router({
    account: accountRouter,
    auditLog: auditLogRouter,
    passkey: passkeyRouter,
    wallet: walletRouter,
    conversation: conversationRouter,
    message: messageRouter,
    encryption: encryptionRouter,
    user: userRouter,
    content: mergeRouters(contentRouter, feedRouter, postRouter),
    upload: uploadRouter,
    escrow: escrowRouter,
    community: communityRouter,
    comment: commentRouter,
    story: storyRouter,
    notification: notificationRouter,
    moderation: moderationRouter,
    creator: creatorRouter,
    notificationPrefs: notificationPrefsRouter,
    stream: streamRouter,
    admin: adminRouter,
    subscription: subscriptionRouter,
    premium: premiumRouter,
    referral: referralRouter,
    cards: cardsRouter,
    friends: friendsRouter,
    spaces: spacesRouter,
    trade: tradeRouter,
    callout: calloutRouter,
    quest: questRouter,
});

/**
 * Export type definition for the router
 * This is used on the client for end-to-end type safety
 */
export type AppRouter = typeof appRouter;
