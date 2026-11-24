import { Linking } from "react-native";

/** The legal pages live on the landing (kubbo3d.com), like on the web. */
const LANDING = (process.env.EXPO_PUBLIC_LANDING_URL || "https://kubbo3d.com").replace(/\/+$/, "");

export const TERMS_URL = `${LANDING}/terminos`;
export const PRIVACY_URL = `${LANDING}/privacidad`;

export const openLegal = (url: string) => Linking.openURL(url).catch(() => {});
