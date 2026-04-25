import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

export class CommerceFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const apiBaseUrl = requiredContext(this, 'apiBaseUrl');
    const cognitoUserPoolId = requiredContext(this, 'cognitoUserPoolId');
    const cognitoClientId = requiredContext(this, 'cognitoClientId');
    const cognitoRegion = this.node.tryGetContext('cognitoRegion') ?? 'ap-northeast-2';

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'commerce-frontend-cluster'
    });

    const logGroup = new logs.LogGroup(this, 'FrontendLogGroup', {
      logGroupName: '/ecs/commerce/frontend',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'FrontendTaskDefinition', {
      family: 'commerce-frontend',
      cpu: 256,
      memoryLimitMiB: 512
    });

    taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: ['cognito-idp:AdminInitiateAuth'],
        resources: [
          cdk.Stack.of(this).formatArn({
            region: cognitoRegion,
            service: 'cognito-idp',
            resource: 'userpool',
            resourceName: cognitoUserPoolId
          })
        ]
      })
    );

    const container = taskDefinition.addContainer('FrontendContainer', {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../../frontend')),
      containerName: 'frontend',
      environment: {
        API_BASE_URL: apiBaseUrl,
        COGNITO_REGION: cognitoRegion,
        COGNITO_USER_POOL_ID: cognitoUserPoolId,
        COGNITO_CLIENT_ID: cognitoClientId,
        PORT: '8080'
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'frontend',
        logGroup
      })
    });
    container.addPortMappings({ containerPort: 8080 });

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'FrontendService', {
      cluster,
      serviceName: 'commerce-frontend',
      taskDefinition,
      desiredCount: 1,
      publicLoadBalancer: true,
      assignPublicIp: false,
      listenerPort: 80,
      healthCheckGracePeriod: cdk.Duration.seconds(90)
    });

    service.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200'
    });

    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `http://${service.loadBalancer.loadBalancerDnsName}`
    });
  }
}

function requiredContext(scope: Construct, name: string): string {
  const value = scope.node.tryGetContext(name);
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing CDK context value: ${name}`);
  }
  return value;
}
