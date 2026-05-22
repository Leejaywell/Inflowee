import type { SpaceMemberRecord } from "@/lib/store";

export function MemberList({
  members,
  actorId,
}: {
  members: SpaceMemberRecord[];
  actorId?: string;
}) {
  if (members.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No collaborators recorded yet. This slice only establishes member
        metadata and roles.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {members.map((member) => (
        <div
          key={`${member.spaceId}:${member.userId}`}
          className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-stone-900">{member.userId}</span>
            {actorId === member.userId ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-stone-500">
                You
              </span>
            ) : null}
          </div>
          <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700">
            {member.role}
          </span>
        </div>
      ))}
    </div>
  );
}
