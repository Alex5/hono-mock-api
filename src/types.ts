import products from "./fixtures/products.json" with { type: 'json' };

export type Product = (typeof products)[number];

export type CartItem = { product: Product; quantity: number };

export type UserCart = Record<string, CartItem>;

export type SessionData = { username?: string };