// VENDORED copy of the bot permission bitfield from the main app's
// lib/developer/bot-permissions.ts (the bundler must not import across the app
// boundary — see console/lib/webhook-events.ts). The BIT VALUES here are guarded
// against drift by tests/console-bot-permissions.test.ts, which deep-compares
// them to the source and gates deploy. The UI labels live only here.

export const BOT_PERMISSIONS = {
  SEND_MESSAGES: 1 << 0, // 1
  MANAGE_COIN_ALERTS: 1 << 1, // 2
  MODERATE: 1 << 2, // 4
  READ_MEMBERS: 1 << 3, // 8
} as const;

export type BotPermissionName = keyof typeof BOT_PERMISSIONS;

/** UI copy for each permission, in display order. */
export const BOT_PERMISSION_META: { name: BotPermissionName; label: string; desc: string }[] = [
  { name: "SEND_MESSAGES", label: "Send messages", desc: "Post in the community's channels" },
  { name: "MANAGE_COIN_ALERTS", label: "Manage coin alerts", desc: "Create and update coin-alert automations" },
  { name: "MODERATE", label: "Moderate", desc: "Delete messages" },
  { name: "READ_MEMBERS", label: "Read members", desc: "Read the member roster" },
];

export function hasPermission(bits: number, perm: number): boolean {
  return (bits & perm) === perm;
}
