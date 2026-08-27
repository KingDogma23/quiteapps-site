Subject: Git Version Control — Deployment Script saves but never executes

Package: DVA Main
Domain: quiteapps.co.uk
Home path: /home/sites/41a/0/0c83a40a54/
Feature: Files → Git Version Control

WHAT I EXPECTED
The Deployment Script to run after a successful pull, so that the built
site is copied from the repository into the served directory.

WHAT HAPPENS
The pull works. The Deployment Script never runs. No error is shown.

Repository:   /home/sites/41a/0/0c83a40a54/quiteapps-web
Remote:       https://github.com/KingDogma23/quiteapps-site.git
Branch:       master

Deployment Script (saved; UI confirms "Successfully updated repository."):

  cp -R /home/sites/41a/0/0c83a40a54/quiteapps-web/dist/. /home/sites/41a/0/0c83a40a54/public_html/

Clicking Deploy returns "Deployment completed successfully" and shows only
git output:

  Switched to a new branch 'master'
  branch 'master' set up to track 'origin/master'.
  From https://github.com/KingDogma23/quiteapps-site
   * branch master -> FETCH_HEAD
  Already up to date.

The destination directory is never modified. Files in public_html keep
their previous modification time after a deploy, and their contents stay
at the previous commit's build. No output from the cp command appears in
the deploy log, and no error appears either.

WHAT I HAVE ALREADY RULED OUT
1. Wrong branch. The clone originally tracked the repo's default branch
   (main) while the panel labelled it master, so pulls legitimately
   reported "up to date". Both branches now point at the same commit and
   the checkout is genuinely on master.
2. Dirty working tree. An earlier checkout had uncommitted local changes
   and correctly refused to fast-forward. I deleted that directory and
   re-cloned; the current checkout is clean and arrives at the correct
   commit immediately.
3. Script not saved. The field persists across page loads and the UI
   confirms the update.
4. Shell operators. I first used "rsync -a --delete ... || cp -R ...".
   Suspecting the || was not being interpreted, I reduced it to the single
   plain cp command above. Same result.
5. CDN caching. StackCDN serves stale HTML on GET while HEAD reaches the
   origin, which masked several earlier tests. All results above are taken
   from HEAD requests against the origin, and confirmed against file
   modification times in File Manager.

QUESTIONS
1. Is the Deployment Script supported on this package, and is it enabled?
2. What shell/user does it run as, and from which working directory?
3. Is its output logged anywhere I can see? The deploy dialog shows only
   git output, so a failing script would be invisible.

WORKAROUND IN PLACE
I have pointed the domain's document root at the repository's build
directory (quiteapps-web/dist), so the pull alone updates the live site
and no copy step is needed. That works well. I am reporting this because
the Deployment Script silently doing nothing, with a "completed
successfully" message, is misleading.
