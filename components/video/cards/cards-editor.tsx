"use client";

import { useState, useCallback, useRef } from "react";
import { AnimatePresence } from "motion/react";

import { InfoIcon } from "@/components/icons";
import { CardList } from "./card-list";
import { CardsTimeline } from "./cards-timeline";
import { CardsPreview } from "./cards-preview";
import { CardSearch } from "./card-search";
import { useCards } from "./use-cards";
import { useHistoryCards } from "./use-history-cards";
import type { DraftCard, CardType } from "./types";
import type { SearchSelectPayload } from "./card-search/types";

// Renders as an absolute overlay within the parent container — no Dialog.
// Parent must be position:relative (or isolate) for this to work.

interface CardsEditorProps {
    open: boolean;
    onClose: () => void;
    postId?: string;                        // undefined → draft (local) mode
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    onDraftChange?: (cards: DraftCard[]) => void;
    initialCards?: DraftCard[];
}

// ── Shared shell ─────────────────────────────────────────────────────────

function EditorShell({
    onClose,
    onSave,
    isSaving,
    isDraft,
    isLoading,
    cardListSlot,
    previewSlot,
    timelineSlot,
    searchOverlay,
}: {
    onClose: () => void;
    onSave?: () => void;
    isSaving?: boolean;
    isDraft?: boolean;
    isLoading?: boolean;
    cardListSlot: React.ReactNode;
    previewSlot: React.ReactNode;
    timelineSlot: React.ReactNode;
    searchOverlay?: React.ReactNode;
}) {
    return (
        <div className="absolute inset-0 z-10 bg-black flex flex-col overflow-hidden rounded-4xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-[14px] border-b border-flexborder/60 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <InfoIcon className="size-6 text-[#aaaaaa]" />
                    <span className="text-[#f1f1f1] text-[20px] font-medium tracking-normal">Cards</span>
                    {isDraft && (
                        <span className="ml-2 text-[13px] text-[#aaaaaa]">Saved when you publish</span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-3 cursor-pointer text-md font-medium text-white bg-white/15 hover:bg-white/20 rounded-full transition-colors h-[36px] flex items-center justify-center"
                    >
                        Discard changes
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!onSave || isSaving}
                        className="px-4 py-3 cursor-pointer text-md font-medium bg-white text-[#030303] hover:bg-gray-200 rounded-full transition-colors disabled:opacity-30 disabled:bg-white/20 disabled:text-white/50 h-[36px] flex items-center justify-center"
                    >
                        {isSaving ? "Saving…" : "Save"}
                    </button>
                </div>
            </div>

            {/* Body — height is set solely by the preview; card list is absolutely
                 positioned so expanding cards never affect the body height */}
            <div className="relative overflow-hidden bg-black">
                {/* Preview determines body height */}
                <div className="ml-[360px] flex items-start justify-center overflow-hidden bg-black border-l border-flexborder/60">
                    {previewSlot}
                </div>

                {/* Card list — absolute, spans the exact body height, scrolls internally */}
                <div className="absolute inset-y-0 left-0 w-[360px] flex flex-col overflow-hidden bg-black">
                    {isLoading ? (
                        <div className="space-y-2 px-6">
                            {[1, 2].map(i => <div key={i} className="h-14 bg-zinc-800/50 rounded-lg animate-pulse" />)}
                        </div>
                    ) : cardListSlot}
                </div>
            </div>

            {/* Timeline */}
            <div className="border-t border-flexborder/60 flex-shrink-0 bg-black">
                {timelineSlot}
            </div>

            {/* Full-editor search overlay — covers header + body + timeline */}
            <AnimatePresence>{searchOverlay}</AnimatePresence>
        </div>
    );
}

// ── Published mode (DB-backed) ────────────────────────────────────────────

function PublishedCardsEditor({ postId, videoUrl, thumbnailUrl, onClose }: {
    postId: string;
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    onClose: () => void;
}) {
    const previewRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [searchState, setSearchState] = useState<{ type: CardType; editingCardId?: string } | null>(null);
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    const [overridesState, setOverridesState] = useState<{
        past: Record<string, Partial<DraftCard>>[];
        present: Record<string, Partial<DraftCard>>;
        future: Record<string, Partial<DraftCard>>[];
    }>({ past: [], present: {}, future: [] });

    const localOverrides = overridesState.present;

    const { cards, isLoading, addCard, saveCard, deleteCard, isSaving } = useCards(postId);
    const allCards = cards.map(c => ({ ...c, ...(localOverrides[c.id] ?? {}) }));

    const seek = useCallback((t: number) => {
        setCurrentTime(t);
        if (previewRef.current) { previewRef.current.currentTime = t; previewRef.current.pause(); }
    }, []);

    // Live override — no history entry (during drag or form typing)
    const applyOverride = useCallback((id: string, patch: Partial<DraftCard>) => {
        setOverridesState(s => ({ ...s, present: { ...s.present, [id]: { ...s.present[id], ...patch } } }));
    }, []);

    // Commit — snapshot the current overrides into undo history
    const commitOverrides = useCallback(() => {
        setOverridesState(s => ({ past: [...s.past, s.present], present: s.present, future: [] }));
    }, []);

    const handleUndo = useCallback(() => {
        setOverridesState(s => {
            if (!s.past.length) return s;
            return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] };
        });
    }, []);

    const handleRedo = useCallback(() => {
        setOverridesState(s => {
            if (!s.future.length) return s;
            return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
        });
    }, []);

    const handleCardSeek = useCallback((id: string, t: number) => {
        applyOverride(id, { startTime: t });
    }, [applyOverride]);

    const handleCardSeekCommit = useCallback(() => {
        commitOverrides();
    }, [commitOverrides]);

    const handleChange = useCallback((id: string, patch: Partial<DraftCard>) => {
        applyOverride(id, patch);
        if (patch.startTime !== undefined) seek(patch.startTime);
    }, [applyOverride, seek]);

    const handleSave = useCallback(async (card: DraftCard) => {
        await saveCard(card);
        setOverridesState(s => {
            const next = { ...s.present };
            delete next[card.id];
            return { past: [...s.past, s.present], present: next, future: [] };
        });
    }, [saveCard]);

    const handleSaveAll = useCallback(async () => {
        const pending = allCards.filter(c => !c.isPersisted || localOverrides[c.id]);
        await Promise.all(pending.map(card => saveCard(card)));
        setOverridesState({ past: [], present: {}, future: [] });
        onClose();
    }, [allCards, localOverrides, saveCard, onClose]);

    const handleSearchRequest = useCallback((type: CardType, editingCardId?: string) => {
        setSearchState({ type, editingCardId });
    }, []);

    const handleSearchSelect = useCallback((payload: SearchSelectPayload) => {
        if (!searchState) return;
        const { type, editingCardId } = searchState;
        const patch = { url: payload.url, title: payload.title, thumbnailUrl: payload.thumbnailUrl };
        if (editingCardId) {
            handleChange(editingCardId, patch);
        } else {
            const id = addCard(Math.floor(currentTime), type);
            handleChange(id, patch);
        }
        setSearchState(null);
    }, [searchState, addCard, handleChange, currentTime]);

    const hasPending = allCards.some(c => !c.isPersisted || !!localOverrides[c.id]);

    return (
        <EditorShell
            onClose={onClose}
            onSave={hasPending ? handleSaveAll : undefined}
            isSaving={isSaving}
            isLoading={isLoading}
            searchOverlay={searchState ? (
                <CardSearch
                    type={searchState.type}
                    onClose={() => setSearchState(null)}
                    onSelect={handleSearchSelect}
                />
            ) : undefined}
            cardListSlot={
                <CardList
                    cards={allCards}
                    videoDuration={duration}
                    onSaveCard={handleSave}
                    onDeleteCard={deleteCard}
                    onChangeCard={handleChange}
                    onSearchRequest={handleSearchRequest}
                    isSaving={isSaving}
                    activeCardId={activeCardId}
                    onSetActive={setActiveCardId}
                />
            }
            previewSlot={
                <CardsPreview
                    ref={previewRef}
                    videoUrl={videoUrl}
                    thumbnailUrl={thumbnailUrl}
                    currentTime={currentTime}
                    duration={duration}
                    cards={allCards}
                    activeCardId={activeCardId}
                    onClearActive={() => setActiveCardId(null)}
                    onTimeUpdate={setCurrentTime}
                    onDurationChange={setDuration}
                />
            }
            timelineSlot={
                <CardsTimeline
                    cards={allCards}
                    currentTime={currentTime}
                    duration={duration}
                    thumbnailUrl={thumbnailUrl}
                    onSeek={seek}
                    onCardSeek={handleCardSeek}
                    onCardSeekCommit={handleCardSeekCommit}
                    onAddCard={addCard}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={overridesState.past.length > 0}
                    canRedo={overridesState.future.length > 0}
                />
            }
        />
    );
}

// ── Draft mode (local-only, pre-publish) ──────────────────────────────────

function DraftCardsEditor({ videoUrl, thumbnailUrl, onClose, onDraftChange, initialCards }: {
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    onClose: () => void;
    onDraftChange?: (cards: DraftCard[]) => void;
    initialCards?: DraftCard[];
}) {
    const previewRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [searchState, setSearchState] = useState<{ type: CardType; editingCardId?: string } | null>(null);
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    const {
        cards,
        addCard,
        deleteCard,
        patchCard,
        commit,
        undo,
        redo,
        canUndo,
        canRedo,
    } = useHistoryCards(initialCards);

    const seek = useCallback((t: number) => {
        setCurrentTime(t);
        if (previewRef.current) { previewRef.current.currentTime = t; previewRef.current.pause(); }
    }, []);

    // Live during drag — no history entry
    const handleCardSeek = useCallback((id: string, t: number) => {
        patchCard(id, { startTime: t });
    }, [patchCard]);

    // On drag end — patchCard already moved the marker; just snapshot current state
    const handleCardSeekCommit = useCallback((_id: string) => {
        commit();
    }, [commit]);

    // Live during form typing — no history entry; saveCard below commits
    const handleChange = useCallback((id: string, patch: Partial<DraftCard>) => {
        patchCard(id, patch);
        if (patch.startTime !== undefined) seek(patch.startTime);
    }, [patchCard, seek]);

    // patchCard already applied all form changes live; commit() snapshots
    // current state into history. Don't use the card arg — it's stale by the
    // time this is called (React batches onChange + onSave in the same flush).
    const handleSave = useCallback(async (_card: DraftCard) => {
        commit();
        onDraftChange?.(cards);
    }, [commit, cards, onDraftChange]);

    const handleDelete = useCallback(async (id: string) => {
        await deleteCard(id);
    }, [deleteCard]);

    const handleAdd = useCallback((t: number, type?: CardType) => {
        return addCard(t, type);
    }, [addCard]);

    const handleSearchRequest = useCallback((type: CardType, editingCardId?: string) => {
        setSearchState({ type, editingCardId });
    }, []);

    const handleSearchSelect = useCallback((payload: SearchSelectPayload) => {
        if (!searchState) return;
        const { type, editingCardId } = searchState;
        const patch = { url: payload.url, title: payload.title, thumbnailUrl: payload.thumbnailUrl };
        if (editingCardId) {
            handleChange(editingCardId, patch);
        } else {
            const id = handleAdd(Math.floor(currentTime), type);
            handleChange(id, patch);
        }
        setSearchState(null);
    }, [searchState, handleAdd, handleChange, currentTime]);

    const handleSaveAll = useCallback(() => {
        onDraftChange?.(cards);
        onClose();
    }, [cards, onDraftChange, onClose]);

    const handleDiscard = useCallback(() => {
        onDraftChange?.(initialCards ?? []);
        onClose();
    }, [initialCards, onDraftChange, onClose]);

    return (
        <EditorShell
            onClose={handleDiscard}
            onSave={handleSaveAll}
            isDraft
            searchOverlay={searchState ? (
                <CardSearch
                    type={searchState.type}
                    onClose={() => setSearchState(null)}
                    onSelect={handleSearchSelect}
                />
            ) : undefined}
            cardListSlot={
                <CardList
                    cards={cards}
                    videoDuration={duration}
                    onSaveCard={handleSave}
                    onDeleteCard={handleDelete}
                    onChangeCard={handleChange}
                    onSearchRequest={handleSearchRequest}
                    isSaving={false}
                    activeCardId={activeCardId}
                    onSetActive={setActiveCardId}
                />
            }
            previewSlot={
                <CardsPreview
                    ref={previewRef}
                    videoUrl={videoUrl}
                    thumbnailUrl={thumbnailUrl}
                    currentTime={currentTime}
                    duration={duration}
                    cards={cards}
                    activeCardId={activeCardId}
                    onClearActive={() => setActiveCardId(null)}
                    onTimeUpdate={setCurrentTime}
                    onDurationChange={setDuration}
                />
            }
            timelineSlot={
                <CardsTimeline
                    cards={cards}
                    currentTime={currentTime}
                    duration={duration}
                    thumbnailUrl={thumbnailUrl}
                    onSeek={seek}
                    onCardSeek={handleCardSeek}
                    onCardSeekCommit={handleCardSeekCommit}
                    onAddCard={handleAdd}
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                />
            }
        />
    );
}

// ── Public component ──────────────────────────────────────────────────────

export function CardsEditor({ open, onClose, postId, videoUrl, thumbnailUrl, onDraftChange, initialCards }: CardsEditorProps) {
    if (!open) return null;
    if (postId) {
        return <PublishedCardsEditor postId={postId} videoUrl={videoUrl} thumbnailUrl={thumbnailUrl} onClose={onClose} />;
    }
    return <DraftCardsEditor videoUrl={videoUrl} thumbnailUrl={thumbnailUrl} onClose={onClose} onDraftChange={onDraftChange} initialCards={initialCards} />;
}
