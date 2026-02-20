export type JwtSubject = {
  sub: string;
  email: string;
  emailVerifiedAt?: string | null;
  tokenType: 'access' | 'refresh';
};
