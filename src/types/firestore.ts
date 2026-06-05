// types/firestore.ts
export interface UserProfile {
    id?: string; // Авто-ID из Firestore
    email: string;
    fullName: string;
    phone?: string;
    passwordHash: string; // Хешированный пароль
    createdAt: string;
    updatedAt?: string;
    lastLoginAt?: string;
    isActive: boolean;
    deletedAt?: string; // Дата мягкого удаления аккаунта
    passport?: {
      series: string;
      number: string;
      issuedBy: string;
      issueDate: string;
      birthDate?: string;
      birthPlace?: string;
    };
    orders?: any[]; // Массив заказов
  }