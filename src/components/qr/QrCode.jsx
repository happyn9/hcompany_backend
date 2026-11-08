import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code rendu en SVG (net à toutes les tailles, imprimable). */
export default function QrCode({ value, size = 224, label, className = "" }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    if (!value) { setSvg(""); return undefined; }
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1a1410", light: "#ffffff" } })
      .then((s) => { if (alive) setSvg(s.replace("<svg ", `<svg width="100%" height="100%" `)); })
      .catch(() => alive && setSvg(""));
    return () => { alive = false; };
  }, [value]);
  return (
    <div
      role="img"
      aria-label={label || "QR code"}
      style={{ width: size, height: size, maxWidth: "100%" }}
      className={`bg-white rounded-2xl p-3 shadow-sm border border-line aspect-square ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
