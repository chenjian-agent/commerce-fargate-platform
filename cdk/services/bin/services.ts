#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CommerceServicesStack } from '../lib/commerce-services-stack';

const app = new cdk.App();
new CommerceServicesStack(app, 'CommerceServicesStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'ap-northeast-2'
  }
});
