/**
 * Сервис для хранения изображений
 * Поддерживает несколько провайдеров: Cloudinary, ImgBB, Base64 в Firestore
 */

import { logger } from '../utils/logger';

export type ImageStorageProvider = 'cloudinary' | 'imgbb' | 'base64' | 'firebase';

export interface ImageUploadResult {
  success: boolean;
  url?: string;
  error?: string;
  provider?: string;
}

export class ImageStorageService {
  private static instance: ImageStorageService;
  private provider: ImageStorageProvider = 'imgbb'; // По умолчанию ImgBB (бесплатный)

  private constructor() {
    // Определяем провайдера из переменных окружения или используем по умолчанию
    const envProvider = process.env.EXPO_PUBLIC_IMAGE_STORAGE_PROVIDER as ImageStorageProvider;
    if (envProvider && ['cloudinary', 'imgbb', 'base64', 'firebase'].includes(envProvider)) {
      this.provider = envProvider;
    }
  }

  public static getInstance(): ImageStorageService {
    if (!ImageStorageService.instance) {
      ImageStorageService.instance = new ImageStorageService();
    }
    return ImageStorageService.instance;
  }

  /**
   * Загружает изображение через выбранный провайдер
   */
  async uploadImage(imageUri: string, fileName?: string): Promise<ImageUploadResult> {
    switch (this.provider) {
      case 'cloudinary':
        return await this.uploadToCloudinary(imageUri, fileName);
      case 'imgbb':
        return await this.uploadToImgBB(imageUri, fileName);
      case 'base64':
        return await this.uploadAsBase64(imageUri);
      case 'firebase':
        return { success: false, error: 'Firebase Storage требует оплату. Используйте другой провайдер.' };
      default:
        return await this.uploadToImgBB(imageUri, fileName);
    }
  }

  /**
   * Cloudinary - бесплатный план: 25GB хранилища, 25GB трафика в месяц
   * Регистрация: https://cloudinary.com/
   */
  private async uploadToCloudinary(imageUri: string, fileName?: string): Promise<ImageUploadResult> {
    try {
      const cloudinaryUrl = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_URL;
      const cloudinaryApiKey = process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY;

      if (!cloudinaryUrl || !cloudinaryApiKey) {
        logger.warn('Cloudinary не настроен, используем ImgBB');
        return await this.uploadToImgBB(imageUri, fileName);
      }

      // Конвертируем изображение в base64
      const base64 = await this.uriToBase64(imageUri);
      
      const formData = new FormData();
      formData.append('file', `data:image/jpeg;base64,${base64}`);
      formData.append('upload_preset', process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'ml_default');
      if (fileName) {
        formData.append('public_id', fileName);
      }

      const response = await fetch(cloudinaryUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Cloudinary upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data || typeof data !== 'object') {
        return await this.uploadToImgBB(imageUri, fileName);
      }
      const url = (data as { secure_url?: string; url?: string }).secure_url || (data as { url?: string }).url;
      if (!url) {
        return await this.uploadToImgBB(imageUri, fileName);
      }
      return {
        success: true,
        url,
        provider: 'cloudinary',
      };
    } catch (error: any) {
      logger.error('Cloudinary upload error:', error);
      // Fallback на ImgBB
      return await this.uploadToImgBB(imageUri, fileName);
    }
  }

  /**
   * ImgBB - полностью бесплатный, без регистрации
   * API: https://api.imgbb.com/
   * Получите API ключ: https://api.imgbb.com/
   */
  private async uploadToImgBB(imageUri: string, fileName?: string): Promise<ImageUploadResult> {
    try {
      const imgbbApiKey = process.env.EXPO_PUBLIC_IMGBB_API_KEY;
      
      if (!imgbbApiKey || imgbbApiKey === 'YOUR_IMGBB_API_KEY') {
        // Если ключ не настроен, используем Base64 в Firestore
        logger.warn('ImgBB API ключ не настроен, используем Base64');
        return await this.uploadAsBase64(imageUri);
      }

      // Конвертируем изображение в base64
      const base64 = await this.uriToBase64(imageUri);
      
      // ImgBB API принимает FormData или JSON
      // Используем FormData для React Native (более надежно)
      const formData = new FormData();
      formData.append('key', imgbbApiKey);
      // ImgBB принимает base64 строку напрямую в поле 'image'
      formData.append('image', base64);
      if (fileName) {
        formData.append('name', fileName);
      }

      const response = await fetch('https://api.imgbb.com/1/upload', {
        method: 'POST',
        body: formData,
        // Не устанавливаем Content-Type - браузер/React Native установит автоматически с boundary
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ImgBB upload failed: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.data && data.data.url) {
        return {
          success: true,
          url: data.data.url,
          provider: 'imgbb',
        };
      } else {
        throw new Error('ImgBB вернул неожиданный ответ');
      }
    } catch (error: any) {
      logger.error('ImgBB upload error:', error);
      // Fallback на Base64
      return await this.uploadAsBase64(imageUri);
    }
  }

  /**
   * Base64 в Firestore - бесплатно, но ограничение размера документа 1MB
   * Подходит только для маленьких изображений (аватарок)
   */
  private async uploadAsBase64(imageUri: string): Promise<ImageUploadResult> {
    try {
      const base64 = await this.uriToBase64(imageUri);
      
      // Проверяем размер (Firestore ограничение ~1MB на документ)
      // Base64 увеличивает размер на ~33%, поэтому ограничиваем до ~750KB оригинального файла
      const base64Size = (base64.length * 3) / 4;
      if (base64Size > 750 * 1024) {
        return {
          success: false,
          error: 'Изображение слишком большое для хранения в базе данных. Максимальный размер: ~750KB',
        };
      }

      // Возвращаем data URL для прямого использования
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      
      return {
        success: true,
        url: dataUrl,
        provider: 'base64',
      };
    } catch (error: any) {
      logger.error('Base64 conversion error:', error);
      return {
        success: false,
        error: error.message || 'Не удалось обработать изображение',
      };
    }
  }

  /**
   * Конвертирует URI изображения в base64 (для React Native)
   */
  private async uriToBase64(uri: string): Promise<string> {
    try {
      // В React Native используем fetch для получения blob
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      
      // Конвертируем blob в base64 через FileReader
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          try {
            const base64String = reader.result as string;
            // Убираем префикс data:image/...;base64,
            const base64 = base64String.includes(',') 
              ? base64String.split(',')[1] 
              : base64String;
            resolve(base64);
          } catch (error) {
            reject(new Error(`Failed to process base64: ${error}`));
          }
        };
        reader.onerror = () => {
          reject(new Error('FileReader failed to read blob'));
        };
        reader.readAsDataURL(blob);
      });
    } catch (error: any) {
      logger.error('Error converting URI to base64:', error);
      throw new Error(`Failed to convert URI to base64: ${error?.message || error}`);
    }
  }

  /**
   * Устанавливает провайдера для хранения изображений
   */
  setProvider(provider: ImageStorageProvider): void {
    this.provider = provider;
  }

  /**
   * Получает текущего провайдера
   */
  getProvider(): ImageStorageProvider {
    return this.provider;
  }
}

export const imageStorageService = ImageStorageService.getInstance();
