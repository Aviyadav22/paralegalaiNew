const { BlobServiceClient } = require("@azure/storage-blob");
const { Readable } = require("stream");

/**
 * Azure Blob Storage utility for storing and retrieving original files
 * Requires environment variables:
 * - AZURE_STORAGE_CONNECTION_STRING or
 * - AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY
 * - AZURE_STORAGE_CONTAINER_NAME (default: "original-files")
 */

class AzureBlobStorage {
  constructor() {
    this.containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || "original-files";
    this.metadataContainerName = process.env.AZURE_STORAGE_METADATA_CONTAINER_NAME || "original-files-metadata";
    this.blobServiceClient = null;
    this.containerClient = null;
    this.metadataContainerClient = null;
    this.initialized = false;
  }

  /**
   * Initialize Azure Blob Storage client
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Try connection string first
      if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(
          process.env.AZURE_STORAGE_CONNECTION_STRING
        );
      } 
      // Fall back to account name and key
      else if (process.env.AZURE_STORAGE_ACCOUNT_NAME && process.env.AZURE_STORAGE_ACCOUNT_KEY) {
        const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
        const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
        const sharedKeyCredential = new StorageSharedKeyCredential(account, accountKey);
        this.blobServiceClient = new BlobServiceClient(
          `https://${account}.blob.core.windows.net`,
          sharedKeyCredential
        );
      } else {
        throw new Error(
          "Azure Storage credentials not found. Please set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY"
        );
      }

      // Get container clients
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      this.metadataContainerClient = this.blobServiceClient.getContainerClient(this.metadataContainerName);

      // Create containers if they don't exist
      await this.containerClient.createIfNotExists({
        access: "private"
      });
      await this.metadataContainerClient.createIfNotExists({
        access: "private"
      });

      this.initialized = true;
      console.log("Azure Blob Storage initialized successfully");
    } catch (error) {
      console.error("Failed to initialize Azure Blob Storage:", error);
      throw error;
    }
  }

  /**
   * Upload a file to Azure Blob Storage
   * @param {string} fileId - Unique file identifier
   * @param {Buffer|Stream} fileContent - File content to upload
   * @param {Object} options - Upload options
   * @returns {Promise<{success: boolean, blobUrl: string, error: string}>}
   */
  async uploadFile(fileId, fileContent, options = {}) {
    try {
      await this.initialize();

      const { filename, mimeType, subdir } = options;
      
      // Create blob path with sharding (same structure as local storage)
      const blobName = subdir ? `${subdir}/${filename}` : filename;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Upload with metadata
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: mimeType || "application/octet-stream"
        },
        metadata: {
          fileId: fileId,
          originalFilename: options.originalFilename || filename
        }
      };

      let uploadResponse;
      if (Buffer.isBuffer(fileContent)) {
        uploadResponse = await blockBlobClient.upload(fileContent, fileContent.length, uploadOptions);
      } else {
        // Handle stream
        uploadResponse = await blockBlobClient.uploadStream(fileContent, undefined, undefined, uploadOptions);
      }

      return {
        success: true,
        blobUrl: blockBlobClient.url,
        blobName: blobName,
        error: null
      };
    } catch (error) {
      console.error("Error uploading file to Azure Blob Storage:", error);
      return {
        success: false,
        blobUrl: null,
        blobName: null,
        error: error.message
      };
    }
  }

  /**
   * Upload file from local path
   * @param {string} fileId - Unique file identifier
   * @param {string} localFilePath - Path to local file
   * @param {Object} options - Upload options
   * @returns {Promise<{success: boolean, blobUrl: string, error: string}>}
   */
  async uploadFileFromPath(fileId, localFilePath, options = {}) {
    try {
      await this.initialize();

      const fs = require("fs");
      const path = require("path");

      if (!fs.existsSync(localFilePath)) {
        return {
          success: false,
          blobUrl: null,
          blobName: null,
          error: "Local file does not exist"
        };
      }

      const { filename, mimeType, subdir } = options;
      const blobName = subdir ? `${subdir}/${filename}` : filename;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);

      // Upload with metadata
      const uploadOptions = {
        blobHTTPHeaders: {
          blobContentType: mimeType || "application/octet-stream"
        },
        metadata: {
          fileId: fileId,
          originalFilename: options.originalFilename || filename
        }
      };

      await blockBlobClient.uploadFile(localFilePath, uploadOptions);

      return {
        success: true,
        blobUrl: blockBlobClient.url,
        blobName: blobName,
        error: null
      };
    } catch (error) {
      console.error("Error uploading file from path to Azure Blob Storage:", error);
      return {
        success: false,
        blobUrl: null,
        blobName: null,
        error: error.message
      };
    }
  }

  /**
   * Download a file from Azure Blob Storage
   * @param {string} blobName - Blob name/path
   * @returns {Promise<{success: boolean, content: Buffer, error: string}>}
   */
  async downloadFile(blobName) {
    try {
      await this.initialize();

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download(0);
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);

      return {
        success: true,
        content: content,
        properties: downloadResponse,
        error: null
      };
    } catch (error) {
      console.error("Error downloading file from Azure Blob Storage:", error);
      return {
        success: false,
        content: null,
        properties: null,
        error: error.message
      };
    }
  }

  /**
   * Get a readable stream for a file
   * @param {string} blobName - Blob name/path
   * @returns {Promise<{success: boolean, stream: Stream, properties: Object, error: string}>}
   */
  async getFileStream(blobName) {
    try {
      await this.initialize();

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      const downloadResponse = await blockBlobClient.download(0);

      return {
        success: true,
        stream: downloadResponse.readableStreamBody,
        properties: downloadResponse,
        error: null
      };
    } catch (error) {
      console.error("Error getting file stream from Azure Blob Storage:", error);
      return {
        success: false,
        stream: null,
        properties: null,
        error: error.message
      };
    }
  }

  /**
   * Delete a file from Azure Blob Storage
   * @param {string} blobName - Blob name/path
   * @returns {Promise<{success: boolean, error: string}>}
   */
  async deleteFile(blobName) {
    try {
      await this.initialize();

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();

      return {
        success: true,
        error: null
      };
    } catch (error) {
      console.error("Error deleting file from Azure Blob Storage:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if a file exists
   * @param {string} blobName - Blob name/path
   * @returns {Promise<boolean>}
   */
  async fileExists(blobName) {
    try {
      await this.initialize();

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      return await blockBlobClient.exists();
    } catch (error) {
      console.error("Error checking file existence in Azure Blob Storage:", error);
      return false;
    }
  }

  /**
   * Store metadata as JSON blob
   * @param {string} fileId - File ID
   * @param {Object} metadata - Metadata object
   * @returns {Promise<{success: boolean, error: string}>}
   */
  async storeMetadata(fileId, metadata) {
    try {
      await this.initialize();

      const blobName = `${fileId}.meta.json`;
      const blockBlobClient = this.metadataContainerClient.getBlockBlobClient(blobName);
      
      const metadataContent = JSON.stringify(metadata, null, 2);
      const buffer = Buffer.from(metadataContent, "utf8");

      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: "application/json"
        }
      });

      return {
        success: true,
        error: null
      };
    } catch (error) {
      console.error("Error storing metadata in Azure Blob Storage:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve metadata from JSON blob
   * @param {string} fileId - File ID
   * @returns {Promise<Object|null>}
   */
  async getMetadata(fileId) {
    try {
      await this.initialize();

      const blobName = `${fileId}.meta.json`;
      const blockBlobClient = this.metadataContainerClient.getBlockBlobClient(blobName);
      
      const exists = await blockBlobClient.exists();
      if (!exists) {
        return null;
      }

      const downloadResponse = await blockBlobClient.download(0);
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString("utf8");
      
      return JSON.parse(content);
    } catch (error) {
      console.error("Error retrieving metadata from Azure Blob Storage:", error);
      return null;
    }
  }

  /**
   * Delete metadata blob
   * @param {string} fileId - File ID
   * @returns {Promise<{success: boolean, error: string}>}
   */
  async deleteMetadata(fileId) {
    try {
      await this.initialize();

      const blobName = `${fileId}.meta.json`;
      const blockBlobClient = this.metadataContainerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();

      return {
        success: true,
        error: null
      };
    } catch (error) {
      console.error("Error deleting metadata from Azure Blob Storage:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
const azureBlobStorage = new AzureBlobStorage();

module.exports = azureBlobStorage;
