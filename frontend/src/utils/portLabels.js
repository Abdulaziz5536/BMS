export const shouldShowAmharicLabels = () =>
  typeof window !== "undefined" && window.location.port === "3001";

export const portLabel = (english, amharic) =>
  shouldShowAmharicLabels() && amharic ? `${english} / ${amharic}` : english;
