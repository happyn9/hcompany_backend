/** Où envoyer quelqu'un juste après sa connexion : chacun arrive dans son espace. */
export function homeFor(user) {
  const role = user?.role;
  if (role === "admin") return "/admin";
  if (role === "agent") return "/agent";
  if (role === "partner") return "/dashboard";
  return "/app";
}
/** Une destination explicite (page qui demandait la connexion) prime ; « / » seul veut dire « pas de préférence ». */
export function afterLogin(redirectTo, user) {
  return !redirectTo || redirectTo === "/" ? homeFor(user) : redirectTo;
}
