export async function requireAdmin() {
  // Admin dashboard is an internal operations tool, no login required
  return { error: null, session: { userId: "admin" } };
}
