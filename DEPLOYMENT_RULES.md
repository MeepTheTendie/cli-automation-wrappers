# Global Pre-Deployment Testing Rule

## Rule: No Deployment Without Clean Local Testing

### Required Workflow
Before ANY deployment, commit, or push to production:

1. **Always run local testing first**
2. **Fix ALL issues before deployment**
3. **Only deploy when all tests pass**

### Standard Testing Sequence
For any Node.js/React project:

```bash
# Step 1: Format and lint
npm run check || npm run lint && npm run format

# Step 2: Build and typecheck  
npm run build

# Step 3: Run tests
npm run test

# Step 4: Only deploy if ALL above pass
```

### Project-Specific Commands

#### iron-tracker (/home/meep/iron-tracker)
- `npm run check` (prettier + eslint fix)
- `npm run build` (vite build + tsc)  
- `npm run test` (vitest)

#### toku-tracker (/home/meep/toku-tracker)
- `npm run check` (prettier + eslint fix)
- `npm run build` (tsc -b + vite build)
- `npm run test` (vitest)

### For New Projects
1. Check `package.json` for available scripts
2. Run equivalent: lint/format → build → test
3. Adapt command names as needed

### Failure Protocol
If any step fails:
1. **STOP** - Do not deploy
2. Fix all errors/warnings
3. Re-run the full sequence
4. Only proceed when clean

### Exceptions
- Emergency hotfixes: Still run minimal tests
- Documentation-only changes: Can skip build/tests
- Always ask user if unsure

### Integration Setup (Future)
- Vercel API access for build/deployment monitoring
- Render API access for deployment logs
- Supabase API access for error tracking
- Automatic pre-deployment validation

### Enforcement
This is now the DEFAULT behavior for opencode. No exceptions without explicit user approval.

**Last Updated**: 2026-01-17
**Projects**: iron-tracker, toku-tracker (clean baseline established)