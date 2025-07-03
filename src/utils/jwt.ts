import jwt, { Secret, SignOptions } from 'jsonwebtoken';

const JWT_SECRET: Secret = process.env.JWT_SECRET || 'defaultSecret';
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '1h';

export const generateToken = (payload: object): string => {
  const options: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };

  return jwt.sign(payload, JWT_SECRET, options);
};


export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}


export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
};
