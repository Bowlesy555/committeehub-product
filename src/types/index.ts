export type Capacity = "available" | "stretched" | "away";

export interface Profile {
  id: string;
  email: string;
  name: string;
  is_global_admin: boolean;
  active: boolean;
  is_vacant: boolean;
  capacity: Capacity;
  created_at: string;
}

export interface SkillArea {
  id: string;
  label: string;
  sort_order: number;
}

export interface Role {
  id: string;
  label: string;
  sort_order: number;
  created_at: string;
}

export interface MemberSkill {
  member_id: string;
  skill_id: string;
  level: number;
}

export interface MemberRole {
  member_id: string;
  role_id: string;
}

export type GroupKind = "committee" | "working-party";

export interface Group {
  id: string;
  name: string;
  kind: GroupKind;
  description: string | null;
  default_quorum: number;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  member_id: string;
  is_admin: boolean;
}

export type SpaceStatus = "open" | "closed";
export type SpaceVisibility = "group" | "private";

export interface Space {
  id: string;
  // null for a private room/DM -- see space_participants for who can see it.
  group_id: string | null;
  name: string;
  status: SpaceStatus;
  visibility: SpaceVisibility;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  last_message_at: string | null;
  last_message_by: string | null;
  pinned: boolean;
  pinned_until: string | null;
}

export interface SpaceParticipant {
  space_id: string;
  member_id: string;
}

export interface SpaceRead {
  space_id: string;
  member_id: string;
  last_read_at: string;
}

// A topic within a room. Messages with topic_id null are in the room's
// implicit "General" topic.
export interface SpaceTopic {
  id: string;
  space_id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  space_id: string;
  topic_id: string | null;
  author_id: string | null;
  text: string;
  created_at: string;
  edited_at: string | null;
}

export type DecisionStatus = "open" | "passed" | "failed" | "withdrawn";

export const DEFAULT_VOTE_OPTIONS = ["yes", "no", "abstain"];

export function isDefaultVoteOptions(options: string[] | null | undefined): boolean {
  return (
    !!options &&
    options.length === DEFAULT_VOTE_OPTIONS.length &&
    DEFAULT_VOTE_OPTIONS.every((o) => options.includes(o))
  );
}

export interface Decision {
  id: string;
  group_id: string;
  space_id: string | null;
  topic_id: string | null;
  title: string;
  motion_text: string;
  proposed_by: string | null;
  quorum: number;
  deadline: string;
  status: DecisionStatus;
  vote_options: string[];
  resolved_choice: string | null;
  created_at: string;
  closed_at: string | null;
  reminder_sent: boolean;
  resolution_notified: boolean;
}

// Any non-empty string is a valid choice now that vote options are
// customisable per-decision -- "yes"/"no"/"abstain" is just the default set.
export type VoteChoice = string;

export interface Vote {
  decision_id: string;
  member_id: string;
  choice: VoteChoice;
  voted_at: string;
}

export type TaskStatus = "todo" | "doing" | "done" | "blocked";
export type TaskPriority = "low" | "normal" | "high";

export interface Task {
  id: string;
  group_id: string;
  space_id: string | null;
  topic_id: string | null;
  decision_id: string | null;
  meeting_id: string | null;
  title: string;
  description: string | null;
  // Legacy single-assignee column -- superseded by task_assignees, no longer
  // read or written by the app.
  assignee_id: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  due_reminder_sent: boolean;
  overdue_notified: boolean;
}

export interface TaskAssignee {
  task_id: string;
  member_id: string;
}

export interface TaskSkillTag {
  task_id: string;
  skill_id: string;
}

export interface DocumentLink {
  id: string;
  document_id: string;
  space_id: string | null;
  topic_id: string | null;
  task_id: string | null;
  decision_id: string | null;
  linked_by: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  group_id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// A pointer to a file already stored in Google Drive -- never the file
// itself. See supabase/schema.sql for why (Supabase free-tier egress, not
// storage space, is the constraint that keeps Drive as the real file store).
export interface Document {
  id: string;
  group_id: string;
  title: string;
  url: string;
  added_by: string | null;
  created_at: string;
}

export interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  url: string;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Which groups a library item is shared with. */
export interface LibraryItemGroup {
  item_id: string;
  group_id: string;
}

export type NotificationKind =
  | "decision_resolved"
  | "decision_reminder"
  | "task_reminder"
  | "task_overdue";

export interface AppNotification {
  id: string;
  member_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  decision_id: string | null;
  task_id: string | null;
  created_at: string;
  read_at: string | null;
}
