/**
 * Badges "Disponible sur l'App Store" / "Disponible sur Google Play" —
 * mènent vers la page du partenaire (aucune vraie fiche de store n'existe
 * pour l'instant), mais avec un rendu fidèle aux badges officiels pour
 * signaler clairement que l'application est déjà utilisable.
 */
function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.536c-.02-2.06 1.685-3.05 1.76-3.096-.96-1.404-2.456-1.596-2.99-1.617-1.273-.13-2.482.75-3.128.75-.647 0-1.646-.732-2.706-.712-1.392.02-2.678.81-3.394 2.058-1.448 2.51-.37 6.226 1.04 8.263.69 1 1.51 2.122 2.588 2.082 1.036-.04 1.428-.67 2.682-.67 1.254 0 1.61.67 2.706.65 1.12-.02 1.828-1.014 2.512-2.02.792-1.157 1.118-2.278 1.136-2.335-.025-.012-2.18-.837-2.206-3.353zM15.09 5.822c.572-.693.958-1.657.852-2.617-.822.033-1.818.548-2.41 1.24-.53.612-.994 1.594-.87 2.532.918.07 1.856-.464 2.428-1.155z"/>
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.3 2.6c-.3.3-.5.7-.5 1.2v16.4c0 .5.2.9.5 1.2l.1.1L13.9 12 4.4 2.5l-.1.1z"/>
      <path d="M17 15.1l-3.1-3.1 3.1-3.1 3.7 2.1c.6.3.6 1.2 0 1.5L17 15.1z" opacity="0.9"/>
      <path d="M13.9 12l3.1 3.1-9.7 5.5c-.4.2-.9.2-1.3 0L13.9 12z" opacity="0.75"/>
      <path d="M13.9 12L5.9 3.4c.4-.2.9-.2 1.3 0l9.7 5.5L13.9 12z" opacity="0.6"/>
    </svg>
  );
}

const BADGES = [
  { key: "apple", Icon: AppleIcon, small: "Télécharger sur l'", big: "App Store" },
  { key: "google", Icon: PlayIcon, small: "Disponible sur", big: "Google Play" },
];

export default function StoreBadges({ to, size = "default" }) {
  const isSmall = size === "small";
  return (
    <div className="flex items-center gap-2.5">
      {BADGES.map(({ key, Icon, small, big }) => (
        <a
          key={key}
          href={to}
          className={`flex items-center gap-2 rounded-xl bg-ink-fixed text-cream-fixed hover:bg-black transition-colors ${
            isSmall ? "px-3 py-1.5" : "px-4 py-2"
          }`}
        >
          <Icon />
          <span className="leading-tight text-left">
            <span className={`block ${isSmall ? "text-[0.55rem]" : "text-[0.6rem]"} text-cream-fixed/70`}>{small}</span>
            <span className={`block font-medium ${isSmall ? "text-xs" : "text-sm"}`}>{big}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
