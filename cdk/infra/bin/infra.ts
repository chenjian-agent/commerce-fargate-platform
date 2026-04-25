#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CommerceInfraStack } from '../lib/commerce-infra-stack';

const app = new cdk.App();
new CommerceInfraStack(app, 'CommerceInfraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2'
  }
});
