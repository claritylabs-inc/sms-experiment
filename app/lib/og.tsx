import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

// Brand colors
const BG = "#faf8f4";
const FG = "#111827";
const MUTED = "#8a8578";
const CARD_BG = "#f0ede7";
const BRAND_BLUE = "#A0D2FA";

const CATEGORY_LABELS: Record<string, string> = {
  auto: "Auto",
  homeowners: "Home",
  renters: "Renters",
  flood: "Flood",
  umbrella: "Umbrella",
  pet: "Pet",
  travel: "Travel",
  earthquake: "Earthquake",
  recreational: "Recreational",
  farm: "Farm",
  commercial: "Commercial",
  other: "Other",
};

export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

type Policy = {
  category: string;
  carrier?: string | null;
  documentType: string;
};

async function loadFonts() {
  const [instrumentSerif, bagel, geist] = await Promise.all([
    fetch(
      "https://fonts.gstatic.com/s/instrumentserif/v5/jizBRFtNs2ka5fXjeivQ4LroWlx-2zI.ttf"
    ).then((r) => r.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/bagelfatone/v2/hYkPPucsQOr5dy02WmQr5Zkd0B4.ttf"
    ).then((r) => r.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/geist/v1/gyBhhwUxId8gMGYQMKR3pzfaWI_CkQ.ttf"
    ).then((r) => r.arrayBuffer()),
  ]);
  return [
    { name: "Instrument Serif", data: instrumentSerif, style: "normal" as const, weight: 400 as const },
    { name: "Bagel Fat One", data: bagel, style: "normal" as const, weight: 400 as const },
    { name: "Geist", data: geist, style: "normal" as const, weight: 400 as const },
  ];
}

function PolicyPills({ policies }: { policies: Policy[] }) {
  if (policies.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "100%",
        maxWidth: 700,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontFamily: "Geist",
          color: MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        On file
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {policies.slice(0, 6).map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              backgroundColor: CARD_BG,
              borderRadius: 100,
              padding: "10px 20px",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: BRAND_BLUE,
              }}
            />
            <span
              style={{
                fontSize: 18,
                fontFamily: "Geist",
                color: FG,
              }}
            >
              {categoryLabel(p.category)}
            </span>
            {p.carrier && (
              <span
                style={{
                  fontSize: 18,
                  fontFamily: "Geist",
                  color: MUTED,
                }}
              >
                {p.carrier}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export async function renderOgImage({
  title,
  subtitle,
  policies,
}: {
  title: string;
  subtitle?: string;
  policies: Policy[];
}) {
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BG,
          padding: "60px 80px",
          gap: 0,
        }}
      >
        {/* SPOT logo */}
        <div
          style={{
            fontFamily: "Bagel Fat One",
            fontSize: 28,
            color: FG,
            letterSpacing: "0.08em",
            marginBottom: 32,
          }}
        >
          SPOT
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 56,
            fontFamily: "Instrument Serif",
            color: FG,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
            textAlign: "center",
            maxWidth: 900,
            marginBottom: subtitle ? 12 : 0,
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div
            style={{
              fontSize: 22,
              fontFamily: "Geist",
              color: MUTED,
              textAlign: "center",
              maxWidth: 700,
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            {subtitle}
          </div>
        )}

        {/* Spacer */}
        {policies.length > 0 && (
          <div style={{ display: "flex", height: 36 }} />
        )}

        {/* Policy pills */}
        <PolicyPills policies={policies} />

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontFamily: "Geist",
              color: `${MUTED}99`,
            }}
          >
            Spot from Clarity Labs
          </span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
    }
  );
}
