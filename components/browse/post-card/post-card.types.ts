export interface PostCardUser {
    name: string | null;
    username: string | null;
    avatar_url: string | null;
    verifiedTier?: string | null;
    affiliateUsername?: string | null;
    affiliateIconUrl?: string | null;
    wallet_address?: string | null;
}

export interface PostCardPost {
    id: string;
    content: string | null;
    replyToId?: string | null;
    parentContent?: string | null;
    parentImageUrl?: string | null;
    parentMedia?: { type: "image" | "video"; url: string }[] | null;
    parentCreatedAt?: Date | string | null;
    parentUsername?: string | null;
    parentUserId?: string | null;
    parentUserAvatar?: string | null;
    parentUserName?: string | null;
    parentUserVerifiedTier?: string | null;
    imageUrl: string | null;
    media?: { type: "image" | "video" | "audio"; url: string }[] | null;
    likes: number;
    reposts: number;
    comments: number;
    bookmarks?: number;
    quoteCount?: number;
    views?: number;
    createdAt: Date | string | null;
    originalCreatedAt?: Date | string | null;
    ticker?: string | null;
    tokenId?: string | null;
    tokenStatus?: string | null;
    token_image?: string | null;
    videoUrl?: string | null;
    userId?: string | null;
    isPaywalled?: boolean;
    paywallPrice?: number | null;
    audience?: string | null;
    replyPrivacy?: string | null;
    hasContentWarning?: boolean;
    contentWarningText?: string | null;
    linkPreview?: {
        url: string;
        title: string | null;
        description: string | null;
        imageUrl: string | null;
        siteName: string | null;
    } | null;
    isPinned?: boolean;
    isLiked?: boolean;
    isBookmarked?: boolean;
    isReposted?: boolean;
    repostedBy?: { name: string; username: string | null } | null;
    repostOfId?: string | null;
    user: PostCardUser;
    quotedPost?: {
        id: string;
        userId?: string | null;
        content: string | null;
        imageUrl: string | null;
        media?: { type: "image" | "video" | "audio"; url: string }[] | null;
        videoUrl?: string | null;
        createdAt: Date | string | null;
        ticker?: string | null;
    tokenId?: string | null;
        audience?: string | null;
        replyPrivacy?: string | null;
        user: PostCardUser;
        hasContentWarning?: boolean;
        contentWarningText?: string | null;
    } | null;
}

/** Props for the PostCard component including threading state */
export interface PostCardProps {
    post: PostCardPost;
    index?: number;
    initialLiked?: boolean;
    initialBookmarked?: boolean;
    initialReposted?: boolean;
    isOwnPost?: boolean;
    connectTop?: boolean;
    connectBottom?: boolean;
}
