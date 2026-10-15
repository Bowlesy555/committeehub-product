// The reactions people can put on a message. Stored by key (not the emoji
// itself) so the database only ever holds a short, known set.
export const REACTIONS = [
  { key: "thumbs_up", emoji: "👍", label: "Thumbs up" },
  { key: "heart", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Funny" },
  { key: "wow", emoji: "😮", label: "Surprised" },
  { key: "thanks", emoji: "🙏", label: "Thanks" },
  { key: "done", emoji: "✅", label: "Done / agreed" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

export function emojiFor(key: string): string {
  return REACTIONS.find((r) => r.key === key)?.emoji ?? "👍";
}
