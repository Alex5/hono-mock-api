import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from 'hono/cors'

import products from "./fixtures/products.json" with {type: 'json'};

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN

const app = new Hono();

if (!CLIENT_ORIGIN) throw new Error("CLIENT_ORIGIN must be provided")

app.use('/api/*', cors({
  origin: CLIENT_ORIGIN
}))

app.get("/api/v1/products", (c) => {
  return c.json(products);
});

serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on ${info.address}`);
  }
);
