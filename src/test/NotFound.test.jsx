import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "../context/LanguageContext.jsx";
import NotFound from "../pages/NotFound.jsx";

function renderWithProviders(ui) {
  return render(
    <BrowserRouter>
      <LanguageProvider>{ui}</LanguageProvider>
    </BrowserRouter>
  );
}

describe("page 404", () => {
  beforeEach(() => {
    // La langue par défaut suit celle du navigateur (comportement voulu) —
    // pour un test déterministe, on fixe explicitement le français plutôt
    // que de dépendre de la locale par défaut de l'environnement de test.
    document.cookie = "hc_lang=fr; Path=/";
  });

  it("s'affiche sans planter et propose un retour à l'accueil", () => {
    renderWithProviders(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /accueil/i })).toBeInTheDocument();
  });
});
