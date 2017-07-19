'use strict';

const AWS = require('aws-sdk');
const fs = require('fs');

class ServerlessAwsCi {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      awsci: {
        usage: 'Creates a CI pipeline using AWS CodePipeline and AWS CodeBuild',
        lifecycleEvents: [
          'initialize',
          'create',
        ],
        options: {
          repo: {
            usage: 'Specify the full GitHub repo (owner/repo) of the source repository',
            shortcut: 'g',
            required: true,
          },
          branch: {
            usage: 'Specify the GitHub repo branch to watch for commits',
            shortcut: 'b',
            required: true,
          },
          token: {
            usage: 'Specify the GitHub personal access token (PAT) of your configured source repository',
            shortcut: 't',
            required: true,
          },
        },
      },
    };

    this.hooks = {
      'awsci:initialize': this.initializeVariables.bind(this),
      'awsci:create': this.run.bind(this),
    };
  }

  initializeVariables() {
    // Sets the credentials for AWS resources.
    const awsCreds = this.serverless.providers.aws.getCredentials();
    AWS.config.update(awsCreds);
    this.codeBuild = new AWS.CodeBuild();
    this.codePipeline = new AWS.CodePipeline();
    this.cloudFormation = new AWS.CloudFormation();
  }

  run() {
    return Promise.all([this.createBuildProject(), this.createPipeline(), this.createBuildSpec()])
      .then(() => (this.serverless.cli.log(`The pipeline was successfully created.\nYou must commit the created buildspec.yml file to the "${this.options.branch}" branch.`)))
      .catch((err) => {
        throw new Error(`The pipeline was not created: ${err}`);
      });
  }

  /**
   * Gets the deployment bucket
   */
  getDeploymentBucket() {
    if (this.serverless.service.provider.deploymentBucket) {
      return Promise.resolve(this.serverless.service.provider.deploymentBucket).then(data => data);
    }

    const params = {
      LogicalResourceId: 'ServerlessDeploymentBucket',
      StackName: `${this.serverless.service.service}-${this.serverless.processedInput.options.stage || this.serverless.service.provider.stage}`,
    };

    return this.cloudFormation.describeStackResource(params).promise().then(data => data.StackResourceDetail.PhysicalResourceId).catch(() => { throw new Error('Cannot find AWS::S3::DeploymentBucket'); });
  }

  createPipeline() {
    this.serverless.cli.log('Creating AWS CodePipeline pipeline...');
    const service = this.serverless.service;
    const [gitOwner, gitRepo] = this.options.repo.split('/');

    if (!service.custom.awsCI || !service.custom.awsCI.roleArn) {
      throw new Error('awsCI settings in Serverless are not configured correctly: roleArn missing');
    }

    return this.getDeploymentBucket().then((deploymentBucket) => {
      const params = {
        pipeline: {
          version: 1,
          name: `${this.serverless.service.service}-${this.serverless.processedInput.options.stage || this.serverless.service.provider.stage}`,
          artifactStore: {
            type: 'S3',
            location: deploymentBucket,
          },
          roleArn: service.custom.awsCI.roleArn,
          stages: [
            {
              name: 'Source',
              actions: [
                {
                  name: 'Source',
                  actionTypeId: {
                    version: '1',
                    category: 'Source',
                    owner: 'ThirdParty',
                    provider: 'GitHub',
                  },
                  configuration: {
                    Owner: gitOwner,
                    Repo: gitRepo,
                    Branch: this.options.branch,
                    OAuthToken: this.options.token,
                  },
                  inputArtifacts: [
                  ],
                  outputArtifacts: [
                    {
                      name: 'ServerlessSource',
                    },
                  ],
                  runOrder: 1,
                },
              ],
            },
            {
              name: 'Deploy',
              actions: [
                {
                  name: 'ServerlessDeploy',
                  actionTypeId: {
                    version: '1',
                    category: 'Build',
                    owner: 'AWS',
                    provider: 'CodeBuild',
                  },
                  configuration: {
                    ProjectName: `${this.serverless.service.service}-${this.serverless.processedInput.options.stage || this.serverless.service.provider.stage}`,
                  },
                  inputArtifacts: [
                    {
                      name: 'ServerlessSource',
                    },
                  ],
                  outputArtifacts: [
                  ],
                  runOrder: 1,
                },
              ],
            },
          ],
        },
      };

      return this.codePipeline.createPipeline(params).promise();
    });
  }

  createBuildProject() {
    return this.findBuildProject().then((data) => {
      if (data.projects.indexOf(`${this.serverless.service.service}-${this.serverless.processedInput.options.stage || this.serverless.service.provider.stage}`) !== -1) {
        this.serverless.cli.log('Found existing AWS CodePBuild project');
        return Promise.resolve();
      }

      this.serverless.cli.log('Creating AWS CodePBuild project...');
      const service = this.serverless.service;

      if (!service.custom.awsCI || !service.custom.awsCI.roleArn) {
        throw new Error('awsCI settings in Serverless are not configured correctly: roleArn missing');
      }

      const params = {
        artifacts: {
          type: 'CODEPIPELINE',
        },
        environment: {
          computeType: 'BUILD_GENERAL1_SMALL',
          image: 'aws/codebuild/nodejs:7.0.0',
          type: 'LINUX_CONTAINER',
        },
        name: `${this.serverless.service.service}-${this.serverless.processedInput.options.stage || this.serverless.service.provider.stage}`,
        source: {
          type: 'CODEPIPELINE',
        },
        serviceRole: service.custom.awsCI.roleArn,
      };

      return this.codeBuild.createProject(params).promise();
    });
  }

  findBuildProject() {
    return this.codeBuild.listProjects({}).promise();
  }

  /*
   * Obtains the certification arn
   */
  createBuildSpec() {
    this.serverless.cli.log('Creating AWS CodePipeline buildspec.yml file...');
    const service = this.serverless.service;

    if (!service.custom.awsCI) {
      throw new Error('awsCI settings in Serverless are not configured correctly');
    }

    const buildSpec = `version: 0.2
phases:
  build:
    commands:
      - npm install -g serverless && npm install && serverless deploy --stage "${this.options.stage || this.serverless.service.provider.stage}" --region "${this.options.region || this.serverless.service.provider.region}"`;

    return new Promise((resolve, reject) => {
      fs.writeFile('buildspec.yml', buildSpec, (err) => {
        if (err) reject(err);
        else resolve(buildSpec);
      });
    });
  }
}

module.exports = ServerlessAwsCi;
