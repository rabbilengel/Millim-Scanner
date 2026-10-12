# Getting Claude's changes into your main branch

Claude works on a separate **branch** (a draft copy of the project), for example `claude/focused-shannon-jddl8k`.
Your real version is the **main** branch. To bring the changes in:

1. Go to the repository on **github.com**.
2. If you see a yellow bar saying the branch "had recent pushes", click **Compare & pull request**.
   Otherwise click the **Pull requests** tab → **New pull request**, set **base: main** and
   **compare: claude/…** (Claude's branch), then click **Create pull request**.
3. Give it a title if it's empty (anything is fine) and click **Create pull request**.
4. Wait a minute for the automatic tests. A green check (✓ "All checks have passed") means everything works.
   If you see a red ✗, tell Claude. Don't merge yet.
5. Click **Merge pull request**, then **Confirm merge**.
6. Done. You can click **Delete branch** if GitHub offers it (it's safe; Claude can make a new one).

Tip: you can ask Claude to open the pull request for you, so you only need steps 4–5.

If GitHub Pages is on, the website updates by itself a minute or two after you merge.
