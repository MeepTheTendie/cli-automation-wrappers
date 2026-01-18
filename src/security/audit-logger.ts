import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { securityManager } from './security-manager';

export interface AuditEvent {
  timestamp: Date;
  event: string;
  userId?: string;
  service?: string;
  metadata?: Record<string, any>;
  severity: 'info' | 'warn' | 'error' | 'critical';
}

export class AuditLogger {
  private logger: winston.Logger;
  private static instance: AuditLogger;
  private logFilePath: string;

  constructor() {
    this.initializeLogger();
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  private initializeLogger(): void {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.env.HOME || '~', '.secure-cli-automation', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { mode: 0o700 }); // Only owner can access
    }

    this.logFilePath = path.join(logsDir, 'audit.log');

    // Configure winston logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        this.sanitizeFormat()
      ),
      transports: [
        new winston.transports.File({
          filename: this.logFilePath,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true
        })
      ]
    });

    // Add console transport for development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  // Custom format to sanitize sensitive data
  private sanitizeFormat(): winston.Logform.Format {
    return winston.format(info => {
      const sanitizedInfo = { ...info };

      // Sanitize potential sensitive fields
      if (sanitizedInfo.metadata) {
        sanitizedInfo.metadata = this.sanitizeMetadata(sanitizedInfo.metadata);
      }

      // Sanitize message
      if (sanitizedInfo.message) {
        sanitizedInfo.message = this.sanitizeString(sanitizedInfo.message);
      }

      return sanitizedInfo;
    })();
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized = { ...metadata };

    // Fields to redact
    const sensitiveFields = [
      'token', 'password', 'secret', 'key', 'credential',
      'authorization', 'auth', 'bearer', 'api_key', 'private'
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        if (typeof sanitized[key] === 'string' && sanitized[key].length > 8) {
          sanitized[key] = sanitized[key].substring(0, 4) + 
                          '*'.repeat(sanitized[key].length - 8) + 
                          sanitized[key].substring(sanitized[key].length - 4);
        } else {
          sanitized[key] = '[REDACTED]';
        }
      }
    }

    return sanitized;
  }

  private sanitizeString(str: string): string {
    return str
      .replace(/token[=:]\s*[a-zA-Z0-9_\-\.]+/gi, 'token=[REDACTED]')
      .replace(/key[=:]\s*[a-zA-Z0-9_\-\.]+/gi, 'key=[REDACTED]')
      .replace(/secret[=:]\s*[a-zA-Z0-9_\-\.]+/gi, 'secret=[REDACTED]')
      .replace(/password[=:]\s*[^\s]+/gi, 'password=[REDACTED]');
  }

  // Log audit event
  async logEvent(event: AuditEvent): Promise<void> {
    try {
      this.logger.info(event.event, {
        timestamp: event.timestamp.toISOString(),
        event: event.event,
        userId: event.userId,
        service: event.service,
        metadata: event.metadata,
        severity: event.severity
      });

      // For critical events, also log to system log if available
      if (event.severity === 'critical') {
        this.logToSystem(event);
      }
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  // Convenience methods for common events
  async logCredentialAccess(service: string, success: boolean, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: success ? 'credential_accessed' : 'credential_access_failed',
      service,
      metadata,
      severity: success ? 'info' : 'warn'
    });
  }

  async logCredentialStored(service: string, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: 'credential_stored',
      service,
      metadata,
      severity: 'info'
    });
  }

  async logCredentialDeleted(service: string, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: 'credential_deleted',
      service,
      metadata,
      severity: 'info'
    });
  }

  async logSecurityViolation(event: string, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: `security_violation_${event}`,
      metadata,
      severity: 'critical'
    });
  }

  async logPluginAction(pluginName: string, action: string, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: `plugin_${action}`,
      metadata: { pluginName, ...metadata },
      severity: 'info'
    });
  }

  async logSystemOperation(operation: string, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: `system_${operation}`,
      metadata,
      severity: 'info'
    });
  }

  async logError(error: Error, operation: string, metadata?: Record<string, any>): Promise<void> {
    await this.logEvent({
      timestamp: new Date(),
      event: `error_${operation}`,
      metadata: {
        error: securityManager.sanitizeError(error),
        ...metadata
      },
      severity: 'error'
    });
  }

  // Log to system log (syslog on Unix, Event Log on Windows)
  private logToSystem(event: AuditEvent): Promise<void> {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        // Windows Event Log implementation would go here
        console.log(`[CRITICAL] ${event.event}:`, event.metadata);
      } else {
        // Unix syslog implementation
        const { exec } = require('child_process');
        const message = `Secure CLI Automation: ${event.event}`;
        exec(`logger -p auth.err -t secure-cli-automation "${message}"`, (err: any) => {
          if (err) {
            console.error('Failed to log to system log:', err);
          }
          resolve();
        });
      }
    });
  }

  // Query audit logs
  async queryLogs(filter: {
    startDate?: Date;
    endDate?: Date;
    event?: string;
    service?: string;
    severity?: string;
  }): Promise<AuditEvent[]> {
    return new Promise((resolve, reject) => {
      const logs: AuditEvent[] = [];
      
      // Read and parse log file
      fs.readFile(this.logFilePath, 'utf8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const lines = data.trim().split('\n');
        
        for (const line of lines) {
          try {
            const logEntry = JSON.parse(line);
            
            // Apply filters
            if (filter.startDate && new Date(logEntry.timestamp) < filter.startDate) continue;
            if (filter.endDate && new Date(logEntry.timestamp) > filter.endDate) continue;
            if (filter.event && logEntry.event !== filter.event) continue;
            if (filter.service && logEntry.service !== filter.service) continue;
            if (filter.severity && logEntry.severity !== filter.severity) continue;
            
            logs.push(logEntry as AuditEvent);
          } catch (parseError) {
            // Skip malformed log entries
            continue;
          }
        }
        
        resolve(logs);
      });
    });
  }

  // Generate security report
  async generateSecurityReport(timeRange: { start: Date; end: Date }): Promise<string> {
    const logs = await this.queryLogs({
      startDate: timeRange.start,
      endDate: timeRange.end
    });

    const report = [
      '=== Security Audit Report ===',
      `Period: ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`,
      '',
      'Summary:',
      `- Total events: ${logs.length}`,
      `- Critical events: ${logs.filter(l => l.severity === 'critical').length}`,
      `- Error events: ${logs.filter(l => l.severity === 'error').length}`,
      `- Warning events: ${logs.filter(l => l.severity === 'warn').length}`,
      '',
      'Critical Events:',
      ...logs
        .filter(l => l.severity === 'critical')
        .map(l => `- ${l.timestamp.toISOString()}: ${l.event}`),
      '',
      'Security Violations:',
      ...logs
        .filter(l => l.event.includes('security_violation'))
        .map(l => `- ${l.timestamp.toISOString()}: ${l.event.replace('security_violation_', '')}`),
      '',
      'Credential Access Events:',
      ...logs
        .filter(l => l.event.includes('credential'))
        .map(l => `- ${l.timestamp.toISOString()}: ${l.event} (${l.service || 'unknown'})`)
    ];

    return report.join('\n');
  }

  // Cleanup old logs
  async cleanupLogs(retentionDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // This is a simplified implementation
    // In production, you'd want more sophisticated log rotation
    const logDir = path.dirname(this.logFilePath);
    const files = fs.readdirSync(logDir);
    
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          await this.logEvent({
            timestamp: new Date(),
            event: 'log_cleanup',
            metadata: { file, size: stats.size },
            severity: 'info'
          });
        }
      }
    }
  }
}

export const auditLogger = AuditLogger.getInstance();