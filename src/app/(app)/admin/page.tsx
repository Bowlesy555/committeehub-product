"use client";

import { useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { initials, colorFor } from "@/lib/format";
import { roleLabelsFor } from "@/lib/roles";
import { Modal } from "@/components/Modal";
import { LoginLog } from "@/components/LoginLog";
import { PictureRetention } from "@/components/PictureRetention";
import { StartGroup } from "@/components/StartGroup";
import type { Capacity, GroupKind } from "@/types";

export default function AdminPage() {
  const {
    me,
    profiles,
    groups,
    groupMembers,
    spaces,
    decisions,
    tasks,
    documents,
    meetings,
    roles,
    memberRoles,
    skillAreas,
    isGroupAdmin,
    amAnyGroupAdmin,
    isCommitteeMember,
    supabase,
  } = useAppData();
  const showToast = useToast();

  const sortedRoles = Object.values(roles).sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );

  const sortedSkillAreas = Object.values(skillAreas).sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
  );

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [invitePin, setInvitePin] = useState("");
  const [inviting, setInviting] = useState(false);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRoleIds, setBulkRoleIds] = useState<string[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    { line: string; ok: boolean; message: string }[] | null
  >(null);

  const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [savingRoles, setSavingRoles] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupKind, setNewGroupKind] = useState<GroupKind>("working-party");
  const [newGroupQuorum, setNewGroupQuorum] = useState(1);
  const [addMemberFor, setAddMemberFor] = useState<Record<string, string>>({});
  const [pinFor, setPinFor] = useState<Record<string, string>>({});
  const [settingPinFor, setSettingPinFor] = useState<string | null>(null);
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [newSkillAreaLabel, setNewSkillAreaLabel] = useState("");
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [offboarding, setOffboarding] = useState<string | null>(null);
  const [offboardingBusy, setOffboardingBusy] = useState(false);

  if (!amAnyGroupAdmin && !isCommitteeMember) {
    return <div className="empty">Admin access only.</div>;
  }

  function toggleInviteRole(roleId: string) {
    setInviteRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  }

  async function invite(usePin: boolean) {
    if (!inviteEmail.trim() || !inviteName.trim() || inviteRoleIds.length === 0) return;
    if (usePin && !/^\d{6}$/.test(invitePin)) {
      showToast("PIN must be exactly 6 digits");
      return;
    }
    setInviting(true);
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        roleIds: inviteRoleIds,
        pin: usePin ? invitePin : undefined,
      }),
    });
    const body = await res.json();
    setInviting(false);
    if (!res.ok) {
      showToast(body.error || "Failed to add member");
    } else {
      showToast(
        usePin
          ? `${inviteName.trim()} created — tell them their email + PIN to sign in`
          : `Invite sent to ${inviteEmail.trim()}`
      );
      setInviteEmail("");
      setInviteName("");
      setInviteRoleIds([]);
      setInvitePin("");
    }
  }

  function toggleBulkRole(roleId: string) {
    setBulkRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  }

  function openBulk() {
    setBulkRoleIds([]);
    setBulkText("");
    setBulkResults(null);
    setBulkOpen(true);
  }

  // One member per non-empty line: "email, name, 6-digit pin". Reuses the
  // same /api/admin/invite path as "Create with PIN" above -- creates the
  // account immediately, pre-confirmed, no email needed.
  function parseBulkRows(text: string) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [email, name, pin] = line.split(",").map((p) => p.trim());
        return { line, email, name, pin };
      });
  }

  const bulkRowCount = parseBulkRows(bulkText).length;

  async function runBulkImport() {
    const rows = parseBulkRows(bulkText);
    if (!rows.length) return;
    setBulkRunning(true);
    const results: { line: string; ok: boolean; message: string }[] = [];
    // Sequential, not parallel -- these hit Supabase's admin user-creation
    // API one at a time rather than firing a burst of concurrent requests.
    for (const row of rows) {
      if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        results.push({ line: row.line, ok: false, message: "Invalid email" });
        continue;
      }
      if (!row.name) {
        results.push({ line: row.line, ok: false, message: "Missing name" });
        continue;
      }
      if (!row.pin || !/^\d{6}$/.test(row.pin)) {
        results.push({ line: row.line, ok: false, message: "PIN must be 6 digits" });
        continue;
      }
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: row.email,
          name: row.name,
          roleIds: bulkRoleIds,
          pin: row.pin,
        }),
      });
      const body = await res.json();
      results.push({
        line: row.line,
        ok: res.ok,
        message: res.ok ? "Created" : body.error || "Failed",
      });
    }
    setBulkRunning(false);
    setBulkResults(results);
    const okCount = results.filter((r) => r.ok).length;
    showToast(`${okCount}/${results.length} member${results.length === 1 ? "" : "s"} created`);
  }

  function openEditRoles(memberId: string) {
    setEditingRolesFor(memberId);
    setEditRoleIds(
      Object.values(memberRoles)
        .filter((mr) => mr.member_id === memberId)
        .map((mr) => mr.role_id)
    );
  }

  function toggleEditRole(roleId: string) {
    setEditRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  }

  async function saveEditRoles() {
    if (!editingRolesFor) return;
    setSavingRoles(true);
    const memberId = editingRolesFor;
    const current = Object.values(memberRoles)
      .filter((mr) => mr.member_id === memberId)
      .map((mr) => mr.role_id);
    const toAdd = editRoleIds.filter((r) => !current.includes(r));
    const toRemove = current.filter((r) => !editRoleIds.includes(r));

    if (toAdd.length) {
      await supabase
        .from("member_roles")
        .insert(toAdd.map((role_id) => ({ member_id: memberId, role_id })));
    }
    for (const roleId of toRemove) {
      await supabase
        .from("member_roles")
        .delete()
        .eq("member_id", memberId)
        .eq("role_id", roleId);
    }
    setSavingRoles(false);
    setEditingRolesFor(null);
    showToast("Roles updated");
  }

  async function updateProfile(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", id);
    if (error) showToast(error.message);
  }

  async function setPinFor_(memberId: string) {
    const pin = pinFor[memberId] || "";
    if (!/^\d{6}$/.test(pin)) {
      showToast("PIN must be exactly 6 digits");
      return;
    }
    const res = await fetch("/api/admin/set-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, pin }),
    });
    const body = await res.json();
    if (!res.ok) {
      showToast(body.error || "Failed to set PIN");
    } else {
      showToast("PIN set for " + (profiles[memberId]?.name || "member"));
      setPinFor((prev) => ({ ...prev, [memberId]: "" }));
      setSettingPinFor(null);
    }
  }

  async function confirmOffboard() {
    if (!offboarding) return;
    setOffboardingBusy(true);
    const res = await fetch("/api/admin/offboard-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: offboarding }),
    });
    const body = await res.json();
    setOffboardingBusy(false);
    if (!res.ok) {
      showToast(body.error || "Failed to remove member");
    } else {
      showToast(`${body.name} — access revoked, history kept`);
      setOffboarding(null);
    }
  }

  async function updateGroup(id: string, patch: Record<string, unknown>) {
    const { error } = await supabase.from("groups").update(patch).eq("id", id);
    if (error) showToast(error.message);
  }

  async function addRole() {
    const label = newRoleLabel.trim();
    if (!label) return;
    const { error } = await supabase
      .from("roles")
      .insert({ label, sort_order: sortedRoles.length + 1 });
    if (error) showToast(error.message);
    else {
      setNewRoleLabel("");
      showToast("Role added");
    }
  }

  async function removeRole(id: string) {
    const { error } = await supabase.from("roles").delete().eq("id", id);
    if (error) showToast(error.message);
  }

  async function addSkillArea() {
    const label = newSkillAreaLabel.trim();
    if (!label) return;
    // skill_areas.id is a readable text key rather than a uuid, so make one
    // from the label and nudge it until it's unused.
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
    let id = base;
    for (let n = 2; skillAreas[id]; n++) id = `${base}-${n}`;
    const nextOrder = Math.max(0, ...sortedSkillAreas.map((s) => s.sort_order)) + 1;
    const { error } = await supabase.from("skill_areas").insert({ id, label, sort_order: nextOrder });
    if (error) showToast(error.message);
    else {
      setNewSkillAreaLabel("");
      showToast("Skill area added");
    }
  }

  async function removeSkillArea(id: string) {
    const label = skillAreas[id]?.label || "this skill area";
    if (!confirm(`Remove "${label}"? Members' ratings for it and its tags on tasks are removed too.`)) return;
    const { error } = await supabase.from("skill_areas").delete().eq("id", id);
    if (error) showToast(error.message);
  }

  async function createGroup() {
    if (!newGroupName.trim()) return;
    const { data, error } = await supabase
      .from("groups")
      .insert({
        name: newGroupName.trim(),
        kind: newGroupKind,
        default_quorum: Math.max(1, newGroupQuorum),
      })
      .select()
      .single();
    if (error) {
      showToast(error.message);
      return;
    }
    if (data && me) {
      await supabase
        .from("group_members")
        .insert({ group_id: data.id, member_id: me.id, is_admin: true });
    }
    setNewGroupName("");
    setNewGroupQuorum(1);
    showToast("Group created");
  }

  async function deleteGroup(groupId: string) {
    setDeleteBusy(true);
    const { data, error } = await supabase.from("groups").delete().eq("id", groupId).select();
    setDeleteBusy(false);
    if (error) {
      showToast(error.message);
    } else if (!data?.length) {
      showToast("That group couldn't be deleted");
    } else {
      showToast("Group deleted");
      setDeletingGroup(null);
      setDeleteTyped("");
    }
  }

  async function addMember(groupId: string) {
    const memberId = addMemberFor[groupId];
    if (!memberId) return;
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: groupId, member_id: memberId, is_admin: false });
    if (error) showToast(error.message);
    setAddMemberFor((prev) => ({ ...prev, [groupId]: "" }));
  }

  async function toggleGroupAdmin(groupId: string, memberId: string, isAdmin: boolean) {
    const { error } = await supabase
      .from("group_members")
      .update({ is_admin: !isAdmin })
      .eq("group_id", groupId)
      .eq("member_id", memberId);
    if (error) showToast(error.message);
  }

  async function removeMember(groupId: string, memberId: string) {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("member_id", memberId);
    if (error) showToast(error.message);
  }

  return (
    <div>
      {me?.is_global_admin && (
        <>
          <div className="section-title">
            <h2>Invite a member</h2>
            <button className="btn sm" onClick={openBulk}>
              📋 Bulk import
            </button>
          </div>
          <div className="card pad">
            <div className="row wrap">
              <div className="field" style={{ flex: 2, minWidth: 200 }}>
                <label>Email *</label>
                <input
                  className="input"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@example.com"
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label>Name *</label>
                <input
                  className="input"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Role(s) * — a member can hold more than one</label>
              <div className="row wrap">
                {sortedRoles.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className={`tag-check${inviteRoleIds.includes(r.id) ? " on" : ""}`}
                    onClick={() => toggleInviteRole(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 12, alignItems: "flex-end" }}>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label>PIN (optional)</label>
                <input
                  className="input"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={invitePin}
                  onChange={(e) => setInvitePin(e.target.value.replace(/\D/g, ""))}
                  placeholder="6 digits"
                />
                <span className="help">
                  Only needed for &quot;Create with PIN&quot; below.
                </span>
              </div>
              <button
                className="btn"
                onClick={() => invite(false)}
                disabled={
                  inviting || !inviteEmail.trim() || !inviteName.trim() || inviteRoleIds.length === 0
                }
              >
                {inviting ? "Sending…" : "Send email invite"}
              </button>
              <button
                className="btn primary"
                onClick={() => invite(true)}
                disabled={
                  inviting ||
                  !inviteEmail.trim() ||
                  !inviteName.trim() ||
                  inviteRoleIds.length === 0 ||
                  invitePin.length !== 6
                }
              >
                {inviting ? "Creating…" : "Create with PIN"}
              </button>
            </div>
            <p className="help" style={{ marginTop: 8 }}>
              <strong>Send email invite</strong> works once a sending domain is verified in
              Resend. <strong>Create with PIN</strong> creates the account immediately, no email
              needed — tell the member their email and PIN yourself.
            </p>
          </div>

          <div className="section-title">
            <h2>Members</h2>
          </div>
          <div className="card pad">
            <div className="table-scroll">
            <table className="members-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Capacity</th>
                  <th>Global admin</th>
                  <th>Active</th>
                  <th>PIN</th>
                  <th>Remove</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(profiles).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="row">
                        <div className="avatar sm" style={{ background: colorFor(p.id) }}>
                          {initials(p.name)}
                        </div>
                        {p.name}
                      </div>
                    </td>
                    <td>{p.email}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 4 }}>
                        <span style={{ fontSize: 12 }}>
                          {roleLabelsFor(p.id, memberRoles, roles).join(", ") || "—"}
                        </span>
                        <button className="btn sm" onClick={() => openEditRoles(p.id)}>
                          Edit
                        </button>
                      </div>
                    </td>
                    <td>
                      <select
                        className="select"
                        style={{ fontSize: 12 }}
                        value={p.capacity}
                        onChange={(e) =>
                          updateProfile(p.id, { capacity: e.target.value as Capacity })
                        }
                      >
                        <option value="available">Available</option>
                        <option value="stretched">Stretched</option>
                        <option value="away">Away</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.is_global_admin}
                        onChange={(e) =>
                          updateProfile(p.id, { is_global_admin: e.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={(e) => updateProfile(p.id, { active: e.target.checked })}
                      />
                    </td>
                    <td>
                      {settingPinFor === p.id ? (
                        <div className="row">
                          <input
                            className="input"
                            style={{ fontSize: 12, width: 80 }}
                            type="password"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinFor[p.id] || ""}
                            onChange={(e) =>
                              setPinFor((prev) => ({
                                ...prev,
                                [p.id]: e.target.value.replace(/\D/g, ""),
                              }))
                            }
                            autoFocus
                          />
                          <button className="btn sm" onClick={() => setPinFor_(p.id)}>
                            Save
                          </button>
                          <button className="btn ghost sm" onClick={() => setSettingPinFor(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button className="btn sm" onClick={() => setSettingPinFor(p.id)}>
                          Set PIN
                        </button>
                      )}
                    </td>
                    <td>
                      {p.name.startsWith("Former Member ") ? (
                        <span className="help">Removed</span>
                      ) : p.id === me?.id ? (
                        <span className="help">—</span>
                      ) : (
                        <button className="btn danger sm" onClick={() => setOffboarding(p.id)}>
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {offboarding && (
            <Modal
              title="Remove from committee"
              onClose={() => setOffboarding(null)}
              footer={
                <>
                  <button className="btn" onClick={() => setOffboarding(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn danger"
                    onClick={confirmOffboard}
                    disabled={offboardingBusy}
                  >
                    {offboardingBusy ? "Removing…" : "Remove & revoke access"}
                  </button>
                </>
              }
            >
              <p style={{ margin: 0 }}>
                This revokes <strong>{profiles[offboarding]?.name}</strong>&apos;s login and
                renames them to an anonymous &quot;Former Member&quot; label. Everything they
                wrote or voted on stays exactly where it is, just no longer attributed to their
                real name or email.
              </p>
              <p className="help">
                This can&apos;t be undone from here — reversing it means editing the database
                directly.
              </p>
            </Modal>
          )}

          {bulkOpen && (
            <Modal
              title="Bulk import members"
              onClose={() => setBulkOpen(false)}
              footer={
                <>
                  <button className="btn" onClick={() => setBulkOpen(false)}>
                    {bulkResults ? "Close" : "Cancel"}
                  </button>
                  <button
                    className="btn primary"
                    onClick={runBulkImport}
                    disabled={bulkRunning || bulkRowCount === 0}
                  >
                    {bulkRunning
                      ? "Importing…"
                      : `Import ${bulkRowCount || ""} member${bulkRowCount === 1 ? "" : "s"}`}
                  </button>
                </>
              }
            >
              <div className="field">
                <label>Role(s) for everyone in this batch — optional</label>
                <div className="row wrap">
                  {sortedRoles.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      className={`tag-check${bulkRoleIds.includes(r.id) ? " on" : ""}`}
                      onClick={() => toggleBulkRole(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>One member per line</label>
                <textarea
                  className="textarea"
                  style={{ minHeight: 140, fontFamily: "monospace", fontSize: 12.5 }}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"jane@example.com, Jane Smith, 482913\njohn@example.com, John Doe, 719204"}
                  disabled={bulkRunning}
                />
                <span className="help">
                  Format: <strong>email, name, 6-digit PIN</strong> — comma-separated, no header
                  row. Each account is created immediately with that PIN, no email needed;
                  everyone gets the role(s) picked above (edit any of it afterwards from the
                  Members table).
                </span>
              </div>
              {bulkResults && (
                <div className="field">
                  <label>Results</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {bulkResults.map((r, i) => (
                      <div key={i} style={{ fontSize: 12 }}>
                        <span style={{ color: r.ok ? "var(--good)" : "var(--critical)" }}>
                          {r.ok ? "✓" : "✕"}
                        </span>{" "}
                        {r.line} — {r.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Modal>
          )}

          {editingRolesFor && (
            <Modal
              title={`Edit roles — ${profiles[editingRolesFor]?.name || ""}`}
              onClose={() => setEditingRolesFor(null)}
              footer={
                <>
                  <button className="btn" onClick={() => setEditingRolesFor(null)}>
                    Cancel
                  </button>
                  <button className="btn primary" onClick={saveEditRoles} disabled={savingRoles}>
                    {savingRoles ? "Saving…" : "Save"}
                  </button>
                </>
              }
            >
              <div className="row wrap">
                {sortedRoles.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className={`tag-check${editRoleIds.includes(r.id) ? " on" : ""}`}
                    onClick={() => toggleEditRole(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Modal>
          )}

          <PictureRetention />

          <LoginLog />

          <div className="section-title">
            <h2>Roles</h2>
            <span className="hint">Shown as the Role option everywhere in the app</span>
          </div>
          <div className="card pad">
            <div className="row wrap">
              {sortedRoles.map((r) => (
                <span className="chip" key={r.id}>
                  {r.label}
                  <button onClick={() => removeRole(r.id)}>✕</button>
                </span>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="input"
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
                placeholder="e.g. Regional Representative"
              />
              <button className="btn sm" onClick={addRole} disabled={!newRoleLabel.trim()}>
                Add role
              </button>
            </div>
          </div>

          <div className="section-title">
            <h2>Skill areas</h2>
            <span className="hint">The columns of the Skills matrix, and the tags on tasks</span>
          </div>
          <div className="card pad">
            <div className="row wrap">
              {sortedSkillAreas.map((s) => (
                <span className="chip" key={s.id}>
                  {s.label}
                  <button onClick={() => removeSkillArea(s.id)}>✕</button>
                </span>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                className="input"
                value={newSkillAreaLabel}
                onChange={(e) => setNewSkillAreaLabel(e.target.value)}
                placeholder="e.g. Safeguarding"
              />
              <button className="btn sm" onClick={addSkillArea} disabled={!newSkillAreaLabel.trim()}>
                Add skill area
              </button>
            </div>
          </div>

          <div className="section-title">
            <h2>New group</h2>
          </div>
          <div className="card pad">
            <div className="row wrap">
              <div className="field" style={{ flex: 2, minWidth: 200 }}>
                <label>Name</label>
                <input
                  className="input"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Media Team"
                />
              </div>
              <div className="field" style={{ flex: 1, minWidth: 150 }}>
                <label>Kind</label>
                <select
                  className="select"
                  value={newGroupKind}
                  onChange={(e) => setNewGroupKind(e.target.value as GroupKind)}
                >
                  <option value="working-party">Working party</option>
                  <option value="committee">Committee</option>
                </select>
              </div>
              <div className="field" style={{ flex: 1, minWidth: 120 }}>
                <label>Default quorum</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={newGroupQuorum}
                  onChange={(e) => setNewGroupQuorum(Number(e.target.value))}
                />
              </div>
              <button
                className="btn primary"
                onClick={createGroup}
                disabled={!newGroupName.trim()}
                style={{ alignSelf: "flex-end" }}
              >
                Create
              </button>
            </div>
          </div>
        </>
      )}

      {!me?.is_global_admin && isCommitteeMember && <StartGroup />}

      <div className="section-title">
        <h2>{me?.is_global_admin ? "Groups" : "Groups you run"}</h2>
      </div>
      {!Object.values(groups).some((g) => isGroupAdmin(g.id)) && (
        <p className="help">You don&apos;t run any groups yet. Start one above.</p>
      )}
      {Object.values(groups)
        .filter((g) => isGroupAdmin(g.id))
        .map((g) => {
          const members = Object.values(groupMembers).filter((gm) => gm.group_id === g.id);
          const memberIds = new Set(members.map((m) => m.member_id));
          const nonMembers = Object.values(profiles).filter((p) => !memberIds.has(p.id));
          return (
            <div className="group-manage-card" key={g.id}>
              <div className="row between">
                <div>
                  <strong>{g.name}</strong>
                  <div className="help">{g.description}</div>
                </div>
                <div className="field" style={{ width: 140 }}>
                  <label>Default quorum</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    defaultValue={g.default_quorum}
                    onBlur={(e) =>
                      updateGroup(g.id, { default_quorum: Math.max(1, Number(e.target.value)) })
                    }
                  />
                  <span className="help">
                    {members.length} active member{members.length === 1 ? "" : "s"} in this group
                  </span>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                {members.map((gm) => {
                  const p = profiles[gm.member_id];
                  if (!p) return null;
                  return (
                    <span className="chip" key={gm.member_id}>
                      {p.name}
                      {gm.is_admin ? " · admin" : ""}
                      <button onClick={() => toggleGroupAdmin(g.id, gm.member_id, gm.is_admin)}>
                        {gm.is_admin ? "demote" : "promote"}
                      </button>
                      <button onClick={() => removeMember(g.id, gm.member_id)}>✕</button>
                    </span>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <select
                  className="select"
                  value={addMemberFor[g.id] || ""}
                  onChange={(e) =>
                    setAddMemberFor((prev) => ({ ...prev, [g.id]: e.target.value }))
                  }
                >
                  <option value="">Add member…</option>
                  {nonMembers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="btn sm" onClick={() => addMember(g.id)}>
                  Add
                </button>
              </div>
              {g.kind === "working-party" && (
                <div className="row" style={{ marginTop: 10, justifyContent: "flex-end" }}>
                  <button
                    className="btn sm danger"
                    onClick={() => {
                      setDeleteTyped("");
                      setDeletingGroup(g.id);
                    }}
                  >
                    Delete group
                  </button>
                </div>
              )}
            </div>
          );
        })}

      {deletingGroup && groups[deletingGroup] && (() => {
        const g = groups[deletingGroup];
        const inGroup = <T extends { group_id: string | null }>(rows: Record<string, T>) =>
          Object.values(rows).filter((r) => r.group_id === g.id).length;
        const parts: [number, string, string][] = [
          [inGroup(spaces), "room", "rooms"],
          [inGroup(decisions), "motion", "motions"],
          [inGroup(tasks), "task", "tasks"],
          [inGroup(documents), "document link", "document links"],
          [inGroup(meetings), "meeting", "meetings"],
        ];
        const listed = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
        return (
          <Modal
            title={`Delete "${g.name}"?`}
            onClose={() => setDeletingGroup(null)}
            footer={
              <>
                <button className="btn" onClick={() => setDeletingGroup(null)}>
                  Keep it
                </button>
                <button
                  className="btn danger"
                  onClick={() => deleteGroup(g.id)}
                  disabled={deleteBusy || deleteTyped.trim() !== g.name}
                >
                  {deleteBusy ? "Deleting…" : "Delete permanently"}
                </button>
              </>
            }
          >
            <p>
              This permanently deletes the group and everything in it
              {listed.length > 0 ? `: ${listed.join(", ")}` : ""}, including all messages and
              votes. It can&apos;t be undone, and everyone loses access straight away.
            </p>
            <div className="field">
              <label>Type the group&apos;s name to confirm</label>
              <input
                className="input"
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
                placeholder={g.name}
                autoFocus
              />
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
