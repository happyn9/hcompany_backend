import { presentationFor, logoSrc } from "../../data/hServices.js";

/** Logo d'un service H-Company, à placer à l'intérieur d'un badge circulaire
 * (ex: <span className="w-10 h-10 rounded-xl bg-coffee/10 ...">) — remplit
 * entièrement ce badge avec l'image uploadée depuis l'admin si elle existe
 * (logo_url renvoyé par le catalogue), sinon retombe sur une icône de
 * secours (voir data/hServices.js). */
export default function ServiceLogo({ logoUrl, serviceKey, size = 19 }) {
  const src = logoSrc(logoUrl);
  if (src) {
    return <img src={src} alt="" className="w-full h-full object-cover rounded-full" />;
  }
  const { Icon } = presentationFor(serviceKey);
  return <Icon size={size} strokeWidth={1.8} />;
}
