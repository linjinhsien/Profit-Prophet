---
inclusion: always
description: Security rules enforced at all times — every role must comply
---

# Security Rules

These rules apply to **ALL roles** at **ALL pipeline stages**. Violations block the pipeline.

## 1. Secrets & Credentials

- NEVER hardcode secrets, API keys, tokens, or passwords in source code
- Use AWS Secrets Manager or SSM Parameter Store for all sensitive values
- Reference secrets by name/ARN in code, never by value
- `.env` files are for local development only — never commit them
- Add `.env`, `*.pem`, `*.key` to `.gitignore`

## 2. IAM & Access Control

- Follow principle of least privilege for all IAM roles and policies
- No `*` in IAM resource fields for production
- Lambda functions get their own execution roles — no shared roles
- API Gateway endpoints require authentication (Cognito or API Key)
- DynamoDB tables use fine-grained access control

## 3. Data Protection

- All data at rest must be encrypted (DynamoDB, S3, OpenSearch)
- All data in transit uses TLS 1.2+
- PII (patient/caregiver data) requires additional encryption layer
- Log redaction: never log PII, PHI, or credentials
- Use synthetic/anonymized data for testing — no real patient data

## 4. Network & Infrastructure

- Lambda functions in VPC when accessing private resources
- Security groups follow least-privilege (no 0.0.0.0/0 ingress)
- API Gateway uses WAF for public endpoints
- CloudFront distributions use HTTPS-only with modern TLS

## 5. Dependencies & Supply Chain

- Pin all dependency versions (no `^` or `~` ranges in production)
- Run `pip audit` / `npm audit` before each release
- Only use well-known, actively maintained packages
- Review new dependencies before adding — flag unusual names

## 6. Code Quality Gates

- No code merges to `main` without passing:
  - Unit tests (≥ 80% coverage)
  - Linting (ruff for Python)
  - Security scan (no critical/high findings)
- PR requires at least 1 approval
- Force push to `main` is prohibited

## 7. AWS-Specific Rules

- Region: limit deployments to `us-east-1` and `us-west-2`
- Bedrock: rate limit < 1 RPS per model for development
- CloudWatch Logs: set retention policy (not indefinite)
- S3 buckets: block public access by default
- Lambda: set memory and timeout limits explicitly

## 8. Compliance (Healthcare Context)

- Treat all caregiver/patient interaction data as sensitive
- Implement audit logging for all data access
- Retain audit logs per organizational policy
- Data deletion requests must be completable within 30 days
- AI-generated care suggestions must include disclaimer markers
