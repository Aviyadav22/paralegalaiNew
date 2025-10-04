const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { normalizePath, isWithin } = require("../files");

// Original files storage directory
const originalFilesPath =
  process.env.NODE_ENV === "development"
    ? path.resolve(__dirname, `../../storage/original-files`)
    : path.resolve(process.env.STORAGE_DIR || "D:/Startup/Project_daedalus/AnytingLLM/anything-llm/server/storage", `original-files`);


// Ensure the original files directory exists
if (!fs.existsSync(originalFilesPath)) {
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
    const shardedDir = path.resolve(originalFilesPath, subdir);
    const storedPath = path.resolve(shardedDir, storedFilename);
    
    // Ensure the sharded directory exists
    fs.mkdirSync(shardedDir, { recursive: true });

    // Copy the original file to our storage
    fs.copyFileSync(originalFilePath, storedPath);

    // Store metadata about the original file
    const metadataPath = path.resolve(originalFilesPath, `${fileId}.meta.json`);
    const fileMetadata = {
      fileId,
      originalFilename: filename,
      storedFilename,
      storedPath: `original-files/${subdir}/${storedFilename}`, // Include subdir in stored path
      originalPath: originalFilePath,
      fileSize: fs.statSync(originalFilePath).size,
      mimeType: getMimeType(fileExtension),
      createdAt: new Date().toISOString(),
      subdir, // Store subdir for easy retrieval
      ...metadata
    };

    fs.writeFileSync(metadataPath, JSON.stringify(fileMetadata, null, 2));

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
 * Retrieve original file metadata by file ID
 * @param {string} fileId - The file ID
 * @returns {Promise<Object|null>} File metadata or null if not found
 */
async function getOriginalFileMetadata(fileId) {
  try {
    const metadataPath = path.resolve(originalFilesPath, `${fileId}.meta.json`);
    if (!fs.existsSync(metadataPath)) {
      return null;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    return metadata;
  } catch (error) {
    console.error("Error retrieving original file metadata:", error);
    return null;
  }
}

/**
 * Get the file path for serving the original file
 * @param {string} fileId - The file ID
 * @returns {Promise<{success: boolean, filePath: string, error: string}>}
 */
async function getOriginalFilePath(fileId) {
  try {
    const metadata = await getOriginalFileMetadata(fileId);
    if (!metadata) {
      return {
        success: false,
        filePath: null,
        error: "File not found"
      };
    }

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
        error: "File no longer exists on disk"
      };
    }

    return {
      success: true,
      filePath: fullPath,
      error: null
    };
  } catch (error) {
    console.error("Error getting original file path:", error);
    return {
      success: false,
      filePath: null,
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

    // Delete the file (handle both sharded and flat structures)
    let filePath;
    if (metadata.subdir) {
      // New sharded structure
      filePath = path.resolve(originalFilesPath, metadata.subdir, metadata.storedFilename);
    } else {
      // Fallback to old flat structure for backward compatibility
      filePath = path.resolve(originalFilesPath, metadata.storedFilename);
    }
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete the metadata
    const metadataPath = path.resolve(originalFilesPath, `${fileId}.meta.json`);
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }

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
