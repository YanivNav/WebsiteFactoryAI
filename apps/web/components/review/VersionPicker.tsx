"use client";

/** v1 / v2 / … selector shown above a reviewed artifact. Newest version is approvable;
 *  older ones open read-only. */
export function VersionPicker({
  onSelect,
  selectedVersion,
  versions,
}: {
  onSelect: (version: number) => void;
  selectedVersion: number;
  versions: number[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-[#596170]">Version</span>
      {versions.map((version) => (
        <button
          className={`rounded border px-2.5 py-1 text-[11px] font-semibold ${selectedVersion === version ? "border-primary text-primary bg-[#edf5ff]" : "border-outline bg-white"}`}
          key={version}
          onClick={() => onSelect(version)}
          type="button"
        >
          v{version}
        </button>
      ))}
    </div>
  );
}
