import { useId } from "react";

/** Marque H-Company : flamme chocolat avec le « h » — SVG pur, net à toutes les tailles. */
export default function Logo({ size = 32, className = "", title = "H-Company" }) {
  const g = `hc-flame-${useId()}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className={className}>
      <defs>
        <linearGradient id={g} x1="14" y1="4" x2="50" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#B4825A" />
          <stop offset=".55" stopColor="#7A4A2E" />
          <stop offset="1" stopColor="#4A2C1A" />
        </linearGradient>
      </defs>
      <path d="M31 2c1 9-3 13-8 19-6 7-10 12-10 21 0 12 8 20 20 20s19-8 19-19c0-6-2-10-5-14-1 4-3 6-6 7 2-9-1-19-10-34z" fill={`url(#${g})`} />
      <path d="M31 2c-3 10-6 13-10 19 5-2 9-1 11 3 1-7 0-14-1-22z" fill="#fff" fillOpacity=".12" />
      <ellipse cx="32" cy="42" rx="12" ry="13" fill="#fff" fillOpacity=".16" />
      <text x="32" y="49" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="24" fill="#fff">h</text>
    </svg>
  );
}
