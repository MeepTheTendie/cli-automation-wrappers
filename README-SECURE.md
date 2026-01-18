# Security-First CLI Automation Framework

## 🛡️ Security Overview

This framework is built with security as the primary concern. All credentials are encrypted and stored in the system keychain, with comprehensive audit logging and input validation.

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- Git

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd cli-automation-wrappers
```

2. **Run setup script**
```bash
npm run setup
```

3. **Initialize the framework**
```bash
npm run dev init
```

### First Run

1. **Interactive Setup**
```bash
sca setup
```

2. **Check Status**
```bash
sca status
```

## 📋 Commands Reference

### Core Commands

#### `sca init`
Initialize SCA with interactive setup
- `--force`: Force reinitialization

#### `sca setup`
Run interactive setup wizard
- `--skip-credentials`: Skip credential setup

#### `sca status`
Show system status and configuration

### Plugin Management

#### `sca plugin list`
List all available plugins
- `--enabled`: Show only enabled plugins
- `--loaded`: Show only loaded plugins

#### `sca plugin enable <name>`
Enable a plugin

#### `sca plugin disable <name>`
Disable a plugin

#### `sca plugin load <name>`
Load a plugin

#### `sca plugin unload <name>`
Unload a plugin

#### `sca plugin execute <name> [args...]`
Execute a plugin with arguments

### Configuration Management

#### `sca config get [key]`
Get configuration value
- Without `key`: Show all configuration
- With `key`: Show specific value

#### `sca config set <key> <value>`
Set configuration value

#### `sca config reset`
Reset configuration to defaults

#### `sca config export [file]`
Export configuration (secrets redacted)

### Security Management

#### `sca security store <service> <token>`
Store credential securely

#### `sca security get <service>`
Retrieve credential

#### `sca security delete <service>`
Delete credential

#### `sca security audit-report [days]`
Generate security audit report (default 7 days)

## 🔒 Security Features

### Credential Management
- **System Keychain Storage**: Credentials stored encrypted in OS keychain
- **No Plaintext Storage**: Never stores secrets in configuration files
- **Access Logging**: All credential accesses logged and audited
- **Secure Validation**: Input validation prevents injection attacks

### Audit Logging
- **Comprehensive Logging**: All operations logged with timestamps
- **Security Events**: Security violations logged with elevated priority
- **Log Rotation**: Automatic log cleanup with configurable retention
- **Sanitized Logs**: Sensitive data automatically redacted

### Input Validation
- **Type Safety**: All inputs validated against schemas
- **Path Traversal Prevention**: File path validation against directory traversal
- **Command Injection Prevention**: Command validation against dangerous patterns
- **XSS Protection**: Input sanitization for web interfaces

### Error Handling
- **Graceful Degradation**: Errors don't expose sensitive information
- **Automatic Recovery**: Self-healing capabilities for common issues
- **Retry Logic**: Exponential backoff for transient failures
- **Error Sanitization**: Error messages sanitized to prevent data leakage

## 🔌 Plugin System

### Architecture
- **Modular Design**: Core framework with pluggable extensions
- **Dependency Management**: Automatic dependency resolution
- **Sandboxing**: Plugins run in controlled environments
- **Version Compatibility**: Semantic versioning and compatibility checks

### Creating Plugins

```typescript
import { Plugin, PluginContext } from '../core/plugin-manager';

export class MyPlugin extends Plugin {
  async initialize(context: PluginContext): Promise<void> {
    // Plugin initialization
  }

  async execute(args: any[]): Promise<any> {
    // Plugin logic
    return { success: true };
  }

  async cleanup(): Promise<void> {
    // Cleanup resources
  }
}
```

### Plugin Configuration

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "dependencies": ["base-plugin"],
  "permissions": ["network", "filesystem"],
  "enabled": true
}
```

## 🛠️ Development

### Build
```bash
npm run build
```

### Test
```bash
npm test
npm run test:coverage
```

### Lint
```bash
npm run lint
```

### Security Audit
```bash
npm run security:audit
npm run security:scan
```

## 📁 Project Structure

```
cli-automation-wrappers/
├── src/
│   ├── core/                 # Core framework
│   │   ├── plugin-manager.ts
│   │   ├── config-manager.ts
│   │   └── error-handler.ts
│   ├── security/             # Security modules
│   │   ├── security-manager.ts
│ │   ├── input-validator.ts
│   │   └── audit-logger.ts
│   ├── cli/                  # CLI interface
│   │   ├── index.ts
│   │   └── setup-wizard.ts
│   └── utils/                # Utilities
├── tests/                    # Test suite
├── scripts/                  # Build scripts
├── config/                   # Default configurations
└── examples/                 # Usage examples
```

## 🔧 Configuration

### Configuration Schema

```json
{
  "workingDir": "string",           // Working directory
  "logLevel": "debug|info|warn|error", // Log level
  "autoFix": "boolean",             // Auto-fix issues
  "testBeforeDeploy": "boolean",    // Test before deployment
  "skipProjects": ["string"],        // Projects to skip
  "environment": "string",          // Environment name
  "plugins": [                      // Plugin configurations
    {
      "name": "string",
      "enabled": "boolean",
      "config": {}
    }
  ],
  "security": {                     // Security settings
    "requireAuthentication": "boolean",
    "auditEnabled": "boolean",
    "logRetentionDays": "number",
    "allowedOrigins": ["string"],
    "maxRequestSize": "number"
  }
}
```

### Environment Variables

- `NODE_ENV`: Environment (development|production|test)
- `SCA_CONFIG_DIR`: Custom configuration directory
- `SCA_LOG_LEVEL`: Override log level
- `SCA_WORKING_DIR`: Override working directory

## 🚨 Security Best Practices

### For Users
1. **Never commit credentials**: Use secure credential storage
2. **Regular security audits**: Review audit reports periodically
3. **Keep updated**: Regularly update to latest version
4. **Principle of least privilege**: Grant minimum necessary permissions

### For Developers
1. **Input validation**: Always validate user inputs
2. **Error handling**: Never expose sensitive information in errors
3. **Audit logging**: Log all security-relevant operations
4. **Dependency management**: Regularly audit dependencies

## 🐛 Troubleshooting

### Common Issues

#### Credential Access Issues
```bash
# Check keychain access
sca security get test-service

# Reset security manager
sca config set security.requireAuthentication false
```

#### Plugin Loading Issues
```bash
# Check plugin status
sca plugin list

# Enable plugin
sca plugin enable plugin-name

# Load plugin
sca plugin load plugin-name
```

#### Configuration Issues
```bash
# Reset configuration
sca config reset

# Export configuration
sca config export

# Check working directory
sca config get workingDir
```

### Debug Mode
```bash
# Enable debug logging
sca config set logLevel debug

# Run with debug output
DEBUG=sca:* sca status
```

## 📊 Monitoring

### Health Checks
```bash
# System status
sca status

# Plugin metrics
sca plugin list --loaded

# Security audit
sca security audit-report
```

### Performance Metrics
- Plugin load times
- Credential access patterns
- Error rates and types
- Resource usage

## 🤝 Contributing

### Development Workflow
1. Fork the repository
2. Create feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit pull request

### Code Standards
- TypeScript for all new code
- 80%+ test coverage required
- Security review for all changes
- Documentation for public APIs

## 📄 License

MIT License - see LICENSE file for details.

## 🔗 Additional Resources

- [Security Guide](docs/security.md)
- [Plugin Development Guide](docs/plugin-development.md)
- [API Reference](docs/api-reference.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [Community Forums](https://github.com/your-org/secure-cli-automation/discussions)

---

## 🔄 MIGRATION FROM OLD VERSION

If you're migrating from the previous version:

1. **Backup your current configuration**
2. **Run the new setup script**: `npm run setup`
3. **Import old credentials** (they will be automatically migrated)
4. **Update any custom scripts** to use the new CLI commands

The new version is fully backward compatible but provides enhanced security and features.