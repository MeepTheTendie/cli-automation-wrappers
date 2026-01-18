import { auditLogger } from '../security/audit-logger';
import { securityManager } from '../security/security-manager';

export interface ErrorContext {
  operation: string;
  plugin?: string;
  args?: any[];
  metadata?: Record<string, any>;
}

export class AutomationError extends Error {
  public readonly code: string;
  public readonly severity: 'low' | 'medium' | 'high' | 'critical';
  public readonly retryable: boolean;
  public readonly context: ErrorContext;

  constructor(
    message: string,
    code: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    retryable: boolean = false,
    context: ErrorContext = { operation: 'unknown' }
  ) {
    super(message);
    this.name = 'AutomationError';
    this.code = code;
    this.severity = severity;
    this.retryable = retryable;
    this.context = context;
  }
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: Error) => boolean;
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: Map<string, Date> = new Map();

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  // Handle and log errors
  async handleError(error: Error, context: ErrorContext): Promise<void> {
    const timestamp = new Date();
    const errorKey = `${context.operation}:${error.message}`;

    // Track error frequency
    const count = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, count + 1);
    this.lastErrors.set(errorKey, timestamp);

    // Log error
    await auditLogger.logError(error, context.operation, {
      plugin: context.plugin,
      argCount: context.args?.length || 0,
      metadata: context.metadata
    });

    // Check for error patterns
    await this.analyzeErrorPattern(errorKey, count, context);

    // Take appropriate action based on severity
    if (error instanceof AutomationError) {
      await this.handleAutomationError(error);
    } else {
      await this.handleGenericError(error, context);
    }
  }

  // Retry operation with exponential backoff
  async retry<T>(
    operation: () => Promise<T>,
    config: RetryConfig,
    context: ErrorContext
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry this error
        if (config.retryCondition && !config.retryCondition(lastError)) {
          break;
        }

        // Check if error is retryable
        if (lastError instanceof AutomationError && !lastError.retryable) {
          break;
        }

        // If this is the last attempt, don't wait
        if (attempt === config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );

        // Log retry attempt
        await auditLogger.logSystemOperation('retry_attempt', {
          operation: context.operation,
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: lastError.message
        });

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    // All retries failed, handle the final error
    await this.handleError(lastError!, context);
    throw lastError!;
  }

  // Handle automation-specific errors
  private async handleAutomationError(error: AutomationError): Promise<void> {
    switch (error.severity) {
      case 'critical':
        await this.handleCriticalError(error);
        break;
      case 'high':
        await this.handleHighSeverityError(error);
        break;
      case 'medium':
        await this.handleMediumSeverityError(error);
        break;
      case 'low':
        await this.handleLowSeverityError(error);
        break;
    }
  }

  private async handleCriticalError(error: AutomationError): Promise<void> {
    // Log to system log
    await auditLogger.logSecurityViolation('critical_error', {
      code: error.code,
      message: error.message
    });

    // Could trigger alerts, notifications, etc.
    console.error('🚨 CRITICAL ERROR:', error.message);
    
    // Attempt recovery if possible
    await this.attemptRecovery(error);
  }

  private async handleHighSeverityError(error: AutomationError): Promise<void> {
    console.error('⚠️  HIGH SEVERITY ERROR:', error.message);
    
    // Log with elevated priority
    await auditLogger.logError(error, error.context.operation, {
      severity: 'high',
      ...error.context.metadata
    });
  }

  private async handleMediumSeverityError(error: AutomationError): Promise<void> {
    console.warn('⚡ MEDIUM SEVERITY ERROR:', error.message);
    
    // Standard error logging
    await auditLogger.logError(error, error.context.operation, error.context.metadata);
  }

  private async handleLowSeverityError(error: AutomationError): Promise<void> {
    console.info('ℹ️  LOW SEVERITY ERROR:', error.message);
    
    // Debug level logging
    await auditLogger.logSystemOperation('low_severity_error', {
      code: error.code,
      message: error.message
    });
  }

  private async handleGenericError(error: Error, context: ErrorContext): Promise<void> {
    console.error('❌ ERROR:', error.message);
    
    await auditLogger.logError(error, context.operation, {
      plugin: context.plugin,
      ...context.metadata
    });
  }

  // Analyze error patterns for potential issues
  private async analyzeErrorPattern(errorKey: string, count: number, context: ErrorContext): Promise<void> {
    // Check for repeated errors
    if (count > 10) {
      await auditLogger.logSecurityViolation('repeated_errors', {
        errorKey,
        count,
        operation: context.operation
      });
    }

    // Check for rapid succession errors
    const lastError = this.lastErrors.get(errorKey);
    if (lastError) {
      const timeSinceLastError = Date.now() - lastError.getTime();
      if (timeSinceLastError < 1000 && count > 5) { // 5 errors in < 1 second
        await auditLogger.logSecurityViolation('rapid_errors', {
          errorKey,
          count,
          operation: context.operation,
          timeWindow: timeSinceLastError
        });
      }
    }
  }

  // Attempt automatic recovery
  private async attemptRecovery(error: AutomationError): Promise<void> {
    try {
      // Recovery strategies based on error type
      switch (error.code) {
        case 'CREDENTIALS_INVALID':
          await this.recoverCredentials();
          break;
        case 'NETWORK_UNREACHABLE':
          await this.recoverNetwork();
          break;
        case 'PERMISSION_DENIED':
          await this.recoverPermissions();
          break;
        case 'DISK_SPACE_LOW':
          await this.recoverDiskSpace();
          break;
        default:
          // Generic recovery
          await this.genericRecovery();
      }
    } catch (recoveryError) {
      await auditLogger.logError(recoveryError as Error, 'recovery_failed', {
        originalError: error.code
      });
    }
  }

  private async recoverCredentials(): Promise<void> {
    // Clear potentially invalid credentials
    await securityManager.deleteCredential('invalidated');
    
    // Re-initialize security manager
    await securityManager.initialize();
  }

  private async recoverNetwork(): Promise<void> {
    // Wait for network to potentially recover
    await this.sleep(5000);
  }

  private async recoverPermissions(): Promise<void> {
    // Could attempt to elevate permissions or fix ownership
    console.log('Attempting to resolve permission issues...');
    return Promise.resolve();
  }

  private async recoverDiskSpace(): Promise<void> {
    // Could attempt to clear temporary files
    console.log('Attempting to free disk space...');
    return Promise.resolve();
  }

  private async genericRecovery(): Promise<void> {
    // Generic recovery: wait and retry
    await this.sleep(3000);
  }

  // Create error with context
  createError(
    message: string,
    code: string,
    context: ErrorContext,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    retryable: boolean = false
  ): AutomationError {
    return new AutomationError(message, code, severity, retryable, context);
  }

  // Get error statistics
  getErrorStats(): {
    totalErrors: number;
    errorsByOperation: Record<string, number>;
    recentErrors: Array<{ key: string; count: number; lastSeen: Date }>;
  } {
    const errorsByOperation: Record<string, number> = {};
    const recentErrors: Array<{ key: string; count: number; lastSeen: Date }> = [];

    for (const [key, count] of this.errorCounts.entries()) {
      const keyParts = key.split(':');
      const operation = keyParts[0] || 'unknown';
      errorsByOperation[operation] = (errorsByOperation[operation] || 0) + count;
      
      const lastSeen = this.lastErrors.get(key)!;
      if (Date.now() - lastSeen.getTime() < 24 * 60 * 60 * 1000) { // Last 24 hours
        recentErrors.push({ key, count, lastSeen });
      }
    }

    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0),
      errorsByOperation,
      recentErrors: recentErrors.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
    };
  }

  // Clear error history
  clearErrorHistory(): void {
    this.errorCounts.clear();
    this.lastErrors.clear();
  }

  // Utility: sleep for specified milliseconds
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Validate error handling configuration
  static validateRetryConfig(config: Partial<RetryConfig>): RetryConfig {
    return {
      maxAttempts: config.maxAttempts || 3,
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffMultiplier: config.backoffMultiplier || 2,
      retryCondition: config.retryCondition || ((error: Error) => {
        // Default retry condition: retry network and timeout errors
        const retryablePatterns = [
          /timeout/i,
          /network/i,
          /connection/i,
          /temporary/i,
          /rate limit/i
        ];
        
        return retryablePatterns.some(pattern => pattern.test(error.message));
      })
    };
  }
}

export const errorHandler = ErrorHandler.getInstance();