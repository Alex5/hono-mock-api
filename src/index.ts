import 'dotenv/config';

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from 'hono/cors';
import { LRUCache } from 'lru-cache';

import products from "./fixtures/products.json" with { type: 'json' };

type Product = (typeof products)[number];
type CartItem = { product: Product; quantity: number };
type UserCart = Record<string, CartItem>;

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;

if (!CLIENT_ORIGIN) throw new Error("CLIENT_ORIGIN must be provided");

const app = new Hono();

const cartCache = new LRUCache<string, UserCart>({
  max: 1000,
  ttl: 300000
});

app.use('/api/*', cors({ origin: CLIENT_ORIGIN }));

app.get("/api/v1/products", (c) => {
  return c.json(products);
});

app.get("/api/v1/cart/:userId", (c) => {
  const { userId } = c.req.param()

  if (!userId) return c.json({ error: "Missing userId" }, 400);

  const cart = cartCache.get(userId);

  return c.json(cart ?? {});
});

app.post("/api/v1/cart/:userId", async (c) => {
  const { userId } = c.req.param();

  const cartItem = await c.req.json() as Product;

  if (!userId && !cartItem) {
    return c.json({ error: "Missing userId, productId, or quantity" }, 400);
  }

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

app.delete("/api/v1/cart/:userId/:productId", async (c) => {
  const {userId, productId} = c.req.param();

  if (!userId && !productId) return c.json({ error: "Missing userId or productId" }, 400);

  const cart = cartCache.get(userId);

  if (!cart || !cart[productId]) {
    return c.json({ error: "Item not found" }, 404);
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