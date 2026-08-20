import * as aws from "@pulumi/aws";
import { CustomResourceOptions } from "@pulumi/pulumi";

export default function createECRRepository(
  name: string,
  args: aws.ecr.RepositoryArgs = {
    name,
    forceDelete: true,
    imageScanningConfiguration: {
      scanOnPush: true,
    },
    imageTagMutability: "MUTABLE",
    imageTagMutabilityExclusionFilters: [
      {
        filter: "latest*",
        filterType: "WILDCARD",
      },
    ],
  },
  options?: CustomResourceOptions,
) {
  const repository = new aws.ecr.Repository(name, args, options);
  return repository;
}
