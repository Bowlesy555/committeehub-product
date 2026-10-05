"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { initials, colorFor } from "@/lib/format";
import { findExistingDirectMessage } from "@/lib/rooms";

export default function SkillsPage() {
  const { profiles, skillAreas, memberSkills, spaces, spaceParticipants, userId, me, supabase } =
    useAppData();
  const showToast = useToast();
  const router = useRouter();
  const [messaging, setMessaging] = useState<string | null>(null);

  const members = Object.values(profiles)
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const skills = Object.values(skillAreas).sort((a, b) => a.sort_order - b.sort_order);

  async function setLevel(memberId: string, skillId: string, level: number) {
    const { error } = await supabase
      .from("member_skills")
      .upsert({ member_id: memberId, skill_id: skillId, level });
    if (error) showToast(error.message);
  }

  function canEdit(memberId: string) {
    return me?.is_global_admin || me?.id === memberId;
  }

  async function messageMember(otherId: string) {
    if (!userId || otherId === userId) return;
    const existing = findExistingDirectMessage(userId, otherId, spaces, spaceParticipants);
    if (existing) {
      router.push(`/spaces/${existing}`);
      return;
    }
    setMessaging(otherId);
    // See the comment on the equivalent insert in Rooms' "start chat" flow --
    // a brand-new private room can't satisfy its own SELECT policy yet
    // (no participants exist until this transaction finishes), so RETURNING
    // the row via .select() gets rejected by RLS. Generate the id ourselves
    // and skip it.
    const newSpaceId = crypto.randomUUID();
    const { error } = await supabase.from("spaces").insert({
      id: newSpaceId,
      name: profiles[otherId]?.name || "Direct message",
      visibility: "private",
      group_id: null,
      created_by: userId,
    });
    if (error) {
      setMessaging(null);
      showToast(error.message);
      return;
    }
    const { error: participantsError } = await supabase
      .from("space_participants")
      .insert([
        { space_id: newSpaceId, member_id: userId },
        { space_id: newSpaceId, member_id: otherId },
      ]);
    setMessaging(null);
    if (participantsError) {
      showToast(participantsError.message);
      return;
    }
    router.push(`/spaces/${newSpaceId}`);
  }

  return (
    <div>
      <div className="section-title">
        <h2>Skills Matrix</h2>
        <span className="hint">Click a member&apos;s own dots to set their skill level</span>
      </div>
      <p className="section-desc">
        Skills help identify who&apos;s best suited for specific tasks or roles.
      </p>
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Member</th>
              <th>Capacity</th>
              {skills.map((s) => (
                <th key={s.id}>{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="member-cell">
                  <div className="row">
                    <div className="avatar sm" style={{ background: colorFor(m.id) }}>
                      {initials(m.name)}
                    </div>
                    {m.name}
                    {m.id !== userId && (
                      <button
                        type="button"
                        className="iconbtn"
                        title={`Message ${m.name}`}
                        onClick={() => messageMember(m.id)}
                        disabled={messaging === m.id}
                      >
                        💬
                      </button>
                    )}
                  </div>
                </td>
                <td>
                  <span className={`cap-tag cap-${m.capacity}`}>{m.capacity}</span>
                </td>
                {skills.map((s) => {
                  const level = memberSkills[`${m.id}:${s.id}`]?.level || 0;
                  const editable = canEdit(m.id);
                  return (
                    <td key={s.id}>
                      <div className={`skill-dots${editable ? "" : " readonly"}`}>
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className={`skill-dot-seg${i < level ? " on" : ""}`}
                            onClick={() => {
                              if (!editable) return;
                              const next = i + 1 === level ? i : i + 1;
                              setLevel(m.id, s.id, next);
                            }}
                          />
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
