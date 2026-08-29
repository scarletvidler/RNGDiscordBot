import * as pulumi from "@pulumi/pulumi";
import createS3Bucket from "./resources/s3";
import { createECRRepository, createRepositoryImage } from "./resources/ecr";

const projectName = process.env.PROJECT_NAME ?? "lerche-bot";

const ecrRepository = createECRRepository(`${projectName}-ecr-repository`);

const repositoryImage = createRepositoryImage(
  ecrRepository,
  `${projectName}-repository-image`,
);

const s3Bucket = createS3Bucket(`${projectName}-s3-bucket`);
pulumi.interpolate`console.log(${repositoryImage.id})`;
pulumi.interpolate`console.log(${ecrRepository.repositoryUrl})`;
pulumi.interpolate`console.log(${s3Bucket.id})`;
