"use client";

/**
 * Official brand icons for the hub's real connectors — drawn as clean
 * SVG vectors (stroke-based, currentColor) so they stay crisp at any
 * size on a phone. No text placeholders (no "M", "Ig", "D", "S", "£"
 * letters) and no apps EchoMind does not connect: the orbit and the
 * drawer show exactly the 8 real connectors (Gmail, Calendar, Drive,
 * Docs, Sheets, Bank, Instagram, YouTube). Slack and Notion exist
 * only as "coming soon" marks — they have no connector and never
 * appear in the orbit.
 */

export type BrandIconId =
  | "gmail"
  | "calendar"
  | "drive"
  | "docs"
  | "sheets"
  | "bank"
  | "instagram"
  | "youtube"
  | "slack"
  | "notion";

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function GmailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" {...S} />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" {...S} />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" {...S} />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" {...S} />
      <rect x="7.5" y="12.5" width="3" height="3" rx="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DriveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M9 4.5h6l5 8.5H14l-2-3.5-2 3.5H4l5-8.5Z" {...S} />
      <path d="M9 13.5h6l2 3.5a2 2 0 0 1-1.7 3H8.7a2 2 0 0 1-1.7-3l2-3.5Z" {...S} />
    </svg>
  );
}

function DocsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7 3.5h7l4 4v13H7V3.5Z" {...S} />
      <path d="M14 3.5v4h4" {...S} />
      <path d="M9.5 12h5M9.5 15.5h5" {...S} />
    </svg>
  );
}

function SheetsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7 3.5h7l4 4v13H7V3.5Z" {...S} />
      <path d="M14 3.5v4h4" {...S} />
      <path d="M9.5 11h5M9.5 14.5h5M9.5 18h3" {...S} />
    </svg>
  );
}

function BankIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="m3.5 9.5 8.5-4.5L20.5 9.5" {...S} />
      <path d="M5 9.5v8M9.7 9.5v8M14.3 9.5v8M19 9.5v8" {...S} />
      <path d="M3.5 17.5h17M4.5 20.5h15" {...S} />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...S} />
      <circle cx="12" cy="12" r="4" {...S} />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="2.5" y="6" width="19" height="12.5" rx="3.5" {...S} />
      <path d="M10.5 9.8v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4" {...S} />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="m6.5 6.5 2.8 2.8M14.7 14.7l2.8 2.8M17.5 6.5l-2.8 2.8M9.3 14.7l-2.8 2.8" {...S} />
    </svg>
  );
}

function NotionIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" {...S} />
      <path d="M8 17V7.5l8 9.5V7.5" {...S} />
    </svg>
  );
}

const ICONS: Record<BrandIconId, (props: { className?: string }) => React.ReactElement> = {
  gmail: GmailIcon,
  calendar: CalendarIcon,
  drive: DriveIcon,
  docs: DocsIcon,
  sheets: SheetsIcon,
  bank: BankIcon,
  instagram: InstagramIcon,
  youtube: YouTubeIcon,
  slack: SlackIcon,
  notion: NotionIcon,
};

export function BrandIcon({ id, className = "h-6 w-6" }: { id: BrandIconId; className?: string }) {
  const Icon = ICONS[id];
  return <Icon className={className} />;
}
