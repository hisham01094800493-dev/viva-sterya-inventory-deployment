export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export const startLogin = () => {
  window.location.assign(`${API_ORIGIN}/api/oauth/google`);
};
