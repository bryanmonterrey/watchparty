export type StepType = "details" | "video-elements" | "checks" | "visibility"

export interface VideoDetailsStepProps {
    file: File
    uploadedUrl: string | null
    isUploading: boolean
    uploadProgress?: number
    onBack: () => void
    onNext: () => void
}

export interface Collaborator {
    id: string
    name: string
    username?: string
    avatar_url?: string
}

export interface AllowedCommenter {
    id: string
    name: string
    avatar_url?: string
}
