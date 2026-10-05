"use client";

import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { countdownText, firstName, fmtDateTime, greeting, timeAgo, truncate } from "@/lib/format";
import { buildActivityFeed } from "@/lib/activity";
import { roomDisplayName, roomLink } from "@/lib/rooms";
import { assigneeIdsOf } from "@/lib/tasks";
import { brand, PRODUCT_NAME } from "@/lib/brand";
import { isDefaultVoteOptions, type VoteChoice } from "@/types";

const DEADLINE_SOON_MS = 48 * 60 * 60 * 1000;

export default function DashboardPage() {
  const {
    userId,
    me,
    groups,
    myGroupIds,
    spaces,
    spaceParticipants,
    decisions,
    votes,
    tasks,
    taskAssignees,
    groupMembers,
    profiles,
    roles,
    unreadSpaceIds,
    supabase,
  } = useAppData();
  const showToast = useToast();

  const allDecisions = Object.values(decisions);
  const allVotes = Object.values(votes);
  const allSpaces = Object.values(spaces);
  const allGroupMembers = Object.values(groupMembers);
  const allTasks = Object.values(tasks);

  async function castVote(decisionId: string, choice: VoteChoice) {
    if (!userId) return;
    const { error } = await supabase
      .from("votes")
      .upsert({ decision_id: decisionId, member_id: userId, choice });
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Vote recorded");
    try {
      await fetch("/api/decisions/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId }),
      });
    } catch {
      // best-effort — a missed notification isn't worth surfacing an error for
    }
  }

  // ---- "Your Attention Needed" -------------------------------------------
  type Attn = {
    id: string;
    color: "yellow" | "red" | "blue";
    label: string;
    icon: string;
    title: string;
    subtitle: string;
    href: string;
    vote?: string; // decision id, if inline vote buttons should render
    summary?: string;
    proposedBy?: string;
    discussHref?: string;
    countdown?: string;
  };

  const attention: Attn[] = [];

  allDecisions.forEach((d) => {
    if (d.status !== "open") return;
    const deadlineSoon = new Date(d.deadline).getTime() - new Date().getTime() < DEADLINE_SOON_MS;
    const myVote = userId ? votes[`${d.id}:${userId}`] : undefined;
    const decisionExtras = {
      summary: truncate(d.motion_text, 140),
      proposedBy: profiles[d.proposed_by || ""]?.name || "someone",
      discussHref: d.space_id && spaces[d.space_id] ? roomLink(d.space_id, d.topic_id) : undefined,
      countdown: countdownText(d.deadline),
    };
    if (!myVote) {
      attention.push({
        id: `vote:${d.id}`,
        color: deadlineSoon ? "red" : "yellow",
        label: deadlineSoon ? "Urgent · deadline approaching" : "Awaiting your vote",
        icon: "🗳️",
        title: d.title,
        subtitle: `${groups[d.group_id]?.name || "committee"} · closes ${fmtDateTime(d.deadline)}`,
        href: "/decisions",
        // Inline quick-vote only makes sense for the plain yes/no/abstain
        // set -- a custom option list needs the full card on the Decisions page.
        vote: isDefaultVoteOptions(d.vote_options) ? d.id : undefined,
        ...decisionExtras,
      });
    } else if (deadlineSoon) {
      attention.push({
        id: `deadline:${d.id}`,
        color: "red",
        label: "Deadline approaching",
        icon: "⏰",
        title: d.title,
        subtitle: `${groups[d.group_id]?.name || "committee"} · closes ${fmtDateTime(d.deadline)}`,
        href: "/decisions",
        ...decisionExtras,
      });
    }
  });

  allTasks.forEach((t) => {
    if (!userId || !assigneeIdsOf(t.id, taskAssignees).includes(userId) || t.status === "done") return;
    const overdue = !!t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
    attention.push({
      id: `task:${t.id}`,
      color: overdue ? "red" : "yellow",
      label: overdue ? "Overdue" : "Assigned to you",
      icon: "✅",
      title: t.title,
      subtitle: t.due_date ? `Due ${t.due_date}` : "No due date set",
      href: "/tasks",
    });
  });

  for (const sid of unreadSpaceIds) {
    const s = spaces[sid];
    if (!s) continue;
    const context = s.group_id ? groups[s.group_id]?.name || "committee" : "Private chat";
    attention.push({
      id: `room:${sid}`,
      color: "blue",
      label: "New activity",
      icon: s.visibility === "private" ? "🔒" : "💬",
      title: roomDisplayName(s, userId, spaceParticipants, profiles),
      subtitle: `${context} · ${timeAgo(s.last_message_at)}`,
      href: `/spaces/${sid}`,
    });
  }

  const severity: Record<Attn["color"], number> = { red: 0, yellow: 1, blue: 2 };
  attention.sort((a, b) => severity[a.color] - severity[b.color]);

  // ---- Committee overview --------------------------------------------------
  const overview = myGroupIds
    .map((gid) => {
      const g = groups[gid];
      if (!g) return null;
      const activeMembers = allGroupMembers.filter(
        (gm) => gm.group_id === gid && profiles[gm.member_id]?.active
      ).length;
      const openDecisions = allDecisions.filter(
        (d) => d.group_id === gid && d.status === "open"
      ).length;
      const activeRooms = allSpaces.filter(
        (s) => s.group_id === gid && s.status === "open"
      ).length;
      return { group: g, activeMembers, openDecisions, activeRooms };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const roleCount = Object.keys(roles).length;
  const activeMemberTotal = Object.values(profiles).filter((p) => p.active).length;

  // ---- Activity feed --------------------------------------------------------
  const feed = buildActivityFeed(
    allVotes,
    allSpaces,
    allTasks,
    decisions,
    profiles,
    groups,
    userId,
    spaceParticipants,
    taskAssignees
  );

  return (
    <div>
      <h1 className="welcome">
        {greeting()}, {firstName(me?.name)} — here&apos;s what needs your attention
      </h1>
      <p className="welcome-sub">This is your home base for {brand.appName}.</p>

      <div className="section-title">
        <h2>Your attention needed</h2>
      </div>
      {attention.length === 0 ? (
        <div className="card">
          <div className="empty">Nothing needs your attention right now — nice work.</div>
        </div>
      ) : (
        attention.map((a) => (
          <div className="attn-row" key={a.id}>
            <span className="ic">{a.icon}</span>
            <div className="info">
              <div className="t">{a.title}</div>
              <div className="s">{a.subtitle}</div>
              {a.proposedBy && <div className="s">Proposed by {a.proposedBy}</div>}
              {a.summary && <div className="summary">{a.summary}</div>}
              {(a.countdown || a.discussHref) && (
                <div className="s meta-row">
                  {a.countdown}
                  {a.discussHref && (
                    <Link href={a.discussHref} onClick={(e) => e.stopPropagation()}>
                      💬 Discuss →
                    </Link>
                  )}
                </div>
              )}
            </div>
            <div className="attn-side">
              <span className={`attn-pill ${a.color}`}>{a.label}</span>
              {a.vote ? (
                <div className="vote-buttons">
                  <button className="btn yes" onClick={() => castVote(a.vote!, "yes")}>
                    Yes
                  </button>
                  <button className="btn no" onClick={() => castVote(a.vote!, "no")}>
                    No
                  </button>
                  <button className="btn abstain" onClick={() => castVote(a.vote!, "abstain")}>
                    Abstain
                  </button>
                </div>
              ) : (
                <Link href={a.href} className="hint">
                  View →
                </Link>
              )}
            </div>
          </div>
        ))
      )}

      <div className="section-title">
        <h2>Committee overview</h2>
      </div>
      <div className="overview-grid">
        {overview.map(({ group, activeMembers, openDecisions, activeRooms }) => (
          <div className="overview-card" key={group.id}>
            <div className="gname">
              {group.kind === "committee" ? "🏛️" : "🔧"} {group.name}
            </div>
            <div className="orow">
              <span>Quorum</span>
              <strong>{group.default_quorum}</strong>
            </div>
            <div className="orow">
              <span>Active members</span>
              <strong>{activeMembers}</strong>
            </div>
            <div className="orow">
              <span>Open decisions</span>
              <strong>{openDecisions}</strong>
            </div>
            <div className="orow">
              <span>Active rooms</span>
              <strong>{activeRooms}</strong>
            </div>
          </div>
        ))}
        <div className="overview-card">
          <div className="gname">🐕 Whole committee</div>
          <div className="orow">
            <span>Active members</span>
            <strong>{activeMemberTotal}</strong>
          </div>
          <div className="orow">
            <span>Roles defined</span>
            <strong>{roleCount}</strong>
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2>Recent activity</h2>
      </div>
      <div className="card pad">
        {feed.length === 0 ? (
          <div className="empty">Nothing has happened yet.</div>
        ) : (
          <div className="activity-feed">
            {feed.map((item) => (
              <Link href={item.href} className="activity-row" key={item.id}>
                <span className="ic">{item.icon}</span>
                <span className="tx">{item.text}</span>
                <time>{timeAgo(item.at)}</time>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="section-title">
        <h2>How {PRODUCT_NAME} works</h2>
      </div>
      <div className="workflow-steps">
        <div className="workflow-step">
          <div className="wn">1</div>
          <div className="wt">Discuss in Rooms</div>
          Talk through a topic before it becomes a formal vote.
        </div>
        <div className="workflow-step">
          <div className="wn">2</div>
          <div className="wt">Create a Decision</div>
          Propose a motion once the discussion is ready for a vote.
        </div>
        <div className="workflow-step">
          <div className="wn">3</div>
          <div className="wt">Vote</div>
          Members vote until quorum is reached or the deadline passes.
        </div>
        <div className="workflow-step">
          <div className="wn">4</div>
          <div className="wt">Record outcome &amp; assign tasks</div>
          The result is recorded automatically — assign follow-up tasks from there.
        </div>
      </div>
    </div>
  );
}
