import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Artifact, WebsiteContent } from "@factory/shared";
import { ExternalLink, ImageUp, Loader2 } from "lucide-react";
import type { ContentItemInput } from "@/data/useUserTask";

const FIELD =
  "block w-full rounded border border-outline bg-canvas px-3 py-2 text-sm text-ink outline-none " +
  "placeholder:text-ink-muted focus:border-primary focus:ring-1 focus:ring-primary";

/**
 * The in-app half of the hybrid content model: the owner fills one-off page
 * copy, hero images, and the logo. Applying re-runs the build to bake it in.
 * (Repeating/structured content is edited in the Wix dashboard instead.)
 */
export function WebsiteContentForm({
  items,
  busy,
  onApply,
}: {
  items: WebsiteContent["items"];
  busy: boolean;
  onApply: (items: ContentItemInput[]) => void;
}) {
  const [draft, setDraft] = useState<ContentItemInput[]>(() => items.map((item) => ({ ...item })));
  const dirty = JSON.stringify(draft) !== JSON.stringify(items);

  const setValue = (key: string, patch: Partial<ContentItemInput>) =>
    setDraft((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  if (items.length === 0) {
    return (
      <section className="border-outline rounded border bg-white p-4">
        <h4 className="text-ink text-sm font-semibold">Your content</h4>
        <p className="text-ink-muted mt-1 text-xs">
          Nothing to fill in — this site uses only generated or dashboard-managed content.
        </p>
      </section>
    );
  }

  const settings = draft.filter((item) => item.kind === "setting");
  const content = draft.filter((item) => item.kind !== "setting");
  const byPage = groupBy(content, (item) => item.page ?? "Site");

  return (
    <section className="border-outline rounded border bg-white p-4">
      <h4 className="text-ink text-sm font-semibold">Your content</h4>
      <p className="text-ink-muted mt-1 text-xs">
        Fill these in and apply — the site rebuilds with your content. You can change it any time.
      </p>
      <div className="mt-3 flex flex-col gap-4">
        {Object.entries(byPage).map(([page, pageItems]) => (
          <div key={page}>
            <p className="text-ink-muted mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
              {page}
            </p>
            <div className="flex flex-col gap-3">
              {pageItems.map((item) => (
                <ContentField key={item.key} item={item} onChange={(patch) => setValue(item.key, patch)} />
              ))}
            </div>
          </div>
        ))}
        {settings.length > 0 && (
          <div>
            <p className="text-ink-muted mb-2 text-[11px] font-semibold uppercase tracking-[0.08em]">
              Details your site needs
            </p>
            <div className="flex flex-col gap-3">
              {settings.map((item) => (
                <ContentField key={item.key} item={item} onChange={(patch) => setValue(item.key, patch)} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          className="bg-primary rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          disabled={busy || !dirty}
          onClick={() => onApply(draft)}
        >
          {busy ? "Applying…" : "Apply content"}
        </button>
      </div>
    </section>
  );
}

function ContentField({
  item,
  onChange,
}: {
  item: ContentItemInput;
  onChange: (patch: Partial<ContentItemInput>) => void;
}) {
  if (item.kind === "image" || item.kind === "logo") {
    return <ImageField item={item} onChange={onChange} />;
  }
  return (
    <label className="block">
      <span className="text-ink text-xs font-medium">{item.label}</span>
      {item.help && <span className="text-ink-muted mt-0.5 block text-xs">{item.help}</span>}
      {item.helpUrl && (
        <a
          className="text-primary mt-0.5 flex w-fit items-center gap-1 text-xs underline hover:no-underline"
          href={item.helpUrl}
          rel="noreferrer"
          target="_blank"
        >
          Where do I find this? <ExternalLink size={11} />
        </a>
      )}
      {item.kind === "longtext" ? (
        <textarea
          className={`${FIELD} mt-1`}
          rows={3}
          placeholder={item.placeholder}
          value={item.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value || null })}
        />
      ) : (
        <input
          className={`${FIELD} mt-1`}
          placeholder={item.placeholder}
          value={item.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value || null })}
        />
      )}
    </label>
  );
}

function ImageField({
  item,
  onChange,
}: {
  item: ContentItemInput;
  onChange: (patch: Partial<ContentItemInput>) => void;
}) {
  const generateUploadUrl = useMutation(api.projects.generateContentUploadUrl);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await res.json()) as { storageId: string };
      onChange({ assetId: storageId, value: file.name });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <span className="text-ink text-xs font-medium">{item.label}</span>
      <label className="border-outline mt-1 flex w-fit cursor-pointer items-center gap-2 rounded border bg-canvas px-3 py-2 text-xs text-ink hover:bg-[#eceef2]">
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
        {item.assetId ? `Uploaded: ${item.value ?? "image"}` : "Upload an image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </label>
    </div>
  );
}

export function WebsiteContentView({ artifact }: { artifact: Artifact<"websiteContent"> }) {
  // Read-only rendering (version browsing / completed tasks).
  return (
    <section className="border-outline rounded border bg-white p-4">
      <h4 className="text-ink text-sm font-semibold">Your content</h4>
      <dl className="mt-3 flex flex-col gap-2">
        {artifact.data.items.map((item) => (
          <div key={item.key} className="text-sm">
            <dt className="text-ink-muted text-xs">{item.label}</dt>
            <dd className="text-ink">{item.value ?? <em className="text-ink-muted">Not provided</em>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of items) (out[key(item)] ??= []).push(item);
  return out;
}
