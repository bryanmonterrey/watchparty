"use client"

import * as React from "react"
import { CardsEditor } from "@/components/video/cards"
import { EndScreenEditor } from "@/components/video/end-screen"
import { useVideoDetails } from "./use-video-details"
import { StepHeader } from "./step-header"
import { StepFooter } from "./step-footer"
import { PreviewPanel } from "./preview-panel"
import { DetailsStep } from "./details-step"
import { VideoElementsStep } from "./video-elements-step"
import { ChecksStep } from "./checks-step"
import { VisibilityStep } from "./visibility-step"
import type { VideoDetailsStepProps } from "./types"

export function VideoDetailsStep(props: VideoDetailsStepProps) {
    const state = useVideoDetails(props)
    const showPreview = state.currentStep === "details" || state.currentStep === "visibility"

    return (
        <div className="relative flex flex-col h-[calc(100vh-125px)] max-h-[700px]">
            <StepHeader
                title={state.title}
                currentStep={state.currentStep}
                onStepChange={state.setCurrentStep}
            />
            <div className="flex flex-1 overflow-hidden p-4 flex-col md:flex-row">
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    {state.currentStep === "details" && (
                        <DetailsStep
                            title={state.title}
                            setTitle={state.setTitle}
                            titleTags={state.titleTags}
                            descTags={state.descTags}
                            description={state.description}
                            setDescription={state.setDescription}
                            thumbnailPreview={state.thumbnailPreview}
                            isThumbnailDragActive={state.isThumbnailDragActive}
                            isThumbnailUploading={state.isThumbnailUploading}
                            getThumbnailRootProps={state.getThumbnailRootProps}
                            getThumbnailInputProps={state.getThumbnailInputProps}
                            selectedPlaylists={state.selectedPlaylists}
                            setSelectedPlaylists={state.setSelectedPlaylists}
                            videoAudience={state.videoAudience}
                            setVideoAudience={state.setVideoAudience}
                            autoChapters={state.autoChapters}
                            setAutoChapters={state.setAutoChapters}
                            autoPlaces={state.autoPlaces}
                            setAutoPlaces={state.setAutoPlaces}
                            remixing={state.remixing}
                            setRemixing={state.setRemixing}
                            comments={state.comments}
                            setComments={state.setComments}
                            commentModeration={state.commentModeration}
                            setCommentModeration={state.setCommentModeration}
                            commentSort={state.commentSort}
                            setCommentSort={state.setCommentSort}
                            showLikeCount={state.showLikeCount}
                            setShowLikeCount={state.setShowLikeCount}
                            captionCertification={state.captionCertification}
                            setCaptionCertification={state.setCaptionCertification}
                            recordingDate={state.recordingDate}
                            setRecordingDate={state.setRecordingDate}
                            videoLocation={state.videoLocation}
                            setVideoLocation={state.setVideoLocation}
                            license={state.license}
                            setLicense={state.setLicense}
                            allowEmbedding={state.allowEmbedding}
                            setAllowEmbedding={state.setAllowEmbedding}
                            publishToFeed={state.publishToFeed}
                            setPublishToFeed={state.setPublishToFeed}
                            category={state.category}
                            setCategory={state.setCategory}
                            languages={state.languages}
                            onLanguagesChange={state.setLanguages}
                            collaborators={state.collaborators}
                            onCollaboratorsChange={state.setCollaborators}
                            whoCanComment={state.whoCanComment}
                            setWhoCanComment={state.setWhoCanComment}
                            allowedCommenters={state.allowedCommenters}
                            onAllowedCommentersChange={state.setAllowedCommenters}
                        />
                    )}
                    {state.currentStep === "video-elements" && (
                        <VideoElementsStep
                            pendingCards={state.pendingCards}
                            onCardsEditorOpen={() => state.setCardsEditorOpen(true)}
                            pendingEndScreenElements={state.pendingEndScreenElements}
                            onEndScreenEditorOpen={() => state.setEndScreenEditorOpen(true)}
                            videoUrl={props.uploadedUrl}
                        />
                    )}
                    {state.currentStep === "checks" && <ChecksStep />}
                    {state.currentStep === "visibility" && (
                        <VisibilityStep
                            visibility={state.visibility}
                            onVisibilityChange={state.setVisibility}
                        />
                    )}
                </div>
                {showPreview && (
                    <PreviewPanel
                        file={props.file}
                        videoUrl={state.videoUrl}
                        previewVideoRef={state.previewVideoRef}
                        onLoadedMetadata={(e) => {
                            const vid = e.currentTarget
                            const seekTo = isFinite(vid.duration) && vid.duration > 0
                                ? Math.min(vid.duration * 0.15, 5)
                                : 0
                            if (seekTo > 0) {
                                vid.currentTime = seekTo
                            } else {
                                requestAnimationFrame(() => requestAnimationFrame(() => state.captureAndUpload(vid)))
                            }
                        }}
                        onSeeked={(e) => {
                            // Must capture currentTarget synchronously — it's null inside rAF
                            const vid = e.currentTarget
                            requestAnimationFrame(() => requestAnimationFrame(() => state.captureAndUpload(vid)))
                        }}
                        previewLink={state.previewLink}
                        copyLink={state.copyLink}
                    />
                )}
            </div>
            <StepFooter
                currentStep={state.currentStep}
                isUploading={props.isUploading}
                uploadProgress={props.uploadProgress ?? 0}
                tokenLaunch={state.tokenLaunch}
                onTokenLaunchSave={(updates) => state.setTokenLaunch(prev => ({ ...prev, ...updates }))}
                onBack={state.handleBack}
                onNext={state.handleNext}
            />
            {/* Cards editor sub-dialog */}
            <CardsEditor
                open={state.cardsEditorOpen}
                onClose={() => state.setCardsEditorOpen(false)}
                videoUrl={props.uploadedUrl}
                thumbnailUrl={state.thumbnailUrl ?? state.thumbnailPreview ?? undefined}
                onDraftChange={state.setPendingCards}
                initialCards={state.pendingCards}
            />
            {/* End screen editor sub-dialog */}
            <EndScreenEditor
                open={state.endScreenEditorOpen}
                onClose={() => state.setEndScreenEditorOpen(false)}
                videoUrl={props.uploadedUrl}
                thumbnailUrl={state.thumbnailUrl ?? state.thumbnailPreview ?? undefined}
                onDraftChange={state.setPendingEndScreenElements}
                initialElements={state.pendingEndScreenElements}
            />
        </div>
    )
}
