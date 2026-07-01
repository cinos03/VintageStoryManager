import { Router } from "express";
import type { Request, Response } from "express";
import { verifyUser, changePassword } from "../db";
import { signToken, requireAuth, type TokenPayload } from "../auth";

export const authRouter = Router();

authRouter.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username and password required" });
  }
  if (!verifyUser(username, password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken(username);
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, username });
});

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req: Request, res: Response) => {
  const user = (req as Request & { user?: TokenPayload }).user;
  res.json({ username: user?.username });
});

authRouter.post("/change-password", requireAuth, (req: Request, res: Response) => {
  const user = (req as Request & { user?: TokenPayload }).user;
  const { newPassword } = req.body ?? {};
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    return res.status(400).json({ error: "newPassword must be at least 6 characters" });
  }
  if (!user || !changePassword(user.username, newPassword)) {
    return res.status(400).json({ error: "Could not change password" });
  }
  res.json({ ok: true });
});
