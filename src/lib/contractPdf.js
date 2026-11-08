/** Génère le PDF du contrat de partenariat côté navigateur (pas de service
 * PDF backend à maintenir) — mise en page simple mais soignée, cohérente
 * avec l'identité H-Company (café/crème), utilisable telle quelle en
 * pièce jointe ou impression.
 *
 * jsPDF est importé dynamiquement : son bundle embarque html2canvas +
 * dompurify (pour sa fonctionnalité .html(), qu'on n'utilise pas), soit
 * ~250 Ko qu'il est inutile de charger tant que personne ne clique sur
 * "Télécharger le PDF". */
export async function downloadContractPdf(contract, partner) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  let y = 64;

  const coffee = [90, 62, 45];
  const ink = [30, 26, 22];
  const soft = [110, 100, 92];

  // En-tête
  doc.setFont("times", "italic");
  doc.setFontSize(22);
  doc.setTextColor(...ink);
  doc.text("H-Company", margin, y);
  y += 10;
  doc.setDrawColor(...coffee);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 30;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Contrat de partenariat", margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...soft);
  doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, margin, y);
  y += 26;

  // Corps du contrat
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...ink);
  const lines = doc.splitTextToSize(contract.content || "", maxWidth);
  const lineHeight = 15;
  const bottomLimit = doc.internal.pageSize.getHeight() - 70;

  for (const line of lines) {
    if (y > bottomLimit) {
      doc.addPage();
      y = 64;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  // Bloc signature
  y += 20;
  if (y > bottomLimit) {
    doc.addPage();
    y = 64;
  }
  doc.setDrawColor(220, 210, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...coffee);
  doc.text("Statut du contrat", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...ink);
  if (contract.status === "signed") {
    doc.text(`Signé par : ${contract.signed_by_name || "—"}`, margin, y);
    y += lineHeight;
    doc.text(
      `Le : ${contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("fr-FR") : "—"}`,
      margin,
      y
    );
  } else {
    doc.setTextColor(...soft);
    doc.text("En attente de signature.", margin, y);
  }

  if (partner?.email) {
    y += 28;
    doc.setFontSize(9);
    doc.setTextColor(...soft);
    doc.text(`Partenaire : ${partner.full_name || ""} ${partner.email ? `<${partner.email}>` : ""}`.trim(), margin, y);
  }

  const filename = `contrat-h-company-${contract.id || "partenariat"}.pdf`;
  doc.save(filename);
}
