import { communityServers, posts, user } from "@/db/schema";
import { sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { effectiveVerifiedTier } from "@/lib/verified-tier";

// THE shape a PostCard needs — selected and mapped in ONE place.
//
// Before this existed, `feed.getFeed` (discover) and `content.getPostsByUser`
// (profile Posts tab) each had their own hand-maintained copy. They drifted:
// the profile copy was missing 36 columns, including EVERY video field, so
// video posts rendered as empty text cards on profiles while looking fine in
// discover (owner report 2026-07-22). Any new post feature belongs here, not
// in a single procedure.

// drizzle's alias() returns a table whose columns carry the ALIAS name in their
// `tableName` type, so an aliased table is NOT assignable to `typeof posts`.
// Derive the alias types from the function itself.
type PostsAlias = ReturnType<typeof alias<typeof posts, string>>;
type UserAlias = ReturnType<typeof alias<typeof user, string>>;
type ServerAlias = ReturnType<typeof alias<typeof communityServers, string>>;

type PostAliases = {
    origPosts: PostsAlias;
    origUser: UserAlias;
    parentPosts: PostsAlias;
    parentUser: UserAlias;
    /**
     * The community server the AUTHOR represents, joined through
     * `user.serverTagId`. An alias rather than the table itself because a query
     * may join community_servers again for its own reasons, and two unaliased
     * joins of one table collide.
     *
     * The caller owes the matching leftJoin — selecting these columns without
     * it is a SQL error, which is the loud failure we want rather than a badge
     * that silently never appears.
     */
    authorServer: ServerAlias;
    /** Viewer id for the isLiked/isBookmarked/isReposted subqueries ("" when logged out). */
    viewerId: string;
};

/**
 * The author fields every post-shaped query selects, INCLUDING the community
 * badge. Exported because six other procedures (replies, bookmarks, likes,
 * media, quotes) hand-rolled this same object and could not use
 * `postSelectFields` — their row shapes differ. The FIELD LIST is what drifted
 * before; sharing just that costs them nothing and keeps a new author feature
 * from having to be added in seven places.
 *
 * The caller owes the matching `leftJoin(authorServer, eq(user.serverTagId,
 * authorServer.id))`, and LEFT specifically — almost nobody represents a
 * server, and an inner join would drop every post by everyone else.
 */
export function authorSelectFields(authorServer: ServerAlias) {
    return {
        id: user.id,
        name: user.name,
        username: user.username,
        avatar_url: user.avatar_url,
        wallet_address: user.wallet_address,
        verifiedTier: effectiveVerifiedTier(user.verifiedTier, user.hideVerifiedBadge),
        affiliateUsername: user.affiliateUsername,
        affiliateIconUrl: user.affiliateIconUrl,
        // Opt-in community badge. All three travel together: the post card shows
        // the name, the icon when there is one, and links by id.
        serverTag: authorServer.tag,
        serverTagIconUrl: authorServer.imageUrl,
        serverTagId: authorServer.id,
    };
}

export function postSelectFields({ origPosts, origUser, parentPosts, parentUser, authorServer, viewerId }: PostAliases) {
    return {
        id: posts.id,
        userId: posts.userId,
        content: posts.content,
        imageUrl: posts.imageUrl,
        visibility: posts.visibility,
        audience: posts.audience,
        replyPrivacy: posts.replyPrivacy,
        likes: posts.likes,
        reposts: posts.reposts,
        comments: posts.comments,
        bookmarks: sql<number>`(SELECT count(*) FROM bookmarks WHERE bookmarks."contentId" = ${posts.id} AND bookmarks."contentType" = 'post')`,
        views: posts.views,
        createdAt: posts.createdAt,
        baseScore: posts.baseScore,
        ticker: posts.ticker,
        // The ticker pill links to /coin/<id>. For a LIVE token this id
        // IS its mint address (createPost sets tokens.id to tokenAddress
        // when launching live), so one field serves the route.
        tokenId: posts.tokenId,
        token_image: posts.token_image,
        media: posts.media,
        tokenStatus: posts.tokenStatus,
        repostOfId: posts.repostOfId,
        isPaywalled: posts.isPaywalled,
        paywallPrice: posts.paywallPrice,
        hasContentWarning: posts.hasContentWarning,
        contentWarningText: posts.contentWarningText,
        linkPreview: posts.linkPreview,
        replyToId: posts.replyToId,
        isPinned: posts.isPinned,
        isLiked: sql<boolean>`EXISTS (SELECT 1 FROM likes WHERE likes."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND likes."userId" = ${viewerId} AND likes."contentType" = 'post')`,
        isBookmarked: sql<boolean>`EXISTS (SELECT 1 FROM bookmarks WHERE bookmarks."contentId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND bookmarks."userId" = ${viewerId} AND bookmarks."contentType" = 'post')`,
        isReposted: sql<boolean>`EXISTS (SELECT 1 FROM posts rp WHERE rp."repostOfId" = COALESCE(${posts.repostOfId}, ${posts.id}) AND rp."userId" = ${viewerId} AND rp."status" = 'published')`,
        user: authorSelectFields(authorServer),
        videoUrl: posts.videoUrl,
        videoTitle: posts.title,
        videoThumbnailUrl: posts.thumbnailUrl,
        videoDuration: posts.duration,
        isLive: posts.isLive,
        origId: origPosts.id,
        origUserId: origPosts.userId,
        origContent: origPosts.content,
        origImageUrl: origPosts.imageUrl,
        origLikes: origPosts.likes,
        origReposts: origPosts.reposts,
        origComments: origPosts.comments,
        origViews: origPosts.views,
        origCreatedAt: origPosts.createdAt,
        origTicker: origPosts.ticker,
        origTokenStatus: origPosts.tokenStatus,
        origIsPaywalled: origPosts.isPaywalled,
        origPaywallPrice: origPosts.paywallPrice,
        origHasContentWarning: origPosts.hasContentWarning,
        origContentWarningText: origPosts.contentWarningText,
        origLinkPreview: origPosts.linkPreview,
        origUserName: origUser.name,
        origUserUsername: origUser.username,
        origUserAvatarUrl: origUser.avatar_url,
        origUserVerifiedTier: effectiveVerifiedTier(origUser.verifiedTier, origUser.hideVerifiedBadge),
        origUserAffiliateUsername: origUser.affiliateUsername,
        origUserAffiliateIconUrl: origUser.affiliateIconUrl,
        origVideoUrl: origPosts.videoUrl,
        origVideoTitle: origPosts.title,
        origVideoThumbnailUrl: origPosts.thumbnailUrl,
        origVideoDuration: origPosts.duration,
        origVideoIsLive: origPosts.isLive,
        origMedia: origPosts.media,
        origTokenImage: origPosts.token_image,
        origTokenId: origPosts.tokenId,
        origAudience: origPosts.audience,
        origReplyPrivacy: origPosts.replyPrivacy,
        parentUsername: parentUser.username,
        parentUserId: parentUser.id,
        parentContent: parentPosts.content,
        parentMedia: parentPosts.media,
        parentImageUrl: parentPosts.imageUrl,
        parentCreatedAt: parentPosts.createdAt,
        // Engagement counts for the feed's "virtual parent" cards (a self-thread
        // parent lifted above its reply when it isn't in the page) — without
        // them the parent card renders NaN counts.
        parentLikes: parentPosts.likes,
        parentReposts: parentPosts.reposts,
        parentComments: parentPosts.comments,
        parentViews: parentPosts.views,
        parentUserAvatar: parentUser.avatar_url,
        parentUserName: parentUser.name,
        parentUserVerifiedTier: effectiveVerifiedTier(parentUser.verifiedTier, parentUser.hideVerifiedBadge),
    };
}

/**
 * Flattens a joined row into what PostCard consumes: plain post, quote-repost
 * (original nested as `quotedPost`), or plain repost (the ORIGINAL becomes the
 * card, with `repostedBy` naming the reposter).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapPostRow(row: any) {
    const {
        origId, origUserId, origContent, origImageUrl, origLikes, origReposts,
        origComments, origViews, origCreatedAt, origTicker, origTokenStatus,
        origIsPaywalled, origPaywallPrice, origHasContentWarning, origContentWarningText,
        origLinkPreview, origUserName, origUserUsername, origUserAvatarUrl,
        origUserVerifiedTier, origVideoUrl, origVideoTitle, origVideoThumbnailUrl,
        origVideoDuration, origVideoIsLive, origMedia, origTokenImage, origTokenId,
        origAudience, origReplyPrivacy,
        parentUsername, parentUserId, parentContent, parentMedia, parentImageUrl,
        parentCreatedAt, parentUserAvatar, parentUserName, parentUserVerifiedTier,
        parentLikes, parentReposts, parentComments, parentViews,
        ...rest
    } = row;

    const parentFields = {
        parentUsername, parentUserId, parentContent, parentMedia, parentImageUrl,
        parentCreatedAt, parentUserAvatar, parentUserName, parentUserVerifiedTier,
        parentLikes, parentReposts, parentComments, parentViews,
    };

    if (row.repostOfId && row.origId) {
        const isQuote = (row.content && row.content.trim().length > 0) || (row.media && row.media.length > 0) || row.imageUrl;

        if (isQuote) {
            return {
                ...rest,
                feedKey: null,
                repostedBy: null,
                ...parentFields,
                quotedPost: {
                    id: origId,
                    userId: origUserId,
                    content: origContent,
                    imageUrl: origImageUrl,
                    media: origMedia,
                    videoUrl: origVideoUrl,
                    videoThumbnailUrl: origVideoThumbnailUrl,
                    videoDuration: origVideoDuration,
                    isLive: origVideoIsLive,
                    createdAt: origCreatedAt,
                    ticker: origTicker,
                    audience: origAudience,
                    replyPrivacy: origReplyPrivacy,
                    user: {
                        name: origUserName,
                        username: origUserUsername,
                        avatar_url: origUserAvatarUrl,
                        verifiedTier: origUserVerifiedTier,
                        affiliateUsername: row.origUserAffiliateUsername,
                        affiliateIconUrl: row.origUserAffiliateIconUrl,
                    },
                    hasContentWarning: origHasContentWarning,
                    contentWarningText: origContentWarningText,
                },
            };
        }

        // Plain repost: the original post IS the card.
        return {
            id: origId,
            feedKey: row.id,
            userId: origUserId,
            content: origContent,
            imageUrl: origImageUrl || null,
            media: origMedia || [],
            token_image: origTokenImage || null,
            tokenId: origTokenId || null,
            videoUrl: origVideoUrl ?? null,
            videoTitle: origVideoTitle ?? null,
            videoThumbnailUrl: origVideoThumbnailUrl ?? null,
            videoDuration: origVideoDuration ?? null,
            isLive: origVideoIsLive ?? false,
            visibility: row.visibility,
            audience: origAudience,
            replyPrivacy: origReplyPrivacy,
            likes: origLikes ?? 0,
            reposts: origReposts ?? 0,
            comments: origComments ?? 0,
            views: origViews ?? 0,
            bookmarks: row.bookmarks ?? 0,
            createdAt: row.createdAt,
            originalCreatedAt: origCreatedAt,
            ticker: origTicker ?? null,
            tokenStatus: origTokenStatus ?? null,
            repostOfId: null,
            isPaywalled: origIsPaywalled ?? false,
            paywallPrice: origPaywallPrice ?? null,
            hasContentWarning: origHasContentWarning ?? false,
            contentWarningText: origContentWarningText ?? null,
            linkPreview: origLinkPreview ?? null,
            isLiked: row.isLiked ?? false,
            isBookmarked: row.isBookmarked ?? false,
            isReposted: row.isReposted ?? false,
            isPinned: row.isPinned ?? false,
            user: {
                id: origUserId,
                name: origUserName,
                username: origUserUsername ?? null,
                avatar_url: origUserAvatarUrl ?? null,
                verifiedTier: origUserVerifiedTier ?? null,
                affiliateUsername: row.origUserAffiliateUsername ?? null,
                affiliateIconUrl: row.origUserAffiliateIconUrl ?? null,
            },
            repostedBy: { name: row.user.name, username: row.user.username ?? null },
            ...parentFields,
        };
    }

    return { ...rest, feedKey: null, repostedBy: null, quotedPost: null, ...parentFields };
}
