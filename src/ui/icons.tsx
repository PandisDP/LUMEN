import type { ReactNode, SVGProps } from 'react'

/** Small stroke icons (24-unit grid, currentColor) so buttons don't rely on emoji glyphs. */
function Icon({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconPin = () => (
  <Icon>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.4" />
  </Icon>
)

export const IconGauge = () => (
  <Icon>
    <path d="M4 15a8 8 0 1 1 16 0" />
    <path d="m12 15 4-5" />
    <path d="M4 19h16" />
  </Icon>
)

export const IconClock = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
)

export const IconChevron = () => (
  <Icon>
    <path d="m7 10 5 5 5-5" />
  </Icon>
)

export const IconHelp = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7" />
    <path d="M12 17h.01" strokeWidth={2.4} />
  </Icon>
)

export const IconCompass = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
  </Icon>
)

export const IconOrbit = () => (
  <Icon>
    <circle cx="12" cy="12" r="3.2" />
    <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)" />
  </Icon>
)

export const IconMountain = () => (
  <Icon>
    <path d="m3 19 6-10 4 6 2.5-3.5L21 19H3Z" />
  </Icon>
)

export const IconLander = () => (
  <Icon>
    <path d="M8 13h8l-1.5-5h-5L8 13Z" />
    <path d="m8 13-3 6M16 13l3 6M12 13v6M4 19h3M17 19h3" />
  </Icon>
)

export const IconCompare = () => (
  <Icon>
    <rect x="3.5" y="5" width="7" height="14" rx="1.5" />
    <rect x="13.5" y="5" width="7" height="14" rx="1.5" />
  </Icon>
)

export const IconEye = () => (
  <Icon>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
)

export const IconEyeOff = () => (
  <Icon>
    <path d="M10 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.3A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
    <path d="m3 3 18 18" />
  </Icon>
)

export const IconBook = () => (
  <Icon>
    <path d="M4 5.5A2 2 0 0 1 6 4h13v14H6a2 2 0 0 0-2 2V5.5Z" />
    <path d="M4 20a2 2 0 0 1 2-2h13v2H6" />
  </Icon>
)

export const IconSpark = () => (
  <Icon>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
  </Icon>
)

export const IconSun = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </Icon>
)

export const IconEarth = () => (
  <Icon>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.1-3.6-8.5s1.2-6.2 3.6-8.5Z" />
  </Icon>
)

export const IconWide = () => (
  <Icon>
    <path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4" />
    <path d="M7 15l3-4 2.5 3 2-2.5L17 15" />
  </Icon>
)

export const IconSatellite = () => (
  <Icon>
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" transform="rotate(45 12 12)" />
    <path d="M7.8 7.8 4.5 4.5M3 8l5-5M16.2 16.2l3.3 3.3M16 21l5-5" />
    <path d="M18 6a4 4 0 0 0-1-1" />
  </Icon>
)

export const IconTarget = () => (
  <Icon>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>
)

export const IconPlay = () => (
  <Icon>
    <path d="M7 4.5v15l12-7.5-12-7.5Z" />
  </Icon>
)

export const IconPause = () => (
  <Icon>
    <path d="M8 5v14M16 5v14" />
  </Icon>
)

export const IconRestart = () => (
  <Icon>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </Icon>
)

export const IconFilter = () => (
  <Icon>
    <path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z" />
  </Icon>
)

export const IconMoon = () => (
  <Icon>
    <path d="M20 14.2A8.3 8.3 0 0 1 9.8 4a8.3 8.3 0 1 0 10.2 10.2Z" />
  </Icon>
)
