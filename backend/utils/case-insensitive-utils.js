const CASE_INSENSITIVE_COLLATION = { locale: "en", strength: 2 };

const normalizeCaseInsensitiveValue = (value) =>
  String(value || "").trim().toLowerCase();

const withCaseInsensitiveCollation = (query) =>
  query.collation(CASE_INSENSITIVE_COLLATION);

module.exports = {
  CASE_INSENSITIVE_COLLATION,
  normalizeCaseInsensitiveValue,
  withCaseInsensitiveCollation
};
