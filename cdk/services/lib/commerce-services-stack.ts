import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as servicediscovery from 'aws-cdk-lib/aws-servicediscovery';

const services = [
  'auth',
  'product',
  'buy',
  'payment',
  'order-mgmt',
  'inventory-mgmt',
  'cart',
  'customer',
  'shipping',
  'notification'
];

export class CommerceServicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: cdk.Fn.importValue('commerce-vpc-id'),
      availabilityZones: cdk.Fn.importListValue('commerce-availability-zones', 2),
      privateSubnetIds: cdk.Fn.importListValue('commerce-private-subnet-ids', 2)
    });
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'Cluster', {
      clusterName: cdk.Fn.importValue('commerce-cluster-name'),
      vpc
    });
    const listener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, 'Listener', {
      listenerArn: cdk.Fn.importValue('commerce-listener-arn'),
      securityGroup: ec2.SecurityGroup.fromSecurityGroupId(
        this,
        'AlbSecurityGroupReference',
        cdk.Fn.importValue('commerce-alb-security-group-id')
      )
    });
    const serviceSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ServiceSecurityGroup',
      cdk.Fn.importValue('commerce-service-security-group-id')
    );
    const namespace = servicediscovery.PrivateDnsNamespace.fromPrivateDnsNamespaceAttributes(this, 'Namespace', {
      namespaceId: cdk.Fn.importValue('commerce-namespace-id'),
      namespaceName: 'commerce.local',
      namespaceArn: cdk.Stack.of(this).formatArn({
        service: 'servicediscovery',
        resource: 'namespace',
        resourceName: cdk.Fn.importValue('commerce-namespace-id')
      })
    });

    services.forEach((service, index) => {
      const repository = new ecr.Repository(this, `${pascal(service)}Repository`, {
        repositoryName: `commerce/${service}`,
        imageScanOnPush: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: true
      });

      const taskDefinition = new ecs.FargateTaskDefinition(this, `${pascal(service)}TaskDefinition`, {
        family: `commerce-${service}`,
        cpu: 256,
        memoryLimitMiB: 512
      });

      const logGroup = new logs.LogGroup(this, `${pascal(service)}LogGroup`, {
        logGroupName: `/ecs/commerce/${service}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      });

      const container = taskDefinition.addContainer(`${pascal(service)}Container`, {
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, '../../..'), {
          file: 'Dockerfile.service',
          buildArgs: {
            SERVICE_NAME: service
          }
        }),
        containerName: service,
        environment: {
          SERVER_PORT: '8080'
        },
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: service,
          logGroup
        })
      });
      container.addPortMappings({ containerPort: 8080 });

      const fargateService = new ecs.FargateService(this, `${pascal(service)}Service`, {
        cluster,
        serviceName: `commerce-${service}`,
        taskDefinition,
        desiredCount: Number(this.node.tryGetContext('desiredCount') ?? '0'),
        minHealthyPercent: 100,
        assignPublicIp: false,
        securityGroups: [serviceSecurityGroup],
        cloudMapOptions: {
          cloudMapNamespace: namespace,
          name: service
        },
        circuitBreaker: {
          rollback: true
        }
      });

      const targetGroup = new elbv2.ApplicationTargetGroup(this, `${pascal(service)}TargetGroup`, {
        vpc,
        port: 8080,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targetType: elbv2.TargetType.IP,
        targets: [fargateService],
        healthCheck: {
          enabled: true,
          path: '/actuator/health',
          healthyHttpCodes: '200'
        }
      });

      listener.addAction(`${pascal(service)}ListenerRule`, {
        priority: 100 + index,
        conditions: [elbv2.ListenerCondition.pathPatterns([`/api/${service}`, `/api/${service}/*`])],
        action: elbv2.ListenerAction.forward([targetGroup])
      });

      new cdk.CfnOutput(this, `${pascal(service)}RepositoryUri`, {
        value: repository.repositoryUri
      });
    });
  }
}

function pascal(value: string): string {
  return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
