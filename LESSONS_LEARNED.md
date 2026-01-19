# Toku Tracker Project - Lessons Learned

## Project Summary

Migrated Toku Tracker from Vite + React + TanStack Router to Next.js 14 to fix Convex React hooks bundling issues. Despite getting the app deployed, the project was ultimately deleted due to accumulated technical debt.

## What Went Wrong

### 1. Convex HTTP API Misunderstanding
- **Spent**: ~1 hour debugging frontend
- **Root cause**: Used dot notation (`shows.getAllShows`) instead of colon (`shows:getAllShows`)
- **Fix**: `path: "module:functionName"`, `format: "json"`, access `data.value`

### 2. TypeScript Compiling Convex Server Files
- **Error**: `Cannot find module 'convex/server'`
- **Root cause**: Next.js trying to compile Convex functions with server-only imports
- **Fix**: Added `"convex/**/*"` to `exclude` in `tsconfig.json`

### 3. Vercel Framework Preset
- **Error**: 404 NOT_FOUND on deployment
- **Root cause**: Vercel project configured for Vite (from original repo)
- **Fix**: Added `"framework": "nextjs"` to `vercel.json`

### 4. Lucide React Version Conflict
- **Error**: Peer dependency conflict with React 18
- **Root cause**: `lucide-react@0.344.0` has strict peer dep requirements
- **Fix**: Upgraded to `lucide-react@0.460.0`

### 5. React 19 Incompatibility
- **Error**: `createContext is not a function`
- **Root cause**: Next.js 15 defaults to React 19
- **Fix**: Pinned to Next.js 14.2.0 + React 18.2.0

## Key Technical Takeaways

### Convex HTTP API Format
```
POST /api/query
{
  "path": "module:functionName",  // COLON, not dot!
  "args": {},
  "format": "json"
}

Response:
{
  "success": true,
  "value": ...  // NOT data.result
}
```

### Version Compatibility Matrix
| Package | Version | Why |
|---------|---------|-----|
| Next.js | 14.2.0 | React 19 breaks things |
| React | 18.2.0 | Stable, well-supported |
| lucide-react | 0.460.0 | React 18 peer dep issues with 0.344.0 |
| Convex | 1.17.0+ | HTTP API works reliably |

### Debugging Workflow
1. **Local build works?** → Problem is deployment config
2. **API failing?** → Test with curl first
   ```bash
   curl -X POST "https://convex-url/api/query" \
     -H "Content-Type: application/json" \
     -d '{"path":"module:function","args":{},"format":"json"}'
   ```
3. **Vercel 404?** → Check `vercel.json` framework preset
4. **TypeScript errors?** → Check `tsconfig.json` exclude array

### Files to Check First When Migrating
- `vercel.json` - Framework preset often wrong
- `tsconfig.json` - Exclude convex folder
- `package.json` - Lock versions, check peer deps
- `convex.json` - Deployment URL configured

## What I'd Do Differently

1. **Test Convex API with curl immediately** before writing any frontend code
2. **Check `vercel.json` framework preset** before first deployment
3. **Use `npx vercel --prod --yes`** to deploy quickly, don't wait for Git
4. **Pin ALL dependencies** in `package.json`, don't trust caret ranges
5. **Validate the deployment URL works** before celebrating

## Commands to Remember

```bash
# Deploy with Vercel CLI
npx vercel --token=TOKEN --prod --yes

# List deployments
npx vercel --token=TOKEN list --yes

# Test Convex API
curl -X POST "https://convex-url/api/query" \
  -H "Content-Type: application/json" \
  -d '{"path":"shows:getAllShows","args":{},"format":"json"}'

# Delete Vercel project (manual)
# Go to: https://vercel.com/project/settings

# Delete GitHub repo
gh repo delete owner/repo --yes
```

## Pattern for Future Projects

1. **Initialize project** with correct versions from day one
2. **Test backend API** with curl before frontend integration
3. **Deploy early and often** - catch issues in first hour, not day 5
4. **Document version requirements** in README
5. **Delete and restart** if accumulation of fixes > 3 hours

## Emotional/Learning Notes

- User frustration compounds when basic functionality doesn't work
- "Works locally" means nothing if deployment fails
- The user doesn't care about technical details - they want working software
- Sometimes deleting and starting fresh is the right call
- Don't take user frustration personally - it's about the code, not me
- "Works on my machine" is the most useless debugging statement

---

**Date**: January 19, 2026
**Project Status**: Deleted
**Reason**: Accumulated technical debt from migration issues
