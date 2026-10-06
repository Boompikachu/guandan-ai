import type { ReactNode, SVGProps } from "react";

type UiIconName =
  | "arrow"
  | "cards"
  | "check"
  | "copy"
  | "enter"
  | "link"
  | "monitor"
  | "play"
  | "room"
  | "user"
  | "users";

type UiIconProps = SVGProps<SVGSVGElement> & {
  name: UiIconName;
};

export function UiIcon({ name, ...props }: UiIconProps) {
  const paths: Record<UiIconName, ReactNode> = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    cards: (
      <>
        <rect x="6.5" y="4" width="12" height="16" rx="2" />
        <path d="m9.5 12 3-3 3 3-3 3-3-3ZM4 7.5H3A1.5 1.5 0 0 0 1.5 9v10A1.5 1.5 0 0 0 3 20h9" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    enter: (
      <>
        <path d="M10 17 15 12 10 7M15 12H3" />
        <path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
      </>
    ),
    link: (
      <>
        <path d="m10 13.5 4-4" />
        <path d="M7.5 16.5 6 18a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" />
        <path d="M15 9a3.5 3.5 0 0 1 0-5l3-3a3.5 3.5 0 1 1 5 5l-1.5 1.5" transform="translate(-1 4)" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    play: <path d="m9 7 8 5-8 5V7Z" />,
    room: (
      <>
        <path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z" />
        <path d="M9 20v-6h6v6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 4.5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
