#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Instance role — 讓 App Runner 能呼叫 Transcribe + Secrets Manager
    const instanceRole = new iam.Role(this, 'BackendInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Profit-Prophet Backend - Transcribe + Secrets Manager',
      inlinePolicies: {
        transcribe: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['transcribe:StartStreamTranscription'],
              resources: ['*'],
            }),
          ],
        }),
        secrets: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [
                `arn:aws:secretsmanager:us-west-2:${this.account}:secret:profit-prophet/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Access role — 讓 App Runner 能拉 ECR image
    const accessRole = new iam.Role(this, 'BackendAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSAppRunnerServicePolicyForECRAccess'
        ),
      ],
    });

    // App Runner 服務 — 用 source code (Python runtime)
    const service = new apprunner.CfnService(this, 'BackendService', {
      serviceName: 'profit-prophet-backend',
      sourceConfiguration: {
        autoDeploymentsEnabled: false,
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: `056724761684.dkr.ecr.us-west-2.amazonaws.com/profit-prophet-backend:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '8080',
            runtimeEnvironmentVariables: [
              { name: 'CARECAPTION_ASR_ENGINE', value: 'aws' },
              { name: 'AWS_REGION', value: 'us-west-2' },
              { name: 'CARECAPTION_LANGUAGE_OPTIONS', value: 'zh-TW,en-US' },
              { name: 'CARECAPTION_SECRET_NAME', value: 'profit-prophet/env' },
            ],
          },
        },
      },
      instanceConfiguration: {
        instanceRoleArn: instanceRole.roleArn,
        cpu: '0.25 vCPU',
        memory: '0.5 GB',
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/api/config',
      },
    });

    new cdk.CfnOutput(this, 'BackendURL', {
      value: `https://${service.attrServiceUrl}`,
      description: 'Profit-Prophet Backend URL (App Runner)',
    });
  }
}

const app = new cdk.App();
new BackendStack(app, 'ProfitProphetBackendStack', {
  env: { region: 'us-west-2', account: '056724761684' },
});
