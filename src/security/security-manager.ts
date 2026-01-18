import crypto from 'crypto';
import keytar from 'keytar';
import { z } from 'zod';

export interface SecureCredentials {
  vercel_token?: string;
  render_token?: string;
  supabase_token?: string;
  [key: string]: string | undefined;
}

export class SecurityManager {
  private readonly serviceName = 'secure-cli-automation';
  private encryptionKey: Buffer;
  private initialized = false;

  constructor() {
    this.encryptionKey = this.getOrCreateEncryptionKey();
  }

  private getOrCreateEncryptionKey(): Buffer {
    // Use system's hardware ID + user info as key source
    const keySource = process.env.USER + process.platform + process.arch;
    return crypto.scryptSync(keySource, 'salt', 32);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // Validate environment
    this.validateEnvironment();
    
    // Initialize audit logging
    await this.initializeAuditLog();
    
    this.initialized = true;
  }

  private validateEnvironment(): void {
    // Check for suspicious environment
    const suspiciousVars = ['DEBUG', 'NODE_ENV', 'CI'];
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (!isProduction && suspiciousVars.some(var_ => process.env[var_])) {
      console.warn('⚠️  Running in non-production environment with debug variables');
    }
  }

  private async initializeAuditLog(): Promise<void> {
    // Initialize secure audit logging
    // Implementation would go here
  }

  async storeCredential(service: string, token: string): Promise<boolean> {
    await this.ensureInitialized();
    
    try {
      // Validate input
      this.validateToken(token);
      
      // Encrypt token before storage
      const encryptedToken = this.encrypt(token);
      
      // Store in system keychain
      await keytar.setPassword(this.serviceName, service, encryptedToken);
      
      // Log audit event
      await this.logAuditEvent('credential_stored', { service });
      
      return true;
    } catch (error) {
      await this.logAuditEvent('credential_store_failed', { 
        service, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async getCredential(service: string): Promise<string | null> {
    await this.ensureInitialized();
    
    try {
      const encryptedToken = await keytar.getPassword(this.serviceName, service);
      
      if (!encryptedToken) {
        return null;
      }
      
      // Decrypt and return
      const token = this.decrypt(encryptedToken);
      
      // Log audit event
      await this.logAuditEvent('credential_accessed', { service });
      
      return token;
    } catch (error) {
      await this.logAuditEvent('credential_access_failed', { 
        service, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  async deleteCredential(service: string): Promise<boolean> {
    await this.ensureInitialized();
    
    try {
      const result = await keytar.deletePassword(this.serviceName, service);
      
      // Log audit event
      await this.logAuditEvent('credential_deleted', { service });
      
      return result;
    } catch (error) {
      await this.logAuditEvent('credential_delete_failed', { 
        service, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private validateToken(token: string): void {
    // Basic token validation
    const tokenSchema = z.string().min(10).max(500);
    
    try {
      tokenSchema.parse(token);
    } catch (error) {
      throw new Error('Invalid token format');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async logAuditEvent(event: string, metadata: Record<string, any>): Promise<void> {
    // Implementation for secure audit logging
    // Would write to encrypted log file or secure service
    console.log(`[AUDIT] ${new Date().toISOString()} - ${event}:`, metadata);
  }

  async validateCredentials(credentials: SecureCredentials): Promise<boolean> {
    const results = await Promise.allSettled(
      Object.entries(credentials).map(async ([service, token]) => {
        if (!token) return true;
        
        // Validate token format
        this.validateToken(token);
        
        // Could add service-specific validation here
        return true;
      })
    );

    return results.every(result => result.status === 'fulfilled' && result.value);
  }

  // Sanitize error messages to prevent credential leakage
  sanitizeError(error: Error): string {
    const message = error.message;
    
    // Remove potential tokens from error messages
    return message
      .replace(/token[=:]\s*[a-zA-Z0-9_\-\.]+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*[a-zA-Z0-9_\-\.]+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*[a-zA-Z0-9_\-\.]+/gi, 'secret=[REDACTED]');
  }

  // Generate secure random strings for testing/mock data
  generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

// Singleton instance
export const securityManager = new SecurityManager();