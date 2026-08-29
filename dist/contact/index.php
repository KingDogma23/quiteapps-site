<?php
declare(strict_types=1);

$TO      = "hello@quiteapps.co.uk";
$SUBJECT = 'Website enquiry — ' . "quiteapps.co.uk";
$MIN_SECONDS = 3;   // a human takes longer than this to fill the form in

$sent = false;
$errors = [];
$name = $email = $message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name    = trim((string)($_POST['name'] ?? ''));
    $email   = trim((string)($_POST['email'] ?? ''));
    $message = trim((string)($_POST['message'] ?? ''));
    $trap    = trim((string)($_POST['website'] ?? ''));
    $started = (int)($_POST['t'] ?? 0);

    // Bots fill hidden fields and submit instantly. Accept silently rather than
    // telling them why they failed.
    $looks_automated = $trap !== '' || $started <= 0 || (time() - $started) < $MIN_SECONDS;

    if ($name === '')                                        { $errors['name'] = 'Please add your name.'; }
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL))
                                                             { $errors['email'] = 'That does not look like an email address.'; }
    if (mb_strlen($message) < 10)                            { $errors['message'] = 'Please add a little more detail.'; }
    if (mb_strlen($message) > 5000)                          { $errors['message'] = 'That is longer than we can accept.'; }

    if (!$errors) {
        if ($looks_automated) {
            $sent = true;   // pretend
        } else {
            // From must be on our own domain or SPF fails; the sender goes in Reply-To.
            $headers = [
                'From: ' . "Quite Apps <website@quiteapps.co.uk>",
                'Reply-To: ' . mb_encode_mimeheader($name, 'UTF-8') . ' <' . $email . '>',
                'Content-Type: text/plain; charset=UTF-8',
                'X-Mailer: quiteapps-contact',
            ];
            $body = "Name:  " . $name . "\n"
                  . "Email: " . $email . "\n"
                  . "Sent:  " . gmdate('c') . "\n"
                  . "IP:    " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n\n"
                  . $message . "\n";
            $sent = @mail($TO, $SUBJECT, $body, implode("\r\n", $headers));
            if (!$sent) {
                $errors['form'] = 'Something went wrong sending that. Please email us directly instead.';
            }
        }
    }
}

function v(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }
function err(array $e, string $k): string {
    return isset($e[$k]) ? '<span class="field__err">' . htmlspecialchars($e[$k], ENT_QUOTES, 'UTF-8') . '</span>' : '';
}
?>
<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contact — Quite Apps</title>
<meta name="description" content="Get in touch about any of the Quite Apps extensions. Bug reports, feature requests and questions, all read by the person who wrote the code.">
<link rel="canonical" href="https://quiteapps.co.uk/contact/">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Quite Apps">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="Contact — Quite Apps">
<meta property="og:description" content="Get in touch about any of the Quite Apps extensions. Bug reports, feature requests and questions, all read by the person who wrote the code.">
<meta property="og:url" content="https://quiteapps.co.uk/contact/">
<meta property="og:image" content="https://quiteapps.co.uk/og/default.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Contact — Quite Apps">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://quiteapps.co.uk/og/default.png">
<meta name="twitter:title" content="Contact — Quite Apps">
<meta name="twitter:description" content="Get in touch about any of the Quite Apps extensions. Bug reports, feature requests and questions, all read by the person who wrote the code.">
<link rel="stylesheet" href="/styles.css?v=664c9c45">
<link rel="alternate" type="application/rss+xml" title="Quite Apps news" href="https://quiteapps.co.uk/news/feed.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ContactPage","name":"Contact","url":"https://quiteapps.co.uk/contact/","isPartOf":{"@id":"https://quiteapps.co.uk/#website"}}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<nav class="gnav" aria-label="Primary">
  <div class="wrap gnav__in">
    <a class="gnav__mark" href="/"><b>Quite</b><s>.</s><i>Apps</i></a>
    <ul>
      <li><a class="gnav__link" href="/#extensions">Extensions</a></li>
      <li class="is-optional"><a class="gnav__link" href="/#approach">Approach</a></li>
      <li><a class="gnav__link" href="/news/">News</a></li>
      <li><a class="gnav__link" href="/contact/">Contact</a></li>
      <li class="gnav__coffee"><a class="gnav__link" href="https://buymeacoffee.com/kingdogma23" rel="noopener">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex:none"><path d="M4 8h13v6.5A5.5 5.5 0 0 1 11.5 20h-2A5.5 5.5 0 0 1 4 14.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M17 9.5h1.75a2.75 2.75 0 0 1 0 5.5H17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 2.5v2.2M12 2.5v2.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>Buy me a coffee</span></a></li>
    </ul>
  </div>
</nav>
<main id="main">

<div class="wrap crumbs">
  <nav aria-label="Breadcrumb"><ol>
    <li><a href="/">Home</a></li><li><span aria-current="page">Contact</span></li>
  </ol></nav>
</div>

<section class="band band--tight">
  <div class="wrap center">
    <h1 class="t-h2">Get in touch</h1>
    <p class="t-sub measure" style="margin:1.15rem auto 0">Bug reports, feature requests, or a note to say something broke after a site update — all welcome, and all read by the person who wrote the code. Issues on GitHub work just as well.</p>
  </div>
</section>

<section class="band band--alt" style="padding-top:0">
  <div class="wrap">
    <?php if ($sent): ?>
      <div class="formcard formcard--done reveal">
        <h2 class="t-h3">Thank you — that has been sent.</h2>
        <p>We read everything ourselves, so a reply may take a day or two, but it will come from a
          person rather than a queue.</p>
        <p style="margin-top:1.5rem"><a class="clink" href="/">Back to the extensions <span aria-hidden="true">&rsaquo;</span></a></p>
      </div>
    <?php else: ?>
      <form class="formcard reveal" method="post" action="/contact/" novalidate>
        <?php if (isset($errors['form'])): ?>
          <p class="field__err field__err--top"><?= v($errors['form']) ?></p>
        <?php endif; ?>

        <div class="field">
          <label for="name">Your name</label>
          <input id="name" name="name" type="text" autocomplete="name" required
                 value="<?= v($name) ?>" <?= isset($errors['name']) ? 'aria-invalid="true"' : '' ?>>
          <?= err($errors, 'name') ?>
        </div>

        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required
                 value="<?= v($email) ?>" <?= isset($errors['email']) ? 'aria-invalid="true"' : '' ?>>
          <?= err($errors, 'email') ?>
        </div>

        <div class="field">
          <label for="message">Message</label>
          <textarea id="message" name="message" rows="7" required
                    <?= isset($errors['message']) ? 'aria-invalid="true"' : '' ?>><?= v($message) ?></textarea>
          <?= err($errors, 'message') ?>
        </div>

        <div class="trap" aria-hidden="true">
          <label for="website">Leave this empty</label>
          <input id="website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <input type="hidden" name="t" value="<?= time() ?>">

        <div class="field field--submit">
          <button class="btn" type="submit">Send it</button>
          <p class="t-tiny" style="margin-top:.85rem">
            No tracking on this form, and your address is used only to reply.
            Prefer your own mail app? <a class="prose-link" href="mailto:hello@quiteapps.co.uk">hello@quiteapps.co.uk</a>
          </p>
        </div>
      </form>
    <?php endif; ?>
  </div>
</section>
</main>

<footer class="foot">
  <div class="wrap">
    <div class="foot__grid">
      <div>
        <h2>Extensions</h2>
        <ul><li><a href="/extensions/quite-for-youtube/">Quite for YouTube</a></li><li><a href="/extensions/quite-for-facebook/">Quite for Facebook</a></li><li><a href="/extensions/quite-for-cookies/">Quite for Cookies</a></li></ul>
      </div>
      <div>
        <h2>Studio</h2>
        <ul>
          <li><a href="/#approach">Approach</a></li>
          <li><a href="/news/">News</a></li>
          <li><a href="/contact/">Contact</a></li>
          <li><a href="https://www.facebook.com/quiteapps/" rel="noopener">Breakage notices</a></li>
        </ul>
      </div>
      <div>
        <h2>Support</h2>
        <ul>
          <li><a href="mailto:support@quiteapps.co.uk">support@quiteapps.co.uk</a></li>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="https://buymeacoffee.com/kingdogma23" rel="noopener">Buy me a coffee</a></li>
        </ul>
      </div>
      <div>
        <h2>Source</h2>
        <ul>
          <li><a href="https://github.com/KingDogma23/quite-for-youtube" rel="noopener">YouTube on GitHub</a></li><li><a href="https://github.com/KingDogma23/quite-for-facebook" rel="noopener">Facebook on GitHub</a></li><li><a href="https://github.com/KingDogma23/quite-for-cookies" rel="noopener">Cookies on GitHub</a></li>
          <li><a href="https://github.com/KingDogma23" rel="noopener">All repositories</a></li>
        </ul>
      </div>
    </div>
    <div class="foot__base">
      <span>Copyright &copy; 2026 Quite Apps. All rights reserved.</span>
      <span>United Kingdom</span>
    </div>
    <p class="foot__legal">Quite Apps is an independent studio in the United Kingdom. Our extensions
      are free, MIT licensed and published as source on GitHub. They install unpacked and run in Chrome,
      Edge, Brave, Arc, Opera and other Chromium browsers. Not affiliated with, endorsed by or connected to
      Google, YouTube or Meta. Chrome and YouTube are trademarks of Google LLC; Facebook is a trademark of
      Meta Platforms, Inc.</p>
  </div>
</footer>
<script>
(function(){
  var els=document.querySelectorAll('.reveal');
  if(!els.length)return;
  if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){
    els.forEach(function(e){e.classList.add('is-in')});return;}
  var io=new IntersectionObserver(function(en){en.forEach(function(x){
    if(x.isIntersecting){x.target.classList.add('is-in');io.unobserve(x.target);}})},
    {rootMargin:'0px 0px -6% 0px',threshold:.05});
  els.forEach(function(e,i){e.style.transitionDelay=Math.min(i%3*80,160)+'ms';io.observe(e)});
})();</script>
</body>
</html>