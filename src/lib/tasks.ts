import type { TaskAssignee } from "@/types";

export function assigneeIdsOf(
  taskId: string,
  taskAssignees: Record<string, TaskAssignee>
): string[] {
  return Object.values(taskAssignees)
    .filter((a) => a.task_id === taskId)
    .map((a) => a.member_id);
}
