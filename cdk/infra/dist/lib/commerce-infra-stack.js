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
exports.CommerceInfraStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const apigwv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const ec2 = __importStar(require("aws-cdk-lib/aws-ec2"));
const ecs = __importStar(require("aws-cdk-lib/aws-ecs"));
const elbv2 = __importStar(require("aws-cdk-lib/aws-elasticloadbalancingv2"));
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
class CommerceInfraStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            natGateways: 1
        });
        const cluster = new ecs.Cluster(this, 'Cluster', {
            vpc,
            clusterName: 'commerce-cluster'
        });
        const namespace = new servicediscovery.PrivateDnsNamespace(this, 'Namespace', {
            vpc,
            name: 'commerce.local'
        });
        const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
            vpc,
            allowAllOutbound: true,
            description: 'Internal ALB security group'
        });
        const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
            vpc,
            allowAllOutbound: true,
            description: 'ECS service security group'
        });
        serviceSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(8080), 'ALB to ECS services');
        const alb = new elbv2.ApplicationLoadBalancer(this, 'InternalAlb', {
            vpc,
            internetFacing: false,
            securityGroup: albSecurityGroup,
            loadBalancerName: 'commerce-internal-alb'
        });
        const listener = alb.addListener('HttpListener', {
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            open: false,
            defaultAction: elbv2.ListenerAction.fixedResponse(404, {
                contentType: 'application/json',
                messageBody: '{"message":"route not found"}'
            })
        });
        const vpcLinkSecurityGroup = new ec2.SecurityGroup(this, 'VpcLinkSecurityGroup', {
            vpc,
            allowAllOutbound: true,
            description: 'API Gateway VPC Link security group'
        });
        albSecurityGroup.addIngressRule(vpcLinkSecurityGroup, ec2.Port.tcp(80), 'API Gateway VPC Link to ALB');
        const vpcLink = new apigwv2.CfnVpcLink(this, 'HttpApiVpcLink', {
            name: 'commerce-http-api-vpc-link',
            subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
            securityGroupIds: [vpcLinkSecurityGroup.securityGroupId]
        });
        const httpApi = new apigwv2.CfnApi(this, 'HttpApi', {
            name: 'commerce-http-api',
            protocolType: 'HTTP'
        });
        const integration = new apigwv2.CfnIntegration(this, 'AlbIntegration', {
            apiId: httpApi.ref,
            integrationType: 'HTTP_PROXY',
            integrationMethod: 'ANY',
            integrationUri: listener.listenerArn,
            connectionType: 'VPC_LINK',
            connectionId: vpcLink.ref,
            payloadFormatVersion: '1.0'
        });
        for (const service of services) {
            new apigwv2.CfnRoute(this, `${pascal(service)}Route`, {
                apiId: httpApi.ref,
                routeKey: `ANY /api/${service}/{proxy+}`,
                target: `integrations/${integration.ref}`
            });
            new apigwv2.CfnRoute(this, `${pascal(service)}RootRoute`, {
                apiId: httpApi.ref,
                routeKey: `ANY /api/${service}`,
                target: `integrations/${integration.ref}`
            });
        }
        new apigwv2.CfnStage(this, 'DefaultStage', {
            apiId: httpApi.ref,
            stageName: '$default',
            autoDeploy: true
        });
        new cdk.CfnOutput(this, 'VpcId', { exportName: 'commerce-vpc-id', value: vpc.vpcId });
        new cdk.CfnOutput(this, 'PrivateSubnetIds', {
            exportName: 'commerce-private-subnet-ids',
            value: vpc.privateSubnets.map((subnet) => subnet.subnetId).join(',')
        });
        new cdk.CfnOutput(this, 'AvailabilityZones', {
            exportName: 'commerce-availability-zones',
            value: vpc.availabilityZones.join(',')
        });
        new cdk.CfnOutput(this, 'ClusterName', { exportName: 'commerce-cluster-name', value: cluster.clusterName });
        new cdk.CfnOutput(this, 'NamespaceId', { exportName: 'commerce-namespace-id', value: namespace.namespaceId });
        new cdk.CfnOutput(this, 'ListenerArn', { exportName: 'commerce-listener-arn', value: listener.listenerArn });
        new cdk.CfnOutput(this, 'AlbSecurityGroupId', {
            exportName: 'commerce-alb-security-group-id',
            value: albSecurityGroup.securityGroupId
        });
        new cdk.CfnOutput(this, 'ServiceSecurityGroupId', {
            exportName: 'commerce-service-security-group-id',
            value: serviceSecurityGroup.securityGroupId
        });
        new cdk.CfnOutput(this, 'HttpApiUrl', {
            exportName: 'commerce-http-api-url',
            value: httpApi.attrApiEndpoint
        });
    }
}
exports.CommerceInfraStack = CommerceInfraStack;
function pascal(value) {
    return value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
