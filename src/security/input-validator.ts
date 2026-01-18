import { z } from 'zod';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitized?: any;
}

export class InputValidator {
  private static instance: InputValidator;
  
  // Common validation schemas
  private readonly schemas = {
    projectName: z.string()
      .min(1, 'Project name is required')
      .max(100, 'Project name too long')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Project name can only contain letters, numbers, hyphens, and underscores'),
    
    url: z.string()
      .url('Invalid URL format')
      .max(2048, 'URL too long'),
    
    email: z.string()
      .email('Invalid email format')
      .max(254, 'Email too long'),
    
    filePath: z.string()
      .min(1, 'File path is required')
      .max(4096, 'File path too long'),
    
    token: z.string()
      .min(10, 'Token too short')
      .max(500, 'Token too long')
      .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Token contains invalid characters'),
    
    command: z.string()
      .min(1, 'Command is required')
      .max(1000, 'Command too long')
      .refine(cmd => !this.containsDangerousPatterns(cmd), {
        message: 'Command contains potentially dangerous patterns'
      }),
    
    environmentName: z.string()
      .min(1, 'Environment name is required')
      .max(50, 'Environment name too long')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Environment name can only contain letters, numbers, hyphens, and underscores')
  };

  static getInstance(): InputValidator {
    if (!InputValidator.instance) {
      InputValidator.instance = new InputValidator();
    }
    return InputValidator.instance;
  }

  // Validate and sanitize project name
  validateProjectName(name: string): ValidationResult {
    const result = this.schemas.projectName.safeParse(name);
    
    if (result.success) {
      return {
        isValid: true,
        errors: [],
        sanitized: this.sanitizeProjectName(result.data)
      };
    }
    
    return {
      isValid: false,
      errors: result.error.errors.map(e => e.message)
    };
  }

  // Validate URL
  validateUrl(url: string): ValidationResult {
    const result = this.schemas.url.safeParse(url);
    
    if (result.success) {
      return {
        isValid: true,
        errors: [],
        sanitized: this.sanitizeUrl(result.data)
      };
    }
    
    return {
      isValid: false,
      errors: result.error.errors.map(e => e.message)
    };
  }

  // Validate token format
  validateToken(token: string): ValidationResult {
    const result = this.schemas.token.safeParse(token);
    
    if (result.success) {
      return {
        isValid: true,
        errors: [],
        sanitized: this.sanitizeToken(result.data)
      };
    }
    
    return {
      isValid: false,
      errors: result.error.errors.map(e => e.message)
    };
  }

  // Validate command for security
  validateCommand(command: string): ValidationResult {
    const result = this.schemas.command.safeParse(command);
    
    if (result.success) {
      return {
        isValid: true,
        errors: [],
        sanitized: this.sanitizeCommand(result.data)
      };
    }
    
    return {
      isValid: false,
      errors: result.error.errors.map(e => e.message)
    };
  }

  // Validate configuration object
  validateConfig(config: any): ValidationResult {
    const configSchema = z.object({
      workingDir: this.schemas.filePath.optional(),
      logLevel: z.enum(['debug', 'info', 'warn', 'error']).optional(),
      autoFix: z.boolean().optional(),
      testBeforeDeploy: z.boolean().optional(),
      skipProjects: z.array(this.schemas.projectName).optional(),
      environment: this.schemas.environmentName.optional()
    });

    const result = configSchema.safeParse(config);
    
    if (result.success) {
      return {
        isValid: true,
        errors: [],
        sanitized: result.data
      };
    }
    
    return {
      isValid: false,
      errors: result.error.errors.map(e => e.message)
    };
  }

  // Validate multiple inputs
  validateMultiple(inputs: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(inputs)) {
      let result: ValidationResult;

      switch (key) {
        case 'projectName':
          result = this.validateProjectName(value);
          break;
        case 'url':
          result = this.validateUrl(value);
          break;
        case 'token':
          result = this.validateToken(value);
          break;
        case 'command':
          result = this.validateCommand(value);
          break;
        case 'config':
          result = this.validateConfig(value);
          break;
        default:
          // For unknown fields, just sanitize
          result = {
            isValid: true,
            errors: [],
            sanitized: this.sanitizeString(value)
          };
      }

      if (!result.isValid) {
        errors.push(`${key}: ${result.errors.join(', ')}`);
      } else {
        sanitized[key] = result.sanitized;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized
    };
  }

  // Sanitization methods
  private sanitizeProjectName(name: string): string {
    return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  private sanitizeUrl(url: string): string {
    const urlObj = new URL(url);
    // Remove potential sensitive info from URL
    urlObj.password = '';
    return urlObj.toString();
  }

  private sanitizeToken(token: string): string {
    // Return masked version for logging
    if (token.length <= 8) {
      return '*'.repeat(token.length);
    }
    return token.substring(0, 4) + '*'.repeat(token.length - 8) + token.substring(token.length - 4);
  }

  private sanitizeCommand(command: string): string {
    // Remove potential sensitive flags and arguments
    return command
      .replace(/(--password[=\s]+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(-p\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(--token[=\s]+)[^\s]+/gi, '$1[REDACTED]');
  }

  private sanitizeString(input: any): string {
    if (typeof input !== 'string') {
      return String(input);
    }
    
    // Remove potential HTML/script injection
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  // Check for dangerous command patterns
  private containsDangerousPatterns(command: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,           // rm -rf /
      />\s*\/dev\/sd[a-z]/,      // Direct disk write
      /dd\s+if=/,                // dd commands
      /mkfs\./,                  // Filesystem formatting
      /fdisk/,                   // Disk partitioning
      /format\s+[a-z]:/,         // Windows format
      /del\s+\/[sq]/,            // Windows recursive delete
      /sudo\s+su/,               // Privilege escalation
      /curl.*\|\s*sh/,           // Pipe curl to shell
      /wget.*\|\s*sh/,           // Pipe wget to shell
      /eval\s*\$/,               // Dynamic execution
      />\s*\/etc\//,             // Writing to system files
      /chmod\s+777/,             // Dangerous permissions
      /chown\s+root/,            // Ownership changes
    ];

    const lowerCommand = command.toLowerCase();
    return dangerousPatterns.some(pattern => pattern.test(lowerCommand));
  }

  // Validate file path for security
  validateFilePath(path: string, baseDir?: string): ValidationResult {
    const result = this.schemas.filePath.safeParse(path);
    
    if (!result.success) {
      return {
        isValid: false,
        errors: result.error.errors.map(e => e.message)
      };
    }

    // Check for path traversal
    const normalizedPath = this.normalizePath(path);
    
    if (baseDir) {
      const normalizedBase = this.normalizePath(baseDir);
      if (!normalizedPath.startsWith(normalizedBase)) {
        return {
          isValid: false,
          errors: ['Path traversal detected']
        };
      }
    }

    // Check for suspicious paths
    const suspiciousPaths = [
      '/etc/passwd',
      '/etc/shadow',
      '/etc/hosts',
      '~/.ssh',
      'id_rsa',
      'known_hosts'
    ];

    if (suspiciousPaths.some(suspicious => normalizedPath.includes(suspicious))) {
      return {
        isValid: false,
        errors: ['Access to sensitive system files not allowed']
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitized: normalizedPath
    };
  }

  private normalizePath(path: string): string {
    // Convert to absolute path and normalize
    const resolved = require('path').resolve(path);
    return require('path').normalize(resolved);
  }

  // Generate validation report
  generateReport(results: Record<string, ValidationResult>): string {
    const report = ['=== Validation Report ==='];
    
    for (const [field, result] of Object.entries(results)) {
      if (result.isValid) {
        report.push(`✅ ${field}: Valid`);
      } else {
        report.push(`❌ ${field}: ${result.errors.join(', ')}`);
      }
    }
    
    return report.join('\n');
  }
}

export const inputValidator = InputValidator.getInstance();