# Security policy

## Scope

This repository serves a static personal portfolio and the public policy pages for Cait Mail Assistant. Security-sensitive findings include:

- credentials, tokens, private correspondence, unpublished personal records or machine-local data accidentally committed to the public repository;
- cross-site scripting or other active-content issues in pages under this repository;
- compromised or unexpectedly executable third-party assets;
- workflow changes that give untrusted pull-request content elevated GitHub Actions permissions;
- publication-boundary mistakes that expose files intended to remain local.

Ordinary factual corrections, copyright or licensing questions, accessibility issues, broken links and editorial disagreements should use normal repository contact rather than the private security channel.

## Reporting

Use GitHub private vulnerability reporting for security-sensitive findings. Do not paste credentials, private email, legal or medical records, or other personal material into a public issue.

The latest main branch receives fixes.

## Mail Assistant policy pages

The mail-assistant directory contains public OAuth and privacy disclosures, not application source code or a credential store. A wording inconsistency is not automatically a security vulnerability. Report privately if those pages expose private data, permit active-content injection, or the disclosed data flow materially diverges because of a security defect.
