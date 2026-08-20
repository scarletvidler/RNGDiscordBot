import * as pulumi from "@pulumi/pulumi";
import createS3Bucket from "./resources/storage";
import {
  createECRRepository,
  createRepositoryImage,
} from "./resources/container";

const projectName = process.env.PROJECT_NAME ?? "lerche-bot";

const ecrRepository = createECRRepository(`${projectName}-ecr-repository`);

const repositoryImage = createRepositoryImage(
  ecrRepository,
  `${projectName}-repository-image`,
);

const s3Bucket = createS3Bucket(`${projectName}-s3-bucket`);
console.log(pulumi.interpolate`${repositoryImage.id}`);
console.log(pulumi.interpolate`${ecrRepository.repositoryUrl}`);
console.log(pulumi.interpolate`${s3Bucket.id}`);
