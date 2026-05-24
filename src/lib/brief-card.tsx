import type { BriefRecord } from "@/lib/store";

/**
 * React component for the shareable image card layout.
 * Consumed by satori to render as SVG → PNG.
 *
 * satori uses a subset of CSS (flexbox only, no grid).
 * All styles must be inline objects.
 */
export function BriefCard({ brief }: { brief: BriefRecord }) {
  const truncatedSummary =
    brief.summary.length > 200
      ? brief.summary.slice(0, 197) + "..."
      : brief.summary;

  const truncatedWhyItMatters =
    brief.whyItMatters.length > 140
      ? brief.whyItMatters.slice(0, 137) + "..."
      : brief.whyItMatters;

  const firstCitation = brief.sourceCitations[0];
  const truncatedCitation = firstCitation
    ? firstCitation.length > 60
      ? firstCitation.slice(0, 57) + "..."
      : firstCitation
    : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1200,
        height: 630,
        background: "linear-gradient(135deg, #1c1917 0%, #292524 100%)",
        color: "#fafaf9",
        fontFamily: "Inter, sans-serif",
        padding: 56,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "#0057ff",
              fontSize: 16,
              fontWeight: 700,
              color: "#ffffff",
            }}
          >
            I
          </div>
          <span
            style={{
              fontSize: 14,
              letterSpacing: "0.18em",
              textTransform: "uppercase" as const,
              color: "#a8a29e",
            }}
          >
            Inflowee
          </span>
        </div>

        {brief.topicTitle && (
          <span
            style={{
              fontSize: 13,
              color: "#78716c",
            }}
          >
            {brief.topicTitle}
          </span>
        )}
      </div>

      {/* Title */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 40,
          flex: 1,
        }}
      >
        <h1
          style={{
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1.2,
            margin: 0,
            maxWidth: 900,
          }}
        >
          {brief.title}
        </h1>

        <p
          style={{
            fontSize: 20,
            lineHeight: 1.6,
            color: "#d6d3d1",
            marginTop: 20,
            maxWidth: 860,
          }}
        >
          {truncatedSummary}
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          <span
            style={{
              display: "flex",
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.1)",
              fontSize: 12,
              color: "#fafaf9",
            }}
          >
            {brief.importanceScore >= 0.75 ? "Important" : "Signal"}
          </span>
          {brief.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                display: "flex",
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                fontSize: 12,
                color: "#d6d3d1",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        {/* Why it matters */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 16,
            padding: "16px 20px",
            maxWidth: 700,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase" as const,
              letterSpacing: "0.14em",
              color: "#a8a29e",
            }}
          >
            Why it matters
          </span>
          <span
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              color: "#e7e5e4",
              marginTop: 6,
            }}
          >
            {truncatedWhyItMatters}
          </span>
        </div>

        {/* Citation + count */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "#78716c",
            }}
          >
            {brief.sourceCitations.length} source
            {brief.sourceCitations.length !== 1 ? "s" : ""}
          </span>
          {truncatedCitation && (
            <span
              style={{
                fontSize: 12,
                color: "#57534e",
                maxWidth: 300,
                textAlign: "right" as const,
              }}
            >
              {truncatedCitation}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
