import * as aws from "@pulumi/aws";
import * as docker_build from "@pulumi/docker-build";
import * as pulumi from "@pulumi/pulumi";
import { Repository } from "@pulumi/aws/ecr";

export function createECRRepository(
  name: string,
  args: aws.ecr.RepositoryArgs = {
    name,
    forceDelete: true,
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
  },
  options?: pulumi.CustomResourceOptions,
) {
  const repository = new aws.ecr.Repository(name, args, options);
  return repository;
}

export function createRepositoryImage(ecrRepository: Repository, name: string) {
  const authToken = aws.ecr.getAuthorizationTokenOutput({
    registryId: ecrRepository.registryId,
  });

  return new docker_build.Image(name, {
    // Tag our image with our ECR repository's address.
    tags: [pulumi.interpolate`${ecrRepository.repositoryUrl}:latest`],
    context: {
      location: "..",
    },
    // Use the pushed image as a cache source.
    cacheFrom: [
      {
        registry: {
          ref: pulumi.interpolate`${ecrRepository.repositoryUrl}:latest`,
        },
      },
    ],
    // Include an inline cache with our pushed image.
    cacheTo: [
      {
        inline: {},
      },
    ],
    // Build a multi-platform image manifest for ARM and AMD.
    platforms: ["linux/amd64", "linux/arm64"],
    // Push the final result to ECR.
    push: true,
    // Provide our ECR credentials.
    registries: [
      {
        address: ecrRepository.repositoryUrl,
        password: authToken.password,
        username: authToken.userName,
      },
    ],
  });
}
