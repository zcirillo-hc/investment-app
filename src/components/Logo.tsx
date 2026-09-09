export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect x="7" y="9" width="18" height="19" rx="6" className="fill-leaf-soft stroke-leaf" strokeWidth="2" />
      <rect x="10" y="5" width="12" height="5" rx="2" className="fill-leaf" />
      <path d="M11 22c2-5 6-7 10-7-1 5-4 8-10 7z" className="fill-leaf" />
      <circle cx="16" cy="24" r="2" className="fill-coral" />
    </svg>
  );
}
