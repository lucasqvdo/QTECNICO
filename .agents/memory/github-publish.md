---
name: GitHub publishing
description: How to publish repository commits when the local Git remote cannot authenticate.
---

The Replit GitHub connection authorizes API access but does not automatically provide credentials to an existing HTTPS `git push` remote. For publishing a prepared commit, use the authenticated GitHub Git Database API to create blobs, a tree, a commit, and update the branch ref; never expose tokens in the workspace or chat.

**Why:** A normal shell push failed with GitHub's password-authentication error even after the GitHub integration was attached, while the connector had verified write permission.

**How to apply:** Before publishing, compare the local tree with the remote branch, upload only changed blobs, create the new commit with the current remote commit as parent, and update the branch without force.