"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommerceServicesStack = void 0;
const path = __importStar(require("path"));
const cdk = __importStar(require("aws-cdk-lib"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecr = __importStar(require("aws-cdk-lib/aws-ecr"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const servicediscovery = __importStar(require("aws-cdk-lib/aws-servicediscovery"));
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
class CommerceServicesStack extends cdk.Stack {
    constructor(scope, id, props) {
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
            securityGroup: ec2.SecurityGroup.fromSecurityGroupId(this, 'AlbSecurityGroupReference', cdk.Fn.importValue('commerce-alb-security-group-id'))
        });
        const serviceSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(this, 'ServiceSecurityGroup', cdk.Fn.importValue('commerce-service-security-group-id'));
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
exports.CommerceServicesStack = CommerceServicesStack;
function pascal(value) {
    return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
