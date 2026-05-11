
import { Storage } from '@google-cloud/storage';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Storage Adapter for handling file operations across different storage types (GCS and Local)
 * Supports file read/write operations and directory handling
 */
export class StorageAdapter {
  private storage?: Storage;
  private storageType: string;
  private bucketName: string;
  private localRootDir: string;

  /**
   * Initializes storage adapter with configuration from environment variables
   * - STORAGE_TYPE: 'gcs' or 'local'
   * - BUCKET_NAME: GCS bucket name
   * - LOCAL_ROOT_DIR: Root directory for local storage
   */
  constructor() {
    this.storageType = process.env.STORAGE_TYPE || 'local';
    this.bucketName = process.env.BUCKET_NAME || '';
    this.localRootDir = process.env.LOCAL_ROOT_DIR || '';

    if (this.storageType === 'gcs') {
      // Credentials omitted — uses Application Default Credentials (ADC).
      // Local dev: gcloud auth application-default login
      // Cloud Run: metadata server via the attached service account
      this.storage = new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
    }
  }

  /**
   * Checks if given path is a directory
   * @param filePath - Path to check
   * @returns Promise resolving to boolean indicating if path is directory
   */
  async isDirectory(filePath: string): Promise<boolean> {
    if (this.storageType === 'local') {
      const fullPath = path.join(this.localRootDir, filePath);
      const stats = await fs.stat(fullPath);
      return stats.isDirectory();
    }
    const bucket = (this.storage as any).bucket(this.bucketName);
    const [files] = await bucket.getFiles({ prefix: filePath });
    return files.length > 1;
  }

  /**
   * Downloads remote files or returns local file paths
   * @param filePath - Path to file or directory
   * @returns Promise resolving to:
   * - String: Local file path for single file
   * - String[]: Array of paths for directory
   * - Buffer: File content for direct downloads
   */
  async getFile(filePath: string): Promise<string | string[] | Buffer> {
    if (this.storageType === 'gcs') {
      const bucket = (this.storage as any).bucket(this.bucketName);
      const isDir = await this.isDirectory(filePath);

      if (isDir) {
        const [files] = await bucket.getFiles({ prefix: filePath });
        const downloadPromises = files.map(async (file: any) => {
          const localPath = path.join(this.localRootDir, file.name);
          await file.download({ destination: localPath });
          return localPath;
        });
        return Promise.all(downloadPromises);
      }

      const blob = bucket.file(filePath);
      const localPath = path.join(this.localRootDir, filePath);
      await blob.download({ destination: localPath });
      return localPath;
    }

    // For local storage
    const fullPath = path.join(this.localRootDir, filePath);
    const isDir = await this.isDirectory(filePath);
    if (isDir) {
      const files = await fs.readdir(fullPath);
      return files.map(file => path.join(fullPath, file));
    }
    return fullPath;
  }

  /**
   * Reads file content from storage
   * @param filePath - Path to file
   * @returns Promise resolving to Buffer containing file content
   */
  async readFile(filePath: string): Promise<Buffer> {
    if (this.storageType === 'gcs') {
      const bucket = (this.storage as any).bucket(this.bucketName);
      const [fileContent] = await bucket.file(filePath).download();
      return Buffer.from(fileContent);
    }

    // else assume it is local storage
    const fullPath = path.join(this.localRootDir, filePath);
    return fs.readFile(fullPath);
  }

  /**
   * Writes buffer data to storage
   * @param buffer - Data to write
   * @param relativePath - Target path for file
   */
  async writeFile(buffer: any, relativePath: string): Promise<void> {
    if (this.storageType === 'local') {
      const fullPath = path.join(this.localRootDir, relativePath);
      const dirPath = path.dirname(fullPath);
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(fullPath, buffer);
      return;
    }

    const bucket = (this.storage as any).bucket(this.bucketName);
    const blob = bucket.file(relativePath);
    await blob.save(buffer, {
      contentType: 'application/octet-stream',
    });
    return;
  }

  resolveFullPath(relativePath: string): string {
    if (this.storageType === 'gcs') {
      const normalized = relativePath.replace(/\\/g, '/');
      return `gs://${this.bucketName}/${normalized}`;
    }
    return path.resolve(this.localRootDir, relativePath);
  }



  async delete_file(filePath: string): Promise<void> {
    if (this.storageType === 'gcs') {
      const bucket = this.storage!.bucket(this.bucketName);
      const isDir = await this.isDirectory(filePath);

      if (isDir) {
        // Delete all files in the folder
        const [files] = await bucket.getFiles({ prefix: filePath });
        if (files.length === 0) {
          console.log("Folder is empty or does not exist in GCS");
          return;
        }

        await Promise.all(files.map((file) => file.delete()));
        console.log(`Deleted folder: ${filePath} from GCS`);
      } else {
        // Delete single file
        await bucket.file(filePath).delete().catch((err: any) => {
          if (err.code === 404) console.log("File not found in GCS");
          else throw err;
        });
        console.log(`Deleted file: ${filePath} from GCS`);
      }
      return;
    }
    const fullPath = path.join(this.localRootDir, filePath);
    try {
      const stat = await fs.lstat(fullPath);
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true });
        console.log(`Deleted folder: ${fullPath}`);
      } else {
        await fs.unlink(fullPath);
        console.log(`Deleted file: ${fullPath}`);
      }
    } catch (error: any) {
      if (error.code === "ENOENT") {
        console.log("File or folder not found locally");
      } else {
        throw error;
      }
    }
  }

}

// Singleton instance
export const storageAdapter = new StorageAdapter();