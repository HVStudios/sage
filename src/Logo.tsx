export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)"/>
      <rect x="5" y="10" width="22" height="15" rx="2.5" fill="white" fillOpacity="0.92"/>
      <rect x="5" y="10" width="13" height="5.5" rx="2.5" fill="white" fillOpacity="0.3"/>
      <circle cx="23" cy="17.5" r="3.5" fill="var(--accent)"/>
      <rect x="7" y="20" width="9" height="1.5" rx="1" fill="var(--accent)" fillOpacity="0.25"/>
      <rect x="7" y="23" width="6" height="1.5" rx="1" fill="var(--accent)" fillOpacity="0.2"/>
    </svg>
  )
}
