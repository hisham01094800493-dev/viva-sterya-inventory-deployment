export const startLogin = () => {
  const apiUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  if (!apiUrl) throw new Error("VITE_API_URL is required to start Google sign-in");
  window.location.assign(`${apiUrl}/auth/google`);
};
