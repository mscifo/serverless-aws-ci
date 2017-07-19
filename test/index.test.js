'use strict';

const AWS = require('aws-sdk-mock');
const aws = require('aws-sdk');
const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;

const ServerlessAwsCi = require('../index.js');

const testCreds = {
  accessKeyId: 'test_key',
  secretAccessKey: 'test_secret',
  sessionToken: 'test_session',
};
const constructPlugin = (basepath, stage) => {
  const serverless = {
    cli: { log(params) { return params; } },
    providers: {
      aws: {
        getCredentials: () => new aws.Credentials(testCreds),
      },
    },
    service: {
      provider: {
        region: 'us-moon-1',
        compiledCloudFormationTemplate: {
          Resources: {
            Deployment0: {
              Type: 'AWS::ApiGateway::Deployment',
            },
          },
        },
        stage: 'providerStage',
      },
      custom: {
        awsCI: {
          roleArn: 'test_arn'
        },
      },
    },
    processedInput: {
        options: {
            region: 'us-moon-1',
            stage: 'providerStage'
        }
    }
  };

  return new ServerlessAwsCi(serverless, {repo: 'owner/repo', branch: 'test', token: '1234567890'});
};


describe('AWS CI Plugin', () => {
  it('check aws config', () => {
    const plugin = constructPlugin({}, 'tests', true);
    plugin.initializeVariables();
    const returnedCreds = plugin.codePipeline.config.credentials;
    expect(returnedCreds.accessKeyId).to.equal(testCreds.accessKeyId);
    expect(returnedCreds.sessionToken).to.equal(testCreds.sessionToken);
  });

  describe('Create a New Domain Name', () => {
    it('Get Serverless deployment bucket', () => {
      AWS.mock('CloudFormation', 'describeStackResource', (params, callback) => {
        callback(null, {StackResourceDetail: {PhysicalResourceId: 'test-serverlessdeploymentbucket' }});
      });

      const plugin = constructPlugin(null, null, true);
      plugin.cloudFormation = new aws.CloudFormation();

      return plugin.getDeploymentBucket().then(data => expect(data).to.equal('test-serverlessdeploymentbucket'));
    });

    it('Create a pipeline', () => {
      AWS.mock('CodePipeline', 'createPipeline', (params, callback) => {
        callback(null, {pipelineName: 'foo'});
      });
      AWS.mock('CloudFormation', 'describeStackResource', (params, callback) => {
        callback(null, {StackResourceDetail: {PhysicalResourceId: 'test-serverlessdeploymentbucket' }});
      });

      const plugin = constructPlugin(null, null, true);
      plugin.codePipeline = new aws.CodePipeline();
      plugin.cloudFormation = new aws.CloudFormation();

      return plugin.createPipeline().then(data => expect(data.pipelineName).to.equal('foo'));;
    });

    it('Create a build project', () => {
      AWS.mock('CodeBuild', 'listProjects', (params, callback) => {
        callback(null, {projects: []});
      });
      AWS.mock('CodeBuild', 'createProject', (params, callback) => {
        callback(null, {projectName: 'foo'});
      });

      const plugin = constructPlugin(null, null, true);
      plugin.codeBuild = new aws.CodeBuild();

      return plugin.createBuildProject().then(data => expect(data.projectName).to.equal('foo'));
    });

    it('Create a buildspec.yml file', () => {
      const plugin = constructPlugin(null, null, true);
      const buildSpec = `version: 0.2
phases:
  build:
    commands:
      - npm install -g serverless && npm install && serverless deploy --stage "providerStage" --region "us-moon-1"`;

      return plugin.createBuildSpec().then(data => {
        fs.unlinkSync('buildspec.yml');
        return expect(data).to.equal(buildSpec);
      });
    });

    afterEach(() => {
      AWS.restore();
    });
  });
});
