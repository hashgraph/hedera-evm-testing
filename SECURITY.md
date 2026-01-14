# Security Policy

## Reporting a Vulnerability

The Hedera team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing [security@hedera.com](mailto:security@hedera.com).

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information in your report:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Security Update Policy

Security updates will be released as soon as possible after a vulnerability is confirmed and a fix is available.

## Supported Versions

We recommend using the latest version of the software to ensure you have the latest security updates.

## Scope

This security policy applies to the hedera-evm-testing repository and its associated projects:
- System contracts testing
- EVM gas schedule compatibility regression testing

### Test Keys and Credentials

Please note that private keys and credentials found in this repository are for **testing purposes only** and should never be used in production environments. These test keys are publicly known and documented in the codebase.

## Security Best Practices

When contributing to this repository:

1. **Never commit production credentials** - Only use test credentials that are already documented
2. **Keep dependencies updated** - Regularly check for and update vulnerable dependencies
3. **Follow secure coding practices** - Review code for common vulnerabilities before submitting PRs
4. **Use the latest versions** - Ensure you're using up-to-date versions of Node.js and other tools

## Acknowledgments

We appreciate the security research community's efforts in helping keep our projects secure.
