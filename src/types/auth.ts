/** Пользователь приложения (замена Firebase User в UI и API). */
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber?: string | null;
  isAnonymous?: boolean;
}

/** Профиль с сервера auth-mobile.php */
export interface AuthUserPassport {
  series?: string;
  number?: string;
  issuedBy?: string;
  issueDate?: string;
  birthDate?: string;
  birthPlace?: string;
}

export interface AuthUserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  passport?: AuthUserPassport | null;
}

export interface AuthTokenResponse {
  success: boolean;
  user?: AuthUserProfile;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
  code?: string;
}
