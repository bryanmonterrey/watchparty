import { router, mergeRouters } from "@/server/trpc";
import { accountRouter } from "./account";
import { assistantRouter } from "./assistant";
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
import { predictionsRouter } from "./predictions";
import { pnlRouter } from "./pnl";
import { perpsRouter } from "./perps";
import { copyRouter } from "./copy";
import { profileRouter } from "./profile";
import { panelsRouter } from "./panels";
import { discoverRouter } from "./discover";
import { coinFeedRouter } from "./coinFeed";
import { trendingRouter } from "./trending";
import { tagsRouter } from "./tags";
import { apiKeysRouter } from "./apiKeys";
import { developerWebhooksRouter } from "./developerWebhooks";
import { developerAppsRouter } from "./developerApps";
import { developerProjectsRouter } from "./developerProjects";
import { developerStreamRulesRouter } from "./developerStreamRules";
import { developerAnnouncementsRouter } from "./developerAnnouncements";
import { developerBotsRouter } from "./developerBots";
import { oauthGrantsRouter } from "./oauthGrants";
import { communityModerationRouter } from "./communityModeration";
import { botRouter } from "./bot";
import { studioRouter } from "./studio";

/**
 * Root application router
 * Merges all sub-routers together
 */
export const appRouter = router({
    account: accountRouter,
    assistant: assistantRouter,
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
    predictions: predictionsRouter,
    pnl: pnlRouter,
    perps: perpsRouter,
    copy: copyRouter,
    profile: profileRouter,
    panels: panelsRouter,
    discover: discoverRouter,
    coinFeed: coinFeedRouter,
    trending: trendingRouter,
    tags: tagsRouter,
    apiKeys: apiKeysRouter,
    developerWebhooks: developerWebhooksRouter,
    developerApps: developerAppsRouter,
    developerProjects: developerProjectsRouter,
    developerStreamRules: developerStreamRulesRouter,
    developerAnnouncements: developerAnnouncementsRouter,
    developerBots: developerBotsRouter,
    bot: botRouter,
    oauthGrants: oauthGrantsRouter,
    communityModeration: communityModerationRouter,
    studio: studioRouter,
});

/**
 * Export type definition for the router
 * This is used on the client for end-to-end type safety
 */
export type AppRouter = typeof appRouter;
