import { DEFAULT_VOTE_OPTIONS, type Decision, type GroupMember, type Profile, type Vote } from "@/types";

export interface QuorumMath {
  total: number;
  options: string[];
  counts: Record<string, number>;
  votedCount: number;
  notYetVoted: number;
  computedStatus: Decision["status"];
  computedChoice: string | null;
  pctFor: (choice: string) => number;
}

/**
 * Mirrors the `recompute_decision_status` Postgres trigger so the UI can show
 * live vote tallies without waiting for a round trip. The trigger (plus the
 * daily cron for deadline expiry) remains the source of truth for
 * `decisions.status`/`resolved_choice` -- this is display-only.
 *
 * Threshold-per-option: the group's quorum applies to every option in
 * `vote_options`, not just yes/no -- whichever one reaches it first wins.
 * "abstain" never triggers a resolution on its own.
 */
export function computeQuorumMath(
  decision: Decision,
  groupMembers: GroupMember[],
  profiles: Record<string, Profile>,
  votes: Vote[]
): QuorumMath {
  const groupActive = groupMembers
    .filter((gm) => gm.group_id === decision.group_id)
    .map((gm) => gm.member_id)
    .filter((id) => profiles[id]?.active);

  const total = groupActive.length || 1;
  const options = decision.vote_options?.length ? decision.vote_options : DEFAULT_VOTE_OPTIONS;
  const decisionVotes = votes.filter((v) => v.decision_id === decision.id);

  const counts: Record<string, number> = {};
  options.forEach((o) => (counts[o] = 0));

  let votedCount = 0;
  for (const memberId of groupActive) {
    const v = decisionVotes.find((vv) => vv.member_id === memberId);
    if (!v) continue;
    votedCount++;
    if (counts[v.choice] !== undefined) counts[v.choice]++;
  }
  const notYetVoted = total - votedCount;

  let computedStatus = decision.status;
  let computedChoice: string | null = null;
  if (decision.status === "open") {
    for (const choice of options) {
      if (choice === "abstain") continue;
      if (counts[choice] >= decision.quorum) {
        computedChoice = choice;
        computedStatus = choice === "yes" ? "passed" : choice === "no" ? "failed" : "passed";
        break;
      }
    }
  }

  return {
    total,
    options,
    counts,
    votedCount,
    notYetVoted,
    computedStatus,
    computedChoice,
    pctFor: (choice) =>
      Math.min(100, Math.round(((counts[choice] || 0) / Math.max(decision.quorum, 1)) * 100)),
  };
}
