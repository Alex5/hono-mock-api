import products from "./fixtures/category.json" with { type: 'json' };

export type Product = (typeof products)[number];

export type CartItem = { product: Product; quantity: number };

export type UserCart = Record<string, CartItem>;

export type SessionData = { user?: {id: string} };