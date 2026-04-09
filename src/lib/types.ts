import { Session } from "next-auth";

export interface ExtendedSession extends Session {
  userId?: string;
  username?: string;
  role?: string;
  userStatus?: string;
}
