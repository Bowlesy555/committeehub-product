import type { MemberRole, Role } from "@/types";

export function roleLabelsFor(
  memberId: string,
  memberRoles: Record<string, MemberRole>,
  roles: Record<string, Role>
): string[] {
  return Object.values(memberRoles)
    .filter((mr) => mr.member_id === memberId)
    .map((mr) => roles[mr.role_id]?.label)
    .filter((label): label is string => !!label)
    .sort((a, b) => a.localeCompare(b));
}
