"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type AnyRow = Record<string, unknown>;
import { createClient } from "@/lib/supabase/client";
import { playNotificationSound } from "@/lib/sound";
import type {
  AppNotification,
  Decision,
  Document,
  DocumentLink,
  Group,
  GroupMember,
  Meeting,
  MemberRole,
  MemberSkill,
  Message,
  Profile,
  Role,
  SkillArea,
  Space,
  SpaceParticipant,
  SpaceRead,
  SpaceTopic,
  LibraryItem,
  LibraryItemGroup,
  Task,
  TaskAssignee,
  TaskSkillTag,
  Vote,
} from "@/types";

type Supabase = ReturnType<typeof createClient>;

function useRealtimeById<T extends { id: string }>(
  supabase: Supabase,
  table: string,
  onEvent?: (payload: RealtimePostgresChangesPayload<AnyRow>) => void
) {
  const [rows, setRows] = useState<Record<string, T>>({});
  const [ready, setReady] = useState(false);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.from(table).select("*");
      if (!active) return;
      if (data) {
        const map: Record<string, T> = {};
        for (const row of data as T[]) map[row.id] = row;
        setRows(map);
      }
      setReady(true);
    })();

    const channel = supabase
      .channel(`public:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: RealtimePostgresChangesPayload<AnyRow>) => {
          setRows((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as Partial<T> & { id?: string };
              if (oldRow.id) delete next[oldRow.id];
            } else {
              const row = payload.new as T & { id: string };
              next[row.id] = row;
            }
            return next;
          });
          onEventRef.current?.(payload);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, table]);

  return { rows, ready };
}

function useRealtimeByCompositeKey<T>(
  supabase: Supabase,
  table: string,
  keyOf: (row: T) => string
) {
  const [rows, setRows] = useState<Record<string, T>>({});
  const [ready, setReady] = useState(false);
  // Callers pass inline lambdas (new identity every render); keeping keyOf in
  // the effect deps made every state update re-run the effect and refetch the
  // whole table, in an endless loop that burned through Supabase egress.
  const keyOfRef = useRef(keyOf);
  useEffect(() => {
    keyOfRef.current = keyOf;
  }, [keyOf]);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.from(table).select("*");
      if (!active) return;
      if (data) {
        const map: Record<string, T> = {};
        for (const row of data as T[]) map[keyOfRef.current(row)] = row;
        setRows(map);
      }
      setReady(true);
    })();

    const channel = supabase
      .channel(`public:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: RealtimePostgresChangesPayload<AnyRow>) => {
          setRows((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as T;
              delete next[keyOfRef.current(oldRow)];
            } else {
              const row = payload.new as T;
              next[keyOfRef.current(row)] = row;
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, table]);

  return { rows, ready };
}

interface AppDataValue {
  supabase: Supabase;
  userId: string | null;
  authReady: boolean;

  profiles: Record<string, Profile>;
  groups: Record<string, Group>;
  groupMembers: Record<string, GroupMember>;
  spaces: Record<string, Space>;
  spaceParticipants: Record<string, SpaceParticipant>;
  spaceTopics: Record<string, SpaceTopic>;
  decisions: Record<string, Decision>;
  votes: Record<string, Vote>;
  tasks: Record<string, Task>;
  taskSkillTags: Record<string, TaskSkillTag>;
  taskAssignees: Record<string, TaskAssignee>;
  documents: Record<string, Document>;
  documentLinks: Record<string, DocumentLink>;
  libraryItems: Record<string, LibraryItem>;
  libraryItemGroups: Record<string, LibraryItemGroup>;
  meetings: Record<string, Meeting>;
  memberSkills: Record<string, MemberSkill>;
  memberRoles: Record<string, MemberRole>;
  skillAreas: Record<string, SkillArea>;
  roles: Record<string, Role>;
  spaceReads: Record<string, SpaceRead>;
  notifications: Record<string, AppNotification>;
  dataReady: boolean;

  me: Profile | null;
  myGroupIds: string[];
  isGroupAdmin: (groupId: string | null) => boolean;
  amAnyGroupAdmin: boolean;
  unreadSpaceIds: Set<string>;
  unreadDecisionNotificationCount: number;
  unreadTaskNotificationCount: number;
  markSpaceRead: (spaceId: string) => Promise<void>;
  markNotificationsRead: (kinds: AppNotification["kind"][]) => Promise<void>;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUserId(data.user?.id ?? null);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      if (!session) router.push("/login");
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  const profiles = useRealtimeById<Profile>(supabase, "profiles");
  const groups = useRealtimeById<Group>(supabase, "groups");
  const spaces = useRealtimeById<Space>(supabase, "spaces", (payload) => {
    if (payload.eventType !== "UPDATE") return;
    const row = payload.new as unknown as Space;
    if (row.last_message_by && row.last_message_by !== userIdRef.current) {
      playNotificationSound();
    }
  });
  const spaceParticipants = useRealtimeByCompositeKey<SpaceParticipant>(
    supabase,
    "space_participants",
    (r) => `${r.space_id}:${r.member_id}`
  );
  const spaceTopics = useRealtimeById<SpaceTopic>(supabase, "space_topics");
  const decisions = useRealtimeById<Decision>(supabase, "decisions");
  const tasks = useRealtimeById<Task>(supabase, "tasks");
  const documents = useRealtimeById<Document>(supabase, "documents");
  const documentLinks = useRealtimeById<DocumentLink>(supabase, "document_links");
  const libraryItems = useRealtimeById<LibraryItem>(supabase, "library_items");
  const libraryItemGroups = useRealtimeByCompositeKey<LibraryItemGroup>(
    supabase,
    "library_item_groups",
    (r) => `${r.item_id}:${r.group_id}`
  );
  const meetings = useRealtimeById<Meeting>(supabase, "meetings");
  const groupMembers = useRealtimeByCompositeKey<GroupMember>(
    supabase,
    "group_members",
    (r) => `${r.group_id}:${r.member_id}`
  );
  const votes = useRealtimeByCompositeKey<Vote>(
    supabase,
    "votes",
    (r) => `${r.decision_id}:${r.member_id}`
  );
  const taskSkillTags = useRealtimeByCompositeKey<TaskSkillTag>(
    supabase,
    "task_skill_tags",
    (r) => `${r.task_id}:${r.skill_id}`
  );
  const taskAssignees = useRealtimeByCompositeKey<TaskAssignee>(
    supabase,
    "task_assignees",
    (r) => `${r.task_id}:${r.member_id}`
  );
  const memberSkills = useRealtimeByCompositeKey<MemberSkill>(
    supabase,
    "member_skills",
    (r) => `${r.member_id}:${r.skill_id}`
  );
  const memberRoles = useRealtimeByCompositeKey<MemberRole>(
    supabase,
    "member_roles",
    (r) => `${r.member_id}:${r.role_id}`
  );
  const skillAreas = useRealtimeById<SkillArea>(supabase, "skill_areas");
  const roles = useRealtimeById<Role>(supabase, "roles");
  const spaceReads = useRealtimeByCompositeKey<SpaceRead>(
    supabase,
    "space_reads",
    (r) => `${r.space_id}:${r.member_id}`
  );
  const notifications = useRealtimeById<AppNotification>(
    supabase,
    "notifications",
    (payload) => {
      if (payload.eventType === "INSERT") playNotificationSound();
    }
  );

  const me = userId ? profiles.rows[userId] ?? null : null;

  const myGroupIds = useMemo(() => {
    if (!userId) return [];
    if (me?.is_global_admin) return Object.keys(groups.rows);
    return Object.values(groupMembers.rows)
      .filter((gm) => gm.member_id === userId)
      .map((gm) => gm.group_id);
  }, [userId, me, groups.rows, groupMembers.rows]);

  const isGroupAdmin = (groupId: string | null) => {
    if (!userId || !groupId) return false;
    if (me?.is_global_admin) return true;
    return Object.values(groupMembers.rows).some(
      (gm) => gm.group_id === groupId && gm.member_id === userId && gm.is_admin
    );
  };

  const amAnyGroupAdmin = useMemo(() => {
    if (!userId) return false;
    if (me?.is_global_admin) return true;
    return Object.values(groupMembers.rows).some(
      (gm) => gm.member_id === userId && gm.is_admin
    );
  }, [userId, me, groupMembers.rows]);

  const dataReady =
    profiles.ready &&
    groups.ready &&
    spaces.ready &&
    decisions.ready &&
    tasks.ready &&
    groupMembers.ready &&
    votes.ready &&
    taskSkillTags.ready &&
    memberSkills.ready &&
    memberRoles.ready &&
    skillAreas.ready &&
    roles.ready &&
    spaceReads.ready &&
    notifications.ready &&
    spaceParticipants.ready &&
    spaceTopics.ready &&
    taskAssignees.ready &&
    documents.ready &&
    documentLinks.ready &&
    libraryItems.ready &&
    libraryItemGroups.ready &&
    meetings.ready;

  const unreadSpaceIds = useMemo(() => {
    if (!userId) return new Set<string>();
    const ids = new Set<string>();
    for (const space of Object.values(spaces.rows)) {
      if (!space.last_message_at) continue;
      const read = spaceReads.rows[`${space.id}:${userId}`];
      if (!read || new Date(space.last_message_at) > new Date(read.last_read_at)) {
        ids.add(space.id);
      }
    }
    return ids;
  }, [userId, spaces.rows, spaceReads.rows]);

  // Split by kind so a decision reminder lights up the Decisions tab and a
  // task reminder lights up the Tasks tab, not both at once -- same idea as
  // Rooms/Chat's separate unread dots.
  const unreadDecisionNotificationCount = Object.values(notifications.rows).filter(
    (n) => !n.read_at && (n.kind === "decision_resolved" || n.kind === "decision_reminder")
  ).length;
  const unreadTaskNotificationCount = Object.values(notifications.rows).filter(
    (n) => !n.read_at && (n.kind === "task_reminder" || n.kind === "task_overdue")
  ).length;

  async function markSpaceRead(spaceId: string) {
    if (!userId) return;
    await supabase
      .from("space_reads")
      .upsert({ space_id: spaceId, member_id: userId, last_read_at: new Date().toISOString() });
  }

  async function markNotificationsRead(kinds: AppNotification["kind"][]) {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("member_id", userId)
      .in("kind", kinds)
      .is("read_at", null);
  }

  const value: AppDataValue = {
    supabase,
    userId,
    authReady,
    profiles: profiles.rows,
    groups: groups.rows,
    groupMembers: groupMembers.rows,
    spaces: spaces.rows,
    spaceParticipants: spaceParticipants.rows,
    spaceTopics: spaceTopics.rows,
    decisions: decisions.rows,
    votes: votes.rows,
    tasks: tasks.rows,
    taskSkillTags: taskSkillTags.rows,
    taskAssignees: taskAssignees.rows,
    documents: documents.rows,
    documentLinks: documentLinks.rows,
    libraryItems: libraryItems.rows,
    libraryItemGroups: libraryItemGroups.rows,
    meetings: meetings.rows,
    memberSkills: memberSkills.rows,
    memberRoles: memberRoles.rows,
    skillAreas: skillAreas.rows,
    roles: roles.rows,
    spaceReads: spaceReads.rows,
    notifications: notifications.rows,
    dataReady,
    me,
    myGroupIds,
    isGroupAdmin,
    amAnyGroupAdmin,
    unreadSpaceIds,
    unreadDecisionNotificationCount,
    unreadTaskNotificationCount,
    markSpaceRead,
    markNotificationsRead,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function useSpaceMessages(spaceId: string | null) {
  const { supabase } = useAppData();
  const [loaded, setLoaded] = useState<{
    spaceId: string;
    messages: Message[];
  } | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    let active = true;

    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("space_id", spaceId)
        .order("created_at", { ascending: true });
      if (!active) return;
      setLoaded({ spaceId, messages: data ?? [] });
    })();

    const channel = supabase
      .channel(`space-messages:${spaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => {
          setLoaded((prev) =>
            prev && prev.spaceId === spaceId
              ? { spaceId, messages: [...prev.messages, payload.new as Message] }
              : prev
          );
        }
      )
      // A delete event only carries the row's id (so it can't be filtered by
      // room), which is all that's needed to drop it from this room's list.
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const gone = (payload.old as { id?: string }).id;
          if (!gone) return;
          setLoaded((prev) =>
            prev && prev.spaceId === spaceId
              ? { spaceId, messages: prev.messages.filter((m) => m.id !== gone) }
              : prev
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `space_id=eq.${spaceId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setLoaded((prev) =>
            prev && prev.spaceId === spaceId
              ? {
                  spaceId,
                  messages: prev.messages.map((m) => (m.id === updated.id ? updated : m)),
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, spaceId]);

  if (!spaceId) return { messages: [], ready: true };
  const ready = loaded?.spaceId === spaceId;
  return { messages: ready ? loaded!.messages : [], ready };
}
