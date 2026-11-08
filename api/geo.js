// Fonction Vercel : pays du visiteur d'après son adresse IP (en-tête posé par Vercel, aucun service externe).
export default function handler(req, res) {
  const country = (req.headers["x-vercel-ip-country"] || "").toString().toUpperCase().slice(0, 2) || null;
  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  res.status(200).json({ country });
}
