# Commerce Fargate Platform

Microservice ecommerce reference platform using Java 25, Spring Boot 4.0.6, AWS CDK v2, API Gateway, internal ALB, and ECS Fargate.

## Services

- auth
- product
- buy
- payment
- order-mgmt
- inventory-mgmt
- cart
- customer
- shipping
- notification

## Architecture

Ingress is API Gateway HTTP API. API Gateway uses a VPC Link to reach an internal Application Load Balancer listener in private subnets. The ALB forwards by path to each ECS Fargate service target group. An NLB is intentionally not used because HTTP API VPC Link supports private ALB listeners directly, keeping routing, health checks, and target registration simpler.

Two CDK apps are provided:

- `cdk/infra`: VPC, ECS cluster, Cloud Map namespace, internal ALB, and API Gateway.
- `cdk/services`: ECR repositories, task definitions, log groups, service target groups, ALB listener rules, and ECS Fargate services. Desired count defaults to `0`.

## Build

```bash
mvn clean package
```

## Deploy

```bash
cd cdk/infra
npm ci
npx cdk deploy --profile aws-4 --region ap-northeast-2 \
  -c customDomainCertificateArn=arn:aws:acm:ap-northeast-2:379810014062:certificate/... \
  --require-approval never

cd ../services
npm ci
npx cdk deploy --profile aws-4 --region ap-northeast-2 --require-approval never
```

The HTTP API custom domain is `api.nike.gcp.chen-siyi.com`. Create or import an ACM certificate for that exact name in `ap-northeast-2`, then point DNS to the `CustomDomainRegionalDomainName` stack output. If DNS is outside Route 53, use a CNAME.

## Local Smoke Test

```bash
mvn spring-boot:run -pl services/auth
curl http://localhost:8080/health
curl http://localhost:8080/api/auth
```
