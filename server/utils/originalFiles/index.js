const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { normalizePath, isWithin } = require("../files");
const azureBlobStorage = require("../AzureBlobStorage");
const prisma = require("../prisma");

// Determine storage mode: 'azure' or 'local'
const STORAGE_MODE = process.env.STORAGE_MODE || "local"; // Default to local for backward compatibility

// Original files storage directory (only used in local mode)
const originalFilesPath =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, `../../storage/original-files`)
    : path.resolve(process.env.STORAGE_DIR || "D:/Startup/Project_daedalus/AnytingLLM/anything-llm/server/storage", `original-files`);


// Ensure the original files directory exists (only in local mode)
if (STORAGE_MODE === "local" && !fs.existsSync(originalFilesPath)) {
  fs.mkdirSync(originalFilesPath, { recursive: true });
}

/**
 * Store an original file and return its metadata
 * @param {Object} params
 * @param {string} params.originalFilePath - Path to the original file
 * @param {string} params.filename - Original filename
 * @param {Object} params.metadata - Document metadata
 * @returns {Promise<{success: boolean, fileId: string, storedPath: string, error: string}>}
 */
async function storeOriginalFile({ originalFilePath, filename, metadata = {} }) {
  try {
    if (!fs.existsSync(originalFilePath)) {
      return {
        success: false,
        fileId: null,
        storedPath: null,
        error: "Original file does not exist"
      };
    }

    // Generate unique file ID
    const fileId = uuidv4();
    const fileExtension = path.extname(filename);
    const storedFilename = `${fileId}${fileExtension}`;
    
    // Create sharded directory structure (00-ff based on first 2 chars of fileId)
    const subdir = fileId.slice(0, 2);
    const fileSize = fs.statSync(originalFilePath).size;
    const mimeType = getMimeType(fileExtension);

    // Prepare metadata object
    const fileMetadata = {
      fileId,
      originalFilename: filename,
      storedFilename,
      storedPath: `original-files/${subdir}/${storedFilename}`,
      originalPath: originalFilePath,
      fileSize: fileSize,
      mimeType: mimeType,
      subdir,
      storageMode: STORAGE_MODE,
      blobUrl: null,
      blobName: null,
      title: metadata.title || null,
      docAuthor: metadata.docAuthor || null,
      description: metadata.description || null,
      docSource: metadata.docSource || null,
      fileType: metadata.fileType || null
    };

    if (STORAGE_MODE === "azure") {
      // Upload to Azure Blob Storage
      const uploadResult = await azureBlobStorage.uploadFileFromPath(
        fileId,
        originalFilePath,
        {
          filename: storedFilename,
          originalFilename: filename,
          mimeType: mimeType,
          subdir: subdir
        }
      );

      if (!uploadResult.success) {
        return {
          success: false,
          fileId: null,
          storedPath: null,
          error: uploadResult.error
        };
      }

      // Update metadata with Azure blob info
      fileMetadata.blobUrl = uploadResult.blobUrl;
      fileMetadata.blobName = uploadResult.blobName;
      
      // Also store metadata in Azure as backup
      await azureBlobStorage.storeMetadata(fileId, fileMetadata);

    } else {
      // Local storage mode
      const shardedDir = path.resolve(originalFilesPath, subdir);
      const storedPath = path.resolve(shardedDir, storedFilename);
      
      // Ensure the sharded directory exists
      fs.mkdirSync(shardedDir, { recursive: true });

      // Copy the original file to our storage
      fs.copyFileSync(originalFilePath, storedPath);
    }

    // Store metadata in local database (for both Azure and local modes)
    await prisma.original_files.create({
      data: {
        fileId: fileMetadata.fileId,
        originalFilename: fileMetadata.originalFilename,
        storedFilename: fileMetadata.storedFilename,
        storedPath: fileMetadata.storedPath,
        originalPath: fileMetadata.originalPath,
        fileSize: fileMetadata.fileSize,
        mimeType: fileMetadata.mimeType,
        subdir: fileMetadata.subdir,
        storageMode: fileMetadata.storageMode,
        blobUrl: fileMetadata.blobUrl,
        blobName: fileMetadata.blobName,
        title: fileMetadata.title,
        docAuthor: fileMetadata.docAuthor,
        description: fileMetadata.description,
        docSource: fileMetadata.docSource,
        fileType: fileMetadata.fileType
      }
    });

    return {
      success: true,
      fileId,
      storedPath: fileMetadata.storedPath,
      error: null
    };
  } catch (error) {
    console.error("Error storing original file:", error);
    return {
      success: false,
      fileId: null,
      storedPath: null,
      error: error.message
    };
  }
}

/**
 * Retrieve original file metadata by file ID (from local database)
 * @param {string} fileId - The file ID
 * @returns {Promise<Object|null>} File metadata or null if not found
 */
async function getOriginalFileMetadata(fileId) {
  try {
    // Always retrieve from local database for fast access
    const metadata = await prisma.original_files.findUnique({
      where: { fileId: fileId }
    });
    
    return metadata;
  } catch (error) {
    console.error("Error retrieving original file metadata:", error);
    return null;
  }
}

/**
 * Get the file path for serving the original file (local mode) or blob name (Azure mode)
 * @param {string} fileId - The file ID
 * @returns {Promise<{success: boolean, filePath: string, blobName: string, storageMode: string, error: string}>}
 */
async function getOriginalFilePath(fileId) {
  try {
    const metadata = await getOriginalFileMetadata(fileId);
    if (!metadata) {
      return {
        success: false,
        filePath: null,
        blobName: null,
        storageMode: STORAGE_MODE,
        error: "File not found"
      };
    }

    if (STORAGE_MODE === "azure" || metadata.storageMode === "azure") {
      // Azure Blob Storage mode
      const blobName = metadata.blobName || `${metadata.subdir}/${metadata.storedFilename}`;
      
      // Verify blob exists
      const exists = await azureBlobStorage.fileExists(blobName);
      if (!exists) {
        return {
          success: false,
          filePath: null,
          blobName: null,
          storageMode: "azure",
          error: "File no longer exists in Azure Blob Storage"
        };
      }

      return {
        success: true,
        filePath: null,
        blobName: blobName,
        storageMode: "azure",
        error: null
      };
    } else {
      // Local storage mode
      // Handle both old flat structure and new sharded structure
      let fullPath;
      if (metadata.subdir) {
        // New sharded structure
        fullPath = path.resolve(originalFilesPath, metadata.subdir, metadata.storedFilename);
      } else {
        // Fallback to old flat structure for backward compatibility
        fullPath = path.resolve(originalFilesPath, metadata.storedFilename);
      }
      
      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          filePath: null,
          blobName: null,
          storageMode: "local",
          error: "File no longer exists on disk"
        };
      }

      return {
        success: true,
        filePath: fullPath,
        blobName: null,
        storageMode: "local",
        error: null
      };
    }
  } catch (error) {
    console.error("Error getting original file path:", error);
    return {
      success: false,
      filePath: null,
      blobName: null,
      storageMode: STORAGE_MODE,
      error: error.message
    };
  }
}

/**
 * Delete an original file and its metadata
 * @param {string} fileId - The file ID
 * @returns {Promise<{success: boolean, error: string}>}
 */
async function deleteOriginalFile(fileId) {
  try {
    const metadata = await getOriginalFileMetadata(fileId);
    if (!metadata) {
      return { success: true, error: null }; // Already deleted
    }

    if (metadata.storageMode === "azure") {
      // Delete from Azure Blob Storage
      const blobName = metadata.blobName || `${metadata.subdir}/${metadata.storedFilename}`;
      await azureBlobStorage.deleteFile(blobName);
      
      // Delete metadata from Azure (backup)
      await azureBlobStorage.deleteMetadata(fileId);
      
    } else {
      // Delete from local storage
      let filePath;
      if (metadata.subdir) {
        filePath = path.resolve(originalFilesPath, metadata.subdir, metadata.storedFilename);
      } else {
        filePath = path.resolve(originalFilesPath, metadata.storedFilename);
      }
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Delete metadata from local database
    await prisma.original_files.delete({
      where: { fileId: fileId }
    });

    return { success: true, error: null };
  } catch (error) {
    console.error("Error deleting original file:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get MIME type based on file extension
 * @param {string} extension - File extension
 * @returns {string} MIME type
 */
function getMimeType(extension) {
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav'
  };
  
  return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
}

/**
 * Clean up orphaned files (files without corresponding metadata)
 * @returns {Promise<{cleaned: number, errors: string[]}>}
 */
async function cleanupOrphanedFiles() {
  const cleaned = [];
  const errors = [];

  try {
    // Clean up files in the root directory (old flat structure)
    const rootFiles = fs.readdirSync(originalFilesPath);
    
    for (const file of rootFiles) {
      if (file.endsWith('.meta.json')) continue;
      if (fs.statSync(path.resolve(originalFilesPath, file)).isDirectory()) continue; // Skip subdirectories
      
      const fileId = path.parse(file).name;
      const metadataPath = path.resolve(originalFilesPath, `${fileId}.meta.json`);
      
      if (!fs.existsSync(metadataPath)) {
        try {
          fs.unlinkSync(path.resolve(originalFilesPath, file));
          cleaned.push(file);
        } catch (error) {
          errors.push(`Failed to delete ${file}: ${error.message}`);
        }
      }
    }

    // Clean up files in sharded subdirectories
    for (const item of rootFiles) {
      const itemPath = path.resolve(originalFilesPath, item);
      if (fs.statSync(itemPath).isDirectory() && /^[0-9a-f]{2}$/.test(item)) {
        // This is a sharded subdirectory (00-ff)
        const subdirFiles = fs.readdirSync(itemPath);
        
        for (const file of subdirFiles) {
          if (file.endsWith('.meta.json')) continue;
          
          const fileId = path.parse(file).name;
          const metadataPath = path.resolve(originalFilesPath, `${fileId}.meta.json`);
          
          if (!fs.existsSync(metadataPath)) {
            try {
              fs.unlinkSync(path.resolve(itemPath, file));
              cleaned.push(`${item}/${file}`);
            } catch (error) {
              errors.push(`Failed to delete ${item}/${file}: ${error.message}`);
            }
          }
        }
      }
    }
  } catch (error) {
    errors.push(`Cleanup failed: ${error.message}`);
  }

  return { cleaned: cleaned.length, errors };
}

module.exports = {
  storeOriginalFile,
  getOriginalFileMetadata,
  getOriginalFilePath,
  deleteOriginalFile,
  cleanupOrphanedFiles,
  originalFilesPath
};
