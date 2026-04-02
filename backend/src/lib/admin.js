const DEFAULT_ADMIN_EMAIL = "admin@quantum.com";

function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getPrimaryAdminEmail() {
  return getAdminEmails()[0] || DEFAULT_ADMIN_EMAIL;
}

function isAdminEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return getAdminEmails().includes(normalized);
}

module.exports = {
  getAdminEmails,
  getPrimaryAdminEmail,
  isAdminEmail,
};
