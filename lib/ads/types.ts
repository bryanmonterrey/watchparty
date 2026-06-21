// Shared ad-delivery types — mirror the OpenAdServer `/api/ad/request` contract.

export interface AdRequestParams {
    slot_id: string;
    user_id?: string;
    device?: { os: string; os_version?: string };
    geo?: { country?: string; city?: string };
    interests?: string[];
}

export interface AdCreative {
    title: string;
    description?: string;
    image_url?: string;
    video_url?: string;
    landing_url: string;
    creative_type?: number;
}

export interface AdTracking {
    impression_url: string;
    click_url: string;
}

export interface Ad {
    creative: AdCreative;
    tracking: AdTracking;
}

export interface AdResponse {
    ad: Ad | null;
}
