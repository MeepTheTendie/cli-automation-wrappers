# Lessons Learned

**⚠️ DEPRECATED:** See `/home/meep/MEGA_LEARNINGS.md` for the complete lessons database.

This file is kept for historical reference but is no longer updated.

---

## Current Lessons (Archived)

### Don't Remove Generated Files Without Verifying Build Requirements

**Mistake:** Removed `convex/_generated/` from git, then added `npx convex codegen` to build.

**Result:** Builds failed on Vercel because:
1. `npx convex codegen` requires Convex credentials (`CONVEX_DEPLOY_KEY`)
2. Vercel wasn't configured with these credentials
3. Generated files were needed at build time

**Fix:** Keep deterministic generated files in git when deployment pipeline isn't fully configured.

### Before Removing Files From Git

1. Check if `npx <tool> codegen` needs credentials
2. Verify CI/CD has required env vars
3. Test locally: `npx <tool> codegen`
4. If it fails without credentials, keep files in git

### Pre-commit Hook Tuning

Too aggressive secret scanning causes false positives:
- Package names flagged as secrets
- Code patterns like `token: string` flagged

**Fix:** Use warning mode for pattern matches, fail only on high-confidence issues.

---

## For Complete Lessons Database

See **`/home/meep/MEGA_LEARNINGS.md`** which includes:
- Framework selection best practices
- Windows development patterns
- Repo hygiene checklist
- Project-specific lessons
- Quick reference commands
- Code review checklist
