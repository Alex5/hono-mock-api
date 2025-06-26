import 'dotenv/config';

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { csrf } from 'hono/csrf'
import { cors } from 'hono/cors';
import {pinoHttp} from "pino-http"
import { requestId } from 'hono/request-id';
import { LRUCache } from 'lru-cache';
import { getIronSession, type SessionOptions, type IronSession } from "iron-session";
import category from "./fixtures/category.json" with { type: 'json' };
import category_group from "./fixtures/category-group.json" with { type: 'json' };
import { getEnvs } from './utils.js';
import type { CartItem, Product, SessionData, UserCart } from './types.js';
import {HTTPException} from "hono/http-exception";
import type {IncomingMessage, ServerResponse} from "node:http";
import type {Logger} from "pino";

const {CLIENT_ORIGIN,SESSION_SECRET, YANDEX_CLIENT_ID, YANDEX_REDIRECT_URI, YANDEX_CLIENT_SECRET} = getEnvs();

const isDevelopment = process.env.NODE_ENV === 'development';

const sessionOptions: SessionOptions = {
  cookieName: "hono_mock_session",
  password: SESSION_SECRET,
  cookieOptions: {
    secure: !isDevelopment,
    sameSite: isDevelopment ? 'lax' : 'none',
    httpOnly: true,
  },
};

const cartCache = new LRUCache<string, UserCart>({
  max: 200,
  ttl: 300000,
});

const app = new Hono<{ Variables: { session: IronSession<SessionData>, logger: Logger}, Bindings: {incoming: IncomingMessage; outgoing: ServerResponse<IncomingMessage>} }>();

app.use(requestId());
app.use(async (c, next) => {
  c.env.incoming.id = c.var.requestId;

  await new Promise<void>((resolve) => pinoHttp({
    transport: {
      target: 'pino-pretty'
    },
  })(c.env.incoming, c.env.outgoing, () => resolve()));

  c.set('logger', c.env.incoming.log);

  await next();
});
app.use('/api/*', cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(csrf({ origin: CLIENT_ORIGIN }));
app.use(async (c, next) => {
  const session = await getIronSession<SessionData>(c.req.raw, c.res, sessionOptions);
  c.set("session", session);
  await next();
});

app.get("/api/v1/me", (c) => {
  const session = c.get("session");

  return session?.user
    ? c.json(session.user, 200)
    : c.json(undefined, 401);
});

app.patch("/api/v1/logout", async (c) => {
  const session = c.get("session");

  if (session?.user) {
    session.destroy();

    return c.json(undefined, 200);
  } else {
    return c.json(undefined, 401);
  }
});

app.get("/api/v1/yandex", (c) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: YANDEX_CLIENT_ID,
    redirect_uri: YANDEX_REDIRECT_URI,
  });

  return c.redirect(`https://oauth.yandex.ru/authorize?${params.toString()}`);
});

app.get("/api/v1/yandex/callback", async (c) => {
  const code = c.req.query("code");

  if (!code) return c.text("Missing code", 400);

  const tokenRes = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: YANDEX_CLIENT_ID,
      client_secret: YANDEX_CLIENT_SECRET,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    console.error("Token error:", tokenData);
    return c.text("OAuth failed", 401);
  }

  const userRes = await fetch(`https://login.yandex.ru/info?format=json`, {
    headers: { Authorization: `OAuth ${tokenData.access_token}` },
  });

  const userInfo = await userRes.json();

  if (!userInfo.id) return c.text("User info error", 401);

  const session = c.get("session");

  session.user = userInfo;

  await session.save();

  return c.redirect(CLIENT_ORIGIN);
});


app.get("/api/v1/products", (c) => c.json(category.products));
app.get("/api/v1/category", (c) => c.json(category));
app.get("/api/v1/category-group", (c) => c.json(category_group));

app.get("/api/v1/cart", (c) => {
  const session = c.get("session");

  const userId = session.user?.id;

  if (!userId) throw new HTTPException(401)

  const cart = cartCache.get(userId);

  return c.json(cart ?? {});
});

app.post("/api/v1/cart", async (c) => {
  const session = c.get("session");

  const userId = session.user?.id;

  if (!userId) throw new HTTPException(401)

  const cartItem = await c.req.json() as Product;

  if (!cartItem?.id) if (!userId) throw new HTTPException(400)

  const cart = cartCache.get(userId) || {};

  const existing = cart[cartItem.id] as CartItem | undefined;

  if (existing) {
    cart[cartItem.id] = {
      ...existing,
      quantity: existing.quantity + 1,
    };
  } else {
    cart[cartItem.id] = {
      product: cartItem,
      quantity: 1,
    };
  }

  cartCache.set(userId, cart);

  return c.json(cart);
});

app.delete("/api/v1/cart/:productId", (c) => {
  const session = c.get("session");

  const userId = session.user?.id;

  if (!userId) throw new HTTPException(401);

  const { productId } = c.req.param();

  const cart = cartCache.get(userId);

  if (!cart || !cart[productId]) throw new HTTPException(404)

  if (cart[productId].quantity === 1) {
    delete cart[productId];
  } else {
    cart[productId].quantity -= 1;
  }

  cartCache.set(userId, cart);

  return c.json(cart);
});

serve({ fetch: app.fetch, port: isDevelopment ? 5174 : 3000 }, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
});