import 'dotenv/config';

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from 'hono/cors';
import { logger } from 'hono/logger'
import { LRUCache } from 'lru-cache';
import { getIronSession, type SessionOptions, type IronSession } from "iron-session";

import products from "./fixtures/products.json" with { type: 'json' };

type Product = (typeof products)[number];
type CartItem = { product: Product; quantity: number };
type UserCart = Record<string, CartItem>;

type SessionData = { username?: string };

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
if (!CLIENT_ORIGIN) throw new Error("CLIENT_ORIGIN must be provided");

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be provided");

const sessionOptions: SessionOptions = {
  cookieName: "hono_mock_session",
  password: SESSION_SECRET,
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    httpOnly: true
  },
};

const app = new Hono<{ Variables: {session: IronSession<SessionData>} }>();

app.use(logger())

const cartCache = new LRUCache<string, UserCart>({
  max: 200,
  ttl: 300000
});

app.use('/api/*', cors({ origin: CLIENT_ORIGIN, credentials: true }));

app.use(async (c, next) => {
  const session = await getIronSession<SessionData>(c.req.raw, c.res, sessionOptions);
 
  c.set("session", session);

  await next();
});

app.get("/api/v1/me", async (c) => {
  const session = c.get("session")

  if (session?.username) {
    return c.json(session, {status: 200});
  } else {
    return c.json(undefined, {status: 401});
  }
})

app.post("/api/v1/login", async (c) => {
  const { username } = await c.req.json();

  if (!username) return c.json({ error: "Missing username" }, 400);

   const session = c.get("session");

  if (session?.username) {
    return c.json(undefined, 409);
  }

  session.username = username;

  await session.save();

  return c.json(session);
});

app.patch("/api/v1/logout", async (c) => {
  const session = c.get("session");
  
  console.log("logout", {session})

  if (session?.username) {
    session.destroy();

    return c.json(undefined, 200);
  } else {
    return c.json(undefined, 401);
  }
});

app.get("/api/v1/products", (c) => {
  return c.json(products);
});

app.get("/api/v1/cart", (c) => {
  const session = c.get("session");

  const userId = session.username;

  if (!userId) return c.json(undefined, 401);

  const cart = cartCache.get(userId);

  return c.json(cart ?? {});
});

app.post("/api/v1/cart", async (c) => {
  const session = c.get("session");

  const userId = session.username;

  if (!userId) return c.json(undefined, 401);

  const cartItem = await c.req.json() as Product;

  if (!cartItem?.id) return c.json(undefined, {status: 400, statusText: 'Missing product'});

  const cart = cartCache.get(userId) || {};

  const existing = cart[cartItem.id] as CartItem | undefined;

  if (existing) {
    cart[existing.product.id] = {
        ...existing,
        quantity: (existing?.quantity ? (existing?.quantity + 1) : 1),
    };
  } else {
    cart[cartItem.id] = {
      product: cartItem,
      quantity: 1
    }
  }

  cartCache.set(userId, cart);

  const cacheCartItem = cartCache.get(userId);

  return c.json(cacheCartItem);
});

app.delete("/api/v1/cart/:productId", async (c) => {
  const session = c.get("session");

  const userId = session.username;
  
  if (!userId) return c.json(undefined, 401);

  const { productId } = c.req.param();

  const cart = cartCache.get(userId);

  if (!cart || !cart[productId]) {
    return c.json(undefined, 404);
  }

  if (cart[productId].quantity === 1) {
    delete cart[productId];
  } else {
    cart[productId] = {product: cart[productId].product, quantity: cart[productId].quantity - 1}
  }

  cartCache.set(userId, cart);

  return c.json(cartCache.get(userId));
});

serve(
  {
    fetch: app.fetch,
    port: process.env.NODE_ENV === "development" ? 5174 : 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);