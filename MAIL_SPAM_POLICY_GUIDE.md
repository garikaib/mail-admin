# Mail Spam Policy Guide

This guide documents the current spam policy direction for the mail stack:

- Keep custom Rspamd maps as heuristic signals.
- Reserve hard rejection for authentication and protocol failures.
- Verify on the remote mail server that spam is moved to Junk/Spam instead of being rejected.

## Policy Summary

The repository contains curated Rspamd multimaps under `spamrules/`.
These rules are intentionally kept at low or moderate scores so they influence classification without becoming reject triggers on their own.

Hard rejection should remain on the remote mail server for:

- SPF failure
- DMARC reject
- DKIM reject
- Other clear protocol or authentication failures

Heuristic rules should be used for:

- Spam keyword detection
- Sender/content reputation
- Brand impersonation patterns
- URL and header suspicion
- Whitelist balancing

## Why This Matters

The previous configuration assigned many content rules high scores such as `12.0`, `18.0`, and `20.0`.
That made the rules useful for catching spam, but also increased false positives because normal mail could cross the reject threshold too easily.

The current approach keeps the detection value while reducing the chance of blocking legitimate mail.

## GitHub-Hosted Maps

Many map files in `spamrules/local.d/` reference `raw.githubusercontent.com`.
That means upstream changes can affect live scoring after Rspamd refreshes its cache.

Safe operating rules:

- Treat upstream map changes as scoring changes, not reject policy changes.
- Review any new high-confidence rules before allowing them to behave like hard blocks.
- If a map update causes false positives, lower the local symbol score rather than moving the rule into rejection logic.

## Remote Server Responsibilities

The live mail behavior is controlled on the remote server, not in the local workspace.

Key remote paths:

- `/etc/rspamd/local.d/`
- `/etc/rspamd/rspamd.local.lua`
- `/etc/postfix/`
- `/var/log/mail.log`
- `/var/log/rspamd/rspamd.log`

The remote server should:

- Accept messages that pass basic SMTP checks
- Score spam using the curated maps
- Move suspicious mail to Junk/Spam
- Reject only hard failures from SPF/DMARC/DKIM or similar policy rules

## Deployment Checklist

Before syncing to the remote server:

1. Review the local score changes in `spamrules/local.d/`.
2. Confirm no heuristic rule has been raised back into reject territory.
3. Run a config syntax check on the remote Rspamd config.
4. Restart Rspamd only after validation passes.

Recommended remote validation commands:

```bash
sudo rspamadm configtest
sudo systemctl status postfix dovecot rspamd
```

## Live Verification Checklist

Use this checklist after deployment:

1. Confirm the mail services are active.
2. Send a known spam sample to a test mailbox.
3. Confirm the message is accepted by SMTP.
4. Confirm Rspamd adds spam classification rather than rejecting the message.
5. Confirm the message appears in Junk/Spam in the mailbox or webmail.
6. Check logs for the decision path.

Useful log locations:

- `/var/log/mail.log`
- `/var/log/rspamd/rspamd.log`

Useful indicators:

- `milter-reject` or `reject` means hard rejection
- spam headers or junk routing means the message was accepted and classified

## Suggested Remote Test Flow

```bash
python3 scripts/core/health_check.py
sudo rspamadm configtest
sudo systemctl status postfix dovecot rspamd
```

Then send a test message that should be classified as spam and verify:

- the SMTP transaction succeeds
- the message does not get rejected
- the message lands in Junk/Spam

## Troubleshooting

If legitimate mail is being blocked:

- Check the remote Rspamd logs for the symbol names involved.
- Verify the score of the symbol is still low enough to avoid rejection.
- Check for upstream map changes from GitHub.
- Confirm the remote server has not mapped a heuristic symbol into a reject action.

If spam is reaching the inbox:

- Check whether the relevant heuristic maps are still enabled.
- Confirm the remote Rspamd thresholds are correct.
- Verify the junk-folder routing is still active for the mailbox client or webmail stack.

## Operational Rule

If a rule is useful but noisy, reduce its score.
If a message is clearly unauthenticated or violates SPF/DMARC/DKIM policy, reject it on the remote server.
