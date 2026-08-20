import * as aws from "@pulumi/aws";

export default function createS3Bucket(name: string) {
  const bucket = new aws.s3.Bucket(name);
  return bucket;
}
