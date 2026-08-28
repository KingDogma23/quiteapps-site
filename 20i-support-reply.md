Thanks — I ran the test you suggested, and it settles it.

I set the deployment script to redirect all output to a log file inside the
webspace so I could read it over HTTP:

  cp -Rv /home/sites/41a/0/0c83a40a54/quiteapps-web/dist/. \
         /home/sites/41a/0/0c83a40a54/public_html/ \
         > /home/sites/41a/0/0c83a40a54/quiteapps-web/dist/deploy.log 2>&1

The script saved, and I clicked Deploy. The deploy reported success and
performed a real git fast-forward:

  Updating 78ad4ee..3bcb02e
  Fast-forward
   20i-support-ticket.md | 67 +++++++++
   README.md             | 46 +++++++-
   2 files changed, 109 insertions(+), 4 deletions

The log file was never created. https://quiteapps.co.uk/deploy.log returns
404, and that directory is the live document root, so any file written there
is immediately readable — other files in it (llms.txt, robots.txt) serve
fine.

So this is not a script that fails silently. The redirection happens before
cp runs, which means even a failing or missing cp would still create an empty
log. Nothing was created at all, so the deployment script is never executed.

To summarise the state:

- git pull works correctly, including a genuine fast-forward across commits
- the deployment script field saves and persists
- the script does not run, produces no file, and no error
- package type: DVA Main, domain quiteapps.co.uk

Given your note that deployment scripts are supported and enabled on this
package, and that only git output is surfaced in the dialog, I think this
does need escalating.

Two things that would help others hitting this, whatever the cause:

1. Surface deployment script output and exit status in the deploy dialog.
   At the moment a script that never runs is indistinguishable from one that
   runs and succeeds — both show "Deployment completed successfully".
2. If the script cannot be run for a package, say so in the UI rather than
   accepting and storing it.

No action needed on my account. My workaround — pointing the document root
at the repository's build directory so the pull itself is the deployment —
works well and I am happy on it.
