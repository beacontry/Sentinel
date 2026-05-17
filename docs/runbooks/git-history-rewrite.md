# Git history rewrite — strip Co-Authored-By trailers + post-procedure

Reference for the 2026-05-17 history rewrite that removed Claude from the GitHub Contributors graph. Save this for future reference if you ever need to rewrite history again (e.g., remove an accidentally-committed secret, strip a sensitive file, change an email across history).

> **Destructive operation warning.** Rewriting history changes every commit SHA reachable from the rewritten ref. Anyone with a clone of the repo will see a divergent history. Only do this when (a) you have a durable backup, and (b) the audience is small enough to handle the disruption.

---

## What the 2026-05-17 rewrite did

- **Stripped**: every line matching `^Co-Authored-By:` from all 423 commit messages on `main`
- **Affected commits**: 389 of 423 had at least one trailer; all 423 were rewritten (filter-branch touches every commit reachable from the ref, not just matching ones)
- **Tool**: `git filter-branch --msg-filter 'sed "/^Co-Authored-By:/d"'`
- **Result**: every commit SHA changed; "Claude" disappears from the Contributors widget within ~24h
- **Backup tag**: `pre-claude-strip-2026-05-17` on origin, pointing at the pre-rewrite HEAD (`1f82558`). Old history preserved forever as long as this tag exists.

---

## What happens after a force-push (in your case, already done)

| Surface | Effect |
|---|---|
| **GitHub Contributors sidebar widget** | Re-indexes commit metadata on push. The "Claude" entry disappears within ~1-24 hours. You can speed it up by visiting **Insights → Contributors** in the repo settings (forces a re-index). |
| **Stars / settings / package registry / Actions / webhooks** | Unaffected — only commit SHAs changed, not the repo itself. |
| **Existing forks** (you have 0) | Keep the old history. They'd need to manually re-sync if they want the new one. |
| **Any external clone** (just you on `localhost` right now) | Will fetch the rewritten history cleanly on `git pull` — but if there are local commits not on origin, they'd need a `git reset --hard origin/main` or a rebase. |
| **PRs / issue comments referencing old SHAs** (you have 0) | Show as dead links. Patch case-by-case. |
| **`docs/changelog.md` SHA references** | Already re-anchored as part of the rewrite (subject-line matching via the `/tmp/translate-shas.sh` pattern). |

---

## Local cleanup — when you're confident the rewrite was good

After ~7 days without issues, free local disk space by garbage-collecting the unreachable old commits:

```bash
git gc --prune=now --aggressive
```

**Wait at least a week before doing this.** The unreachable old commits are your local "undo" path if you regret the rewrite. The pushed backup tag on origin is a separate, durable safety net regardless.

---

## Restore procedure — if you ever want the old history back

The backup tag preserves it forever:

```bash
# Inspect first
git checkout pre-claude-strip-2026-05-17
git log --oneline -10                    # confirm old SHAs present

# Restore main to that point
git push --force origin pre-claude-strip-2026-05-17:main
```

After restore: you'd want to delete the rewritten history's tag too (if you tagged the new state) to avoid confusion.

---

## Generalized procedure (for future rewrites)

If you ever need to do another history rewrite — strip a leaked secret, remove a binary, fix an email — the pattern is:

### 1. Pre-flight

```bash
# Clean tree, on the branch you want to rewrite, in sync with origin
git status --short && git fetch origin && git log --oneline origin/main..HEAD
```

### 2. Save SHA map for any docs that reference SHAs

```bash
git log --pretty=format:"%H|%s" > /tmp/sha-map-before.txt
```

### 3. Tag current HEAD as durable backup, push to remote

```bash
git tag pre-<descriptive-name>-$(date +%Y-%m-%d)
git push origin pre-<descriptive-name>-$(date +%Y-%m-%d)
```

### 4. Run the rewrite

Examples by use case:

**Strip a line pattern from commit messages:**
```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch \
  --msg-filter 'sed "/^Co-Authored-By:/d"' HEAD
```

**Remove a file from all history** (e.g., accidentally-committed secret):
```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch \
  --index-filter 'git rm --cached --ignore-unmatch path/to/leaked-file' \
  -- --all
```

**Change author email across history:**
```bash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --env-filter '
  if [ "$GIT_AUTHOR_EMAIL" = "old@example.com" ]; then
    export GIT_AUTHOR_EMAIL="new@example.com"
  fi
  if [ "$GIT_COMMITTER_EMAIL" = "old@example.com" ]; then
    export GIT_COMMITTER_EMAIL="new@example.com"
  fi
' --tag-name-filter cat -- --all
```

### 5. Verify the rewrite did what you wanted

```bash
# Should be 0 if you stripped Co-Authored-By:
git log --pretty=format:"%B" | grep -cE "^Co-Authored-By:"

# Or for file removal:
git log --all --full-history -- path/to/leaked-file
```

### 6. Patch any SHA references in tracked docs

Build the new SHA map, find each old short-SHA reference, look up its subject in the old map, find the matching subject in the new map. The script pattern from 2026-05-17 is in conversation history; replicate when needed.

### 7. Force-push with lease (safer than plain --force)

```bash
git push --force-with-lease=main:<previous-origin-sha> origin main
```

`--force-with-lease` refuses if someone else pushed in the meantime. Use plain `--force` only if you're certain you're the sole pusher.

### 8. Notify any collaborators

For anyone with the repo cloned:
```bash
# They do:
git fetch origin
git reset --hard origin/main
```

Or just re-clone.

---

## Pitfalls I hit on 2026-05-17

| Pitfall | Fix |
|---|---|
| **Unstaged working-tree changes blocked `filter-branch`** | Commit or stash before running. |
| **Filter ran for 3-5 min and produced verbose progress output** | Pipe to a file or use `2>/dev/null` if you don't need to monitor it. Use `FILTER_BRANCH_SQUELCH_WARNING=1` to silence the deprecation warning. |
| **Filter-branch matched false positives in commit body prose** | The regex `^Co-Authored-By:` correctly anchors at line start — descriptions like "the Co-Authored-By trailer" in the body are preserved. Don't broaden the regex. |
| **Mailmap doesn't fix the Contributors widget** | GitHub honors `.mailmap` for the primary author field but NOT for `Co-Authored-By` trailers. History rewrite is the only path. |

---

## When NOT to rewrite history

- After external contributors have based their work on the existing history (forces them to rebase)
- After you've shared the repo widely (blog posts, support articles linking to specific commits)
- For cosmetic fixes that don't affect correctness or security (the cost of rewriting almost always exceeds the benefit)
- When the "fix" can be done forward-only (e.g., adding `.mailmap` for new commits going forward, leaving history alone)

The 2026-05-17 rewrite was justified because: pre-launch, zero forks, zero external contributors, the cosmetic gain (clean Contributors graph) was worth the one-time disruption, and the backup tag preserved the audit trail.

---

## Related runbooks

- `docs/runbooks/rotate-secrets.md` — JWT_SECRET / CRON_SECRET rotation procedure (event-driven, never cron-scheduled)
- `docs/runbooks/live-trading.md` — going-live + rollback procedures for the trading engine
- `docs/legal/security-review-2026-05-17.md` — public-source threat model that drove today's hardening work
