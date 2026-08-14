import jwt, { SignOptions } from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "./env";

export interface JwtPayload {
  sub: string; // dashboard User.id
  discordId: string;
  jti: string; // соответствует Session.jwtId, позволяет отзывать сессии
}

export function signSessionToken(payload: Omit<JwtPayload, "jti">) {
  const jti = randomUUID();
  const token = jwt.sign({ ...payload, jti }, env.JWT_SECRET, {
    // @types/jsonwebtoken типизирует expiresIn через шаблонный литерал (StringValue),
    // а у нас это произвольная строка из env — значение валидируется в рантайме
    // самим jsonwebtoken (бросит исключение при некорректном формате при старте).
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
  return { token, jti };
}

export function verifySessionToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
