export type AppLanguage = "ru" | "en";

export type OverlayMode = "quiet" | "focus";

export type AppSettings = {
  language: AppLanguage;
  wakeWord: string;
  addressTitle: string;
  overlayMode: OverlayMode;
};

export const defaultSettings: AppSettings = {
  language: "ru",
  wakeWord: "Джарвис",
  addressTitle: "Мистер Старк",
  overlayMode: "quiet",
};