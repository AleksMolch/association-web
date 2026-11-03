/**
 * route.ts — обработчик всех маршрутов Better Auth.
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
