export function getEnvs() {
  const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

  if (!CLIENT_ORIGIN) throw new Error("CLIENT_ORIGIN must be provided");

  const SESSION_SECRET = process.env.SESSION_SECRET;

  if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be provided");

  const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID;

  if (!YANDEX_CLIENT_ID) throw new Error("YANDEX_CLIENT_ID must be provided");

  const YANDEX_REDIRECT_URI = process.env.YANDEX_REDIRECT_URI;

  if (!YANDEX_REDIRECT_URI)
    throw new Error("YANDEX_REDIRECT_URI must be provided");


  const YANDEX_CLIENT_SECRET = process.env.YANDEX_CLIENT_SECRET;

  if (!YANDEX_CLIENT_SECRET)
    throw new Error("YANDEX_REDIRECT_URI must be provided");

  return {
    CLIENT_ORIGIN,
    SESSION_SECRET,
    YANDEX_CLIENT_ID,
    YANDEX_REDIRECT_URI,
    YANDEX_CLIENT_SECRET,
  };
}
