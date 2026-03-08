export type AppLanguage = "ru" | "en";

export type AppSettings = {
  language: AppLanguage;
  wakeWord: string;
  addressTitle: string;
};

export const defaultSettings: AppSettings = {
  language: "ru",
  wakeWord: "Джарвис",
  addressTitle: "Мистер Старк",
};