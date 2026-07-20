"use client";

export function ZoomOverlay({
  imageUrl,
  onClose,
  title = "Design Preview",
}: {
  imageUrl: string;
  onClose: () => void;
  title?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e1e3e6] p-4">
          <h3 className="text-sm font-semibold text-[#2c3038]">{title}</h3>
          <button
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[#edeeef]"
            onClick={onClose}
            type="button"
          >
            <span className="text-xl leading-none text-[#727785]">&times;</span>
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-[#f8f9fa] p-8">
          <img
            alt={title}
            className="mx-auto max-w-full border border-[#e1e3e6] shadow-lg"
            src={imageUrl}
          />
        </div>
      </div>
    </div>
  );
}
