import { describe, it, expect } from "vitest";
import { ApiError, NetworkError } from "../lib/api.js";

describe("classes d'erreur de l'API", () => {
  it("ApiError conserve le statut HTTP et les données brutes", () => {
    const err = new ApiError("Non trouvé", 404, { detail: "Non trouvé" });
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(404);
    expect(err.data).toEqual({ detail: "Non trouvé" });
    expect(err).toBeInstanceOf(Error);
  });

  it("NetworkError a un message compréhensible, distinct d'une erreur applicative", () => {
    const err = new NetworkError();
    expect(err.name).toBe("NetworkError");
    expect(err.message).toMatch(/serveur|connexion/i);
    expect(err).toBeInstanceOf(Error);
  });
});
