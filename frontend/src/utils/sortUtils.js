const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

// Shared table sorting helpers keep numeric-looking strings such as unit IDs in natural order.
export const compareSortValues = (a, b, direction = "asc") => {
  const aValue = a === null || a === undefined ? "" : a;
  const bValue = b === null || b === undefined ? "" : b;
  const result = collator.compare(String(aValue), String(bValue));

  return direction === "asc" ? result : -result;
};

export const nextSortDirection = (currentField, nextField, currentDirection) =>
  currentField === nextField && currentDirection === "asc" ? "desc" : "asc";
