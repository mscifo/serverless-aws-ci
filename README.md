# serverless-aws-ci
[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![npm version](https://badge.fury.io/js/serverless-domain-manager.svg)](https://badge.fury.io/js/serverless-domain-manager)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/amplify-education/serverless-domain-manager/master/LICENSE)

Create a CI pipeline using AWS CodePipeline and AWS CodeBuild to automatically deploy your Serverless project when changes are committed.

# Getting Started

## Prerequisites
Make sure you have the following installed before starting:
* [nodejs](https://nodejs.org/en/download/)
* [npm](https://www.npmjs.com/get-npm?utm_source=house&utm_medium=homepage&utm_campaign=free%20orgs&utm_term=Install%20npm)
* [serverless](https://serverless.com/framework/docs/providers/aws/guide/installation/)

The AWS credentials used to create the CI pipeline via the `serverless` command will need the following permissions:
```
cloudformation:DescribeStackResources
codebuild:CreateProject
codebuild:ListBuilds
codepipeline:CreatePipeline
```

The IAM role (specified via the `custom.awsCI.roleArn` configuration) that AWS CodePipeline and AWS CodeBuild will assume will need to be assigned the `AWSCodeBuildDeveloperAccess` policy AND be assigned the following permissions:
```
logs:CreateLogGroup
logs:CreateLogStream
```

## Installing
```
# From npm (recommended)
npm install serverless-aws-ci

# From github
npm install https://github.com/mscifo/serverless-aws-ci.git
```

Then make the following edits to your `serverless.yml` file:
```yaml
plugins:
  - serverless-aws-ci

custom:
  awsCI:
    roleArn:  # (required) the AWS ARN for the role CodePipeline/CodeBuild will assume
```

## Running

To create the pipeline (you only need to run this once per branch/stage):
```
serverless awsci -g [GITHUB_OWNER/GITHUB_REPO] -b [GITHUB_BRANCH] -t [GITHUB_PERSONAL_ACCESS_TOKEN] -s [STAGE]
```

Be sure to commit the created `buildspec.yml` so the pipeline will know how to deploy your Serverless project.

## Running Tests
To run the test:
```
npm test
```
All tests should pass.