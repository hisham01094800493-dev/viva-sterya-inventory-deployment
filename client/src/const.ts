export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

export const startLogin = () => {
  window.location.assign("/api/oauth/google");
};
