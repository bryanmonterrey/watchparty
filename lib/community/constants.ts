/**
 * Values shared between the community router and the client's optimistic
 * updates. An optimistic patch has to produce EXACTLY what the server will send
 * back, or the row visibly changes twice: once when you act, once when the
 * refetch lands.
 *
 * Not a "use client" module on purpose — the router imports it too, and that
 * shared import is the only thing keeping the two copies from drifting.
 */

/** Replaces the body of a soft-deleted community message. */
export const DELETED_MESSAGE_TEXT = "This message has been deleted.";
