import createS3Bucket from "./resources/storage";
import createECRRepository from "./resources/container";

function main() {
  try {
    const ecrRepository = createECRRepository(
      `${process.env.PROJECT_NAME ?? "lerche-bot"}-ecr-repository`,
    );

    const s3Bucket = createS3Bucket(
      `${process.env.PROJECT_NAME ?? "lerche-bot"}-s3-bucket`,
    );

    console.log(`ECR Repository created: ${ecrRepository.id}`);
    console.log(`S3 Bucket created: ${s3Bucket.id}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();
