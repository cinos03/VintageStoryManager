import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

export interface TokenPayload {
  username: string;
}

export function signToken(username: string): string {
  return jwt.sign({ username } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: "7d",
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/** Reads the JWT from the auth cookie or Authorization header. */
export function extractToken(req: Request): string | null {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.token;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { user?: TokenPayload }).user = payload;
  next();
}
