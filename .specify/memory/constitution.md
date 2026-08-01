# Profit-Prophet Constitution

## Core Principles

### I. AWS Account Security
All AWS resources must follow least-privilege and restricted-access principles. No public-facing resources unless explicitly required and properly secured. Every team member must verify they are operating in the correct shared AWS account.

### II. Region Compliance
All resources and services must be deployed exclusively in **us-east-1 (N. Virginia)** or **us-west-2 (Oregon)**. If access denied errors occur, verify region selection first.

### III. Data Protection (NON-NEGOTIABLE)
No personal, regulated, financial, biometric, health, or payment data may be imported into the AWS account. No data related to race, ethnicity, political opinions, religion, trade union membership, sexual orientation, or genetic information. Only synthetic or non-sensitive data is permitted.

### IV. Resource Minimalism
Only launch instances and resources strictly necessary for the project. Avoid unnecessary cost by limiting compute, storage, and service usage to active development needs.

### V. Rate Limiting
Amazon Bedrock and other generative AI service requests must stay below **1 Request Per Second (RPS/TPS)**. Only enable Bedrock models essential to the project — do not bulk-enable models without clear purpose.

## Security Constraints

### S3 Buckets
- All S3 buckets MUST have public access blocked via S3 Block Public Access or a restrictive Bucket Policy
- No unrestricted public bucket access is permitted

### EC2 Instances
- Security Groups must NOT be wide-open to public (0.0.0.0/0 on all ports)
- Only open specific ports required for the application

### RDS & EMR
- Public Access must be **disabled** on all RDS instances and EMR clusters
- Database access must be restricted to VPC-internal traffic or specific Security Groups

### SageMaker
- Do not duplicate metric definitions in `CreateTrainingJob` calls

## Development Workflow

### Environment Access
1. Sign in via Workshop Studio with event access code
2. Verify account number matches across all team members
3. Access AWS via Console or CLI from the Workshop Studio menu
4. Confirm region is us-east-1 or us-west-2 before any operation

### Responsible Usage
- Review all resource configurations before deployment
- Clean up unused resources promptly
- Monitor costs and resource utilization
- Coordinate with teammates to avoid duplicate resources

## Governance

This constitution reflects the Hackathon operator's mandatory rules and supersedes any conflicting development preferences. Violations may result in account access revocation. All team members must acknowledge and follow these constraints throughout the event.

**Version**: 1.0.0 | **Ratified**: 2026-08-01 | **Last Amended**: 2026-08-01
