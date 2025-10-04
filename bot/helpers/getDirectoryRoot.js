import path from "path";
import { fileURLToPath } from "url";

export default function getDirectoryRoot() {
  // Get the current file path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const parentDir = path.resolve(__dirname, "..");

  return parentDir;
}
